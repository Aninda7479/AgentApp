import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Trash2,
  Wallet,
  Coins,
  BarChart2,
  Cpu,
  Clock,
  Zap,
  Tag,
  Layers,
  ArrowDown,
  ArrowUp,
  Info,
  LucideIcon
} from 'lucide-react';

/** Individual API call record with token counts, cost, and timing. */
interface ModelUsageRecord {
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: string;
  durationMs?: number;
}

/** Per-model per-million-token pricing. */
interface ModelPricing {
  model: string;
  provider: string;
  inputPrice: number;
  outputPrice: number;
}

type Period = 'this-month' | 'last-month' | 'last-3-months' | 'custom';

/** Session uptime anchor — captured once when the renderer module loads. */
const APP_LAUNCH = Date.now();

// ── Formatting helpers ─────────────────────────────────────────────────────
const fmtMoney = (n: number): string =>
  n === 0 ? '$0.00' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
const fmtTokens = (n: number): string => n.toLocaleString();
const fmtSpeed = (tps: number | null): string =>
  tps == null ? '—' : tps >= 1000 ? `${(tps / 1000).toFixed(1)}k tok/s` : `${Math.round(tps)} tok/s`;
const fmtUptime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

// ── Period filtering ──────────────────────────────────────────────────────
function inPeriod(ts: string, period: Period, custom: { start: string; end: string }): boolean {
  const d = new Date(ts);
  const now = new Date();
  if (period === 'this-month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (period === 'last-month') {
    const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return d.getFullYear() === ly && d.getMonth() === lm;
  }
  if (period === 'last-3-months') {
    return d.getTime() >= now.getTime() - 90 * 24 * 3600 * 1000;
  }
  // custom
  if (!custom.start && !custom.end) return true;
  const start = custom.start ? new Date(`${custom.start}T00:00:00`).getTime() : -Infinity;
  const end = custom.end ? new Date(`${custom.end}T23:59:59`).getTime() : Infinity;
  return d.getTime() >= start && d.getTime() <= end;
}

interface AggRow {
  model: string;
  provider: string;
  input: number;
  output: number;
  total: number;
  cost: number;
  calls: number;
  durationMs: number;
}

function aggregate(records: ModelUsageRecord[]): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const r of records) {
    const key = `${r.provider}:${r.model}`;
    let row = map.get(key);
    if (!row) {
      row = { model: r.model, provider: r.provider, input: 0, output: 0, total: 0, cost: 0, calls: 0, durationMs: 0 };
      map.set(key, row);
    }
    row.input += r.promptTokens;
    row.output += r.completionTokens;
    row.total += r.totalTokens;
    row.cost += r.cost;
    row.calls += 1;
    row.durationMs += r.durationMs ?? 0;
  }
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

function speedOf(records: ModelUsageRecord[]): { tps: number | null; measured: number } {
  let toks = 0;
  let ms = 0;
  let measured = 0;
  for (const r of records) {
    if (r.durationMs && r.durationMs > 0) {
      toks += r.totalTokens;
      ms += r.durationMs;
      measured += 1;
    }
  }
  return { tps: ms > 0 ? toks / (ms / 1000) : null, measured };
}

