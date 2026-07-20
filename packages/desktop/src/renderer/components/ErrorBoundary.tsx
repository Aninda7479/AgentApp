import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
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
}

interface State {
  hasError: boolean;
  error: Error | null;
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
 * settings sub-panel can't white-screen the whole app. Logs the error (console +
 * toast) and shows a minimal recovery panel scoped to that view only — the rest
 * of the app keeps running.
 *
 * Wrap EACH page (and each settings category) in its own boundary so a crash
 * shows an inline "error opening this page" panel instead of taking down the app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
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
    // Auto-recover when the navigation key changes (e.g. user switches tab or
    // settings category) so a fresh view isn't stuck behind the old error.
    if (this.state.hasError && resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      const pageName = this.props.name;
      return (
        <div className="h-full w-full flex items-center justify-center bg-brand-bg p-8">
          <div className="max-w-md border border-[color:var(--neon-destructive)]/30 bg-[color:var(--neon-destructive)]/10 rounded-xl p-6 text-center shadow-2xl">
            <AlertTriangle size={28} className="text-[color:var(--neon-destructive)] mx-auto mb-3 animate-pulse" />
            <h2 className="text-brand-textMain font-sans font-semibold mb-2">There was an error opening this page</h2>
            <p className="text-brand-textMuted font-sans text-sm mb-1">
              {pageName
                ? `The “${pageName}” page hit an error and couldn't be displayed.`
                : 'This page hit an error and couldn’t be displayed.'}
            </p>
            <p className="text-brand-textMuted font-sans text-sm mb-4">
              The rest of the app is still running — check the console for details, or try again.
              Your data is safe.
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-brand-border bg-brand-popover text-brand-textMain font-sans text-sm hover:bg-[var(--brand-hover)] transition-all cursor-pointer"
            >
              <RotateCcw size={14} /> Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
