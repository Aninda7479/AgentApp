import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Sparkles, Search, X } from 'lucide-react';
import { useModelList } from '../hooks/useModelList';
import { useLastUsedModel, providerStore } from '../stores/providerStore';

interface ModelPickerProps {
  selectedModel: string;
  onSelectModel: (model: string) => void;
  orchestratorEnabled?: boolean;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ selectedModel, onSelectModel, orchestratorEnabled = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { groupedModels, allModels } = useModelList();
  const lastUsedModel = useLastUsedModel();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0, openUpward: true });

  const effectiveModel = selectedModel || lastUsedModel || allModels[0]?.name || '';

  const handleSelect = (modelName: string) => {
    providerStore.setLastUsedModel(modelName);
    onSelectModel(modelName);
    setIsOpen(false);
    setSearchQuery('');
  };

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < 340 && rect.top > spaceBelow;
      const targetWidth = Math.min(window.innerWidth - 16, Math.max(rect.width, 280));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - targetWidth - 8));
      setCoords({
        top: rect.top,
        left,
        width: targetWidth,
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
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }
    updateCoords();
    // Focus search input after popover renders
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
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

  // Filter models and providers according to search query
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groupedModels;
    return groupedModels
      .map(({ provider, models }) => {
        const providerMatches = provider.name.toLowerCase().includes(q);
        const matchingModels = models.filter(
          (m) =>
            providerMatches ||
            m.name.toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q) ||
            (m.description && m.description.toLowerCase().includes(q))
        );
        return { provider, models: matchingModels };
      })
      .filter((g) => g.models.length > 0);
  }, [groupedModels, searchQuery]);

  const showOrchestrator = useMemo(() => {
    if (!orchestratorEnabled) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return 'orchestrator'.includes(q) || 'ai orchestrator'.includes(q) || 'auto'.includes(q);
  }, [orchestratorEnabled, searchQuery]);

  const totalResultsCount = (showOrchestrator ? 1 : 0) + filteredGroups.reduce((acc, g) => acc + g.models.length, 0);

  return (
    <div className="relative inline-block">
      {/* Trigger Button: Shows text + subtle chevron with brand theme colors */}
      <button
        ref={triggerRef}
        type="button"
        data-testid="model-select-btn"
        onClick={() => {
          updateCoords();
          setIsOpen(!isOpen);
        }}
        className={`group inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors select-none cursor-pointer ${
          isOpen
            ? 'bg-brand-hover text-brand-textMain'
            : 'text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
        }`}
        title={`Model: ${displayLabel}`}
        aria-label={`Select model, currently ${displayLabel}`}
      >
        <span className="truncate max-w-[110px] xs:max-w-[140px] sm:max-w-[200px]">{displayLabel}</span>
        <ChevronDown size={11} className="text-brand-textMuted/60 group-hover:text-brand-textMuted shrink-0 transition-transform duration-150" />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxWidth: 'calc(100vw - 16px)',
            ...(coords.openUpward
              ? { bottom: `${window.innerHeight - coords.top + 6}px` }
              : { top: `${coords.top + coords.height + 6}px` }),
            maxHeight: coords.openUpward
              ? `${Math.min(360, Math.max(180, coords.top - 20))}px`
              : `${Math.min(360, Math.max(180, window.innerHeight - (coords.top + coords.height) - 20))}px`,
          }}
          className="z-[99999] flex flex-col bg-brand-popover/95 backdrop-blur-2xl border border-brand-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search Box */}
          <div className="p-2 border-b border-brand-border/60 shrink-0 bg-brand-popover/50">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-brand-card/80 border border-brand-border focus-within:border-brand-border-strong text-xs">
              <Search size={13} className="text-brand-textMuted shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearchQuery('');
                  }
                }}
                placeholder="Search models..."
                className="w-full bg-transparent text-xs text-brand-textMain placeholder:text-brand-textMuted/60 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-brand-textMuted hover:text-brand-textMain p-0.5 rounded cursor-pointer"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Model Options List */}
          <div className="overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-brand-border flex-1">
            {showOrchestrator && (
              <div
                onClick={() => handleSelect('Orchestrator')}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-brand-hover cursor-pointer text-xs transition-colors text-brand-textMain"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-cyan-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-cyan-300">AI Orchestrator</div>
                    <div className="text-[10px] text-brand-textMuted">Auto-route to optimal model</div>
                  </div>
                </div>
                {(displayLabel === 'Orchestrator' || effectiveModel === 'Orchestrator') && (
                  <Check size={14} className="text-cyan-400 shrink-0 ml-2" />
                )}
              </div>
            )}

            {showOrchestrator && filteredGroups.length > 0 && (
              <div className="my-1 border-t border-brand-border/60" />
            )}

            {totalResultsCount === 0 && (
              <div className="p-4 text-center text-xs text-brand-textMuted">
                {searchQuery ? `No models found matching "${searchQuery}"` : 'No models enabled. Connect or enable models in Settings.'}
              </div>
            )}

            {filteredGroups.map(({ provider, models }) => (
              <div key={provider.id} className="mb-2 last:mb-0">
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
                      <div className="truncate pr-2">
                        <div className="truncate text-xs font-medium text-brand-textMain">{m.name}</div>
                        {m.description && (
                          <div className="truncate text-[10px] text-brand-textMuted">{m.description}</div>
                        )}
                      </div>
                      {isSelected && <Check size={14} className="text-cyan-400 shrink-0 ml-auto" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
