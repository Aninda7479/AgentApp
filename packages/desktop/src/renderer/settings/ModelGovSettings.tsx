import React, { useEffect, useState } from 'react';
import { ModelConfig } from './types';
import { Scale, Save, RefreshCw, AlertCircle, FileText, CheckSquare, Square, Sliders, Settings, Award, Sparkles, Coins, Cpu, Layers, Zap, Bot } from 'lucide-react';
import { Button, Select } from '../components/ui';

/** Props for the Orchestrator settings panel. */
interface ModelGovSettingsProps {
  modelsCatalog: ModelConfig[];
  onSaveSettings: (patch: {
    modelGov: {
      enabledModels: string[];
      autoUpdateInstructions: boolean;
      optimizationGoal: 'quality' | 'cost' | 'balanced';
      routingStrategy: 'orchestrator' | 'router';
      categoryOverrides: Record<string, string>;
    }
  }) => void;
}

/** Settings panel for Fugu-based model orchestration, routing strategy, and system instructions. */
export const ModelGovSettings: React.FC<ModelGovSettingsProps> = ({
  modelsCatalog,
  onSaveSettings
}) => {
  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [optimizationGoal, setOptimizationGoal] = useState<'quality' | 'cost' | 'balanced'>('balanced');
  const [routingStrategy, setRoutingStrategy] = useState<'orchestrator' | 'router'>('router');
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({
    coding: '',
    reasoning: '',
    vision: '',
    conversations: ''
  });
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const ipc = typeof window !== 'undefined' && (window as any).require
    ? (window as any).require('electron').ipcRenderer
    : null;

  const loadSettingsAndInstructions = async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const settings = await ipc.invoke('settings-read') as any;
      const inst = await ipc.invoke('model-gov-read-instructions') as string;
      
      const gov = settings.modelGov || {};
      
      // Default to enabling all available models in the catalog if none are specifically saved
      const savedEnabled = gov.enabledModels || modelsCatalog.map(m => m.id);
      
      setEnabledModels(savedEnabled);
      setAutoUpdate(!!gov.autoUpdateInstructions);
      setOptimizationGoal(gov.optimizationGoal || 'balanced');
      setRoutingStrategy(gov.routingStrategy || 'router');
      setCategoryOverrides({
        coding: gov.categoryOverrides?.coding || '',
        reasoning: gov.categoryOverrides?.reasoning || '',
        vision: gov.categoryOverrides?.vision || '',
        conversations: gov.categoryOverrides?.conversations || ''
      });
      setInstructions(inst || '');
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
      // Save configuration patch
      onSaveSettings({
        modelGov: {
          enabledModels,
          autoUpdateInstructions: autoUpdate,
          optimizationGoal,
          routingStrategy,
          categoryOverrides
        }
      });

      // Write instructions markdown file
      await ipc.invoke('model-gov-write-instructions', instructions);
      setMessage({ text: 'Orchestrator settings and system instructions saved successfully!', type: 'success' });
      
      // Re-load instructions in case they were dynamically recompiled in background
      const inst = await ipc.invoke('model-gov-read-instructions') as string;
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
      const newInst = await ipc.invoke('model-gov-update-instructions') as string;
      setInstructions(newInst);
      setMessage({ text: 'Model instructions and pricing rates updated from OpenRouter API successfully!', type: 'success' });
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
      const newInst = await ipc.invoke('model-gov-optimize-instructions-by-ai') as string;
      setInstructions(newInst);
      setMessage({ text: 'Orchestrator system instructions optimized by AI successfully!', type: 'success' });
    } catch (e: any) {
      setMessage({ text: `AI Optimization failed: ${e.message}`, type: 'error' });
    } finally {
      setOptimizing(false);
    }
  };

  const toggleModelSelection = (modelId: string) => {
    setEnabledModels(prev =>
      prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId]
    );
  };

  const selectAllModels = () => setEnabledModels(modelsCatalog.map(m => m.id));
  const clearAllModels = () => setEnabledModels([]);

  const handleOverrideChange = (category: string, value: string) => {
    setCategoryOverrides(prev => ({
      ...prev,
      [category]: value
    }));
  };

  useEffect(() => {
    loadSettingsAndInstructions();
  }, [modelsCatalog]);

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Decentralization level</label>
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
          {modelsCatalog.length > 0 && (
            <div className="flex gap-1.5">
              <Button onClick={selectAllModels} variant="ghost" size="sm">Select all</Button>
              <Button onClick={clearAllModels} variant="ghost" size="sm">Clear</Button>
            </div>
          )}
        </div>

        {modelsCatalog.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {modelsCatalog.map((m) => {
              const isSelected = enabledModels.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleModelSelection(m.id)}
                  className={`flex items-center justify-between p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[var(--brand-accent-tint)] border-[var(--brand-accent-border)] text-brand-textMain'
                      : 'bg-brand-bg/40 border-brand-border/40 hover:bg-brand-hover text-brand-textMuted'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold">{m.name}</div>
                    <div className="text-[10px] opacity-70 mt-0.5 capitalize">{m.providerId}</div>
                  </div>
                  {isSelected ? (
                    <CheckSquare size={16} className="text-[var(--brand-accent)] flex-shrink-0" />
                  ) : (
                    <Square size={16} className="text-brand-border flex-shrink-0" />
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

      {/* Instructions Editor */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-3">
        <div>
          <h2 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={14} className="text-[var(--brand-accent)]" />
            <span>Orchestrator System Instructions (model-gov-instructions.md) [Dynamic]</span>
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
