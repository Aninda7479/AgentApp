import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog Component', () => {
  it('does not render into DOM when isOpen is false', () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Delete Chat"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders correctly with accessibility attributes and default danger labels', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        variant="danger"
        title="Delete Conversation"
        description="Are you sure you want to delete this chat?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Delete Conversation')).toBeDefined();
    expect(screen.getByText('Are you sure you want to delete this chat?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
  });

  it('triggers onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Chat"
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: 'Delete' });
    await user.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when cancel button or close X is clicked', async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Chat"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });
    await user.click(closeBtn);
    expect(handleCancel).toHaveBeenCalledTimes(2);
  });

  it('triggers onCancel on Escape keydown', () => {
    const handleCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Chat"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when backdrop overlay is clicked directly', async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Chat"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    const overlay = screen.getByTestId('confirm-dialog-overlay');
    await user.click(overlay);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('disables all buttons and displays loading indicator when isLoading is true', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        isLoading={true}
        title="Deleting..."
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: 'Processing...' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    const closeBtn = screen.getByRole('button', { name: 'Close dialog' });

    expect(confirmBtn.hasAttribute('disabled')).toBe(true);
    expect(cancelBtn.hasAttribute('disabled')).toBe(true);
    expect(closeBtn.hasAttribute('disabled')).toBe(true);

    // Clicking overlay while loading does not call onCancel
    const overlay = screen.getByTestId('confirm-dialog-overlay');
    await user.click(overlay);
    expect(handleCancel).not.toHaveBeenCalled();
  });
});
