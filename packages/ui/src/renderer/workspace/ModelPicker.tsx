import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0, openUpward: true });

  const effectiveModel = selectedModel || lastUsedModel || allModels[0]?.name || '';

  const handleSelect = (modelName: string) => {
    providerStore.setLastUsedModel(modelName);
    onSelectModel(modelName);
    setIsOpen(false);
  };

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < 320 && rect.top > spaceBelow;
      setCoords({
        top: rect.top,
        left: rect.left,
        width: Math.max(rect.width, 240),
        height: rect.height,
        openUpward,
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (evt: MouseEvent) => {
      const target = evt.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePopup = popupRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePopup) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isOpen]);

  // Display label — never show "Orchestrator" as selected when orchestrator is disabled
  const displayLabel = (() => {
    if (!orchestratorEnabled && (effectiveModel === 'Orchestrator' || !effectiveModel)) {
      return allModels[0]?.name || 'Select Model';
    }
    return effectiveModel || (orchestratorEnabled ? 'Orchestrator' : (allModels[0]?.name || 'Select Model'));
  })();

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateCoords();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-bg hover:bg-brand-bg/85 text-brand-textMain border border-brand-border text-xs font-semibold shadow-sm transition-all select-none cursor-pointer"
      >
        <Cpu size={14} className="text-cyan-400" />
        <span className="truncate max-w-[140px]">{displayLabel}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            ...(coords.openUpward
              ? { bottom: `${window.innerHeight - coords.top + 6}px` }
              : { top: `${coords.top + coords.height + 6}px` }),
            maxHeight: coords.openUpward
              ? `${Math.min(320, Math.max(160, coords.top - 20))}px`
              : `${Math.min(320, Math.max(160, window.innerHeight - (coords.top + coords.height) - 20))}px`,
          }}
          className="z-[99999] overflow-y-auto bg-brand-popover/95 backdrop-blur-2xl border border-brand-border rounded-2xl shadow-2xl p-1.5 scrollbar-thin scrollbar-thumb-brand-border animate-in fade-in zoom-in-95 duration-100"
        >
          {orchestratorEnabled && (
            <div
              onClick={() => handleSelect('Orchestrator')}
              className="flex items-center justify-between p-2 rounded-xl hover:bg-brand-hover cursor-pointer text-xs transition-colors text-brand-textMain"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-cyan-400" />
                <span className="font-semibold text-cyan-300">AI Orchestrator</span>
              </div>
              {(displayLabel === 'Orchestrator' || effectiveModel === 'Orchestrator') && <Check size={14} className="text-cyan-400" />}
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
              {models.map((m) => {
                const isSelected = displayLabel === m.name || effectiveModel === m.name || effectiveModel === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => handleSelect(m.name)}
                    className={`flex items-center justify-between p-2 rounded-xl hover:bg-brand-hover cursor-pointer text-xs transition-colors ${
                      isSelected ? 'text-brand-textMain font-semibold bg-brand-hover-strong' : 'text-brand-textMuted'
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    {isSelected && <Check size={14} className="text-cyan-400" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};
