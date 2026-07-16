import React, { useEffect, useState } from 'react';
import { Trash2, BarChart2, Coins, Cpu, Clock, RefreshCw } from 'lucide-react';

/** Aggregated usage stats for a single model. */
interface ModelUsageSummary {
  model: string;
  provider: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCost: number;
  callCount: number;
}

/** Individual API call record with token counts and cost. */
interface ModelUsageRecord {
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: string;
}

/** Settings panel showing AI usage metrics, cost breakdown, and transaction logs. */
export const UsageTrackerSettings: React.FC = () => {
  const [summary, setSummary] = useState<ModelUsageSummary[]>([]);
  const [records, setRecords] = useState<ModelUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Resolve ipcRenderer safely
  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  const loadStats = async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const sum = await ipc.invoke('usage-summary') as ModelUsageSummary[];
      const rec = await ipc.invoke('usage-records') as ModelUsageRecord[];
      setSummary(sum || []);
      setRecords((rec || []).reverse()); // newest first
    } catch (e) {
      console.error('Failed to load usage statistics:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!ipc) return;
    if (confirm('Are you sure you want to clear all model usage history? This action cannot be undone.')) {
      try {
        await ipc.invoke('usage-clear');
        setSummary([]);
        setRecords([]);
      } catch (e) {
        console.error('Failed to clear usage statistics:', e);
      }
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const totalCost = summary.reduce((acc, s) => acc + s.totalCost, 0);
  const totalTokens = summary.reduce((acc, s) => acc + s.totalTokens, 0);
  const totalCalls = summary.reduce((acc, s) => acc + s.callCount, 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--brand-accent)] mb-2" />
        <span>Loading usage logs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h1 className="text-base font-bold text-brand-textMain">AI Usage & Cost Tracker</h1>
          <p className="text-xs text-brand-textMuted mt-1">
            Real-time token logging and billing metrics across all connected AI models.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-hover text-brand-textMain text-xs font-semibold cursor-pointer transition-all active:scale-[0.98]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          {records.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[color:var(--neon-destructive)]/25 bg-[color:var(--neon-destructive)]/10 hover:bg-[color:var(--neon-destructive)]/20 text-[color:var(--neon-destructive)] text-xs font-semibold cursor-pointer transition-all active:scale-[0.98]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-card p-4 rounded-xl border border-[var(--brand-accent-border)] flex gap-4 items-center">
          <div className="w-10 h-10 rounded-lg bg-[var(--brand-accent-tint)] text-[var(--brand-accent)] flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted">Cumulative Cost</div>
            <div className="text-lg font-bold text-brand-textMain mt-0.5">${totalCost.toFixed(5)}</div>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-[color:var(--neon-live)]/10 flex gap-4 items-center">
          <div className="w-10 h-10 rounded-lg bg-[color:var(--neon-live)]/10 text-[color:var(--neon-live)] flex items-center justify-center">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted">Total Tokens</div>
            <div className="text-lg font-bold text-brand-textMain mt-0.5">{totalTokens.toLocaleString()}</div>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-[color:var(--neon-constructive)]/10 flex gap-4 items-center">
          <div className="w-10 h-10 rounded-lg bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)] flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted">API Requests</div>
            <div className="text-lg font-bold text-brand-textMain mt-0.5">{totalCalls} calls</div>
          </div>
        </div>
      </div>

      {/* Model Breakdown */}
      {summary.length > 0 ? (
        <div className="glass-card rounded-xl border border-brand-border/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-border/60 bg-brand-hover">
            <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider">Model breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-brand-border/60 text-brand-textMuted bg-brand-hover select-none">
                  <th className="px-4 py-2 font-semibold">Model</th>
                  <th className="px-4 py-2 font-semibold">Provider</th>
                  <th className="px-4 py-2 font-semibold text-right">Requests</th>
                  <th className="px-4 py-2 font-semibold text-right">Prompt Tokens</th>
                  <th className="px-4 py-2 font-semibold text-right">Completion Tokens</th>
                  <th className="px-4 py-2 font-semibold text-right">Total Tokens</th>
                  <th className="px-4 py-2 font-semibold text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {summary.map((row) => (
                  <tr key={`${row.provider}-${row.model}`} className="hover:bg-brand-hover text-brand-textMuted">
                    <td className="px-4 py-2.5 font-medium text-brand-textMain">{row.model}</td>
                    <td className="px-4 py-2.5 capitalize">{row.provider}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{row.callCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{row.totalPromptTokens.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{row.totalCompletionTokens.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{row.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-brand-textMain font-semibold">${row.totalCost.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border border-brand-border/50 border-dashed rounded-xl p-8 text-center text-xs text-brand-textMuted">
          No usage records found. Send a prompt to the AI agent to log API transactions.
        </div>
      )}

      {/* Detailed Call Logs */}
      {records.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-brand-textMuted" />
            <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider">Transaction logs</h2>
          </div>
          <div className="max-h-[300px] overflow-y-auto border border-brand-border/60 rounded-xl divide-y divide-brand-border/40 bg-brand-card/40 custom-scrollbar">
            {records.map((r, idx) => (
              <div key={idx} className="px-4 py-3 flex justify-between items-center hover:bg-brand-hover transition-colors">
                <div className="text-left">
                  <div className="text-xs font-semibold text-brand-textMain">{r.model}</div>
                  <div className="text-[10px] text-brand-textMuted mt-0.5 capitalize flex items-center gap-1.5">
                    <span>{r.provider}</span>
                    <span>•</span>
                    <span>{new Date(r.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-brand-textMain">${r.cost.toFixed(5)}</div>
                  <div className="text-[10px] text-brand-textMuted mt-0.5 font-mono">
                    {r.promptTokens} in / {r.completionTokens} out
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
