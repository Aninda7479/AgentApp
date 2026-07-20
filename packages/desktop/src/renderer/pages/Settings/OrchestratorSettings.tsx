import React, { useEffect, useState } from 'react';
import { ModelConfig } from './types';
import { Scale, Save, RefreshCw, AlertCircle, FileText, CheckSquare, Square, Sliders, Settings, Award, Sparkles, Coins, Cpu, Layers, Zap, Bot, Brain, Activity, Search, Circle } from 'lucide-react';
import { Button, Select } from '../../components/ui';
import { getIpc } from '../../lib/electron';

/** Props for the Orchestrator settings panel. */
interface OrchestratorSettingsProps {
  modelsCatalog: ModelConfig[];
  onSaveSettings: (patch: {
    orchestrator?: {
      enabledModels: string[];
      autoUpdateInstructions: boolean;
      optimizationGoal: 'quality' | 'cost' | 'balanced';
      routingStrategy: 'orchestrator' | 'router';
      reasoningEffort: 'off' | 'low' | 'medium' | 'high';
      categoryOverrides: Record<string, string>;
      freeOnly: boolean;
    };
    modelGov?: {
      enabledModels: string[];
      autoUpdateInstructions: boolean;
      optimizationGoal: 'quality' | 'cost' | 'balanced';
      routingStrategy: 'orchestrator' | 'router';
      reasoningEffort: 'off' | 'low' | 'medium' | 'high';
      categoryOverrides: Record<string, string>;
      freeOnly: boolean;
    };
  }) => void;
}

