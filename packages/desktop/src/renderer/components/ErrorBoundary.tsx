import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportError } from '../lib/errorReporter';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render/runtime errors in the React tree so a single broken component
 * can't white-screen the whole app. Logs the error (console + toast) and shows a
 * minimal recovery panel instead of crashing.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportError('react-render', error);
    // eslint-disable-next-line no-console
    console.error('[ERROR] react-render componentStack', info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-brand-bg p-8">
          <div className="max-w-md border border-[color:var(--neon-destructive)]/30 bg-[color:var(--neon-destructive)]/10 rounded-xl p-6 text-center shadow-2xl">
            <AlertTriangle size={28} className="text-[color:var(--neon-destructive)] mx-auto mb-3 animate-pulse" />
            <h2 className="text-brand-textMain font-sans font-semibold mb-2">Something went wrong</h2>
            <p className="text-brand-textMuted font-sans text-sm mb-4">
              Part of the interface hit an error. The app is still running — check the console for details,
              or try again. Your data is safe.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
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
