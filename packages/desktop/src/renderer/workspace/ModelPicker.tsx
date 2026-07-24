/**
 * Model Picker Component (Pure TailwindCSS)
 * Sleek dropdown selector grouped by connected AI providers.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Cpu, Check, Sparkles } from 'lucide-react';
import { useModelList } from '../hooks/useModelList';
import { useProviderStore } from '../stores/providerStore';

interface ModelPickerProps {
  selectedModel: string;
  onSelectModel: (model: string) => void;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ selectedModel, onSelectModel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { groupedModels, allModels } = useModelList();
  const lastUsedModel = useProviderStore((s) => s.lastUsedModel);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const effectiveModel = selectedModel || lastUsedModel || allModels[0]?.name || 'Orchestrator';

  useEffect(() => {
    const handleClickOutside = (evt: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(evt.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 text-slate-200 border border-slate-700/60 text-xs font-semibold shadow-sm transition-all select-none"
      >
        <Cpu size={14} className="text-cyan-400" />
        <span className="truncate max-w-[140px]">{effectiveModel}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-64 max-h-80 overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 p-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          <div
            onClick={() => {
              onSelectModel('Orchestrator');
              setIsOpen(false);
            }}
            className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/80 cursor-pointer text-xs transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-cyan-400" />
              <span className="font-semibold text-cyan-300">AI Orchestrator</span>
            </div>
            {effectiveModel === 'Orchestrator' && <Check size={14} className="text-cyan-400" />}
          </div>

          <div className="my-1 border-t border-slate-800/80" />

          {groupedModels.map(({ provider, models }) => (
            <div key={provider.id} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                {provider.name}
              </div>
              {models.map((m) => (
                <div
                  key={m.id}
                  onClick={() => {
                    onSelectModel(m.name);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/80 cursor-pointer text-xs transition-colors ${
                    effectiveModel === m.name ? 'text-white font-semibold bg-slate-800/50' : 'text-slate-300'
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  {effectiveModel === m.name && <Check size={14} className="text-cyan-400" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
