import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarPlus,
  Search,
  Bell,
  FileCheck2,
  Folder,
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Activity,
  Send,
  Edit3,
  Calendar,
  Sliders,
  Sparkles,
  Copy,
  Check,
  Eye,
  ChevronDown,
  ChevronUp,
  Terminal,
  Globe,
  Radio
} from 'lucide-react';
import { getIpc } from '../../lib/electron';

export interface ScheduledViewProps {
  onCreateTask?: (taskType: string) => void;
  onUseTemplate?: (templateName: string, cronExpr: string) => void;
}

export interface LiveTrigger {
  id: string;
  name: string;
  type: 'cron' | 'watcher' | 'webhook';
  enabled: boolean;
  targetPath?: string;
  cronExpression?: string;
  intervalMs?: number;
  prompt: string;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error' | 'running';
  lastError?: string;
  lastOutput?: string;
  runCount: number;
  notifyTelegram?: boolean;
  telegramChatId?: string;
}

interface TemplateCard {
  id: string;
  icon: string;
  title: string;
  schedule: string;
  cron: string;
  description?: string;
}

type FrequencyMode = 'interval' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a cron expression or trigger metadata into a human-friendly sentence.
 */
export function formatCronNaturalLanguage(
  cron?: string,
  intervalMs?: number,
  type: string = 'cron',
  targetPath?: string
): string {
  if (type === 'watcher') {
    return targetPath ? `Watches changes in "${targetPath}"` : 'Filesystem change watcher';
  }
  if (type === 'webhook') {
    return 'Triggered via incoming Webhook / API request';
  }

  if (intervalMs && intervalMs > 0) {
    const mins = Math.round(intervalMs / 60000);
    if (mins < 60) return `Every ${mins} minute${mins === 1 ? '' : 's'}`;
    const hours = Math.round(mins / 60);
    return `Every ${hours} hour${hours === 1 ? '' : 's'}`;
  }

  if (!cron || typeof cron !== 'string') return 'Manual / Custom schedule';
  const c = cron.trim();

  // Known standard expressions
  if (c === '*/15 * * * *') return 'Every 15 minutes';
  if (c === '*/30 * * * *') return 'Every 30 minutes';
  if (c === '0 * * * *') return 'Every hour on the hour';
  if (c === '0 */2 * * *') return 'Every 2 hours';
  if (c === '0 */4 * * *') return 'Every 4 hours';
  if (c === '0 */6 * * *') return 'Every 6 hours';
  if (c === '0 */12 * * *') return 'Every 12 hours';
  if (c === '0 9 * * *') return 'Every day at 09:00';
  if (c === '0 21 * * *') return 'Every day at 21:00 (9 PM)';
  if (c === '0 9 * * 1-5') return 'Every weekday (Mon–Fri) at 09:00';
  if (c === '0 17 * * 1-5') return 'Every weekday (Mon–Fri) at 17:00 (5 PM)';
  if (c === '0 9 * * 5') return 'Every Friday at 09:00';
  if (c === '0 18 * * 0') return 'Every Sunday at 18:00 (6 PM)';

  // Parse 5-part cron syntax
  const parts = c.split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, dom, mon, dow] = parts;

    // Minute intervals
    if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${min.slice(2)} minutes`;
    }
    // Hour intervals
    if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${hour.slice(3)} hours`;
    }

    const pad = (n: string) => n.padStart(2, '0');
    const isValidHour = !isNaN(Number(hour)) && Number(hour) >= 0 && Number(hour) <= 23;
    const isValidMin = !isNaN(Number(min)) && Number(min) >= 0 && Number(min) <= 59;

    if (isValidHour && isValidMin) {
      const timeStr = `${pad(hour)}:${pad(min)}`;

      if (dom === '*' && mon === '*' && dow === '*') {
        return `Daily at ${timeStr}`;
      }
      if (dom === '*' && mon === '*' && dow === '1-5') {
        return `Weekdays (Mon–Fri) at ${timeStr}`;
      }
      if (dom === '*' && mon === '*' && dow === '0,6') {
        return `Weekends (Sat & Sun) at ${timeStr}`;
      }
      if (dom === '*' && mon === '*' && !isNaN(Number(dow))) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `Every ${dayNames[Number(dow)] || 'day'} at ${timeStr}`;
      }
      if (dom !== '*' && mon === '*' && dow === '*') {
        return `Monthly on day ${dom} at ${timeStr}`;
      }
      if (dom === '*' && mon === '*' && dow.includes(',')) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = dow
          .split(',')
          .map((d) => dayNames[Number(d)] || d)
          .join(', ');
        return `Every ${days} at ${timeStr}`;
      }
    }
  }

  return `Cron: ${c}`;
}

const DAY_OPTIONS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 }
];

