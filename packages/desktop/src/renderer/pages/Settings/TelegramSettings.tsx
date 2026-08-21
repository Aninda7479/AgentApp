import React, { useState, useEffect } from 'react';
import {
  Send, CheckCircle2, AlertCircle, Eye, EyeOff,
  RefreshCw, Key, MessageSquare, Shield, Wifi, WifiOff, Loader2, Bot
} from 'lucide-react';
import { getIpc } from '../../lib/ipc';

interface ConnectionInfo {
  botName: string;
  username: string;
  botId?: number;
}

export const TelegramSettings: React.FC = () => {
  const ipc = getIpc();

  const [botToken, setBotToken]   = useState<string>('');
  const [chatId,   setChatId]     = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [testText,  setTestText]  = useState<string>('Hello from SuperAgent! 🚀');

  const [loading,  setLoading]  = useState<boolean>(true);
  const [testing,  setTesting]  = useState<boolean>(false);
  const [saving,   setSaving]   = useState<boolean>(false);

  // Persistent connection info — set on load (auto-verify) or after a successful test
  const [connInfo,   setConnInfo]   = useState<ConnectionInfo | null>(null);
  const [verifying,  setVerifying]  = useState<boolean>(false);   // silent bg check on load

  // Track snapshot of what's on disk for dirty detection
  const [savedSnapshot, setSavedSnapshot] = useState<{ botToken: string; chatId: string } | null>(null);
  const isDirty = savedSnapshot !== null &&
    (botToken.trim() !== savedSnapshot.botToken || chatId.trim() !== savedSnapshot.chatId);

  // Editing clears the "verified" badge until re-tested
  const [savedOk, setSavedOk] = useState<boolean>(false);

  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── On mount: load config, then silently verify if a token exists ────────────
  useEffect(() => {
    if (!ipc) { setLoading(false); return; }

    const load = async () => {
      try {
        const config = await ipc.invoke('telegram-config-get');
        const token = config?.botToken || '';
        const chat  = config?.chatId  || '';
        setBotToken(token);
        setChatId(chat);
        setSavedSnapshot({ botToken: token, chatId: chat });

        if (token) {
          // Silently call getMe to restore connection state across refreshes (no spam message)
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
            // Ignore — token might be temporarily unreachable; user can re-test manually
          } finally {
            setVerifying(false);
          }
        }
      } catch (err) {
        console.error('Failed to load Telegram config:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ipc]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const persistConfig = async (token: string, chat: string) => {
    await ipc!.invoke('telegram-config-save', { botToken: token, chatId: chat, enabled: true });
    setSavedSnapshot({ botToken: token, chatId: chat });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ipc) return;
    setSaving(true);
    setStatus(null);
    try {
      const trimmedToken = botToken.trim();
      const trimmedChat = chatId.trim();
      await persistConfig(trimmedToken, trimmedChat);
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
          // Best effort validation on save
        }
      }
      setStatus({ type: 'success', message: 'Settings saved.' });
    } catch (err: any) {
      setStatus({ type: 'error', message: `Failed to save: ${err.message || err}` });
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
        await persistConfig(botToken.trim(), chatId.trim());
        setSavedOk(true);
        setConnInfo({ botName: res.botName, username: res.username, botId: res.botId });
        setStatus({
          type: 'success',
          message: `Connected & saved! Verified as "${res.botName}"${res.username ? ` (${res.username})` : ''}.${chatId.trim() ? ' Test message sent to your chat.' : ''}`,
        });
      } else {
        setStatus({ type: 'error', message: res?.error || 'Failed to connect.' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: `Connection error: ${err.message || err}` });
    } finally {
      setTesting(false);
    }
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
    } catch (err: any) {
      setStatus({ type: 'error', message: `Error: ${err.message || err}` });
    } finally {
      setTesting(false);
    }
  };

  const handleFieldChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setSavedOk(false);
    setConnInfo(null);  // field edit invalidates the verified connection badge
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const isConnected = savedOk && connInfo !== null;

  return (
    <div className="mx-auto w-full max-w-3xl text-left">

      {/* Header */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
          <Send size={18} />
        </div>
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
            Telegram Integration
          </h1>
          <p className="mt-1 text-sm text-brand-textMuted">
            Send notifications and scheduled task responses directly to Telegram.
          </p>
        </div>
      </div>

      {/* ── Connection Status Card (persistent, shown when verified) ── */}
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
                <p className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 size={13} /> Connected
                </p>
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
                      <p className="font-mono font-semibold text-sky-400">{connInfo!.username}</p>
                    </div>
                  )}
                  {chatId && (
                    <div>
                      <span className="text-brand-textMuted">Default chat</span>
                      <p className="font-mono font-semibold text-brand-textMain">{chatId}</p>
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

      {/* Transient status banner (action feedback) */}
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
              Default Recipient Chat ID / Channel
            </label>
            <input
              type="text"
              placeholder="e.g. 123456789 or @mychannel"
              value={chatId}
              onChange={handleFieldChange(setChatId)}
              className="ui-input w-full mt-1 text-xs font-mono"
            />
            <p className="mt-1 text-[11px] text-brand-textMuted">
              Your numeric user ID (from <span className="text-brand-textMain">@userinfobot</span>) or a public channel (e.g. <span className="text-brand-textMain">@mychannel</span>).
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

      {/* ── Quick Dispatch Test ── */}
      <div className="ui-card mt-6 flex flex-col gap-4 p-6">
        <div className="border-b border-brand-border/40 pb-3">
          <h2 className="text-base font-semibold text-brand-textMain flex items-center gap-2">
            <MessageSquare size={16} className="text-brand-textMuted" />
            Quick Dispatch Test
          </h2>
          <p className="mt-1 text-xs text-brand-textMuted">
            Send a direct payload to verify delivery to your configured chat.
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
          Agent Capabilities Enabled
        </h3>
        <ul className="mt-3 space-y-2 text-xs text-brand-textMuted leading-relaxed list-disc list-inside">
          <li>
            <strong className="text-brand-textMain">Agent Tool:</strong> The AI Agent can use{' '}
            <code className="bg-brand-bg px-1 py-0.5 rounded text-sky-400 font-mono">notify_message(platform='telegram')</code>{' '}
            to deliver messages and alerts.
          </li>
          <li>
            <strong className="text-brand-textMain">Scheduled Delivery:</strong> Any cron or watcher schedule can forward its final output automatically to Telegram.
          </li>
          <li>
            <strong className="text-brand-textMain">Auto-Chunking:</strong> Messages longer than 4,096 characters are split and delivered in sequence.
          </li>
        </ul>
      </div>
    </div>
  );
};
