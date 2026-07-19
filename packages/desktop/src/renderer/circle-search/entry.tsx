import React from 'react';
import { createRoot } from 'react-dom/client';
import { CircleSearchOverlay } from './CircleSearchOverlay';
import { ErrorBoundary } from '../components/ErrorBoundary';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <CircleSearchOverlay />
    </ErrorBoundary>
  );
}
