import React, { useEffect, useState } from 'react';
import { ModelConfig } from './types';
import { Scale, Save, RefreshCw, AlertCircle, FileText, CheckSquare, Square, Sliders, Settings, Award, Sparkles } from 'lucide-react';

/** Props for the Model Governance settings panel. */
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
      console.error('Failed to load Model Gov configurations:', e);
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
      setMessage({ text: 'Model Governance settings and system instructions saved successfully!', type: 'success' });
      
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
      setMessage({ text: 'Model Governance system instructions optimized by AI successfully!', type: 'success' });
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
        <RefreshCw className="w-5 h-5 animate-spin text-sky-400 mb-2" />
        <span>Loading Model Governance system config...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-border/60 pb-4">
        <div>
          <h2 className="text-base font-bold text-brand-textMain">Model Governance (Fugu Orchestration)</h2>
          <p className="text-xs text-brand-textMuted mt-1">
            Dynamic routing mechanism inspired by Sakana AI's Fugu conducting agent. Auto-switches between enabled models depending on the complexity, cost, and context of each query.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAutoUpdateNow}
            disabled={updatingPrice}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${updatingPrice ? 'animate-spin' : ''}`} />
            <span>Update Swarm Rates</span>
          </button>
          <button
            onClick={handleOptimizeByAI}
            disabled={optimizing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
          >
            <Sparkles className={`w-3.5 h-3.5 ${optimizing ? 'animate-spin' : ''}`} />
            <span>Optimize by AI</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg flex items-start gap-2.5 text-xs ${
          message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          <AlertCircle size={15} className="mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}

      {/* swarm tuning controls */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
          <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <Sliders size={14} className="text-sky-400" />
            <span>Optimization Goal</span>
          </h3>
          <div className="space-y-1">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Select routing objective</label>
            <select
              value={optimizationGoal}
              onChange={(e) => setOptimizationGoal(e.target.value as any)}
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
            >
              <option value="quality">Quality First (Prefer top-tier reasoning/coding)</option>
              <option value="cost">Cost Saver (Prefer cheapest available models)</option>
              <option value="balanced">Balanced (Optimal trade-off quality/cost)</option>
            </select>
          </div>
        </div>

        <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
          <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <Award size={14} className="text-sky-400" />
            <span>Routing Strategy</span>
          </h3>
          <div className="space-y-1">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Decentralization level</label>
            <select
              value={routingStrategy}
              onChange={(e) => setRoutingStrategy(e.target.value as any)}
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
            >
              <option value="router">Single Model Router (Fastest execution)</option>
              <option value="orchestrator">Orchestrator Mode (Decompose & collaborate)</option>
            </select>
          </div>
        </div>
      </div>

      {/* category overrides */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-4">
        <div>
          <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <Settings size={14} className="text-sky-400" />
            <span>Category Overrides</span>
          </h3>
          <p className="text-[11px] text-brand-textMuted mt-1">
            Set static model assignments for specific task domains, overriding dynamic routing options.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 text-left">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold">Coding & engineering</label>
            <select
              value={categoryOverrides.coding}
              onChange={(e) => handleOverrideChange('coding', e.target.value)}
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
            >
              <option value="">Dynamic Swarm Routing</option>
              {activeSwarmModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold">Logic & Reasoning</label>
            <select
              value={categoryOverrides.reasoning}
              onChange={(e) => handleOverrideChange('reasoning', e.target.value)}
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
            >
              <option value="">Dynamic Swarm Routing</option>
              {activeSwarmModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold">Vision & Multimodal</label>
            <select
              value={categoryOverrides.vision}
              onChange={(e) => handleOverrideChange('vision', e.target.value)}
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
            >
              <option value="">Dynamic Swarm Routing</option>
              {activeSwarmModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] text-brand-textMuted uppercase font-bold">Conversations & Summary</label>
            <select
              value={categoryOverrides.conversations}
              onChange={(e) => handleOverrideChange('conversations', e.target.value)}
              className="w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-textMain outline-none focus:border-sky-500/70"
            >
              <option value="">Dynamic Swarm Routing</option>
              {activeSwarmModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Model Selector list */}
      <div className="glass-card rounded-xl border border-brand-border/60 p-4 space-y-3">
        <div>
          <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <CheckSquare size={14} className="text-sky-400" />
            <span>Governance Swarm Pool</span>
          </h3>
          <p className="text-[11px] text-brand-textMuted mt-1">
            Choose which enabled models are available for Fugu to route prompts to. Output quality and pricing rates will determine selection.
          </p>
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
                      ? 'bg-sky-500/10 border-sky-500/40 text-brand-textMain'
                      : 'bg-white/1 border-brand-border/40 hover:bg-white/3 text-brand-textMuted'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold">{m.name}</div>
                    <div className="text-[10px] opacity-70 mt-0.5 capitalize">{m.providerId}</div>
                  </div>
                  {isSelected ? (
                    <CheckSquare size={16} className="text-sky-400 flex-shrink-0" />
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
          <h3 className="text-xs font-bold text-brand-textMain uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={14} className="text-sky-400" />
            <span>Fugu System Instructions (model-gov-instructions.md) [Dynamic]</span>
          </h3>
          <p className="text-[11px] text-brand-textMuted mt-1">
            Markdown system guidelines used to direct task assignments. Automatically re-compiles when you save settings changes.
          </p>
        </div>

        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="w-full h-80 rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs font-mono text-brand-textMain outline-none focus:border-sky-500/70 custom-scrollbar resize-none"
          placeholder="System instructions mapping tasks to capabilities..."
        />
      </div>
    </div>
  );
};
