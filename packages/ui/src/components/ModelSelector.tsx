import React, { useState } from 'react';
import { ChevronDown, Cpu, Check } from 'lucide-react';
import { ModelOption } from '../types.js';
import { AVAILABLE_MODELS } from '../config.js';

interface ModelSelectorProps {
  selectedModel: ModelOption;
  onSelectModel: (model: ModelOption) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onSelectModel }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block text-left select-none">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-slate-200 transition-colors"
      >
        <Cpu className="w-3.5 h-3.5 text-indigo-400" />
        <span className="font-semibold">{selectedModel.name}</span>
        {selectedModel.isFree && (
          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded font-mono">
            FREE
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 bottom-full mb-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-40 p-1.5 space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Select AI Model
            </div>
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onSelectModel(model);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                  model.id === selectedModel.id
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span>{model.name}</span>
                    {model.isFree && (
                      <span className="text-[9px] px-1 py-0.1 bg-emerald-900 text-emerald-300 rounded font-mono">
                        FREE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 capitalize">{model.provider}</div>
                </div>
                {model.id === selectedModel.id && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