// ── Small presentational pieces ───────────────────────────────────────────
function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  accent
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="ui-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted">{label}</span>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            accent ? 'bg-brand-accent-tint text-brand-accent' : 'bg-brand-hover text-brand-textMuted'
          }`}
        >
          <Icon size={15} />
        </div>
      </div>
      <div className="text-xl font-bold text-brand-textMain font-outfit tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-brand-textMuted">{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="text-brand-textMuted" />
      <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider">{children}</h2>
    </div>
  );
}

const PERIODS: { id: Period; label: string }[] = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'last-3-months', label: 'Last 3 Months' },
  { id: 'custom', label: 'Custom' }
];

/** Settings panel showing AI usage metrics, cost, pricing, and speed. */
export const UsageTrackerSettings: React.FC = () => {
  const [records, setRecords] = useState<ModelUsageRecord[]>([]);
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('this-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [now, setNow] = useState(Date.now());

  const ipc =
    typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;

  const loadStats = async () => {
    if (!ipc) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rec, price] = await Promise.all([
        ipc.invoke('usage-records') as Promise<ModelUsageRecord[]>,
        ipc.invoke('usage-pricing') as Promise<ModelPricing[]>
      ]);
      setRecords(rec || []);
      setPricing(price || []);
    } catch (e) {
      console.error('Failed to load usage statistics:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!ipc) return;
    if (window.confirm('Are you sure you want to clear all model usage history? This action cannot be undone.')) {
      try {
        await ipc.invoke('usage-clear');
        setRecords([]);
        setPricing([]);
      } catch (e) {
        console.error('Failed to clear usage statistics:', e);
      }
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const custom = { start: customStart, end: customEnd };
  const scoped = useMemo(() => records.filter((r) => inPeriod(r.timestamp, period, custom)), [records, period, customStart, customEnd]);
  const rows = useMemo(() => aggregate(scoped), [scoped]);
  const scopedSpeed = useMemo(() => speedOf(scoped), [scoped]);

  const totals = useMemo(() => {
    const t = { cost: 0, tokens: 0, input: 0, output: 0, calls: 0 };
    for (const r of scoped) {
      t.cost += r.cost;
      t.tokens += r.totalTokens;
      t.input += r.promptTokens;
      t.output += r.completionTokens;
      t.calls += 1;
    }
    return t;
  }, [scoped]);

  const expenseThisMonth = useMemo(
    () => records.filter((r) => inPeriod(r.timestamp, 'this-month', custom)).reduce((a, r) => a + r.cost, 0),
    [records]
  );
  const expenseLastMonth = useMemo(
    () => records.filter((r) => inPeriod(r.timestamp, 'last-month', custom)).reduce((a, r) => a + r.cost, 0),
    [records]
  );
  const expenseLast3 = useMemo(
    () => records.filter((r) => inPeriod(r.timestamp, 'last-3-months', custom)).reduce((a, r) => a + r.cost, 0),
    [records]
  );
  const customActive = Boolean(customStart || customEnd);
  const expenseCustom = useMemo(
    () => (customActive ? records.filter((r) => inPeriod(r.timestamp, 'custom', custom)).reduce((a, r) => a + r.cost, 0) : 0),
    [records, customActive, customStart, customEnd]
  );

  const uptimeMs = now - APP_LAUNCH;
  const hasData = records.length > 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--brand-accent)] mb-2" />
        <span>Loading usage logs...</span>
      </div>
    );
  }

  if (!ipc) {
    return (
      <div className="space-y-6 text-left">
        <Header onRefresh={loadStats} onClear={handleClear} hasRecords={false} />
        <div className="border border-brand-border/50 border-dashed rounded-xl p-10 text-center text-sm text-brand-textMuted">
          Usage tracking is available in the desktop app. Open SuperAgent on the desktop to see your
          token and cost analytics here.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[880px] text-left space-y-7 animate-fade-in">
      <Header onRefresh={loadStats} onClear={handleClear} hasRecords={hasData} />

      {/* Timeframe selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-brand-border bg-brand-card p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                period === p.id ? 'bg-brand-accent-tint text-brand-accent' : 'text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2 text-xs text-brand-textMuted">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-card px-2 py-1 text-brand-textMain outline-none"
            />
            <span>→</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-card px-2 py-1 text-brand-textMain outline-none"
            />
          </div>
        )}
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={Wallet}
          label="Expense"
          value={fmtMoney(totals.cost)}
          sub={PERIODS.find((p) => p.id === period)?.label ?? ''}
          accent
        />
        <MetricCard icon={BarChart2} label="Tokens" value={fmtTokens(totals.tokens)} sub={`${fmtTokens(totals.input)} in · ${fmtTokens(totals.output)} out`} />
        <MetricCard icon={Cpu} label="Requests" value={`${totals.calls}`} sub="API calls" />
        <MetricCard icon={Clock} label="Uptime" value={fmtUptime(uptimeMs)} sub="this session" />
      </div>

      {/* Expense overview — explicit periods */}
      <div className="ui-card p-4">
        <SectionTitle icon={Wallet}>Total expense</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ExpenseCell label="This Month" value={fmtMoney(expenseThisMonth)} />
          <ExpenseCell label="Last Month" value={fmtMoney(expenseLastMonth)} />
          <ExpenseCell label="Last 3 Months" value={fmtMoney(expenseLast3)} />
          <ExpenseCell
            label="Custom"
            value={customActive ? fmtMoney(expenseCustom) : '—'}
            hint={customActive ? undefined : 'pick a range above'}
          />
        </div>
      </div>

      {/* Price */}
      <div className="ui-card p-4">
        <SectionTitle icon={Tag}>Price</SectionTitle>
        {pricing.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-brand-textMuted border-b border-brand-border/60 select-none">
                  <th className="py-2 pr-4 font-semibold">Model</th>
                  <th className="py-2 pr-4 font-semibold">Provider</th>
                  <th className="py-2 pr-4 font-semibold text-right">Input / 1M</th>
                  <th className="py-2 font-semibold text-right">Output / 1M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {pricing.map((p) => {
                  const free = p.inputPrice === 0 && p.outputPrice === 0;
                  return (
                    <tr key={`${p.provider}:${p.model}`} className="text-brand-textMuted">
                      <td className="py-2.5 pr-4 font-medium text-brand-textMain">{p.model}</td>
                      <td className="py-2.5 pr-4 capitalize">{p.provider}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">{free ? 'Free' : `$${p.inputPrice.toFixed(2)}`}</td>
                      <td className="py-2.5 text-right font-mono">{free ? 'Local' : `$${p.outputPrice.toFixed(2)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-brand-textMuted">No priced models yet — rates appear once a model has been used.</p>
        )}
      </div>

      {/* Token use per model (input / output) */}
      <div className="ui-card p-4">
        <SectionTitle icon={Layers}>Token use per model</SectionTitle>
        {rows.length > 0 ? (
          <div className="space-y-3.5">
            {rows.map((r) => {
              const inputPct = r.total > 0 ? (r.input / r.total) * 100 : 0;
              return (
                <div key={`${r.provider}:${r.model}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-brand-textMain">{r.model}</span>
                    <span className="text-[11px] text-brand-textMuted font-mono">
                      {fmtTokens(r.input)} in · {fmtTokens(r.output)} out
                    </span>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-brand-hover">
                    <div className="h-full bg-brand-accent transition-all" style={{ width: `${inputPct}%` }} />
                    <div className="h-full bg-brand-text-muted/50" style={{ width: `${100 - inputPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-brand-textMuted">No token activity in this period.</p>
        )}
      </div>

      {/* Token generation speed */}
      <div className="ui-card p-4">
        <SectionTitle icon={Zap}>Token generation speed</SectionTitle>
        <div className="flex items-end gap-3">
          <span className="text-3xl font-bold text-brand-textMain font-outfit tracking-tight">{fmtSpeed(scopedSpeed.tps)}</span>
          <span className="text-xs text-brand-textMuted mb-1">
            {scopedSpeed.measured > 0
              ? `avg across ${scopedSpeed.measured} timed generation${scopedSpeed.measured === 1 ? '' : 's'}`
              : 'timing starts on your next generation'}
          </span>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-brand-textMuted">
          <Info size={12} />
          Measured from the duration of each model call (input + output tokens ÷ elapsed time).
        </p>
      </div>

      {/* Model breakdown table */}
      <div className="ui-card overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border/60 bg-brand-hover">
          <SectionTitle icon={BarChart2}>Model breakdown</SectionTitle>
        </div>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-brand-border/60 text-brand-textMuted bg-brand-hover select-none">
                  <th className="px-4 py-2 font-semibold">Model</th>
                  <th className="px-4 py-2 font-semibold">Provider</th>
                  <th className="px-4 py-2 font-semibold text-right">Requests</th>
                  <th className="px-4 py-2 font-semibold text-right">Input</th>
                  <th className="px-4 py-2 font-semibold text-right">Output</th>
                  <th className="px-4 py-2 font-semibold text-right">Total</th>
                  <th className="px-4 py-2 font-semibold text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {rows.map((r) => (
                  <tr key={`${r.provider}:${r.model}`} className="hover:bg-brand-hover text-brand-textMuted">
                    <td className="px-4 py-2.5 font-medium text-brand-textMain">{r.model}</td>
                    <td className="px-4 py-2.5 capitalize">{r.provider}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.calls}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtTokens(r.input)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtTokens(r.output)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtTokens(r.total)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-brand-textMain font-semibold">{fmtMoney(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-brand-textMuted">No usage records in this period.</div>
        )}
      </div>

      {/* Transaction logs */}
      {scoped.length > 0 && (
        <div className="space-y-3">
          <SectionTitle icon={Clock}>Transaction logs</SectionTitle>
          <div className="max-h-[320px] overflow-y-auto border border-brand-border/60 rounded-xl divide-y divide-brand-border/40 bg-brand-card/40 custom-scrollbar">
            {scoped
              .slice()
              .reverse()
              .map((r, idx) => (
                <div key={idx} className="px-4 py-3 flex justify-between items-center hover:bg-brand-hover transition-colors">
                  <div className="text-left">
                    <div className="text-xs font-semibold text-brand-textMain">{r.model}</div>
                    <div className="text-[10px] text-brand-textMuted mt-0.5 capitalize flex items-center gap-1.5">
                      <span>{r.provider}</span>
                      <span>•</span>
                      <span>{new Date(r.timestamp).toLocaleString()}</span>
                      {r.durationMs ? (
                        <>
                          <span>•</span>
                          <span>{fmtSpeed(r.totalTokens / (r.durationMs / 1000))}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-brand-textMain">{fmtMoney(r.cost)}</div>
                    <div className="text-[10px] text-brand-textMuted mt-0.5 font-mono flex items-center gap-1 justify-end">
                      <ArrowDown size={10} className="text-brand-accent" />
                      {fmtTokens(r.promptTokens)}
                      <ArrowUp size={10} className="text-brand-text-muted" />
                      {fmtTokens(r.completionTokens)}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {!hasData && (
        <div className="border border-brand-border/50 border-dashed rounded-xl p-8 text-center text-xs text-brand-textMuted">
          No usage records found. Send a prompt to the AI agent to start logging API transactions.
        </div>
      )}
    </div>
  );
};

function Header({
  onRefresh,
  onClear,
  hasRecords
}: {
  onRefresh: () => void;
  onClear: () => void;
  hasRecords: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
      <div>
        <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">AI Usage &amp; Cost</h1>
        <p className="text-xs text-brand-textMuted mt-1">
          Token volume, spend, pricing, and generation speed across every connected model.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-hover text-brand-textMain text-xs font-semibold cursor-pointer transition-all active:scale-[0.98]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
        {hasRecords && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[color:var(--neon-destructive)]/25 bg-[color:var(--neon-destructive)]/10 hover:bg-[color:var(--neon-destructive)]/20 text-[color:var(--neon-destructive)] text-xs font-semibold cursor-pointer transition-all active:scale-[0.98]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ExpenseCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-brand-border bg-brand-hover px-3 py-2.5">
      <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted">{label}</div>
      <div className="text-base font-bold text-brand-textMain mt-0.5 font-outfit tracking-tight">{value}</div>
      {hint && <div className="text-[10px] text-brand-textMuted mt-0.5">{hint}</div>}
    </div>
  );
}

export default UsageTrackerSettings;
