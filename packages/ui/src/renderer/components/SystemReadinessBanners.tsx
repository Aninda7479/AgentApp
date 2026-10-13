import React from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, RotateCw, Stethoscope, X } from 'lucide-react';

export interface SystemReadinessBannersProps {
  showMissingModel: boolean;
  onConnectProvider: () => void;
  onDismissMissingModel: () => void;

  showDaemonOffline: boolean;
  onRestartDaemon: () => void;
  onOpenDoctor: () => void;
  onDismissDaemonOffline: () => void;
  isRestartingDaemon?: boolean;
}

export const SystemReadinessBanners: React.FC<SystemReadinessBannersProps> = ({
  showMissingModel,
  onConnectProvider,
  onDismissMissingModel,
  showDaemonOffline,
  onRestartDaemon,
  onOpenDoctor,
  onDismissDaemonOffline,
  isRestartingDaemon,
}) => {
  if (!showMissingModel && !showDaemonOffline) {
    return null;
  }

  return (
    <div className="w-full flex flex-col gap-1.5 px-4 pt-2 pb-1 z-30 font-sans text-xs">
      {/* Daemon Offline Warning Banner */}
      {showDaemonOffline && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 backdrop-blur-md animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <span className="truncate">
              <strong>Core Engine Daemon Offline:</strong> Port 1469 is unreachable. Local tools and agent loops require the core service.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isRestartingDaemon}
              onClick={onRestartDaemon}
              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 font-medium text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {isRestartingDaemon ? (
                <RotateCw size={12} className="animate-spin" />
              ) : (
                <RotateCw size={12} />
              )}
              Restart Engine
            </button>
            <button
              type="button"
              onClick={onOpenDoctor}
              className="px-2.5 py-1 rounded-lg bg-brand-bg hover:bg-brand-card text-brand-textMain border border-brand-border font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Stethoscope size={12} className="text-(--brand-highlight)" />
              Diagnostics
            </button>
            <button
              type="button"
              onClick={onDismissDaemonOffline}
              className="p-1 rounded text-red-400 hover:text-red-200 hover:bg-red-500/20 transition-colors cursor-pointer"
              title="Dismiss warning"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Missing Model Banner */}
      {showMissingModel && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 backdrop-blur-md animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle size={15} className="text-amber-400 shrink-0" />
            <span className="truncate">
              <strong>No AI Model Enabled:</strong> Connect an AI provider (Gemini, Claude, OpenAI, Ollama, OpenCode) to start chatting.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onConnectProvider}
              className="ui-btn ui-btn-primary px-3 py-1 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              Connect Provider <ArrowRight size={12} />
            </button>
            <button
              type="button"
              onClick={onDismissMissingModel}
              className="p-1 rounded text-amber-400 hover:text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
