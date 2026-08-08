/**
 * Model Picker Component (Pure TailwindCSS)
 * Sleek dropdown selector grouped by connected AI providers.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Cpu, Check, Sparkles } from 'lucide-react';
import { useModelList } from '../hooks/useModelList';
import { useLastUsedModel, providerStore } from '../stores/providerStore';

interface ModelPickerProps {
  selectedModel: string;
  onSelectModel: (model: string) => void;
  orchestratorEnabled?: boolean;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ selectedModel, onSelectModel, orchestratorEnabled = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { groupedModels, allModels } = useModelList();
  const lastUsedModel = useLastUsedModel();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const effectiveModel = selectedModel || lastUsedModel || allModels[0]?.name || '';

  useEffect(() => {
    const handleClickOutside = (evt: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(evt.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Display label — never show "Orchestrator" as selected when orchestrator is disabled
  const displayLabel = (() => {
    if (!orchestratorEnabled && (effectiveModel === 'Orchestrator' || !effectiveModel)) {
      return allModels[0]?.name || 'Select Model';
    }
    return effectiveModel || (orchestratorEnabled ? 'Orchestrator' : (allModels[0]?.name || 'Select Model'));
  })();

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-bg hover:bg-brand-bg/85 text-brand-textMain border border-brand-border text-xs font-semibold shadow-sm transition-all select-none"
      >
        <Cpu size={14} className="text-cyan-400" />
        <span className="truncate max-w-[140px]">{displayLabel}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-64 max-h-80 overflow-y-auto bg-brand-popover border border-brand-border rounded-2xl shadow-2xl z-50 p-1.5 scrollbar-thin scrollbar-thumb-brand-border">
          {orchestratorEnabled && (
            <div
              onClick={() => {
                onSelectModel('Orchestrator');
                setIsOpen(false);
              }}
              className="flex items-center justify-between p-2 rounded-xl hover:bg-brand-hover cursor-pointer text-xs transition-colors text-brand-textMain"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-cyan-400" />
                <span className="font-semibold text-cyan-300">AI Orchestrator</span>
              </div>
              {displayLabel === 'Orchestrator' && <Check size={14} className="text-cyan-400" />}
            </div>
          )}

          {orchestratorEnabled && <div className="my-1 border-t border-brand-border" />}

          {groupedModels.length === 0 && !orchestratorEnabled && (
            <div className="p-3 text-center text-xs text-brand-textMuted">
              No models enabled. Connect or enable models in Settings.
            </div>
          )}

          {groupedModels.map(({ provider, models }) => (
            <div key={provider.id} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-mono text-brand-textMuted uppercase tracking-wider">
                {provider.name}
              </div>
              {models.map((m) => (
                <div
                  key={m.id}
                  onClick={() => {
                    onSelectModel(m.name);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between p-2 rounded-xl hover:bg-brand-hover cursor-pointer text-xs transition-colors ${
                    displayLabel === m.name ? 'text-brand-textMain font-semibold bg-brand-hover-strong' : 'text-brand-textMuted'
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  {displayLabel === m.name && <Check size={14} className="text-cyan-400" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
