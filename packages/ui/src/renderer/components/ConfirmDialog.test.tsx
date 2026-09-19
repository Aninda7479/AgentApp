import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog Component', () => {
  it('does not render when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        isOpen={false}
        title="Delete Chat"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(html).toBe('');
  });

  it('renders correctly with danger variant and default delete label', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        isOpen={true}
        variant="danger"
        title="Delete Chat"
        description="Are you sure you want to delete this conversation?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    expect(html).toContain('Delete Chat');
    expect(html).toContain('Are you sure you want to delete this conversation?');
    expect(html).toContain('data-testid="confirm-dialog-overlay"');
    expect(html).toContain('data-testid="confirm-dialog-content"');
    expect(html).toContain('data-testid="confirm-dialog-confirm-btn"');
    expect(html).toContain('Delete');
    expect(html).toContain('Cancel');
  });

  it('renders custom labels and buttons for warning/neutral variants', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        isOpen={true}
        variant="warning"
        title="Reset Settings"
        description="This will restore all default configurations."
        confirmLabel="Yes, Reset"
        cancelLabel="Keep Settings"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    expect(html).toContain('Reset Settings');
    expect(html).toContain('This will restore all default configurations.');
    expect(html).toContain('Yes, Reset');
    expect(html).toContain('Keep Settings');
  });

  it('renders children when provided', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        isOpen={true}
        title="Custom Action"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        <div data-testid="custom-child">Additional warning details</div>
      </ConfirmDialog>
    );

    expect(html).toContain('data-testid="custom-child"');
    expect(html).toContain('Additional warning details');
  });
});
