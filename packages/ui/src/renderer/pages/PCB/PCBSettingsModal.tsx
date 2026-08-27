import React, { useState } from 'react';
import {
  Settings,
  Cpu,
  Zap,
  Layers,
  Sparkles,
  X,
  Check,
  Shield,
  FileCode,
  Box,
  Sliders,
} from 'lucide-react';
import { PCBSettingsConfig, DEFAULT_PCB_SETTINGS } from './hardwareAiEngine';
import { useModelList } from '../../hooks/useModelList';
import { useProviderStore } from '../../stores/providerStore';

interface PCBSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PCBSettingsConfig;
  onSaveSettings: (newSettings: PCBSettingsConfig) => void;
}

export const PCBSettingsModal: React.FC<PCBSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  // Fetch available models from providers
  const { enabledModels } = useModelList();
  const allStoreModels = useProviderStore((s) => s.models) || [];
  const availableModels = enabledModels.length > 0 ? enabledModels : allStoreModels;

  const getEffectiveModel = (configured: string) => {
    if (configured && availableModels.some((m) => m.name === configured || m.id === configured)) {
      return configured;
    }
    return availableModels[0]?.name || configured || 'Default AI Model';
  };

  const [draft, setDraft] = useState<PCBSettingsConfig>(() => ({
    ...settings,
    selectedModel: getEffectiveModel(settings.selectedModel),
  }));
  const [activeCategory, setActiveCategory] = useState<'ai' | 'ecad' | 'erc' | 'bom'>('ai');

  // Synchronize draft whenever modal opens or settings/models change
  React.useEffect(() => {
    if (isOpen) {
      setDraft({
        ...settings,
        selectedModel: getEffectiveModel(settings.selectedModel),
      });
    }
  }, [isOpen, settings, availableModels]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveSettings(draft);
    onClose();
  };

  const handleReset = () => {
    setDraft({
      ...DEFAULT_PCB_SETTINGS,
      selectedModel: availableModels[0]?.name || 'Default AI Model',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-[color:var(--brand-surface)] border border-brand-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-brand-textMain animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 border-b border-brand-border/40 px-6 flex items-center justify-between shrink-0 bg-black/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-brand-textMain">PCB Workspace & Co-Pilot Settings</h2>
              <p className="text-[11px] text-brand-textMuted">Configure AI hardware model, ECAD export rules, and ERC constraints</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-brand-border/30 px-6 bg-black/10 text-xs">
          <button
            onClick={() => setActiveCategory('ai')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeCategory === 'ai'
                ? 'border-emerald-500 text-emerald-400 font-semibold'
                : 'border-transparent text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Model & Inference</span>
          </button>
          <button
            onClick={() => setActiveCategory('ecad')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeCategory === 'ecad'
                ? 'border-emerald-500 text-emerald-400 font-semibold'
                : 'border-transparent text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>ECAD & Exporters</span>
          </button>
          <button
            onClick={() => setActiveCategory('erc')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeCategory === 'erc'
                ? 'border-emerald-500 text-emerald-400 font-semibold'
                : 'border-transparent text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Rules & ERC</span>
          </button>
          <button
            onClick={() => setActiveCategory('bom')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeCategory === 'bom'
                ? 'border-emerald-500 text-emerald-400 font-semibold'
                : 'border-transparent text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>BOM & Sourcing</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* AI Model Category */}
          {activeCategory === 'ai' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-textMain mb-1.5">
                  Active Hardware Co-Pilot Model
                </label>
                <p className="text-[11px] text-brand-textMuted mb-2">
                  Select which connected LLM engine interprets your hardware prompts, generates pin assignments, and audits schematics.
                </p>
                <select
                  value={draft.selectedModel}
                  onChange={(e) => setDraft({ ...draft, selectedModel: e.target.value })}
                  className="w-full bg-black/40 border border-brand-border/40 rounded-xl px-3 py-2 text-xs text-brand-textMain focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {availableModels.length > 0 ? (
                    availableModels.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} ({m.providerId})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Claude 3.7 Sonnet / Gemini 2.5">Claude 3.7 Sonnet / Gemini 2.5 Pro</option>
                      <option value="GPT-4o">GPT-4o (OpenAI)</option>
                      <option value="Gemini 2.5 Pro">Google Gemini 2.5 Pro</option>
                      <option value="Llama 3.2 (Local)">Ollama Llama 3.2 (Local)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-textMain mb-1.5">
                  AI Hardware Engineering Strictness
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['standard', 'strict', 'relaxed'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setDraft({ ...draft, ercStrictness: mode })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        draft.ercStrictness === mode
                          ? 'border-emerald-500 bg-emerald-500/10 text-brand-textMain'
                          : 'border-brand-border/30 bg-black/20 text-brand-textMuted hover:text-brand-textMain hover:bg-white/5'
                      }`}
                    >
                      <div className="font-semibold capitalize text-xs">{mode}</div>
                      <div className="text-[10px] text-brand-textMuted/80 mt-1">
                        {mode === 'strict'
                          ? 'Zero tolerance for floating pins or missing passives'
                          : mode === 'standard'
                          ? 'Standard industry IPC-2221 design practices'
                          : 'Permissive exploratory architectural drafting'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-textMain mb-1.5">
                  Custom Hardware Instructions & Directives
                </label>
                <textarea
                  value={draft.customPromptInstructions}
                  onChange={(e) => setDraft({ ...draft, customPromptInstructions: e.target.value })}
                  rows={3}
                  placeholder="e.g. Prioritize ultra-low power consumption, use JLCPCB basic parts library, favor I2C over SPI..."
                  className="w-full bg-black/40 border border-brand-border/40 rounded-xl p-3 text-xs text-brand-textMain focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* ECAD & Exporters Category */}
          {activeCategory === 'ecad' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-textMain mb-1.5">
                  Default Target ECAD Suite
                </label>
                <p className="text-[11px] text-brand-textMuted mb-2">
                  Choose the primary Electronic Design Automation software for generating lossless schematic netlists.
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 'kicad8', name: 'KiCad 8', desc: 'Modern KiCad s-expression netlist & symbols' },
                    { id: 'kicad9', name: 'KiCad 9 (Next-Gen)', desc: 'KiCad 9 latest format with IPC-D-356 netlists' },
                    { id: 'altium', name: 'Altium Designer', desc: 'Industry-standard Altium schematic .NET netlist' },
                    { id: 'skidl', name: 'SKiDL (Python ECAD)', desc: 'Executable Python hardware description script' },
                    { id: 'easyeda', name: 'EasyEDA Pro', desc: 'Direct web & desktop EasyEDA Pro schematic JSON' },
                  ].map((target) => (
                    <div
                      key={target.id}
                      onClick={() => setDraft({ ...draft, targetEcad: target.id as any })}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        draft.targetEcad === target.id
                          ? 'border-emerald-500 bg-emerald-500/10 text-brand-textMain'
                          : 'border-brand-border/30 bg-black/20 text-brand-textMuted hover:text-brand-textMain hover:bg-white/5'
                      }`}
                    >
                      <div className="font-semibold text-xs flex items-center justify-between">
                        <span>{target.name}</span>
                        {draft.targetEcad === target.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <div className="text-[10px] text-brand-textMuted/80 mt-1">{target.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ERC Rules Category */}
          {activeCategory === 'erc' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-brand-border/30">
                <div>
                  <div className="font-semibold text-xs text-brand-textMain">Auto-Run ERC on Every Edit</div>
                  <div className="text-[10px] text-brand-textMuted">Perform real-time electrical rule checks after every component or net modification</div>
                </div>
                <input
                  type="checkbox"
                  checked={draft.autoErcOnEdit}
                  onChange={(e) => setDraft({ ...draft, autoErcOnEdit: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-textMain mb-1.5">
                    Default I2C Pull-Up Resistor
                  </label>
                  <select
                    value={draft.defaultPullupResistor}
                    onChange={(e) => setDraft({ ...draft, defaultPullupResistor: e.target.value as any })}
                    className="w-full bg-black/40 border border-brand-border/40 rounded-xl px-3 py-2 text-xs text-brand-textMain focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="2.2k">2.2kΩ (Fast-Mode Plus / High Capacitance)</option>
                    <option value="4.7k">4.7kΩ (Standard 100k/400k recommended)</option>
                    <option value="10k">10kΩ (Ultra-Low Power / Battery)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-textMain mb-1.5">
                    Default IC Decoupling Capacitor
                  </label>
                  <select
                    value={draft.defaultDecouplingCap}
                    onChange={(e) => setDraft({ ...draft, defaultDecouplingCap: e.target.value as any })}
                    className="w-full bg-black/40 border border-brand-border/40 rounded-xl px-3 py-2 text-xs text-brand-textMain focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="100nF">100nF (0.1µF) Ceramic X7R</option>
                    <option value="1uF">1µF MLCC</option>
                    <option value="10uF">10µF Bulk Ceramic</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* BOM & Sourcing Category */}
          {activeCategory === 'bom' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-textMain mb-1.5">
                  Preferred SMD Passive Package Size
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { pkg: '0402', title: '0402 (1005 Metric)', desc: 'Ultra-compact high-density layouts' },
                    { pkg: '0603', title: '0603 (1608 Metric)', desc: 'Standard hand-solderable & automated' },
                    { pkg: '0805', title: '0805 (2012 Metric)', desc: 'Robust higher-power dissipation' },
                  ].map((p) => (
                    <button
                      key={p.pkg}
                      onClick={() => setDraft({ ...draft, preferredPassivePackage: p.pkg as any })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        draft.preferredPassivePackage === p.pkg
                          ? 'border-emerald-500 bg-emerald-500/10 text-brand-textMain'
                          : 'border-brand-border/30 bg-black/20 text-brand-textMuted hover:text-brand-textMain hover:bg-white/5'
                      }`}
                    >
                      <div className="font-semibold text-xs">{p.title}</div>
                      <div className="text-[10px] text-brand-textMuted/80 mt-1">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-textMain mb-1.5">
                  Preferred Sourcing Distributor
                </label>
                <select
                  value={draft.preferredDistributor}
                  onChange={(e) => setDraft({ ...draft, preferredDistributor: e.target.value as any })}
                  className="w-full bg-black/40 border border-brand-border/40 rounded-xl px-3 py-2 text-xs text-brand-textMain focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="LCSC / JLCPCB">LCSC / JLCPCB SMT Basic & Extended Parts</option>
                  <option value="DigiKey">DigiKey Global Catalog</option>
                  <option value="Mouser">Mouser Electronics</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="h-14 border-t border-brand-border/40 px-6 flex items-center justify-between shrink-0 bg-black/20">
          <button
            onClick={handleReset}
            className="text-xs text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
          >
            Reset to Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-brand-textMuted hover:text-brand-textMain border border-brand-border/40 text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