export const ScheduledView: React.FC<ScheduledViewProps> = ({ onCreateTask, onUseTemplate }) => {
  const [activeSubTab, setActiveSubTab] = useState<'tasks' | 'templates'>('tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [triggers, setTriggers] = useState<LiveTrigger[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [runningTriggerId, setRunningTriggerId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ─── Schedule Builder / Modal State ─────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [modalName, setModalName] = useState<string>('');
  const [modalType, setModalType] = useState<'cron' | 'watcher' | 'webhook'>('cron');
  const [frequencyMode, setFrequencyMode] = useState<FrequencyMode>('daily');
  const [intervalChoice, setIntervalChoice] = useState<string>('1h');
  const [timeOfDay, setTimeOfDay] = useState<string>('09:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [customCron, setCustomCron] = useState<string>('0 9 * * 1-5');
  const [modalPrompt, setModalPrompt] = useState<string>('');
  const [modalPath, setModalPath] = useState<string>('');
  const [modalNotifyTelegram, setModalNotifyTelegram] = useState<boolean>(false);
  const [modalTelegramChatId, setModalTelegramChatId] = useState<string>('');
  const [modalEnabled, setModalEnabled] = useState<boolean>(true);

  const ipc = getIpc();

  // Load triggers from IPC
  const fetchTriggers = useCallback(async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const res = await ipc.invoke('triggers-list');
      if (Array.isArray(res)) {
        setTriggers(res);
      }
    } catch (e) {
      console.error('Failed to load triggers:', e);
    } finally {
      setLoading(false);
    }
  }, [ipc]);

  useEffect(() => {
    fetchTriggers();

    if (!ipc) return;
    const handleFired = (_e: unknown, data: any) => {
      console.log('[ScheduledView] Trigger fired event received:', data);
      fetchTriggers();
    };
    ipc.on('trigger-fired', handleFired);
    return () => {
      ipc.removeListener('trigger-fired', handleFired);
    };
  }, [fetchTriggers, ipc]);

  // ─── Cron Computation ───────────────────────────────────────────────────────
  const computedCronExpression = useMemo(() => {
    if (modalType !== 'cron') return undefined;

    const [hourStr, minStr] = timeOfDay.split(':');
    const hour = parseInt(hourStr || '9', 10);
    const min = parseInt(minStr || '0', 10);

    switch (frequencyMode) {
      case 'interval': {
        switch (intervalChoice) {
          case '15m':
            return '*/15 * * * *';
          case '30m':
            return '*/30 * * * *';
          case '1h':
            return '0 * * * *';
          case '2h':
            return '0 */2 * * *';
          case '4h':
            return '0 */4 * * *';
          case '6h':
            return '0 */6 * * *';
          case '12h':
            return '0 */12 * * *';
          default:
            return '0 * * * *';
        }
      }
      case 'daily':
        return `${min} ${hour} * * *`;
      case 'weekdays':
        return `${min} ${hour} * * 1-5`;
      case 'weekly': {
        const sorted = [...selectedDays].sort((a, b) => a - b);
        const daysPart = sorted.length > 0 ? sorted.join(',') : '1';
        return `${min} ${hour} * * ${daysPart}`;
      }
      case 'monthly':
        return `${min} ${hour} ${dayOfMonth} * *`;
      case 'custom':
        return customCron.trim() || '0 9 * * *';
      default:
        return '0 9 * * *';
    }
  }, [modalType, frequencyMode, intervalChoice, timeOfDay, selectedDays, dayOfMonth, customCron]);

  // ─── Modal Open/Close Handlers ──────────────────────────────────────────────
  const handleOpenCreateModal = (preset?: Partial<{
    name: string;
    prompt: string;
    cron: string;
    type: 'cron' | 'watcher' | 'webhook';
    targetPath: string;
  }>) => {
    setEditingTriggerId(null);
    setModalName(preset?.name || '');
    setModalType(preset?.type || 'cron');
    setModalPrompt(preset?.prompt || '');
    setModalPath(preset?.targetPath || '');
    setModalNotifyTelegram(false);
    setModalTelegramChatId('');
    setModalEnabled(true);

    if (preset?.cron) {
      setCustomCron(preset.cron);
      // Determine if preset matches standard presets
      if (preset.cron === '0 9 * * 1-5') {
        setFrequencyMode('weekdays');
        setTimeOfDay('09:00');
      } else if (preset.cron === '0 9 * * *') {
        setFrequencyMode('daily');
        setTimeOfDay('09:00');
      } else if (preset.cron === '0 21 * * *') {
        setFrequencyMode('daily');
        setTimeOfDay('21:00');
      } else if (preset.cron === '0 9 * * 5') {
        setFrequencyMode('weekly');
        setSelectedDays([5]);
        setTimeOfDay('09:00');
      } else if (preset.cron === '0 18 * * 0') {
        setFrequencyMode('weekly');
        setSelectedDays([0]);
        setTimeOfDay('18:00');
      } else if (preset.cron.startsWith('*/')) {
        setFrequencyMode('interval');
        setIntervalChoice(preset.cron === '*/15 * * * *' ? '15m' : '30m');
      } else {
        setFrequencyMode('custom');
      }
    } else {
      setFrequencyMode('daily');
      setTimeOfDay('09:00');
      setSelectedDays([1, 2, 3, 4, 5]);
      setDayOfMonth(1);
      setCustomCron('0 9 * * *');
    }

    setIsModalOpen(true);
  };

  const handleOpenEditModal = (trigger: LiveTrigger) => {
    setEditingTriggerId(trigger.id);
    setModalName(trigger.name);
    setModalType(trigger.type || 'cron');
    setModalPrompt(trigger.prompt);
    setModalPath(trigger.targetPath || '');
    setModalNotifyTelegram(Boolean(trigger.notifyTelegram));
    setModalTelegramChatId(trigger.telegramChatId || '');
    setModalEnabled(trigger.enabled);

    if (trigger.cronExpression) {
      setCustomCron(trigger.cronExpression);
      const parts = trigger.cronExpression.trim().split(/\s+/);
      if (parts.length === 5) {
        const [min, hour, dom, mon, dow] = parts;
        const validTime = !isNaN(Number(hour)) && !isNaN(Number(min));
        if (validTime) {
          const timeStr = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
          setTimeOfDay(timeStr);

          if (dom === '*' && mon === '*' && dow === '*') {
            setFrequencyMode('daily');
          } else if (dom === '*' && mon === '*' && dow === '1-5') {
            setFrequencyMode('weekdays');
          } else if (dom !== '*' && mon === '*' && dow === '*') {
            setFrequencyMode('monthly');
            setDayOfMonth(parseInt(dom, 10) || 1);
          } else if (dom === '*' && mon === '*' && !isNaN(Number(dow))) {
            setFrequencyMode('weekly');
            setSelectedDays([parseInt(dow, 10)]);
          } else if (dom === '*' && mon === '*' && dow.includes(',')) {
            setFrequencyMode('weekly');
            setSelectedDays(dow.split(',').map((d) => parseInt(d, 10)).filter((n) => !isNaN(n)));
          } else {
            setFrequencyMode('custom');
          }
        } else if (trigger.cronExpression.startsWith('*/')) {
          setFrequencyMode('interval');
          setIntervalChoice(trigger.cronExpression === '*/15 * * * *' ? '15m' : '30m');
        } else if (trigger.cronExpression === '0 * * * *') {
          setFrequencyMode('interval');
          setIntervalChoice('1h');
        } else if (trigger.cronExpression.startsWith('0 */')) {
          setFrequencyMode('interval');
          setIntervalChoice(trigger.cronExpression === '0 */2 * * *' ? '2h' : '6h');
        } else {
          setFrequencyMode('custom');
        }
      } else {
        setFrequencyMode('custom');
      }
    } else {
      setFrequencyMode('daily');
      setTimeOfDay('09:00');
    }

    setIsModalOpen(true);
  };

  // ─── Actions ────────────────────────────────────────────────────────────────
  const handleToggleTrigger = async (id: string, currentEnabled: boolean) => {
    if (!ipc) return;
    try {
      await ipc.invoke('triggers-toggle', { id, enabled: !currentEnabled });
      fetchTriggers();
    } catch (e) {
      console.error('Failed to toggle trigger:', e);
    }
  };

  const handleRunNow = async (id: string) => {
    if (!ipc) return;
    setRunningTriggerId(id);
    try {
      await ipc.invoke('triggers-run-now', id);
      fetchTriggers();
    } catch (e) {
      console.error('Failed to run trigger now:', e);
    } finally {
      setRunningTriggerId(null);
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    if (!ipc) return;
    try {
      await ipc.invoke('triggers-remove', id);
      fetchTriggers();
    } catch (e) {
      console.error('Failed to remove trigger:', e);
    }
  };

  const handleSaveTriggerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName.trim() || !modalPrompt.trim() || !ipc) return;

    const payload = {
      name: modalName.trim(),
      type: modalType,
      enabled: modalEnabled,
      cronExpression: modalType === 'cron' ? computedCronExpression : undefined,
      targetPath: modalType === 'watcher' ? modalPath.trim() : undefined,
      prompt: modalPrompt.trim(),
      notifyTelegram: modalNotifyTelegram,
      telegramChatId: modalNotifyTelegram && modalTelegramChatId.trim() ? modalTelegramChatId.trim() : undefined
    };

    try {
      if (editingTriggerId) {
        // Edit existing trigger
        await ipc.invoke('triggers-update', {
          id: editingTriggerId,
          updates: payload
        });
      } else {
        // Create new trigger
        await ipc.invoke('triggers-create', payload);
      }
      setIsModalOpen(false);
      fetchTriggers();
    } catch (err) {
      console.error('Failed to save schedule:', err);
    }
  };

  const handleInstantiateTemplate = async (tmpl: TemplateCard) => {
    if (ipc) {
      try {
        await ipc.invoke('triggers-create', {
          name: tmpl.title.slice(0, 50),
          type: 'cron',
          enabled: true,
          cronExpression: tmpl.cron,
          prompt: tmpl.title,
          notifyTelegram: false
        });
        setActiveSubTab('tasks');
        fetchTriggers();
        return;
      } catch (e) {
        console.error('Failed to instantiate trigger template:', e);
      }
    }
    // Fallback if no IPC available
    onUseTemplate?.(tmpl.title, tmpl.cron);
  };

  const handleCustomizeTemplate = (tmpl: TemplateCard) => {
    handleOpenCreateModal({
      name: tmpl.title.slice(0, 50),
      prompt: tmpl.title,
      cron: tmpl.cron,
      type: 'cron'
    });
  };

  const handleCopyWebhookUrl = (triggerId: string) => {
    const curlCommand = `curl -X POST http://localhost:1469/api/ipc/triggers-run-now -H "Content-Type: application/json" -d '{"args": ["${triggerId}"]}'`;
    navigator.clipboard?.writeText(curlCommand);
    setCopiedId(triggerId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleDaySelection = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? (prev.length > 1 ? prev.filter((d) => d !== day) : prev) : [...prev, day]
    );
  };

  // ─── Templates Catalog ───────────────────────────────────────────────────────
  const templates: TemplateCard[] = [
    {
      id: 't1',
      icon: '🐞',
      title: 'Scan recent commits for likely bugs and propose minimal fixes.',
      description: 'Reviews latest git commits against tests and type definitions.',
      schedule: 'Daily at 9:00',
      cron: '0 9 * * *'
    },
    {
      id: 't2',
      icon: '📖',
      title: 'Draft weekly release notes from merged PRs and commits.',
      description: 'Aggregates merged pull requests and drafts changelog sections.',
      schedule: 'Fridays at 17:00',
      cron: '0 17 * * 5'
    },
    {
      id: 't3',
      icon: '💬',
      title: "Summarize yesterday's git activity and blockers for standup.",
      description: 'Prepares a concise 3-bullet morning standup summary.',
      schedule: 'Weekdays at 9:00',
      cron: '0 9 * * 1-5'
    },
    {
      id: 't4',
      icon: '🎯',
      title: 'Summarize CI failures and flaky tests; suggest top fixes.',
      description: 'Checks build artifacts & logs for recurring failures.',
      schedule: 'Daily at 21:00',
      cron: '0 21 * * *'
    },
    {
      id: 't5',
      icon: '⭐',
      title: 'Draft a summary report of repository highlights & performance.',
      description: 'Generates weekly code health and commit velocity overview.',
      schedule: 'Sundays at 18:00',
      cron: '0 18 * * 0'
    },
    {
      id: 't6',
      icon: '🌿',
      title: 'Monitor active PRs and alert on stale reviews or merge conflicts.',
      description: 'Tracks open PRs needing review or conflict resolution.',
      schedule: 'Weekdays at 17:00',
      cron: '0 17 * * 1-5'
    }
  ];

  const filteredTemplates = templates.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.schedule.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTriggers = triggers.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.cronExpression && t.cronExpression.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Quick Preset options for empty state & fast setup
  const quickPresets = [
    {
      id: 'preset-standup',
      label: 'Daily Standup Brief',
      icon: <Bell size={15} className="text-amber-400" />,
      desc: 'Weekdays at 9am: Summarizes recent commits & blockers.',
      preset: {
        name: 'Daily Standup Brief',
        prompt: "Summarize yesterday's git commits, open PRs, and active work for our morning standup. Highlight any blockers.",
        cron: '0 9 * * 1-5'
      }
    },
    {
      id: 'preset-review',
      label: 'Weekly Code Review',
      icon: <FileCheck2 size={15} className="text-emerald-400" />,
      desc: 'Fridays at 5pm: Reviews merged PRs & drafts release notes.',
      preset: {
        name: 'Weekly Code Review & Release Notes',
        prompt: 'Review commits merged this week and draft a release summary highlighting key features, bug fixes, and breaking changes.',
        cron: '0 17 * * 5'
      }
    },
    {
      id: 'preset-scan',
      label: 'Nightly Bug & Security Scan',
      icon: <Sparkles size={15} className="text-cyan-400" />,
      desc: 'Daily at 9pm: Checks code quality and flaky tests.',
      preset: {
        name: 'Nightly Bug & Test Audit',
        prompt: 'Scan the repository for broken imports, lint errors, untested edge cases, and flaky tests. Output top recommended fixes.',
        cron: '0 21 * * *'
      }
    },
    {
      id: 'preset-watcher',
      label: 'Source File Watcher',
      icon: <Folder size={15} className="text-indigo-400" />,
      desc: 'On change: Auto-verifies files modified in ./src.',
      preset: {
        name: 'Source Changes Inspector',
        prompt: 'A file was updated in the codebase. Verify that tests pass and no syntax regressions were introduced.',
        type: 'watcher' as const,
        targetPath: './src'
      }
    }
  ];

  return (
    <div
      data-testid="scheduled-container"
      className="flex h-full min-h-0 w-full flex-col bg-brand-bg text-brand-textMain relative select-none"
    >
      {/* ─── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border px-4 py-3 sm:px-6 sm:py-4 bg-brand-bg/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex gap-1 rounded-lg border border-brand-border bg-brand-sidebar/40 p-1">
          <button
            data-testid="subtab-tasks"
            onClick={() => setActiveSubTab('tasks')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'tasks'
                ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            Active Routines ({triggers.length})
          </button>
          <button
            data-testid="subtab-templates"
            onClick={() => setActiveSubTab('templates')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'templates'
                ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            Templates
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Manual Create Button */}
          <button
            data-testid="btn-new-schedule"
            onClick={() => handleOpenCreateModal()}
            className="ui-btn-primary flex items-center gap-1.5 text-xs px-3.5 py-2 font-medium cursor-pointer shadow-sm active:scale-95 transition-transform"
          >
            <Plus size={15} />
            <span>New Schedule</span>
          </button>

          {/* Optional Chat-based Create */}
          {onCreateTask && (
            <button
              data-testid="create-via-chat-btn"
              onClick={() => onCreateTask('general')}
              className="ui-btn flex items-center gap-1.5 text-xs px-3 py-2 text-brand-textMuted hover:text-brand-textMain cursor-pointer transition-colors"
              title="Open Chat to plan and configure routines conversationally"
            >
              <CalendarPlus size={14} />
              <span className="hidden sm:inline">Create via chat</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Content ──────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        {activeSubTab === 'tasks' ? (
          <div className="mx-auto flex w-full max-w-4xl flex-col">
            {/* Header / Title area */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl flex items-center gap-2.5">
                  Automated Schedules & Routines
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-brand-textMuted leading-relaxed">
                  Autonomous routines executed in background by AgentEngine with optional Telegram alerts.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {triggers.length > 0 && (
                  <div className="ui-input flex items-center gap-2 py-1.5 px-2.5 bg-brand-card text-xs">
                    <Search size={13} className="text-brand-textMuted" />
                    <input
                      type="text"
                      placeholder="Filter routines..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none outline-none text-xs text-brand-textMain placeholder:text-brand-textMuted/50 w-28 sm:w-36"
                    />
                  </div>
                )}

                <button
                  onClick={fetchTriggers}
                  disabled={loading}
                  className={`p-2 rounded-lg bg-brand-card border border-brand-border text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer ${
                    loading ? 'animate-spin' : ''
                  }`}
                  title="Refresh triggers status"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {triggers.length === 0 ? (
              /* ─── Empty State (Full Manual & Presets) ─────────────────────────── */
              <div className="ui-card flex flex-col items-center justify-center gap-6 px-6 py-12 text-center border-dashed">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
                  <Clock size={28} />
                </div>
                <div className="max-w-md">
                  <h3 className="text-base font-semibold text-brand-textMain">
                    No active scheduled routines
                  </h3>
                  <p className="text-xs text-brand-textMuted mt-1.5 leading-relaxed">
                    Set up recurring cron checks, filesystem watchers, or webhook routines to run tasks, audits, and reports automatically.
                  </p>
                </div>

                {/* Primary Manual Action */}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => handleOpenCreateModal()}
                    className="ui-btn-primary flex items-center gap-2 text-xs px-4 py-2.5 font-semibold cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>Create Schedule Manually</span>
                  </button>

                  {onCreateTask && (
                    <button
                      onClick={() => onCreateTask('general')}
                      className="ui-btn flex items-center gap-1.5 text-xs px-3.5 py-2.5 text-brand-textMuted hover:text-brand-textMain cursor-pointer"
                    >
                      <CalendarPlus size={14} />
                      <span>Ask AI to Setup</span>
                    </button>
                  )}
                </div>

                {/* Quick Presets Grid */}
                <div className="w-full mt-4 pt-6 border-t border-brand-border/40 text-left">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-brand-textMuted mb-3 flex items-center gap-1.5">
                    <Sliders size={12} />
                    <span>Quick-Start Presets (Click to customize & schedule)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quickPresets.map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => handleOpenCreateModal(preset.preset)}
                        className="ui-card p-3.5 cursor-pointer hover:border-cyan-500/40 hover:bg-brand-sidebar/40 transition-all group flex flex-col justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-brand-sidebar border border-brand-border group-hover:scale-105 transition-transform">
                            {preset.icon}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-brand-textMain group-hover:text-cyan-400 transition-colors">
                              {preset.label}
                            </div>
                            <div className="text-[11px] text-brand-textMuted mt-0.5 leading-snug">
                              {preset.desc}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-end text-[11px] font-semibold text-cyan-400 group-hover:translate-x-1 transition-transform">
                          Configure &rarr;
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ─── Active Routines List ────────────────────────────────────────── */
              <div className="grid grid-cols-1 gap-4">
                {filteredTriggers.map((t) => {
                  const isRunning = runningTriggerId === t.id || t.lastStatus === 'running';
                  const isLogExpanded = expandedLogId === t.id;
                  const naturalTiming = formatCronNaturalLanguage(
                    t.cronExpression,
                    t.intervalMs,
                    t.type,
                    t.targetPath
                  );

                  return (
                    <div
                      key={t.id}
                      className={`ui-card flex flex-col justify-between p-5 transition-all duration-200 hover:border-brand-border-strong ${
                        !t.enabled ? 'opacity-65 bg-brand-sidebar/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-brand-textMain truncate">
                              {t.name}
                            </span>

                            {/* Status Chip */}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                t.enabled
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30'
                              }`}
                            >
                              {t.enabled ? 'Active' : 'Paused'}
                            </span>

                            {/* Natural schedule summary pill */}
                            <span className="px-2 py-0.5 rounded-md bg-brand-sidebar border border-brand-border text-[11px] text-brand-textMuted flex items-center gap-1 font-mono">
                              <Clock size={11} className="text-cyan-400" />
                              {naturalTiming}
                            </span>

                            {/* Telegram Notification Badge */}
                            {t.notifyTelegram && (
                              <span
                                className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-400 flex items-center gap-1"
                                title={`Telegram alerts enabled (Chat ID: ${t.telegramChatId || 'Default'})`}
                              >
                                <Send size={10} />
                                <span>Telegram</span>
                              </span>
                            )}

                            {/* Last Status Badge */}
                            {t.lastStatus === 'success' && (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                                <CheckCircle2 size={12} /> Success
                              </span>
                            )}
                            {t.lastStatus === 'error' && (
                              <span
                                className="flex items-center gap-1 text-[11px] text-rose-400 font-medium cursor-pointer"
                                onClick={() => setExpandedLogId(isLogExpanded ? null : t.id)}
                                title={t.lastError}
                              >
                                <AlertCircle size={12} /> Failed (Click for error)
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-brand-textMuted leading-relaxed line-clamp-2 max-w-2xl">
                            {t.prompt}
                          </p>
                        </div>

                        {/* Control Actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Run Trigger Now */}
                          <button
                            onClick={() => handleRunNow(t.id)}
                            disabled={isRunning}
                            className="p-2 rounded-lg bg-brand-card hover:bg-brand-hover border border-brand-border text-brand-textMain text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Run Trigger Now"
                          >
                            <Play size={13} className={isRunning ? 'animate-spin text-cyan-400' : 'text-cyan-400'} />
                            <span className="hidden md:inline">Run Now</span>
                          </button>

                          {/* Edit Schedule */}
                          <button
                            onClick={() => handleOpenEditModal(t)}
                            className="p-2 rounded-lg bg-brand-card hover:bg-brand-hover border border-brand-border text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
                            title="Edit Routine Settings"
                          >
                            <Edit3 size={13} />
                          </button>

                          {/* Pause / Resume */}
                          <button
                            onClick={() => handleToggleTrigger(t.id, t.enabled)}
                            className="p-2 rounded-lg bg-brand-card hover:bg-brand-hover border border-brand-border text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
                            title={t.enabled ? 'Pause Routine' : 'Resume Routine'}
                          >
                            {t.enabled ? <Pause size={13} /> : <Play size={13} />}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteTrigger(t.id)}
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer"
                            title="Delete Routine"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Webhook trigger cURL command helper */}
                      {t.type === 'webhook' && (
                        <div className="mt-3 p-2.5 rounded-lg bg-brand-sidebar/60 border border-brand-border/60 flex items-center justify-between gap-2 text-[11px] font-mono text-brand-textMuted">
                          <div className="truncate flex items-center gap-1.5">
                            <Globe size={12} className="text-cyan-400 flex-shrink-0" />
                            <span>POST /api/ipc/triggers-run-now [id: {t.id}]</span>
                          </div>
                          <button
                            onClick={() => handleCopyWebhookUrl(t.id)}
                            className="px-2 py-1 rounded bg-brand-card hover:bg-brand-hover text-brand-textMain flex items-center gap-1 text-[10px] cursor-pointer"
                          >
                            {copiedId === t.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedId === t.id ? 'Copied' : 'Copy cURL'}</span>
                          </button>
                        </div>
                      )}

                      {/* Footer Details */}
                      <div className="mt-3.5 pt-3 border-t border-brand-border/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-brand-textMuted">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {t.type === 'cron'
                              ? `Cron: ${t.cronExpression || 'Custom'}`
                              : t.type === 'watcher'
                              ? `Path: ${t.targetPath || './'}`
                              : 'Webhook API'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Activity size={11} />
                            Runs: {t.runCount}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {t.lastRunAt && (
                            <span>Last run: {new Date(t.lastRunAt).toLocaleString()}</span>
                          )}

                          {(t.lastError || t.lastOutput) && (
                            <button
                              onClick={() => setExpandedLogId(isLogExpanded ? null : t.id)}
                              className="text-[10px] font-semibold text-cyan-400 hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
                            >
                              <span>{isLogExpanded ? 'Hide output' : 'View output'}</span>
                              {isLogExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable Execution Output / Error Box */}
                      {isLogExpanded && (
                        <div className="mt-3 p-3 rounded-lg bg-black/40 border border-brand-border/60 text-xs font-mono">
                          {t.lastError && (
                            <div className="text-rose-400 mb-2">
                              <span className="font-bold">Error: </span>
                              {t.lastError}
                            </div>
                          )}
                          {t.lastOutput ? (
                            <div className="text-brand-textMuted whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {t.lastOutput}
                            </div>
                          ) : (
                            <div className="text-brand-textMuted/60 italic">No output text recorded for last execution.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ─── Templates Catalog Sub-Tab ─────────────────────────────────────── */
          <div className="mx-auto flex w-full max-w-3xl flex-col">
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
              Schedule Templates
            </h1>
            <p className="mb-5 mt-2 text-xs sm:text-sm leading-relaxed text-brand-textMuted">
              Start from a ready-made automation routine. Activate directly or customize schedule times and instructions before saving.
            </p>

            {/* Search */}
            <div className="ui-input mb-6 flex items-center gap-2 border-transparent bg-brand-card">
              <Search size={15} className="flex-shrink-0 text-brand-textMuted" />
              <input
                data-testid="template-search-input"
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border-none bg-transparent text-xs sm:text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
              />
            </div>

            <div className="text-xs font-bold uppercase tracking-wider text-brand-textMuted mb-3">
              Preset Routines ({filteredTemplates.length})
            </div>

            {filteredTemplates.length === 0 ? (
              <div className="ui-card px-6 py-10 text-center text-xs text-brand-textMuted">
                No templates match “{searchQuery}”.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTemplates.map((t) => (
                  <div
                    key={t.id}
                    data-testid={`template-card-${t.id}`}
                    className="ui-card group flex min-h-[200px] flex-col justify-between p-5 text-left transition-all duration-200 hover:border-cyan-500/40 hover:shadow-lg"
                  >
                    <div>
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-xl">
                        {t.icon}
                      </div>
                      <div className="text-xs font-semibold leading-snug text-brand-textMain">
                        {t.title}
                      </div>
                      {t.description && (
                        <div className="text-[11px] text-brand-textMuted mt-1.5 leading-relaxed">
                          {t.description}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-col gap-2.5 border-t border-brand-border/30 pt-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-brand-textMuted font-mono">
                        <Clock size={11} className="flex-shrink-0 text-cyan-400" />
                        {t.schedule}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleCustomizeTemplate(t)}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-brand-card hover:bg-brand-hover border border-brand-border text-xs font-medium text-brand-textMain transition-colors cursor-pointer text-center"
                          title="Tweak schedule timing and prompt before adding"
                        >
                          Customize
                        </button>
                        <button
                          onClick={() => handleInstantiateTemplate(t)}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-brand-highlight text-brand-highlight-text hover:bg-brand-highlight-hover text-xs font-semibold transition-colors cursor-pointer text-center"
                          title="Activate immediately with default schedule"
                        >
                          Quick Activate
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Manual Schedule Builder / Editor Modal ─────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="ui-card w-full max-w-lg p-6 bg-brand-popover border border-brand-border shadow-2xl rounded-2xl relative my-8">
            <div className="flex items-center justify-between pb-4 border-b border-brand-border/40">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Calendar size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-textMain">
                    {editingTriggerId ? 'Edit Scheduled Routine' : 'New Automated Schedule'}
                  </h3>
                  <p className="text-[11px] text-brand-textMuted">
                    {editingTriggerId ? 'Update execution frequency or prompt instruction.' : 'Configure timing, trigger conditions, and actions.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-brand-textMuted hover:text-brand-textMain p-1 rounded-lg hover:bg-brand-sidebar transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveTriggerSubmit} className="mt-4 space-y-4 text-xs">
              {/* Routine Name */}
              <div>
                <label className="text-[11px] font-bold text-brand-textMuted uppercase tracking-wider">
                  Routine Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Morning Standup Brief"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="ui-input w-full mt-1 text-xs"
                />
              </div>

              {/* Trigger Type Selection */}
              <div>
                <label className="text-[11px] font-bold text-brand-textMuted uppercase tracking-wider">
                  Trigger Type
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setModalType('cron')}
                    className={`py-2 px-3 rounded-lg border text-center font-semibold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      modalType === 'cron'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-brand-border bg-brand-card text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    <Clock size={14} />
                    <span>Recurring Time</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalType('watcher')}
                    className={`py-2 px-3 rounded-lg border text-center font-semibold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      modalType === 'watcher'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-brand-border bg-brand-card text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    <Folder size={14} />
                    <span>File Watcher</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalType('webhook')}
                    className={`py-2 px-3 rounded-lg border text-center font-semibold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      modalType === 'webhook'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-brand-border bg-brand-card text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    <Globe size={14} />
                    <span>Webhook / API</span>
                  </button>
                </div>
              </div>

              {/* ─── Schedule / Frequency Picker (when Type is cron) ───────── */}
              {modalType === 'cron' && (
                <div className="p-3.5 rounded-xl bg-brand-sidebar/40 border border-brand-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-brand-textMuted uppercase tracking-wider">
                      Frequency
                    </label>
                    <span className="text-[11px] font-mono text-cyan-400 font-medium">
                      {formatCronNaturalLanguage(computedCronExpression, undefined, 'cron')}
                    </span>
                  </div>

                  {/* Frequency Mode Tabs */}
                  <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-brand-card border border-brand-border">
                    {(['daily', 'weekdays', 'weekly', 'interval', 'monthly', 'custom'] as FrequencyMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setFrequencyMode(mode)}
                        className={`flex-1 min-w-[60px] py-1 text-[11px] rounded-md capitalize font-medium transition-colors cursor-pointer ${
                          frequencyMode === mode
                            ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                            : 'text-brand-textMuted hover:text-brand-textMain'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Frequency Controls based on Mode */}
                  {frequencyMode === 'interval' && (
                    <div>
                      <label className="text-[11px] text-brand-textMuted">Repeat Every:</label>
                      <div className="grid grid-cols-4 gap-2 mt-1">
                        {['15m', '30m', '1h', '2h', '4h', '6h', '12h'].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setIntervalChoice(val)}
                            className={`py-1.5 px-2 rounded-lg border text-center font-medium cursor-pointer transition-colors ${
                              intervalChoice === val
                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                : 'border-brand-border bg-brand-card text-brand-textMuted'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(frequencyMode === 'daily' || frequencyMode === 'weekdays') && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-[11px] text-brand-textMuted">Execution Time (24-hour HH:MM):</label>
                        <input
                          type="time"
                          value={timeOfDay}
                          onChange={(e) => setTimeOfDay(e.target.value)}
                          className="ui-input w-full mt-1 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {frequencyMode === 'weekly' && (
                    <div className="space-y-2">
                      <label className="text-[11px] text-brand-textMuted">Select Days & Time:</label>
                      <div className="flex gap-1.5">
                        {DAY_OPTIONS.map((d) => {
                          const isSelected = selectedDays.includes(d.value);
                          return (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => toggleDaySelection(d.value)}
                              className={`flex-1 py-1.5 rounded-lg border text-center font-semibold text-[11px] cursor-pointer transition-colors ${
                                isSelected
                                  ? 'border-cyan-500 bg-cyan-500/15 text-cyan-400'
                                  : 'border-brand-border bg-brand-card text-brand-textMuted'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-1">
                        <label className="text-[11px] text-brand-textMuted">Time of Day:</label>
                        <input
                          type="time"
                          value={timeOfDay}
                          onChange={(e) => setTimeOfDay(e.target.value)}
                          className="ui-input w-full mt-1 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {frequencyMode === 'monthly' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-brand-textMuted">Day of Month (1-31):</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={dayOfMonth}
                          onChange={(e) => setDayOfMonth(parseInt(e.target.value, 10) || 1)}
                          className="ui-input w-full mt-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-brand-textMuted">Time of Day:</label>
                        <input
                          type="time"
                          value={timeOfDay}
                          onChange={(e) => setTimeOfDay(e.target.value)}
                          className="ui-input w-full mt-1 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {frequencyMode === 'custom' && (
                    <div>
                      <label className="text-[11px] text-brand-textMuted">Cron Expression (min hour dom mon dow):</label>
                      <input
                        type="text"
                        placeholder="0 9 * * 1-5"
                        value={customCron}
                        onChange={(e) => setCustomCron(e.target.value)}
                        className="ui-input w-full mt-1 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ─── File Watcher Target Path ─────────────────────────────── */}
              {modalType === 'watcher' && (
                <div className="p-3.5 rounded-xl bg-brand-sidebar/40 border border-brand-border/60 space-y-2">
                  <label className="text-[11px] font-bold text-brand-textMuted uppercase tracking-wider">
                    Target Folder Path
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="./src or /absolute/path"
                    value={modalPath}
                    onChange={(e) => setModalPath(e.target.value)}
                    className="ui-input w-full mt-1 text-xs font-mono"
                  />
                  <p className="text-[10px] text-brand-textMuted leading-relaxed">
                    Trigger executes whenever files within this directory change (ignoring node_modules and .git).
                  </p>
                </div>
              )}

              {/* ─── Webhook API Helper ───────────────────────────────────── */}
              {modalType === 'webhook' && (
                <div className="p-3.5 rounded-xl bg-brand-sidebar/40 border border-brand-border/60 space-y-2">
                  <label className="text-[11px] font-bold text-brand-textMuted uppercase tracking-wider">
                    Incoming Webhook Endpoint
                  </label>
                  <p className="text-[11px] text-brand-textMuted">
                    This routine can be triggered externally via HTTP POST to the local SuperAgent server:
                  </p>
                  <div className="p-2 rounded-lg bg-black/40 font-mono text-[11px] text-cyan-300">
                    POST http://localhost:1469/api/ipc/triggers-run-now
                  </div>
                </div>
              )}

              {/* Prompt Instruction */}
              <div>
                <label className="text-[11px] font-bold text-brand-textMuted uppercase tracking-wider flex items-center justify-between">
                  <span>Prompt / Agent Instructions</span>
                  <span className="text-[10px] text-brand-textMuted font-normal">Executed by AgentEngine</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Instructions for the agent when this routine executes..."
                  value={modalPrompt}
                  onChange={(e) => setModalPrompt(e.target.value)}
                  className="ui-input w-full mt-1 text-xs resize-none"
                />
              </div>

              {/* Telegram Notification Configuration */}
              <div className="pt-2 border-t border-brand-border/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Send size={14} className="text-sky-400" />
                    <div>
                      <div className="text-xs font-semibold text-brand-textMain">Telegram Notifications</div>
                      <div className="text-[10px] text-brand-textMuted">
                        Send execution summary to Telegram on completion
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalNotifyTelegram}
                    onChange={(e) => setModalNotifyTelegram(e.target.checked)}
                    className="h-4 w-4 rounded border-brand-border text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                  />
                </div>

                {modalNotifyTelegram && (
                  <div className="pl-6 pt-1 animate-fade-in">
                    <label className="text-[10px] text-brand-textMuted">
                      Custom Telegram Chat ID (Leave blank to use default from Settings):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 123456789 or @channel"
                      value={modalTelegramChatId}
                      onChange={(e) => setModalTelegramChatId(e.target.value)}
                      className="ui-input w-full mt-1 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex gap-2 justify-end pt-3 border-t border-brand-border/40">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-highlight text-brand-highlight-text hover:bg-brand-highlight-hover transition-colors cursor-pointer shadow-sm"
                >
                  {editingTriggerId ? 'Save Changes' : 'Create Routine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
