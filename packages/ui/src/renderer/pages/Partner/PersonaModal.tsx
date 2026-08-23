import React, { useState } from 'react';
import { X, Bot, Sparkles, Check, Shield, Cpu, Sliders, Wrench } from 'lucide-react';
import type { AgentPersona, CapabilityTier } from '../../core/types';

interface PersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (persona: AgentPersona) => Promise<void>;
  initialPersona?: AgentPersona | null;
}

const TIER_OPTIONS: { value: CapabilityTier; label: string; desc: string }[] = [
  { value: 'deep_reasoning', label: 'Tier 1: Deep Reasoning & Code', desc: 'Complex reasoning, multi-file refactors, autonomous debugging' },
  { value: 'high_throughput', label: 'Tier 2: Real-Time & High Throughput', desc: 'Low-latency search, fast social radar, routine polling' },
  { value: 'long_context', label: 'Tier 3: Long-Context Extraction', desc: '1M+ token context for massive codebases & financial logs' },
  { value: 'local_privacy', label: 'Tier 4: Local & Privacy-Preserving', desc: 'Local Ollama/llama.cpp models with zero external egress' },
  { value: 'multimodal_media', label: 'Tier 5: Multimodal & Media', desc: 'Visual generation, presentations, PDF compiler' },
];

const AVAILABLE_TOOLS = [
  { id: 'read_file', label: 'Read Files' },
  { id: 'write_file', label: 'Write Files' },
  { id: 'edit_file', label: 'Edit Files' },
  { id: 'list_dir', label: 'List Directories' },
  { id: 'run_command', label: 'Execute Terminal Commands' },
  { id: 'grep_search', label: 'Search Codebase (Grep)' },
  { id: 'web_search', label: 'Live Web Search' },
  { id: 'browser_navigate', label: 'Headless Browser Navigation' },
  { id: 'generate_pdf', label: 'PDF Document Compiler' },
  { id: 'generate_presentation', label: 'Presentation Builder' },
  { id: 'run_subagent', label: 'Delegate to Subagents' },
];

export const PersonaModal: React.FC<PersonaModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialPersona,
}) => {
  const [id, setId] = useState(initialPersona?.id || '');
  const [name, setName] = useState(initialPersona?.name || '');
  const [roleTitle, setRoleTitle] = useState(initialPersona?.roleTitle || '');
  const [description, setDescription] = useState(initialPersona?.description || '');
  const [systemPrompt, setSystemPrompt] = useState(initialPersona?.systemPrompt || '');
  const [capabilityTier, setCapabilityTier] = useState<CapabilityTier>(initialPersona?.capabilityTier || 'deep_reasoning');
  const [provider, setProvider] = useState(initialPersona?.modelConfig.provider || 'openai');
  const [modelId, setModelId] = useState(initialPersona?.modelConfig.model_id || 'gpt-4o');
  const [allowedTools, setAllowedTools] = useState<string[]>(initialPersona?.allowedTools || ['read_file', 'write_file', 'list_dir']);
  const [avatarEmoji, setAvatarEmoji] = useState(initialPersona?.avatarEmoji || '🤖');
  const [isCoordinator, setIsCoordinator] = useState(initialPersona?.isCoordinator || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isEditing = Boolean(initialPersona);

  const toggleTool = (toolId: string) => {
    setAllowedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !name.trim()) {
      setError('Please provide an Agent ID and Name.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const persona: AgentPersona = {
        id: id.trim().toLowerCase().replace(/\s+/g, '-'),
        name: name.trim(),
        roleTitle: roleTitle.trim() || 'AI Specialist',
        description: description.trim() || 'Custom digital employee.',
        systemPrompt: systemPrompt.trim() || `You are ${name.trim()}, a specialized digital employee.`,
        capabilityTier,
        modelConfig: {
          provider,
          model_id: modelId,
        },
        allowedTools,
        isCoordinator,
        maxTurns: initialPersona?.maxTurns || 20,
        avatarEmoji: avatarEmoji || '🤖',
        isBuiltin: initialPersona?.isBuiltin || false,
      };

      await onSave(persona);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save agent persona');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center text-lg">
              {avatarEmoji}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {isEditing ? `Edit ${initialPersona?.name}` : 'Create New Agent Persona'}
              </h2>
              <p className="text-xs text-slate-400">Configure persona role, model tier, and allowed tools</p>
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

          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Avatar Emoji</label>
              <input
                type="text"
                value={avatarEmoji}
                onChange={(e) => setAvatarEmoji(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-center text-lg focus:outline-none focus:border-cyan-500"
                maxLength={4}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Agent Name</label>
              <input
                type="text"
                placeholder="e.g. Trend Radar"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!isEditing && !id) {
                    setId(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Agent ID (@handle)</label>
              <input
                type="text"
                placeholder="e.g. trend-radar"
                value={id}
                onChange={(e) => setId(e.target.value)}
                disabled={isEditing && initialPersona?.isBuiltin}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-50 font-mono"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Role Title & Expertise</label>
            <input
              type="text"
              placeholder="e.g. Continuous Market & Social Analyst"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Description</label>
            <input
              type="text"
              placeholder="One-line summary of what this agent does"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Capability Tier */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Cpu size={14} className="text-cyan-400" />
              <span>Model Capability Tier</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TIER_OPTIONS.map((t) => (
                <div
                  key={t.value}
                  onClick={() => setCapabilityTier(t.value)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    capabilityTier === t.value
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs mb-0.5">{t.label}</div>
                  <div className="text-[11px] text-slate-400 leading-tight">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Model Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Ollama (Local)</option>
                <option value="openrouter">OpenRouter</option>
                <option value="deepseek">DeepSeek</option>
                <option value="groq">Groq</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Model ID</label>
              <input
                type="text"
                placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Domain System Prompt</label>
            <textarea
              rows={4}
              placeholder="Instructions defining persona tone, domain expertise, and operational boundaries..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Allowed Tools */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Wrench size={14} className="text-amber-400" />
              <span>Allowed Tools & Capabilities</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AVAILABLE_TOOLS.map((tool) => {
                const isChecked = allowedTools.includes(tool.id);
                return (
                  <div
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs cursor-pointer select-none transition-all ${
                      isChecked
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border ${
                        isChecked ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-700'
                      }`}
                    >
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </div>
                    <span className="truncate">{tool.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
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
            <Sparkles size={14} />
            <span>{saving ? 'Saving...' : isEditing ? 'Update Persona' : 'Create Agent'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
