import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Check,
  Sparkles,
  ExternalLink,
  CircleAlert,
  Loader2,
} from 'lucide-react';
import { ImageModelInfo, EngineStatus } from '../../../services/imageService';

export interface OnlineImageModelOption {
  id: string;
  name: string;
  providerId: string;
  inputModalities?: string[];
  outputModalities?: string[];
}

export interface ImageModelSelectProps {
  models: ImageModelInfo[];
  onlineModels?: OnlineImageModelOption[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  onOpenSettings?: () => void;
  engineStatus?: EngineStatus | null;
  className?: string;
}

const fmtBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
};

const getFamilyLabel = (family: string) => {
  switch (family) {
    case 'sd15':
      return 'SD 1.5';
    case 'sdxl':
      return 'SDXL';
    case 'sd35':
      return 'SD 3.5';
    case 'flux':
      return 'FLUX.1';
    case 'custom':
      return 'Custom';
    default:
      return family.toUpperCase();
  }
};

const getProviderLabel = (providerId: string) => {
  switch (providerId.toLowerCase()) {
    case 'openai':
      return 'OpenAI';
    case 'google':
    case 'gemini':
      return 'Google';
    case 'openrouter':
      return 'OpenRouter';
    case 'groq':
      return 'Groq';
    default:
      return providerId.toUpperCase();
  }
};