/** Settings panel for Fugu-based model orchestration, routing strategy, and system instructions. */
export const OrchestratorSettings: React.FC<OrchestratorSettingsProps> = ({
  modelsCatalog,
  onSaveSettings
}) => {
  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [optimizationGoal, setOptimizationGoal] = useState<'quality' | 'cost' | 'balanced'>('balanced');
  const [routingStrategy, setRoutingStrategy] = useState<'orchestrator' | 'router'>('router');
  const [reasoningEffort, setReasoningEffort] = useState<'off' | 'low' | 'medium' | 'high'>('off');
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({
    coding: '',
    reasoning: '',
    vision: '',
    conversations: ''
  });
  const [freeOnly, setFreeOnly] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Live provider-health diagnostics (the resilience signal).
  const [health, setHealth] = useState<Record<string, { status: string; cooldownRemainingMs: number; consecutiveFailures: number }>>({});
  const [healthLoading, setHealthLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latencyMs: number; error?: string; status: string }>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const refreshHealth = async () => {
    if (!ipc) return;
    setHealthLoading(true);
    try {
      const diag = await ipc.invoke('provider-health-diagnostics') as Record<string, { status: string; cooldownRemainingMs: number; consecutiveFailures: number }>;
      setHealth(diag || {});
    } catch {
      /* non-fatal — leave last known state */
    } finally {
      setHealthLoading(false);
    }
  };

  const ipc = typeof window !== 'undefined' && (window as any).require
    ? getIpc()
    : null;

  const loadSettingsAndInstructions = async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const settings = await ipc.invoke('settings-read') as any;
      const inst = await ipc.invoke('orchestrator-read-instructions') as string;
      
      const gov = settings.orchestrator || settings.modelGov || {};
      
      // Default to enabling all available models in the catalog if none are specifically saved
      const savedEnabled = gov.enabledModels || modelsCatalog.map(m => m.id);
      
      setEnabledModels(savedEnabled);
      setAutoUpdate(!!gov.autoUpdateInstructions);
      setOptimizationGoal(gov.optimizationGoal || 'balanced');
      setRoutingStrategy(gov.routingStrategy || 'router');
      setReasoningEffort(gov.reasoningEffort || 'off');
      setFreeOnly(!!gov.freeOnly);
      setCategoryOverrides({
        coding: gov.categoryOverrides?.coding || '',
        reasoning: gov.categoryOverrides?.reasoning || '',
        vision: gov.categoryOverrides?.vision || '',
        conversations: gov.categoryOverrides?.conversations || ''
      });
      setInstructions(inst || '');
      refreshHealth();
    } catch (e) {
      console.error('Failed to load Orchestrator configurations:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!ipc) return;
    setSaving(true);
    setMessage(null);
    try {
      const patch = {
        enabledModels,
        autoUpdateInstructions: autoUpdate,
        optimizationGoal,
        routingStrategy,
        reasoningEffort,
        categoryOverrides,
        freeOnly
      };

      // Save configuration patch
      onSaveSettings({
        orchestrator: patch,
        modelGov: patch
      });

      // Write instructions markdown file
      await ipc.invoke('orchestrator-write-instructions', instructions);
      setMessage({ text: 'Orchestrator settings and system instructions saved successfully!', type: 'success' });
      
      // Re-load instructions in case they were dynamically recompiled in background
      const inst = await ipc.invoke('orchestrator-read-instructions') as string;
      setInstructions(inst);
    } catch (e: any) {
      setMessage({ text: `Failed to save changes: ${e.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoUpdateNow = async () => {
    if (!ipc) return;
    setUpdatingPrice(true);
    setMessage(null);
    try {
      const newInst = await ipc.invoke('orchestrator-update-instructions') as string;
      setInstructions(newInst);
      setMessage({ text: 'Orchestrator instructions and pricing rates updated from OpenRouter API successfully!', type: 'success' });
    } catch (e: any) {
      setMessage({ text: `Pricing update failed: ${e.message}`, type: 'error' });
    } finally {
      setUpdatingPrice(false);
    }
  };

  const [optimizing, setOptimizing] = useState(false);
  const handleOptimizeByAI = async () => {
    if (!ipc) return;
    setOptimizing(true);
    setMessage(null);
    try {
      const newInst = await ipc.invoke('orchestrator-optimize-instructions-by-ai') as string;
      setInstructions(newInst);
      setMessage({ text: 'Orchestrator system instructions optimized by AI successfully!', type: 'success' });
    } catch (e: any) {
      setMessage({ text: `AI Optimization failed: ${e.message}`, type: 'error' });
    } finally {
      setOptimizing(false);
    }
  };

  const handleTestConnections = async () => {
    if (!ipc) return;
    setTesting(true);
    setMessage(null);
    try {
      const results = await ipc.invoke('provider-test-connection') as Array<{ providerId: string; ok: boolean; latencyMs: number; error?: string; status: string }>;
      const map: Record<string, { ok: boolean; latencyMs: number; error?: string; status: string }> = {};
      for (const r of results) map[r.providerId] = r;
      setTestResults(map);
      const okCount = results.filter((r) => r.ok).length;
      if (results.length === 0) {
        setMessage({ text: 'No configured (free) providers found to test. Add a provider key in Settings → AI Config.', type: 'error' });
      } else {
        setMessage({
          text: `${okCount}/${results.length} connection(s) succeeded.${okCount < results.length ? ' Check the rows below for failures.' : ''}`,
          type: okCount === results.length ? 'success' : 'error'
        });
      }
      refreshHealth();
    } catch (e: any) {
      setMessage({ text: `Connection test failed: ${e.message}`, type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const toggleModelSelection = (modelId: string) => {
    // If Free Only is enabled, do not allow selecting a paid model
    const m = modelsCatalog.find(model => model.id === modelId);
    if (freeOnly && m && !m.free) {
      setMessage({ text: 'Cannot enable paid models when "Free Only" mode is active.', type: 'error' });
      return;
    }
    setEnabledModels(prev =>
      prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]
    );
  };

  const selectAllModels = () => {
    if (freeOnly) {
      setEnabledModels(modelsCatalog.filter(m => m.free).map(m => m.id));
    } else {
      setEnabledModels(modelsCatalog.map(m => m.id));
    }
  };
  const clearAllModels = () => setEnabledModels([]);

  const handleOverrideChange = (category: string, value: string) => {
    setCategoryOverrides(prev => ({
      ...prev,
      [category]: value
    }));
  };

  const handleToggleFreeOnly = (checked: boolean) => {
    setFreeOnly(checked);
    if (checked) {
      // Auto enable all free models and disable all paid models
      const freeModelIds = modelsCatalog.filter(m => m.free).map(m => m.id);
      setEnabledModels(freeModelIds);
    }
  };

  useEffect(() => {
    loadSettingsAndInstructions();
  }, [modelsCatalog]);

  // Keep the provider-health view live (ticking cooldown countdown).
  useEffect(() => {
    if (!ipc) return;
    const id = setInterval(refreshHealth, 2000);
    return () => clearInterval(id);
  }, [ipc]);

  const activeSwarmModels = modelsCatalog.filter(m => enabledModels.includes(m.id));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-brand-textMuted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin text-[var(--brand-accent)] mb-2" />
        <span>Loading Orchestrator system config...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Orchestrator</h1>
          <p className="text-xs text-brand-textMuted mt-1">
            Model orchestration layer that auto-routes each query across your enabled models based on complexity, cost, and capability — so no single provider can become a point of failure.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleAutoUpdateNow}
            disabled={updatingPrice}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${updatingPrice ? 'animate-spin' : ''}`} />
            <span>Update Swarm Rates</span>
          </Button>
          <Button
            onClick={handleOptimizeByAI}
            disabled={optimizing}
            variant="secondary"
            size="sm"
          >
            <Sparkles className={`w-3.5 h-3.5 ${optimizing ? 'animate-spin' : ''}`} />
            <span>Optimize by AI</span>
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="primary"
            size="sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </Button>
        </div>
      </div>

      {message && (
        <div className={`ui-state-banner p-3 rounded-lg flex items-start gap-2.5 text-xs ${
          message.type === 'success' ? 'constructive' : 'destructive'
        }`}>
          <AlertCircle size={15} className="mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}

      {/* swarm tuning controls */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
          <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <Sliders size={14} className="text-[var(--brand-accent)]" />
            <span>Optimization Goal</span>
          </h2>
          <div className="space-y-1">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Select routing objective</label>
            <Select
              options={[
                { value: 'quality', label: 'Quality First (Prefer top-tier reasoning/coding)', icon: <Award className="w-3.5 h-3.5" /> },
                { value: 'cost', label: 'Cost Saver (Prefer cheapest available models)', icon: <Coins className="w-3.5 h-3.5" /> },
                { value: 'balanced', label: 'Balanced (Optimal trade-off quality/cost)', icon: <Scale className="w-3.5 h-3.5" /> }
              ]}
              value={optimizationGoal}
              onChange={(val) => setOptimizationGoal(val as any)}
            />
          </div>
        </div>

        <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
          <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <Award size={14} className="text-[var(--brand-accent)]" />
            <span>Routing Strategy</span>
          </h2>
          <div className="space-y-1">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Dispatch mode</label>
            <Select
              options={[
                { value: 'router', label: 'Single Model Router (Fastest execution)', icon: <Cpu className="w-3.5 h-3.5" /> },
                { value: 'orchestrator', label: 'Orchestrator Mode (Decompose & collaborate)', icon: <Layers className="w-3.5 h-3.5" /> }
              ]}
              value={routingStrategy}
              onChange={(val) => setRoutingStrategy(val as any)}
            />
          </div>
        </div>

        <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
          <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <Brain size={14} className="text-[var(--brand-accent)]" />
            <span>Default Reasoning Effort</span>
          </h2>
          <div className="space-y-1">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Thinking depth for routed turns</label>
            <Select
              options={[
                { value: 'off', label: 'Auto (let the orchestrator decide per task)', icon: <Zap className="w-3.5 h-3.5" /> },
                { value: 'low', label: 'Low (fastest, cheapest)', icon: <Zap className="w-3.5 h-3.5" /> },
                { value: 'medium', label: 'Medium (balanced thinking)', icon: <Brain className="w-3.5 h-3.5" /> },
                { value: 'high', label: 'High (deepest reasoning)', icon: <Brain className="w-3.5 h-3.5" /> }
              ]}
              value={reasoningEffort}
              onChange={(val) => setReasoningEffort(val as any)}
            />
            <p className="text-[10px] text-brand-textMuted mt-1.5">
              Overrides per-turn cascade only when no explicit effort is set — hard tasks still escalate.
            </p>
          </div>
        </div>
      </div>

      {/* category overrides */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
        <div>
          <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <Settings size={14} className="text-[var(--brand-accent)]" />
            <span>Category Overrides</span>
          </h2>
          <p className="text-[11px] text-brand-textMuted mt-1">
            Set static model assignments for specific task domains, overriding dynamic routing options.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-left">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold">Coding & engineering</label>
            <Select
              options={[{ value: '', label: 'Dynamic Swarm Routing', icon: <Zap className="w-3.5 h-3.5" /> }, ...activeSwarmModels.map(m => ({ value: m.id, label: m.name, icon: <Bot className="w-3.5 h-3.5" /> }))]}
              value={categoryOverrides.coding || ''}
              onChange={(val) => handleOverrideChange('coding', val)}
            />
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold">Logic & Reasoning</label>
            <Select
              options={[{ value: '', label: 'Dynamic Swarm Routing', icon: <Zap className="w-3.5 h-3.5" /> }, ...activeSwarmModels.map(m => ({ value: m.id, label: m.name, icon: <Bot className="w-3.5 h-3.5" /> }))]}
              value={categoryOverrides.reasoning || ''}
              onChange={(val) => handleOverrideChange('reasoning', val)}
            />
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold">Vision & Multimodal</label>
            <Select
              options={[{ value: '', label: 'Dynamic Swarm Routing', icon: <Zap className="w-3.5 h-3.5" /> }, ...activeSwarmModels.map(m => ({ value: m.id, label: m.name, icon: <Bot className="w-3.5 h-3.5" /> }))]}
              value={categoryOverrides.vision || ''}
              onChange={(val) => handleOverrideChange('vision', val)}
            />
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold">Conversations & Summary</label>
            <Select
              options={[{ value: '', label: 'Dynamic Swarm Routing', icon: <Zap className="w-3.5 h-3.5" /> }, ...activeSwarmModels.map(m => ({ value: m.id, label: m.name, icon: <Bot className="w-3.5 h-3.5" /> }))]}
              value={categoryOverrides.conversations || ''}
              onChange={(val) => handleOverrideChange('conversations', val)}
            />
          </div>
        </div>
      </div>

      {/* Model Selector list */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare size={14} className="text-[var(--brand-accent)]" />
              <span>Orchestrator Model Pool</span>
              <span className="ui-badge muted">{enabledModels.length}/{modelsCatalog.length}</span>
            </h2>
            <p className="text-[11px] text-brand-textMuted mt-1">
              Choose which enabled models the Orchestrator can route prompts across. Output quality and pricing rates determine selection.
            </p>
          </div>
          <div className="flex gap-1.5 items-center">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-brand-textMuted pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter models…"
                className="w-40 pl-7 pr-2 py-1.5 rounded-md border border-brand-border bg-brand-bg text-xs text-brand-textMain outline-none focus:border-[var(--brand-accent-border)]"
              />
            </div>
            {modelsCatalog.length > 0 && (
              <>
                <button
                  onClick={() => handleToggleFreeOnly(!freeOnly)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                    freeOnly 
                      ? 'bg-[var(--brand-accent-tint)] border-[var(--brand-accent-border)] text-brand-textMain'
                      : 'border-brand-border bg-brand-bg/40 text-brand-textMuted hover:bg-brand-hover'
                  }`}
                >
                  {freeOnly ? 'Free Only: On' : 'Free Only'}
                </button>
                <Button onClick={selectAllModels} variant="ghost" size="sm">Select all</Button>
                <Button onClick={clearAllModels} variant="ghost" size="sm">Clear</Button>
              </>
            )}
          </div>
        </div>

        {modelsCatalog.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {modelsCatalog
              .filter((m) => {
                const q = searchQuery.trim().toLowerCase();
                if (!q) return true;
                return m.name.toLowerCase().includes(q) || m.providerId.toLowerCase().includes(q);
              })
              .map((m) => {
                const isSelected = enabledModels.includes(m.id);
                const modalities = (m.inputModalities || []).filter((mod) => mod !== 'text');
                const inPrice = m.pricing?.inputPer1M;
                const outPrice = m.pricing?.outputPer1M;
                const hasPrice = !m.free && (inPrice || outPrice);
                const disabled = freeOnly && !m.free;
                return (
                <button
                  key={m.id}
                  onClick={() => toggleModelSelection(m.id)}
                  disabled={disabled}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[var(--brand-accent-tint)] border-[var(--brand-accent-border)] text-brand-textMain'
                      : 'bg-brand-bg/40 border-brand-border/40 hover:bg-brand-hover text-brand-textMuted'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{m.name}</div>
                    <div className="text-[10px] opacity-70 mt-0.5 capitalize truncate">{m.providerId}{m.contextLimit ? ` · ${m.contextLimit}` : ''}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {m.free && (
                        <span className="ui-badge" style={{ color: 'var(--neon-constructive)', borderColor: 'var(--neon-constructive)' }}>Free</span>
                      )}
                      {hasPrice && (
                        <span className="ui-badge muted" title="Input / Output per 1M tokens">
                          ${inPrice || '?'}/${outPrice || '?'}
                        </span>
                      )}
                      {modalities.map((mod) => (
                        <span key={mod} className="ui-badge muted capitalize">{mod}</span>
                      ))}
                      {m.contextLimit && (
                        <span className="ui-badge muted" title="Context window">{m.contextLimit}</span>
                      )}
                    </div>
                  </div>
                  {isSelected ? (
                    <CheckSquare size={16} className="text-[var(--brand-accent)] flex-shrink-0 ml-2" />
                  ) : (
                    <Square size={16} className="text-brand-border flex-shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-xs text-brand-textMuted py-4">
            No models found in catalog. Enable providers and discover models first under "AI Config".
          </div>
        )}
      </div>

      {/* Provider Health — resilience visibility */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
              <Activity size={14} className="text-[var(--brand-accent)]" />
              <span>Provider Health</span>
            </h2>
            <p className="text-[11px] text-brand-textMuted mt-1">
              Live status of every provider the Orchestrator has contacted. Throttled providers are avoided and rerouted automatically — here's the why.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleTestConnections} variant="ghost" size="sm" disabled={testing}>
              <Zap className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Testing…' : 'Test Connections'}</span>
            </Button>
            <Button onClick={refreshHealth} variant="ghost" size="sm" disabled={healthLoading}>
              <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {Object.keys(health).length === 0 ? (
          <div className="text-center text-xs text-brand-textMuted py-4">
            No provider activity recorded yet. The Orchestrator logs health after it routes or retries a request.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(health).map(([provider, diag]) => {
              const status = diag.status as 'available' | 'locked' | 'rate_limited' | 'deprecated';
              const dotColor =
                status === 'available' ? 'var(--neon-constructive)' :
                status === 'rate_limited' ? 'var(--neon-attention)' :
                'var(--neon-destructive)';
              const statusLabel =
                status === 'available' ? 'Available' :
                status === 'rate_limited' ? `Throttled${diag.cooldownRemainingMs > 0 ? ` · ${Math.ceil(diag.cooldownRemainingMs / 1000)}s` : ''}` :
                status === 'locked' ? 'Locked (auth)' : 'Deprecated';
              const statusNote =
                status === 'rate_limited' ? 'Avoided until cooldown clears, then retried.' :
                status === 'locked' ? 'Check the API key in AI Config.' :
                status === 'deprecated' ? 'Model/endpoint is gone — reconfigure.' :
                'Healthy — eligible for routing.';
              return (
                <div key={provider} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-brand-border/40 bg-brand-bg/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <Circle size={9} className="flex-shrink-0" style={{ fill: dotColor, color: dotColor }} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold capitalize truncate">{provider}</div>
                      <div className="text-[10px] text-brand-textMuted">{statusNote}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[11px] font-semibold" style={{ color: dotColor }}>{statusLabel}</div>
                    {diag.consecutiveFailures > 0 && (
                      <div className="text-[10px] text-brand-textMuted">{diag.consecutiveFailures} fail{diag.consecutiveFailures === 1 ? '' : 's'}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {Object.keys(testResults).length > 0 && (
          <div className="pt-2 border-t border-brand-border/40">
            <div className="text-[10px] uppercase tracking-wider text-brand-textMuted mb-2">Last Connection Test</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(testResults).map(([provider, r]) => {
                const dotColor = r.ok ? 'var(--neon-constructive)' : 'var(--neon-destructive)';
                return (
                  <div key={provider} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-brand-border/40 bg-brand-bg/40" title={r.error || ''}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Circle size={9} className="flex-shrink-0" style={{ fill: dotColor, color: dotColor }} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold capitalize truncate">{provider}</div>
                        <div className="text-[10px] text-brand-textMuted truncate">{r.ok ? `Reachable · ${r.latencyMs}ms` : (r.error || 'Failed').slice(0, 80)}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[11px] font-semibold" style={{ color: dotColor }}>{r.ok ? 'OK' : 'FAIL'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Instructions Editor */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-3">
        <div>
          <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={14} className="text-[var(--brand-accent)]" />
            <span>Orchestrator System Instructions (orchestrator-instructions.md) [Dynamic]</span>
          </h2>
          <p className="text-[11px] text-brand-textMuted mt-1">
            Markdown system guidelines used to direct task assignments. Automatically re-compiles when you save settings changes.
          </p>
        </div>

        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="w-full h-80 rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs font-mono text-brand-textMain outline-none focus:border-[var(--brand-accent-border)] custom-scrollbar resize-none"
          placeholder="System instructions mapping tasks to capabilities..."
        />
      </div>
    </div>
  );
};
