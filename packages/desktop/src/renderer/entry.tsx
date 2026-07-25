import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportError } from './lib/errorReporter';

// Global error handlers so async rejections or unhandled runtime errors are reported
window.addEventListener('error', (event) => {
  reportError('unhandled-window-error', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  reportError('unhandled-promise-rejection', event.reason);
});

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary name="SuperAgent Root">
      <App />
    </ErrorBoundary>
  );
}
