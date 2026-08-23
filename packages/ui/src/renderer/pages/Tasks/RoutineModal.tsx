import React, { useState } from 'react';
import { X, Clock, Sparkles, Send, Bell, Calendar, Repeat } from 'lucide-react';
import type { RoutineTrigger, RoutineTriggerType } from '../../core/types';
import { usePersonas } from '../../hooks/usePersonas';

interface RoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (routine: RoutineTrigger) => Promise<void>;
  initialRoutine?: RoutineTrigger | null;
}

const CRON_PRESETS = [
  { label: 'Every 15 minutes', expr: '*/15 * * * *' },
  { label: 'Hourly', expr: '0 * * * *' },
  { label: 'Daily at 9:00 AM', expr: '0 9 * * *' },
  { label: 'Every Weekday at 9:00 AM', expr: '0 9 * * 1-5' },
  { label: 'Every Sunday at Midnight', expr: '0 0 * * 0' },
  { label: 'Custom Cron Expression', expr: 'custom' },
];

export const RoutineModal: React.FC<RoutineModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialRoutine,
}) => {
  const { personas } = usePersonas();
  const [name, setName] = useState(initialRoutine?.name || '');
  const [description, setDescription] = useState(initialRoutine?.description || '');
  const [triggerType, setTriggerType] = useState<RoutineTriggerType>(initialRoutine?.triggerType || 'cron');
  const [cronPreset, setCronPreset] = useState<string>(
    initialRoutine?.cronExpression ? (CRON_PRESETS.find(p => p.expr === initialRoutine.cronExpression)?.expr || 'custom') : '*/15 * * * *'
  );
  const [customCron, setCustomCron] = useState(initialRoutine?.cronExpression || '*/15 * * * *');
  const [intervalSeconds, setIntervalSeconds] = useState(initialRoutine?.intervalSeconds || 900);
  const [personaId, setPersonaId] = useState(initialRoutine?.personaId || 'trend-radar');
  const [prompt, setPrompt] = useState(initialRoutine?.prompt || '');
  const [notifyTelegram, setNotifyTelegram] = useState(initialRoutine?.notifyTelegram || false);
  const [telegramChatId, setTelegramChatId] = useState(initialRoutine?.telegramChatId || '');
  const [enabled, setEnabled] = useState(initialRoutine?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isEditing = Boolean(initialRoutine);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      setError('Please provide a Routine Name and Prompt template.');
      return;
    }

    setSaving(true);
    setError(null);

    const id = initialRoutine?.id || `routine_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const effectiveCron = cronPreset === 'custom' ? customCron.trim() : cronPreset;

    try {
      const routine: RoutineTrigger = {
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        enabled,
        cronExpression: triggerType === 'cron' ? effectiveCron : undefined,
        intervalSeconds: triggerType === 'interval' ? Number(intervalSeconds) : undefined,
        personaId,
        prompt: prompt.trim(),
        notifyTelegram,
        telegramChatId: notifyTelegram && telegramChatId.trim() ? telegramChatId.trim() : undefined,
        lastRunAt: initialRoutine?.lastRunAt,
        lastStatus: initialRoutine?.lastStatus,
        lastError: initialRoutine?.lastError,
        runCount: initialRoutine?.runCount || 0,
      };

      await onSave(routine);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save scheduled routine');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {isEditing ? `Edit ${initialRoutine?.name}` : 'Create Scheduled Routine'}
              </h2>
              <p className="text-xs text-slate-400">Configure recurring background agent execution</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin scrollbar-thumb-slate-800">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Routine Name</label>
            <input
              type="text"
              placeholder="e.g. 15-Min Market Radar or Daily Email Scanner"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Description (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Scans live feeds and sends structured briefings"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Persona Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Assigned Agent Persona</label>
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.avatarEmoji || '🤖'} {p.name} (@{p.id}) — {p.roleTitle}
                </option>
              ))}
            </select>
          </div>

          {/* Schedule Configuration */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Repeat size={14} className="text-cyan-400" />
                <span>Trigger Schedule</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTriggerType('cron')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    triggerType === 'cron' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  Cron
                </button>
                <button
                  type="button"
                  onClick={() => setTriggerType('interval')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    triggerType === 'interval' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  Interval
                </button>
              </div>
            </div>

            {triggerType === 'cron' ? (
              <div className="space-y-2">
                <select
                  value={cronPreset}
                  onChange={(e) => setCronPreset(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.expr} value={p.expr}>
                      {p.label} ({p.expr})
                    </option>
                  ))}
                </select>

                {cronPreset === 'custom' && (
                  <input
                    type="text"
                    placeholder="e.g. 0 9 * * 1-5"
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
                  />
                )}
              </div>
            ) : (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Repeat Every (Seconds)</label>
                <input
                  type="number"
                  min={30}
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}
          </div>

          {/* Prompt Instruction */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Agent Prompt / Instruction</label>
            <textarea
              rows={3}
              placeholder="e.g. Scan X feed for the latest trending AI advancements, extract top 5 insights, and format a clean update."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
              required
            />
          </div>

          {/* Notification Alert */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800">
            <div className="flex items-center gap-2.5">
              <Bell size={16} className={notifyTelegram ? 'text-cyan-400' : 'text-slate-500'} />
              <div>
                <div className="text-xs font-semibold text-slate-200">Telegram Notification</div>
                <div className="text-[11px] text-slate-400">Send completed result summary to Telegram</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyTelegram}
              onChange={(e) => setNotifyTelegram(e.target.checked)}
              className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
            />
          </div>

          {notifyTelegram && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Telegram Chat ID</label>
              <input
                type="text"
                placeholder="e.g. 123456789"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            <Clock size={14} />
            <span>{saving ? 'Saving...' : isEditing ? 'Update Routine' : 'Create Routine'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
