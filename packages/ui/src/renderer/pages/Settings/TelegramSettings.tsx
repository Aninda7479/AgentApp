import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Send, CheckCircle2, AlertCircle, Eye, EyeOff,
  RefreshCw, Key, MessageSquare, Shield, Wifi, WifiOff, Loader2, Bot,
  Sliders, UserCheck, Play, Square, Mic, FileText, Zap
} from 'lucide-react';
import { getIpc } from '../../lib/ipc';
import { SearchableSelect, SearchableSelectOption } from '../../components/ui/SearchableSelect';
import type { ProviderConnection, ModelConfig } from '../../types';

interface ConnectionInfo {
  botName: string;
  username: string;
  botId?: number;
}

interface TelegramBotStatusInfo {
  state: 'stopped' | 'starting' | 'running' | { error: string };
  bot_username?: string;
  bot_name?: string;
  last_poll_time?: string;
  processed_updates?: number;
  active_chats_count?: number;
  debounce_seconds?: number;
  auto_start?: boolean;
}

export interface TelegramSettingsProps {
  connectedProviders?: ProviderConnection[];
  modelsCatalog?: ModelConfig[];
}

export const TelegramSettings: React.FC<TelegramSettingsProps> = ({
  connectedProviders: propProviders,
  modelsCatalog: propModels,
}) => {
  const ipc = getIpc();

  const [botToken, setBotToken] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [twoWayEnabled, setTwoWayEnabled] = useState<boolean>(false);
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [debounceSeconds, setDebounceSeconds] = useState<number>(2.5);
  const [allowedChatIds, setAllowedChatIds] = useState<string[]>([]);
  const [newChatIdInput, setNewChatIdInput] = useState<string>('');

  const [selectedKey, setSelectedKey] = useState<string>('auto');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [fallbackProviders, setFallbackProviders] = useState<ProviderConnection[]>([]);
  const [fallbackModels, setFallbackModels] = useState<ModelConfig[]>([]);
  const [isModelSaved, setIsModelSaved] = useState<boolean>(false);

  const effectiveProviders = propProviders && propProviders.length > 0 ? propProviders : fallbackProviders;
  const effectiveModels = propModels && propModels.length > 0 ? propModels : fallbackModels;

  const enabledModels = useMemo(() => {
    return effectiveModels.filter((m) => m.enabled !== false);
  }, [effectiveModels]);

  const modelOptions = useMemo<SearchableSelectOption[]>(() => {
    const options: SearchableSelectOption[] = [
      {
        value: 'auto',
        label: 'Automatic (Workspace Default)',
        description: 'Uses your primary workspace active AI model',
        metadata: 'Default',
        keywords: 'auto default workspace active assistant',
        raw: { providerId: '', model: 'auto' },
      },
    ];

    const seenKeys = new Set<string>();

    for (const m of enabledModels) {
      const provObj = effectiveProviders.find(
        (p) => p.id === m.providerId || p.name?.toLowerCase() === m.providerId?.toLowerCase()
      );
      const pName = provObj?.name || m.providerId;
      const bareId = m.id.startsWith(`${m.providerId}-`) ? m.id.slice(m.providerId.length + 1) : m.id;
      const key = `${m.providerId}::${bareId}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const hasVision =
          m.inputModalities?.includes('image') ||
          m.id.toLowerCase().includes('vision') ||
          m.id.toLowerCase().includes('llava') ||
          m.id.toLowerCase().includes('4o') ||
          m.id.toLowerCase().includes('gemini') ||
          m.id.toLowerCase().includes('claude');

        options.push({
          value: key,
          label: m.name || bareId,
          description: `By ${pName}`,
          metadata: hasVision ? 'Vision' : '',
          keywords: `${m.name} ${m.id} ${m.providerId} ${pName}`,
          raw: { providerId: m.providerId, model: bareId, providerName: pName, hasVision },
        });
      }
    }

    return options;
  }, [enabledModels, effectiveProviders]);

  const activeSelectedOption = useMemo(() => {
    return modelOptions.find((o) => o.value === selectedKey);
  }, [modelOptions, selectedKey]);

  const [showToken, setShowToken] = useState<boolean>(false);
  const [testText, setTestText] = useState<string>('Hello from SuperAgent! 🚀');

  const [loading, setLoading] = useState<boolean>(true);
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [botToggling, setBotToggling] = useState<boolean>(false);

  // Persistent connection info — set on load (auto-verify) or after a successful test
  const [connInfo, setConnInfo] = useState<ConnectionInfo | null>(null);
  const [botStatus, setBotStatus] = useState<TelegramBotStatusInfo | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);

  // Track snapshot for dirty detection
  const [savedSnapshot, setSavedSnapshot] = useState<{
    botToken: string;
    chatId: string;
    twoWayEnabled: boolean;
    autoStart: boolean;
    debounceSeconds: number;
    allowedChatIds: string[];
    model: string;
    provider: string;
  } | null>(null);

  const isDirty = savedSnapshot !== null &&
    (botToken.trim() !== savedSnapshot.botToken ||
     chatId.trim() !== savedSnapshot.chatId ||
     twoWayEnabled !== savedSnapshot.twoWayEnabled ||
     autoStart !== savedSnapshot.autoStart ||
     debounceSeconds !== savedSnapshot.debounceSeconds ||
     selectedModel !== (savedSnapshot.model || '') ||
     selectedProvider !== (savedSnapshot.provider || '') ||
     JSON.stringify(allowedChatIds) !== JSON.stringify(savedSnapshot.allowedChatIds));

  const [savedOk, setSavedOk] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const refreshBotStatus = useCallback(async () => {
    if (!ipc) return;
    try {
      const res = await ipc.invoke('telegram-bot-status');
      if (res) {
        setBotStatus(res as TelegramBotStatusInfo);
      }
    } catch {
      // Best-effort status query
    }
  }, [ipc]);

  // ── On mount: load config, then silently verify if a token exists ────────────
  useEffect(() => {
    if (!ipc) { setLoading(false); return; }

    const load = async () => {
      try {
        const config = await ipc.invoke('telegram-config-get');
        const token = config?.botToken || config?.bot_token || '';
        const chat = config?.chatId || config?.chat_id || '';
        const twoWay = config?.twoWayEnabled ?? config?.two_way_enabled ?? false;
        const autoStartVal = config?.autoStart ?? config?.auto_start ?? Boolean(twoWay);
        const debounce = config?.debounceSeconds ?? config?.debounce_seconds ?? 2.5;
        const allowed = (config?.allowedChatIds || config?.allowed_chat_ids || []) as string[];
        const savedMod = config?.model || config?.modelId || config?.model_id || '';
        const savedProv = config?.provider || config?.providerId || config?.provider_id || '';

        setBotToken(token);
        setChatId(chat);
        setTwoWayEnabled(Boolean(twoWay));
        setAutoStart(Boolean(autoStartVal));
        setDebounceSeconds(Number(debounce) || 2.5);
        setAllowedChatIds(Array.isArray(allowed) ? allowed : []);
        setSelectedModel(savedMod);
        setSelectedProvider(savedProv);

        if (!savedMod || savedMod === 'auto') {
          setSelectedKey('auto');
        } else if (savedProv) {
          setSelectedKey(`${savedProv}::${savedMod}`);
        } else {
          setSelectedKey(savedMod);
        }

        setSavedSnapshot({
          botToken: token,
          chatId: chat,
          twoWayEnabled: Boolean(twoWay),
          autoStart: Boolean(autoStartVal),
          debounceSeconds: Number(debounce) || 2.5,
          allowedChatIds: Array.isArray(allowed) ? allowed : [],
          model: savedMod,
          provider: savedProv,
        });

        // Load fallback providers and models from settings-read
        try {
          const settings = await ipc.invoke('settings-read');
          if (Array.isArray(settings?.providers)) {
            setFallbackProviders(settings.providers);
          }
          if (Array.isArray(settings?.models)) {
            setFallbackModels(settings.models);
          }
        } catch {}

        if (token) {
          setVerifying(true);
          try {
            const res = await ipc.invoke('telegram-test', {
              botToken: token,
              chatId: chat || undefined,
              sendTestMessage: false,
            });
            if (res?.success) {
              setConnInfo({ botName: res.botName, username: res.username, botId: res.botId });
              setSavedOk(true);
            }
          } catch {
            // Ignore temporary validation failure
          } finally {
            setVerifying(false);
          }
        }

        await refreshBotStatus();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Failed to load Telegram config:', msg);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ipc, refreshBotStatus]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const persistConfig = async (
    token: string,
    chat: string,
    twoWay: boolean,
    autoStartVal: boolean,
    debounce: number,
    allowed: string[],
    mod?: string,
    prov?: string
  ) => {
    const finalMod = mod !== undefined ? mod : selectedModel;
    const finalProv = prov !== undefined ? prov : selectedProvider;

    await ipc!.invoke('telegram-config-save', {
      botToken: token,
      chatId: chat,
      twoWayEnabled: twoWay,
      autoStart: autoStartVal,
      debounceSeconds: debounce,
      allowedChatIds: allowed,
      model: finalMod,
      provider: finalProv,
      enabled: true,
    });
    setSavedSnapshot({
      botToken: token,
      chatId: chat,
      twoWayEnabled: twoWay,
      autoStart: autoStartVal,
      debounceSeconds: debounce,
      allowedChatIds: allowed,
      model: finalMod,
      provider: finalProv,
    });
    await refreshBotStatus();
  };

  const handleModelChange = async (val: string) => {
    setSelectedKey(val);
    let prov = '';
    let mod = '';
    if (val === 'auto') {
      prov = '';
      mod = 'auto';
    } else {
      const matched = modelOptions.find((o) => o.value === val);
      if (matched?.raw) {
        prov = (matched.raw as any).providerId || '';
        mod = (matched.raw as any).model || '';
      } else if (val.includes('::')) {
        const [p, m] = val.split('::');
        prov = p;
        mod = m;
      } else {
        mod = val;
      }
    }
    setSelectedProvider(prov);
    setSelectedModel(mod);
    setIsModelSaved(true);
    setTimeout(() => setIsModelSaved(false), 2500);

    if (ipc) {
      try {
        await persistConfig(
          botToken.trim(),
          chatId.trim(),
          twoWayEnabled,
          autoStart,
          debounceSeconds,
          allowedChatIds,
          mod,
          prov
        );
        setStatus({
          type: 'success',
          message: `Telegram AI model updated to ${mod === 'auto' ? 'Automatic (Workspace Default)' : (mod || 'selected model')}.`,
        });
        setTimeout(() => setStatus(null), 3000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus({ type: 'error', message: `Failed to update Telegram model: ${msg}` });
      }
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ipc) return;
    setSaving(true);
    setStatus(null);
    try {
      const trimmedToken = botToken.trim();
      const trimmedChat = chatId.trim();
      await persistConfig(trimmedToken, trimmedChat, twoWayEnabled, autoStart, debounceSeconds, allowedChatIds);

      if (trimmedToken) {
        try {
          const res = await ipc.invoke('telegram-test', {
            botToken: trimmedToken,
            chatId: trimmedChat || undefined,
            sendTestMessage: false,
          });
          if (res?.success) {
            setConnInfo({ botName: res.botName, username: res.username, botId: res.botId });
            setSavedOk(true);
          }
        } catch {
          // Best effort validation
        }
      }
      setStatus({ type: 'success', message: 'Settings saved successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ type: 'error', message: `Failed to save: ${msg}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!ipc) return;
    if (!botToken.trim()) {
      setStatus({ type: 'error', message: 'Please enter a Bot Token before testing.' });
      return;
    }
    setTesting(true);
    setSavedOk(false);
    setConnInfo(null);
    setStatus(null);
    try {
      const res = await ipc.invoke('telegram-test', {
        botToken: botToken.trim(),
        chatId: chatId.trim() || undefined,
        sendTestMessage: true,
      });
      if (res?.success) {
        await persistConfig(botToken.trim(), chatId.trim(), twoWayEnabled, autoStart, debounceSeconds, allowedChatIds);
        setSavedOk(true);
        setConnInfo({ botName: res.botName, username: res.username, botId: res.botId });
        setStatus({
          type: 'success',
          message: `Connected & saved! Verified as "${res.botName}"${res.username ? ` (@${res.username})` : ''}.${chatId.trim() ? ' Test notification dispatched.' : ''}`,
        });
      } else {
        setStatus({ type: 'error', message: res?.error || 'Failed to connect.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ type: 'error', message: `Connection error: ${msg}` });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleBot = async () => {
    if (!ipc) return;
    setBotToggling(true);
    try {
      const isRunning = botStatus?.state === 'running';
      if (isRunning) {
        await ipc.invoke('telegram-bot-stop');
        setTwoWayEnabled(false);
        await persistConfig(botToken.trim(), chatId.trim(), false, autoStart, debounceSeconds, allowedChatIds);
      } else {
        setTwoWayEnabled(true);
        await persistConfig(botToken.trim(), chatId.trim(), true, autoStart, debounceSeconds, allowedChatIds);
        const res = await ipc.invoke('telegram-bot-start');
        if (res?.error) {
          setStatus({ type: 'error', message: `Bot start error: ${res.error}` });
        }
      }
      await refreshBotStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ type: 'error', message: `Bot toggle error: ${msg}` });
    } finally {
      setBotToggling(false);
    }
  };

  const handleToggleAutoStart = async (newVal: boolean) => {
    setAutoStart(newVal);
    if (!ipc) return;
    try {
      await persistConfig(
        botToken.trim(),
        chatId.trim(),
        twoWayEnabled,
        newVal,
        debounceSeconds,
        allowedChatIds
      );
      setStatus({
        type: 'success',
        message: newVal
          ? 'Auto-start enabled: Bot listener will automatically start when the backend boots.'
          : 'Auto-start disabled: Bot will only run when manually started.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ type: 'error', message: `Failed to update auto-start setting: ${msg}` });
    }
  };

  const handleAddAllowedChat = () => {
    const trimmed = newChatIdInput.trim();
    if (!trimmed) return;
    if (!allowedChatIds.includes(trimmed)) {
      setAllowedChatIds([...allowedChatIds, trimmed]);
    }
    setNewChatIdInput('');
  };

  const handleRemoveAllowedChat = (idToRemove: string) => {
    setAllowedChatIds(allowedChatIds.filter(id => id !== idToRemove));
  };

  const handleSendCustomMessage = async () => {
    if (!ipc || !testText.trim()) return;
    setTesting(true);
    setStatus(null);
    try {
      const res = await ipc.invoke('telegram-send', {
        botToken: botToken.trim() || undefined,
        chatId: chatId.trim() || undefined,
        text: testText.trim(),
      });
      if (res?.success) {
        setStatus({ type: 'success', message: `Message delivered! (ID: ${res.messageId || 'sent'})` });
      } else {
        setStatus({ type: 'error', message: res?.error || 'Failed to send.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ type: 'error', message: `Error: ${msg}` });
    } finally {
      setTesting(false);
    }
  };

  const handleFieldChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setSavedOk(false);
    setConnInfo(null);
  };

  const isConnected = savedOk && connInfo !== null;
  const isBotActive = botStatus?.state === 'running';

  return (
    <div className="mx-auto w-full max-w-3xl text-left">

      {/* Header */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
          <Send size={18} />
        </div>
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
            Telegram Agent & Bot
          </h1>
          <p className="mt-1 text-sm text-brand-textMuted">
            Two-way autonomous agent, notifications, voice transcription, and multi-message human burst handling.
          </p>
        </div>
      </div>

      {/* ── Connection Status Card ── */}
      {!loading && (
        verifying ? (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-brand-border/40 bg-brand-sidebar/40 px-5 py-4 text-xs text-brand-textMuted">
            <Loader2 size={15} className="animate-spin shrink-0" />
            <span>Verifying saved credentials…</span>
          </div>
        ) : isConnected ? (
          <div className="mb-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <Wifi size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> Bot Connected & Verified
                  </p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
                    isBotActive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isBotActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-400'}`} />
                    {isBotActive ? 'Two-Way Listener Active' : 'Two-Way Listener Inactive'}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
                  <div>
                    <span className="text-brand-textMuted">Bot name</span>
                    <p className="font-semibold text-brand-textMain flex items-center gap-1">
                      <Bot size={11} className="text-sky-400" /> {connInfo!.botName}
                    </p>
                  </div>
                  {connInfo!.username && (
                    <div>
                      <span className="text-brand-textMuted">Username</span>
                      <p className="font-mono font-semibold text-sky-400">@{connInfo!.username}</p>
                    </div>
                  )}
                  {chatId && (
                    <div>
                      <span className="text-brand-textMuted">Primary chat</span>
                      <p className="font-mono font-semibold text-brand-textMain">{chatId}</p>
                    </div>
                  )}
                  {botStatus?.processed_updates !== undefined && (
                    <div>
                      <span className="text-brand-textMuted">Processed updates</span>
                      <p className="font-mono font-semibold text-brand-textMain">{botStatus.processed_updates}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : botToken ? (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-5 py-4 text-xs">
            <WifiOff size={14} className="shrink-0 text-amber-400" />
            <span className="text-amber-300">
              Credentials saved but not yet verified. Click <strong>Test Connection</strong> to confirm.
            </span>
          </div>
        ) : null
      )}

      {/* Transient status banner */}
      {status && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-xl p-4 text-xs leading-relaxed ${
            status.type === 'success'
              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {status.type === 'success'
            ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
            : <AlertCircle  size={16} className="shrink-0 text-rose-400" />}
          <span className="flex-1 font-medium">{status.message}</span>
          <button onClick={() => setStatus(null)} className="shrink-0 opacity-60 hover:opacity-100 text-[10px]">✕</button>
        </div>
      )}

      {/* ── Two-Way Autonomous Agent Bot Card ── */}
      <div className="ui-card mb-6 flex flex-col gap-5 p-6 border-brand-highlight/30 bg-brand-highlight/5">
        <div className="flex items-start justify-between gap-4 border-b border-brand-border/40 pb-4">
          <div>
            <h2 className="text-base font-semibold text-brand-textMain flex items-center gap-2">
              <Bot size={18} className="text-sky-400" />
              Two-Way Autonomous Agent Bot
            </h2>
            <p className="mt-1 text-xs text-brand-textMuted leading-relaxed">
              When enabled, you can talk to SuperAgent directly on Telegram using text, voice notes, photos, documents, and videos. The agent will respond contextually and execute tools.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleBot}
            disabled={botToggling || !botToken.trim()}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 disabled:opacity-50 shrink-0 ${
              isBotActive
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25'
                : 'bg-emerald-500 text-black hover:bg-emerald-400'
            }`}
          >
            {botToggling ? (
              <Loader2 size={13} className="animate-spin" />
            ) : isBotActive ? (
              <Square size={13} className="fill-current" />
            ) : (
              <Play size={13} className="fill-current" />
            )}
            <span>{isBotActive ? 'Stop Bot Listener' : 'Start Bot Listener'}</span>
          </button>
        </div>

        {/* ── Auto-Start Bot on Daemon Startup ── */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-brand-border/40">
          <div className="text-left">
            <label className="text-xs font-semibold uppercase tracking-wider text-brand-textMuted flex items-center gap-1.5">
              <Zap size={13} className="text-amber-400" />
              Auto-Start Bot
            </label>
            <p className="mt-1 text-[11px] text-brand-textMuted leading-relaxed">
              Automatically start the Telegram bot listener in the background whenever the backend daemon boots up.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoStart}
            onClick={() => handleToggleAutoStart(!autoStart)}
            className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors duration-200 focus:outline-hidden ${
              autoStart ? 'bg-sky-500' : 'bg-brand-border/80'
            }`}
            title={autoStart ? 'Auto-start enabled' : 'Auto-start disabled'}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                autoStart ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* ── AI Model Selection for Telegram ── */}
        <div className="space-y-3 pb-4 border-b border-brand-border/40">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-brand-textMuted flex items-center gap-1.5">
              <Bot size={13} className="text-sky-400" />
              Telegram AI Model
            </label>
            {isModelSaved && (
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
                <CheckCircle2 size={12} />
                <span>Saved</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-brand-textMuted leading-relaxed">
            Select which AI model handles Telegram conversations, answers queries, analyzes media, and runs tools.
          </p>

          <SearchableSelect
            options={modelOptions}
            value={selectedKey}
            onChange={handleModelChange}
            placeholder="Search your available AI models..."
          />

          <div className="rounded-xl bg-brand-bg/60 border border-brand-border/50 p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="text-brand-textMuted shrink-0">Active Telegram AI:</span>
              <strong className="text-brand-textMain font-medium truncate">
                {activeSelectedOption?.label || selectedModel || 'Automatic (Workspace Default)'}
              </strong>
              {activeSelectedOption?.description && (
                <span className="text-brand-textMuted/80 text-[11px] hidden sm:inline truncate">
                  ({activeSelectedOption.description})
                </span>
              )}
            </div>

            {activeSelectedOption?.metadata && (
              <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 text-[10px] font-semibold shrink-0">
                {activeSelectedOption.metadata}
              </span>
            )}
          </div>
        </div>

        {/* ── Human Burst Debouncing Configuration ── */}
        <div className="space-y-4 pt-1">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-brand-textMuted flex items-center gap-1.5">
                <Sliders size={13} className="text-sky-400" />
                Typing Burst Quiet Window: <span className="font-mono text-sky-400">{debounceSeconds.toFixed(1)}s</span>
              </label>
              <span className="text-[11px] text-brand-textMuted font-mono">
                {debounceSeconds <= 1.5 ? 'Fast Response' : debounceSeconds <= 3.0 ? 'Balanced (Recommended)' : 'Deep Patient Listener'}
              </span>
            </div>
            <input
              type="range"
              min="1.0"
              max="5.0"
              step="0.5"
              value={debounceSeconds}
              onChange={(e) => setDebounceSeconds(parseFloat(e.target.value))}
              className="w-full mt-2 accent-sky-400 cursor-pointer"
            />
            <p className="mt-1.5 text-[11px] text-brand-textMuted leading-relaxed">
              When you send consecutive messages, corrections, or attachments in quick succession, the agent waits this many seconds after your last message before formulating a single comprehensive answer.
            </p>
          </div>

          {/* ── Security & Allowed Chat IDs ── */}
          <div className="pt-3 border-t border-brand-border/40">
            <label className="text-xs font-semibold uppercase tracking-wider text-brand-textMuted flex items-center gap-1.5">
              <UserCheck size={13} className="text-sky-400" />
              Authorized Chat IDs Whitelist
            </label>
            <p className="mt-1 text-[11px] text-brand-textMuted">
              Only authorized users or channels can command the agent. Primary Chat ID ({chatId || 'none'}) is automatically permitted.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter numerical Chat ID (e.g. 987654321)"
                value={newChatIdInput}
                onChange={(e) => setNewChatIdInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAllowedChat(); } }}
                className="ui-input flex-1 text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleAddAllowedChat}
                disabled={!newChatIdInput.trim()}
                className="ui-btn px-3 py-2 text-xs disabled:opacity-50"
              >
                Add ID
              </button>
            </div>

            {allowedChatIds.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {allowedChatIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-sidebar border border-brand-border/60 text-xs font-mono text-brand-textMain"
                  >
                    <span>{id}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAllowedChat(id)}
                      className="text-brand-textMuted hover:text-rose-400 text-xs px-0.5"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Credentials Card ── */}
      <div className="ui-card flex flex-col gap-6 p-6">
        <div className="border-b border-brand-border/40 pb-4">
          <h2 className="text-base font-semibold text-brand-textMain flex items-center gap-2">
            <Key size={16} className="text-brand-textMuted" />
            Bot Credentials
          </h2>
          <p className="mt-1 text-xs text-brand-textMuted leading-relaxed">
            Create a bot with <span className="font-semibold text-brand-textMain">@BotFather</span> on Telegram to get a Bot Token.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Bot Token */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-brand-textMuted">
              Telegram Bot Token
            </label>
            <div className="relative mt-1">
              <input
                type={showToken ? 'text' : 'password'}
                required
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                value={botToken}
                onChange={handleFieldChange(setBotToken)}
                className="ui-input w-full pr-10 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-textMuted hover:text-brand-textMain p-1"
                title={showToken ? 'Hide Token' : 'Show Token'}
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-brand-textMuted">
              Stored locally on your device in settings.json.
            </p>
          </div>

          {/* Default Chat ID */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-brand-textMuted">
              Primary User / Admin Chat ID
            </label>
            <input
              type="text"
              placeholder="e.g. 123456789"
              value={chatId}
              onChange={handleFieldChange(setChatId)}
              className="ui-input w-full mt-1 text-xs font-mono"
            />
            <p className="mt-1 text-[11px] text-brand-textMuted">
              Your personal numerical user ID (from <span className="text-brand-textMain">@userinfobot</span>).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-brand-border/40">
            <button
              type="submit"
              disabled={saving || loading || !botToken.trim()}
              className={[
                'relative px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50',
                isDirty
                  ? 'bg-brand-highlight text-brand-highlight-text shadow-[0_0_14px_3px] shadow-brand-highlight/60 animate-pulse hover:shadow-[0_0_20px_6px] hover:shadow-brand-highlight/70 hover:animate-none'
                  : 'bg-brand-highlight text-brand-highlight-text hover:bg-brand-highlight-hover',
              ].join(' ')}
            >
              {saving ? 'Saving…' : isDirty ? 'Save Changes' : 'Save Settings'}
            </button>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || loading || !botToken.trim()}
              className="ui-btn flex items-center gap-1.5 text-xs px-3.5 py-2 disabled:opacity-50"
            >
              {testing
                ? <Loader2 size={13} className="animate-spin" />
                : isConnected && !isDirty
                  ? <CheckCircle2 size={13} className="text-emerald-400" />
                  : <RefreshCw size={13} />}
              <span>
                {testing ? 'Verifying…' : isConnected && !isDirty ? 'Re-test' : 'Test Connection'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* ── Quick Outbound Dispatch Test ── */}
      <div className="ui-card mt-6 flex flex-col gap-4 p-6">
        <div className="border-b border-brand-border/40 pb-3">
          <h2 className="text-base font-semibold text-brand-textMain flex items-center gap-2">
            <MessageSquare size={16} className="text-brand-textMuted" />
            Outbound Dispatch Test
          </h2>
          <p className="mt-1 text-xs text-brand-textMuted">
            Send a direct notification test message to your configured primary chat ID.
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Type a test notification message…"
            className="ui-input w-full text-xs"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSendCustomMessage}
              disabled={testing || !botToken.trim() || !chatId.trim() || !testText.trim()}
              className="ui-btn-primary flex items-center gap-1.5 text-xs px-4 py-2 disabled:opacity-50"
            >
              <Send size={13} className={testing ? 'animate-spin' : ''} />
              <span>Send Test Message</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Agent capabilities info ── */}
      <div className="mt-6 rounded-2xl border border-brand-border/50 bg-brand-sidebar/30 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-textMain flex items-center gap-2">
          <Shield size={14} className="text-brand-highlight" />
          Multimodal Two-Way Intelligence Features
        </h3>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-brand-textMuted">
          <div className="flex items-start gap-2 rounded-xl border border-brand-border/30 bg-brand-bg/40 p-3">
            <Sliders size={15} className="text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-brand-textMain block font-medium">Human Typing Debouncer</strong>
              <span>Consecutive messages, corrections, and thoughts sent in bursts are unified into one turn before replying.</span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-brand-border/30 bg-brand-bg/40 p-3">
            <Mic size={15} className="text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-brand-textMain block font-medium">Voice Transcription</strong>
              <span>Voice notes and audio files sent to the bot are automatically transcribed using Whisper and answered contextually.</span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-brand-border/30 bg-brand-bg/40 p-3">
            <FileText size={15} className="text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-brand-textMain block font-medium">Files & Photos Ingestion</strong>
              <span>Images are processed via vision LLMs; documents, PDFs, and code files are placed in the workspace for tool analysis.</span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-brand-border/30 bg-brand-bg/40 p-3">
            <UserCheck size={15} className="text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-brand-textMain block font-medium">Security Whitelisting</strong>
              <span>Guards execution by rejecting unauthorized users and informing them of their chat ID for pairing.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

