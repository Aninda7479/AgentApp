import React from 'react';
import { PawPrint, Cpu, Users, Bot, ArrowLeft } from 'lucide-react';

interface PartnerPageProps {
  onBack?: () => void;
}

export const PartnerPage: React.FC<PartnerPageProps> = ({ onBack }) => {
  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-950/10 overflow-y-auto p-6 md:p-8 select-none">
      {/* Top Header */}
      <div className="flex items-center gap-4 mb-8">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-slate-900/40 border border-slate-800/60 hover:bg-slate-800/80 text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer"
            aria-label="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-textMuted uppercase tracking-wider mb-1">
            <span>Ecosystem</span>
            <span className="w-1.5 h-1.5 rounded-full bg-brand-textMuted/40" />
            <span className="text-amber-500 font-bold">Under Construction</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 tracking-tight">
            AI Partner Platform
          </h1>
        </div>
      </div>

      {/* Main glass card */}
      <div className="max-w-4xl w-full mx-auto rounded-3xl bg-brand-popover/20 border border-brand-border/40 backdrop-blur-xl p-6 md:p-10 shadow-2xl flex flex-col md:flex-row gap-8 items-center md:items-stretch mb-8 relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -right-20 -top-20 w-60 h-60 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-60 h-60 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Left info column */}
        <div className="flex-1 flex flex-col justify-between z-10">
          <div>
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 mb-6">
              <PawPrint className="w-6 h-6 animate-bounce" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-brand-textMain mb-4">
              Meet Your Future Digital Coworkers
            </h2>
            <p className="text-sm md:text-base text-brand-textMuted leading-relaxed mb-6">
              The Partner Platform is an upcoming marketplace and configuration dashboard for autonomous AI agents, interactive desktop pets, and pair programming sidebars.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-slate-800/50 text-brand-textMuted mt-0.5">
                <Bot size={16} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-brand-textMain">Desktop Pets & Sprites</h4>
                <p className="text-xs text-brand-textMuted">Bring VRM 3D models or pixel-art sprites to walk and play on your screen.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-slate-800/50 text-brand-textMuted mt-0.5">
                <Cpu size={16} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-brand-textMain">Specialized Agent Roles</h4>
                <p className="text-xs text-brand-textMuted">Hire dedicated agents for automated unit testing, frontend design review, or DB optimization.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right visual decoration / card preview */}
        <div className="w-full md:w-80 flex flex-col justify-center items-center rounded-2xl bg-slate-900/40 border border-slate-800/60 p-6 relative overflow-hidden z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-amber-500/5 pointer-events-none" />
          <div className="relative w-32 h-32 flex items-center justify-center mb-6">
            {/* Outer rings */}
            <div className="absolute inset-0 rounded-full border border-dashed border-amber-500/20 animate-spin" style={{ animationDuration: '20s' }} />
            <div className="absolute inset-2 rounded-full border border-dashed border-orange-500/30 animate-spin" style={{ animationDuration: '10s', animationDirection: 'reverse' }} />
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-500/20 to-orange-500/20 flex items-center justify-center backdrop-blur-sm border border-amber-500/30">
              <Users className="w-10 h-10 text-amber-400" />
            </div>
          </div>

          <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 mb-2">
            Coming Soon
          </span>
          <p className="text-[11px] text-brand-textMuted text-center">
            Currently being designed. Check back in a future update!
          </p>
        </div>
      </div>
    </div>
  );
};

export default PartnerPage;
