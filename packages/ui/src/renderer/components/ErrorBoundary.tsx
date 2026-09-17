import React from 'react';
import { AlertTriangle, RotateCcw, Copy, Check, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { reportError } from '../lib/errorReporter';

interface Props {
  children: React.ReactNode;
  /**
   * Human-readable label of the page/view this boundary wraps (e.g. "Voice & Mic").
   * Used in the fallback message so the user knows which page failed.
   */
  name?: string;
  /**
   * When any value in this array changes, the boundary resets (clears the error).
   * Pass the active route/category so navigating away and back drops the stale
   * error state instead of keeping the broken page on screen.
   */
  resetKeys?: ReadonlyArray<unknown>;
  /**
   * Optional compact mode for inline cards, viewers, and sub-components.
   */
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
  copied: boolean;
}

function resetKeysChanged(a?: ReadonlyArray<unknown>, b?: ReadonlyArray<unknown>): boolean {
  if (a === b) return false;
  if (!a || !b || a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return true;
  }
  return false;
}

/**
 * Catches render/runtime errors in the React tree so a single broken page or
 * component can't white-screen or blank out the app.
 *
 * Displays a styled, detailed error panel with exact error message, stack trace,
 * copy details button, and recovery actions.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      showDetails: false,
      copied: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportError(this.props.name ? `react-render:${this.props.name}` : 'react-render', error);
    // eslint-disable-next-line no-console
    console.error(`[ERROR] Crash in page${this.props.name ? ` "${this.props.name}"` : ''}:`, error);
    // eslint-disable-next-line no-console
    console.error('[ERROR] react-render componentStack', info.componentStack);
  }

  componentDidUpdate(prevProps: Props): void {
    // Auto-recover when the navigation key changes (e.g. user switches tab or settings category)
    if (this.state.hasError && resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ hasError: false, error: null, showDetails: false, copied: false });
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, showDetails: false, copied: false });
  };

  private handleReloadPage = (): void => {
    window.location.reload();
  };

  private toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  private handleCopyError = (): void => {
    const { error } = this.state;
    if (!error) return;
    const text = `Component: ${this.props.name || 'Root'}\nError: ${error.name}: ${error.message}\nStack:\n${error.stack || 'N/A'}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {});
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const pageName = this.props.name;
      const { error, showDetails, copied } = this.state;
      const errorMsg = error?.message || 'An unexpected error occurred.';

      if (this.props.compact) {
        return (
          <div className="p-3 my-1 rounded-xl border border-[color:var(--neon-destructive)]/30 bg-[color:var(--neon-destructive)]/10 text-xs text-[color:var(--neon-destructive)] flex items-center justify-between gap-2 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle size={14} className="text-[color:var(--neon-destructive)] shrink-0" />
              <span className="font-medium truncate">{pageName || 'Component'} failed to render</span>
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-[color:var(--neon-destructive)]/15 hover:bg-[color:var(--neon-destructive)]/25 text-[color:var(--neon-destructive)] text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        );
      }

      return (
        <div className="min-h-[300px] w-full flex-1 flex flex-col items-center justify-center p-6 text-center select-text bg-brand-bg text-brand-textMain">
          <div className="w-full max-w-xl rounded-2xl p-6 text-left shadow-2xl border border-brand-border bg-brand-card">
            <div className="flex items-center gap-3.5 mb-3">
              <div className="p-2.5 rounded-xl bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/20 text-[color:var(--neon-destructive)] shrink-0">
                <AlertTriangle size={22} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-brand-textMain">
                  {pageName ? `Error in "${pageName}"` : 'Something went wrong'}
                </h2>
                <p className="text-xs text-brand-textMuted">
                  This component encountered an error and couldn't be displayed.
                </p>
              </div>
            </div>

            <div className="my-3 p-3.5 rounded-xl border border-[color:var(--neon-destructive)]/25 bg-[color:var(--neon-destructive)]/5 font-mono text-xs text-[color:var(--neon-destructive)] break-words max-h-36 overflow-auto">
              {error?.name ? `${error.name}: ` : ''}{errorMsg}
            </div>

            {showDetails && error?.stack && (
              <div className="mb-4">
                <div className="text-[11px] font-medium text-brand-textMuted uppercase tracking-wider mb-1">
                  Stack Trace
                </div>
                <pre className="p-3 rounded-xl border border-brand-border bg-brand-innerBg font-mono text-[11px] text-brand-textMuted overflow-auto max-h-48 whitespace-pre-wrap break-all">
                  {error.stack}
                </pre>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-brand-border">
              <button
                type="button"
                onClick={this.toggleDetails}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
              >
                {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showDetails ? 'Hide Stack' : 'Show Error Details'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={this.handleCopyError}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-card text-brand-textMain text-xs font-medium hover:bg-brand-hover transition-all cursor-pointer shadow-sm"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy Details'}
                </button>

                <button
                  type="button"
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-card text-brand-textMain text-xs font-medium hover:bg-brand-hover transition-all cursor-pointer shadow-sm"
                >
                  <RotateCcw size={14} />
                  Try Again
                </button>

                <button
                  type="button"
                  onClick={this.handleReloadPage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--neon-destructive)] text-white text-xs font-medium hover:opacity-90 transition-all cursor-pointer shadow-sm"
                >
                  <RefreshCw size={14} />
                  Reload App
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
