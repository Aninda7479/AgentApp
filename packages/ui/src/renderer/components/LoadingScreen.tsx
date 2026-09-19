import React, { useState, useEffect } from 'react';
import { Terminal, Copy, Check, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';

export interface LoadingScreenProps {
  statusMessage?: string;
  signature?: string;
  isOffline?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
}

const STATUS_MESSAGES = [
  'Initializing autonomous workspace...',
  'Connecting intelligence engine...',
  'Preparing environment...'
];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  statusMessage,
  signature = 'SuperAgent — your autonomous workspace',
  isOffline = false,
  onRetry,
  isRetrying = false,
}) => {
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  const handleCopyCommand = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText('npm run dev:web');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (statusMessage) return;
    const interval = setInterval(() => {
      setCurrentStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [statusMessage]);

  const activeMessage = statusMessage || STATUS_MESSAGES[currentStatusIndex];

  return (
    <div
      data-testid="loading-screen"
      className="fixed inset-0 h-screen w-screen flex items-center justify-center select-none overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0a0f1f 0%, #102233 38%, #16323a 68%, #14302a 100%)',
        color: '#eef1f6',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        zIndex: 9999
      }}
    >
      <style>{`
        @keyframes moonBreath {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.04); opacity: 1; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 0.9; transform: scale(1.2); }
        }
        @keyframes driftA {
          from { transform: translateX(0); }
          to { transform: translateX(-34px); }
        }
        @keyframes driftB {
          from { transform: translateX(0); }
          to { transform: translateX(26px); }
        }
        @keyframes cardRise {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes amberPulse {
          0%, 100% { transform: scaleY(0.35); opacity: 0.45; }
          50% { transform: scaleY(1); opacity: 1; filter: drop-shadow(0 0 6px rgba(217, 160, 102, 0.6)); }
        }
        @keyframes haloPulse {
          0%, 100% { transform: scale(0.95); opacity: 0.35; }
          50% { transform: scale(1.1); opacity: 0.65; }
        }
        @keyframes textFade {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
        .loading-bar-warm {
          animation: amberPulse 1.2s ease-in-out infinite;
          background: linear-gradient(180deg, #fdf6e3 0%, #d9a066 60%, #c98e54 100%);
        }
        .loading-bar-warm:nth-child(1) { animation-delay: 0s; }
        .loading-bar-warm:nth-child(2) { animation-delay: 0.15s; }
        .loading-bar-warm:nth-child(3) { animation-delay: 0.3s; }
        .loading-bar-warm:nth-child(4) { animation-delay: 0.45s; }
        .loading-bar-warm:nth-child(5) { animation-delay: 0.6s; }

        @media (prefers-reduced-motion: reduce) {
          .moon-anim, .star-anim, .hill-anim, .loading-bar-warm, .halo-anim {
            animation: none !important;
          }
        }
      `}</style>

      {/* ── Layered Atmosphere Backdrop ─────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Ambient Top Glow */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(120% 80% at 78% 12%, rgba(217, 160, 102, 0.12), transparent 55%)'
          }}
        />

        {/* Luminous Moon */}
        <div
          className="moon-anim absolute rounded-full"
          style={{
            top: '10%',
            right: '15%',
            width: '130px',
            height: '130px',
            background: 'radial-gradient(circle at 38% 36%, #fdf6e3 0%, #f3e7c9 46%, #e7d3a6 72%, #d9bf8e 100%)',
            boxShadow: '0 0 80px 30px rgba(243, 231, 201, 0.18), inset -10px -12px 26px rgba(120, 96, 60, 0.25)',
            animation: 'moonBreath 11s ease-in-out infinite'
          }}
        />

        {/* Starfield */}
        <div className="absolute inset-0 opacity-70">
          {[
            { top: '14%', left: '18%', delay: '0s', size: 2.5 },
            { top: '22%', left: '42%', delay: '1.4s', size: 2 },
            { top: '9%', left: '62%', delay: '2.6s', size: 2.5 },
            { top: '30%', left: '78%', delay: '0.8s', size: 2 },
            { top: '18%', left: '88%', delay: '3.4s', size: 3 },
            { top: '36%', left: '28%', delay: '2.0s', size: 2 },
            { top: '12%', left: '32%', delay: '1.8s', size: 1.5 },
            { top: '25%', left: '6%', delay: '2.9s', size: 2 }
          ].map((star, idx) => (
            <div
              key={idx}
              className="star-anim absolute rounded-full"
              style={{
                top: star.top,
                left: star.left,
                width: `${star.size}px`,
                height: `${star.size}px`,
                background: '#eef1f6',
                boxShadow: '0 0 6px rgba(238, 241, 246, 0.85)',
                animation: `twinkle 5s ease-in-out infinite ${star.delay}`
              }}
            />
          ))}
        </div>

        {/* Rolling SVG Hills */}
        <svg
          className="absolute left-0 right-0 bottom-0 w-full"
          style={{ height: '46%' }}
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="hill-anim"
            fill="#1f4a47"
            opacity="0.45"
            style={{ animation: 'driftA 120s ease-in-out infinite alternate', transformOrigin: 'bottom' }}
            d="M0,196 C240,150 480,224 720,188 C960,152 1200,216 1440,176 L1440,320 L0,320 Z"
          />
          <path
            className="hill-anim"
            fill="#1a3d38"
            opacity="0.65"
            style={{ animation: 'driftB 150s ease-in-out infinite alternate', transformOrigin: 'bottom' }}
            d="M0,238 C200,202 400,266 720,230 C1000,198 1240,256 1440,228 L1440,320 L0,320 Z"
          />
          <path
            className="hill-anim"
            fill="#143028"
            opacity="0.96"
            style={{ animation: 'driftA 180s ease-in-out infinite alternate', transformOrigin: 'bottom' }}
            d="M0,280 C260,252 520,300 760,276 C1020,250 1240,294 1440,272 L1440,320 L0,320 Z"
          />
        </svg>
      </div>

      {/* ── Glassmorphic Focal Card ─────────────────────────────────────── */}
      <div
        className={`relative z-10 flex flex-col items-center ${isOffline ? 'max-w-md' : 'max-w-sm'} w-full mx-4 px-7 ${isOffline ? 'py-8' : 'py-10'} rounded-3xl text-center transition-all duration-500`}
        style={{
          background: isOffline ? 'rgba(14, 18, 28, 0.84)' : 'rgba(12, 17, 28, 0.62)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(28px) saturate(130%)',
          WebkitBackdropFilter: 'blur(28px) saturate(130%)',
          boxShadow: '0 28px 75px rgba(0, 0, 0, 0.65), 0 0 1px 1px rgba(255, 255, 255, 0.05) inset',
          animation: 'cardRise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}
      >
        {/* Logo Container with Warm Aura Glow */}
        <div className="relative mb-4">
          <div
            className="halo-anim absolute inset-0 rounded-2xl blur-xl"
            style={{
              background: isOffline
                ? 'radial-gradient(circle, rgba(234, 138, 80, 0.35) 0%, rgba(200, 90, 60, 0.15) 70%, transparent 100%)'
                : 'radial-gradient(circle, rgba(217, 160, 102, 0.45) 0%, rgba(158, 199, 189, 0.2) 70%, transparent 100%)',
              animation: 'haloPulse 4s ease-in-out infinite'
            }}
          />
          <div
            className="relative rounded-2xl p-1.5 shadow-xl"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <BrandLogo size={isOffline ? 56 : 68} />
          </div>
        </div>

        {/* Wordmark Typography */}
        <h1
          className="text-xl font-bold tracking-tight text-white mb-1"
          style={{
            fontFamily: "'Outfit', 'Inter', -apple-system, sans-serif",
            letterSpacing: '-0.02em'
          }}
        >
          Super<span style={{ color: '#d9a066' }}>Agent</span>
        </h1>
        
        <p className="text-xs text-[#9aa6b8] mb-4 font-medium tracking-wide">
          Your Autonomous Workspace
        </p>

        {isOffline ? (
          <div className="w-full flex flex-col items-center">
            {/* Status Capsule Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium mb-3">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
              <span>Core Daemon Offline</span>
            </div>

            <h2 className="text-sm font-semibold text-white/95 mb-1.5">
              Intelligence Engine Not Detected
            </h2>

            <p className="text-[11px] text-[#9aa6b8] leading-relaxed max-w-xs mb-4">
              The web app was loaded from cache, but the local SuperAgent backend service is not running on port 1469.
            </p>

            {/* Terminal Command Box */}
            <div className="w-full bg-[#0a0d14]/90 border border-white/[0.08] rounded-xl p-2.5 mb-3.5 flex items-center justify-between text-left">
              <div className="flex items-center gap-2 overflow-hidden min-w-0">
                <Terminal className="w-3.5 h-3.5 text-[#d9a066] shrink-0" />
                <code className="text-xs font-mono text-zinc-200 truncate select-all">
                  npm run dev:web
                </code>
              </div>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white transition-all shrink-0 ml-2 cursor-pointer"
                title="Copy command"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Retry Button */}
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#d9a066] to-[#c98e54] hover:from-[#e4ae74] hover:to-[#d4995f] active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Checking Connection...' : 'Retry Connection'}</span>
            </button>

            {/* Background Live Polling Indicator */}
            <div className="flex items-center justify-center gap-1.5 mt-3 text-[11px] text-[#9aa6b8]/75 font-normal">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-ping" />
              <span>Auto-reconnecting every 3s...</span>
            </div>

            {/* Troubleshooting Collapsible */}
            <div className="w-full mt-3 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowTroubleshoot((prev) => !prev)}
                className="text-[11px] text-[#9aa6b8] hover:text-white/80 flex items-center justify-center gap-1 mx-auto transition-colors cursor-pointer"
              >
                <span>Troubleshooting tips</span>
                {showTroubleshoot ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showTroubleshoot && (
                <div className="mt-2 text-[11px] text-[#9aa6b8]/90 text-left bg-black/25 rounded-xl p-3 space-y-1.5 border border-white/[0.05]">
                  <p>• Make sure port <strong>1469</strong> is not blocked by another process or firewall.</p>
                  <p>• For Desktop or Rust engine: run <code>cargo run -p superagent-core-v2</code>.</p>
                  <p>• If running under another Windows user, start the server in that user session.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Warm Amber Equalizer Bars */}
            <div className="flex items-center justify-center gap-1.5 h-6 mb-5" role="status" aria-label="Loading">
              <div className="w-1.5 h-full rounded-full loading-bar-warm origin-center" />
              <div className="w-1.5 h-full rounded-full loading-bar-warm origin-center" />
              <div className="w-1.5 h-full rounded-full loading-bar-warm origin-center" />
              <div className="w-1.5 h-full rounded-full loading-bar-warm origin-center" />
              <div className="w-1.5 h-full rounded-full loading-bar-warm origin-center" />
            </div>

            {/* Dynamic Status Text */}
            <div
              className="text-xs text-[#d9a066] font-medium transition-all duration-300 min-h-[18px]"
              style={{ animation: 'textFade 2.4s ease-in-out infinite' }}
            >
              {activeMessage}
            </div>
          </>
        )}
      </div>

      {/* ── Subtitle / Signature ────────────────────────────────────────── */}
      <div
        className="absolute bottom-6 left-0 right-0 text-center text-[11px] font-medium text-[#9aa6b8]/60 tracking-wider uppercase pointer-events-none z-10"
      >
        {signature}
      </div>
    </div>
  );
};