export const ImageModelSelect: React.FC<ImageModelSelectProps> = ({
  models,
  onlineModels = [],
  selectedModelId,
  onSelectModel,
  onOpenSettings,
  engineStatus,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    openUpward: false,
  });

  const downloadedModels = models.filter((m) => m.is_downloaded);
  const downloadingModels = models.filter((m) => m.is_downloading);
  const activeLocal = downloadedModels.find((m) => m.id === selectedModelId);
  const activeOnline = onlineModels.find((m) => m.id === selectedModelId);
  const hasAnyModels = downloadedModels.length > 0 || onlineModels.length > 0;

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < 280 && rect.top > spaceBelow;
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      updateCoords();
      setIsOpen(!isOpen);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        updateCoords();
        setIsOpen(true);
      } else if (downloadedModels.length > 0) {
        const currentIdx = downloadedModels.findIndex((m) => m.id === selectedModelId);
        const nextIdx =
          e.key === 'ArrowDown'
            ? (currentIdx + 1) % downloadedModels.length
            : (currentIdx - 1 + downloadedModels.length) % downloadedModels.length;
        onSelectModel(downloadedModels[nextIdx].id);
      }
    }
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* ── Custom Trigger Button ── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateCoords();
          setIsOpen(!isOpen);
        }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left text-xs transition-all select-none cursor-pointer outline-none ${
          isOpen
            ? 'bg-brand-card border-[var(--brand-accent-border)] ring-2 ring-[var(--brand-accent-border)]/30'
            : 'bg-brand-bg/60 hover:bg-brand-bg/90 border-brand-border hover:border-brand-border-strong text-brand-textMain'
        }`}
      >
        {activeLocal ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Sparkles size={14} className="text-[var(--brand-accent)] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-brand-textMain truncate">
                {activeLocal.name}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-brand-textMuted mt-0.5 truncate">
                <span className="px-1.5 py-0.5 rounded bg-brand-hover text-brand-textMuted font-medium">
                  {getFamilyLabel(activeLocal.family)}
                </span>
                <span className="font-mono text-brand-textMuted">
                  {activeLocal.quantization}
                </span>
                {activeLocal.size_bytes > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-mono">{fmtBytes(activeLocal.size_bytes)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : activeOnline ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Sparkles size={14} className="text-purple-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-brand-textMain truncate">
                {activeOnline.name}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-brand-textMuted mt-0.5 truncate">
                <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 font-medium">
                  {getProviderLabel(activeOnline.providerId)}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-brand-hover text-brand-textMuted font-medium">
                  Cloud
                </span>
                {activeOnline.inputModalities?.includes('image') ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-[9px]">
                    I2I
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40 text-[9px]">
                    T2I
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <CircleAlert size={15} className="text-amber-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-amber-400 truncate">
                No local models installed
              </div>
              <div className="text-[10px] text-brand-textMuted truncate">
                Download a model from settings
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {activeLocal || activeOnline ? (
            <span
              className="w-2 h-2 rounded-full bg-[color:var(--neon-constructive)] shadow-[0_0_8px_rgba(52,211,153,0.6)]"
              title={activeOnline ? "Cloud model ready" : "Model is installed and ready for local inference"}
            />
          ) : (
            <span
              className="w-2 h-2 rounded-full bg-amber-400"
              title="No downloaded models available"
            />
          )}
          <ChevronDown
            size={14}
            className={`text-brand-textMuted transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Downloading banner indicator under select */}
      {downloadingModels.length > 0 && (
        <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--brand-accent)]/10 border border-[var(--brand-accent-border)] flex items-center justify-between text-[11px] text-[var(--brand-accent)] animate-pulse">
          <div className="flex items-center gap-1.5 truncate">
            <Loader2 size={12} className="animate-spin shrink-0" />
            <span className="truncate">
              Downloading {downloadingModels[0].name}...
            </span>
          </div>
          {downloadingModels[0].download_progress !== undefined && (
            <span className="font-mono text-[10px] shrink-0">
              {Math.round(downloadingModels[0].download_progress * 100)}%
            </span>
          )}
        </div>
      )}

      {/* ── Custom Portal Popover List ── */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popupRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: `${coords.left}px`,
              width: `${Math.max(coords.width, 280)}px`,
              ...(coords.openUpward
                ? { bottom: `${window.innerHeight - coords.top + 6}px` }
                : { top: `${coords.top + coords.height + 6}px` }),
            }}
            className="z-[9999] bg-brand-card/95 backdrop-blur-xl border border-brand-border rounded-xl shadow-2xl overflow-hidden p-1.5 flex flex-col gap-1 max-h-[320px] overflow-y-auto animate-in fade-in duration-100"
          >
            {/* Online Models Section */}
            {onlineModels.length > 0 && (
              <div className="space-y-1 py-0.5">
                <div className="px-2.5 py-1 text-[10px] font-semibold text-purple-400 uppercase tracking-wider flex items-center justify-between border-b border-brand-border/30">
                  <span>Online Models ({onlineModels.length})</span>
                  <span className="text-[9px] text-purple-300 font-normal">Cloud API</span>
                </div>
                {onlineModels.map((model) => {
                  const isSelected = model.id === selectedModelId;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelectModel(model.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--brand-accent)]/15 border border-[var(--brand-accent-border)] text-brand-textMain shadow-xs'
                          : 'hover:bg-brand-hover text-brand-textMain border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-4 flex items-center justify-center shrink-0">
                          {isSelected ? (
                            <Check size={14} className="text-[var(--brand-accent)]" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-border" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate text-brand-textMain">
                            {model.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[10px] text-brand-textMuted">
                            <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 font-medium">
                              {getProviderLabel(model.providerId)}
                            </span>
                            {model.inputModalities?.includes('image') ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-[9px]">
                                Image-to-Image
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40 text-[9px]">
                                Text-to-Image
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Local Models Header */}
            <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px] font-semibold text-brand-textMuted uppercase tracking-wider border-b border-brand-border/50">
              <span>Local Models ({downloadedModels.length})</span>
              {downloadedModels.length > 0 && (
                <span className="text-[10px] text-[color:var(--neon-constructive)] font-normal flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-constructive)] inline-block" />
                  Ready
                </span>
              )}
            </div>

            {/* List of Models */}
            {!hasAnyModels ? (
              <div className="p-3 text-center space-y-2.5">
                <div className="flex justify-center text-amber-400">
                  <CircleAlert size={24} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-brand-textMain">
                    No Models Downloaded Yet
                  </div>
                  <p className="text-[11px] text-brand-textMuted mt-0.5">
                    Download Stable Diffusion 1.5, SDXL, or FLUX.1 to generate artwork locally.
                  </p>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenSettings();
                    }}
                    className="ui-btn-primary text-xs w-full flex items-center justify-center gap-1.5 py-2 cursor-pointer shadow-sm"
                  >
                    <Sparkles size={13} />
                    <span>Open Model Catalog & Download</span>
                  </button>
                )}
              </div>
            ) : downloadedModels.length > 0 ? (
              <div className="space-y-1 py-0.5">
                {downloadedModels.map((model) => {
                  const isSelected = model.id === selectedModelId;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelectModel(model.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--brand-accent)]/15 border border-[var(--brand-accent-border)] text-brand-textMain shadow-xs'
                          : 'hover:bg-brand-hover text-brand-textMain border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-4 flex items-center justify-center shrink-0">
                          {isSelected ? (
                            <Check size={14} className="text-[var(--brand-accent)]" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-border" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate text-brand-textMain">
                            {model.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[10px] text-brand-textMuted">
                            <span className="px-1.5 py-0.2 rounded bg-brand-popover text-brand-textMuted">
                              {getFamilyLabel(model.family)}
                            </span>
                            <span className="font-mono text-brand-textMuted">
                              {model.quantization}
                            </span>
                            {model.size_bytes > 0 && (
                              <>
                                <span>•</span>
                                <span className="font-mono">{fmtBytes(model.size_bytes)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Footer Action: Discover & Download */}
            {onOpenSettings && (
              <div className="pt-1 mt-1 border-t border-brand-border/50">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs text-[var(--brand-accent)] hover:bg-brand-hover transition-colors cursor-pointer"
                >
                  <Sparkles size={13} />
                  <span>Explore & Download More Models</span>
                  <ExternalLink size={11} className="opacity-70 ml-0.5" />
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
