import React, { useEffect, useRef } from 'react';
import { Trash2, AlertTriangle, AlertCircle, Info, HelpCircle, X } from 'lucide-react';
import { Button } from './ui';

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info' | 'neutral';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  variant?: ConfirmDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary' | 'secondary';
  cancelVariant?: 'ghost' | 'secondary';
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

/**
 * Generic, reusable confirmation dialog with Apple & Claude-inspired soft, clean styling.
 * 
 * Supports different visual variants (`danger`, `warning`, `info`, `neutral`), customizable
 * buttons, custom icons, and optional child components (e.g. checklists, confirmation text).
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  variant = 'danger',
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant,
  cancelVariant = 'ghost',
  icon: CustomIcon,
  isLoading = false,
  onConfirm,
  onCancel,
  children,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key to cancel
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // Variant-specific styles and default icons
  const getVariantConfig = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/20 text-rose-600 dark:text-rose-400',
          defaultIcon: Trash2,
          defaultConfirmLabel: 'Delete',
          defaultConfirmVariant: 'danger' as const,
        };
      case 'warning':
        return {
          iconBg: 'bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/20 text-amber-600 dark:text-amber-400',
          defaultIcon: AlertTriangle,
          defaultConfirmLabel: 'Proceed',
          defaultConfirmVariant: 'primary' as const,
        };
      case 'info':
        return {
          iconBg: 'bg-cyan-500/10 dark:bg-cyan-500/15 border-cyan-500/20 text-cyan-600 dark:text-cyan-400',
          defaultIcon: Info,
          defaultConfirmLabel: 'Confirm',
          defaultConfirmVariant: 'primary' as const,
        };
      case 'neutral':
      default:
        return {
          iconBg: 'bg-brand-textMain/10 border-brand-border/40 text-brand-textMain',
          defaultIcon: HelpCircle,
          defaultConfirmLabel: 'Confirm',
          defaultConfirmVariant: 'secondary' as const,
        };
    }
  };

  const config = getVariantConfig();
  const effectiveConfirmLabel = confirmLabel || config.defaultConfirmLabel;
  const effectiveConfirmVariant = confirmVariant || config.defaultConfirmVariant;
  const IconComponent = config.defaultIcon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="confirm-dialog-overlay"
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onCancel();
        }
      }}
    >
      <div
        data-testid="confirm-dialog-content"
        className="relative w-full max-w-md bg-brand-card/95 border border-brand-border/80 rounded-2xl p-6 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 text-left overflow-hidden"
      >
        {/* Close "X" button in top-right */}
        <button
          type="button"
          data-testid="confirm-dialog-close-btn"
          onClick={onCancel}
          disabled={isLoading}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-colors cursor-pointer"
          title="Close"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          {/* Variant Icon */}
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${config.iconBg}`}
          >
            {CustomIcon ? (
              typeof CustomIcon === 'function' ? (
                <CustomIcon className="w-5 h-5" />
              ) : (
                CustomIcon
              )
            ) : (
              <IconComponent className="w-5 h-5" />
            )}
          </div>

          {/* Title & Description */}
          <div className="flex-1 min-w-0 pr-4">
            <h3
              data-testid="confirm-dialog-title"
              className="text-base font-semibold text-brand-textMain tracking-tight m-0"
            >
              {title}
            </h3>
            {description && (
              <div
                data-testid="confirm-dialog-description"
                className="text-xs text-brand-textMuted mt-1.5 leading-relaxed break-words"
              >
                {description}
              </div>
            )}
          </div>
        </div>

        {/* Optional Custom Children Content */}
        {children && <div className="mt-4">{children}</div>}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 mt-6 pt-2">
          <Button
            type="button"
            data-testid="confirm-dialog-cancel-btn"
            variant={cancelVariant}
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
            className="px-3.5 py-1.5 text-xs rounded-xl"
          >
            {cancelLabel}
          </Button>

          <Button
            ref={confirmBtnRef}
            type="button"
            data-testid="confirm-dialog-confirm-btn"
            variant={effectiveConfirmVariant}
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-1.5 text-xs font-semibold rounded-xl ${
              effectiveConfirmVariant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-none shadow-sm shadow-rose-500/20'
                : ''
            }`}
          >
            {isLoading ? 'Processing...' : effectiveConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
