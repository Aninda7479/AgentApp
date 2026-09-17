import React, { useState } from 'react';
import { User, KeyRound, AlertTriangle, X, ArrowRight, RotateCw } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { getIpc } from '../lib/ipc';
import { AuthService } from '../services/AuthService';

export interface HostSetupModalProps {
  onClose: () => void;
  onSaved?: (ownerName: string) => void;
}

export const HostSetupModal: React.FC<HostSetupModalProps> = ({ onClose, onSaved }) => {
  const ipc = getIpc();
  const [ownerName, setOwnerName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web App Authentication state (optional inline password update)
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('admin');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const trimmedName = ownerName.trim();
    if (!trimmedName) {
      setError('Please enter your name or a host owner identifier.');
      return;
    }

    setIsSaving(true);
    try {
      if (ipc) {
        await ipc.invoke('settings-write', {
          general: {
            ownerName: trimmedName,
          },
        });
      }

      // If user filled in new password fields, update it
      if (showPasswordSetup && newPassword.trim()) {
        if (newPassword !== confirmPassword) {
          setError('New passwords do not match.');
          setIsSaving(false);
          return;
        }
        if (newPassword.length < 6) {
          setError('New password must be at least 6 characters.');
          setIsSaving(false);
          return;
        }

        if (ipc) {
          interface PasswordChangeResult {
            ok?: boolean;
            error?: string;
          }
          const res = (await ipc.invoke('web-change-password', {
            current: currentPassword,
            next: newPassword,
          })) as PasswordChangeResult | undefined;
          if (res && res.ok === false) {
            setError(res.error || 'Failed to update access password.');
            setIsSaving(false);
            return;
          }
        }
      }

      // Update AuthService and broadcast immediately
      AuthService.setOwnerName(trimmedName);
      void AuthService.checkStatus();

      onSaved?.(trimmedName);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save host details.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans text-brand-textMain">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl flex flex-col max-h-[90vh]">
        {/* Atmosphere Banner Header */}
        <div className="relative border-b border-brand-border/60 px-6 py-5 bg-brand-bg/50">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(120% 90% at 85% -10%, var(--brand-atmo-glow), transparent 55%)' }}
            />
          </div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-brand-popover border border-brand-border shadow-inner">
                <BrandLogo size={26} />
              </div>
              <div>
                <h2 className="font-outfit text-lg font-semibold tracking-tight text-brand-textMain">
                  Host Ownership &amp; Setup
                </h2>
                <p className="text-xs text-brand-textMuted">
                  Configure your workspace branding before you begin.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
              title="Remind me later"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="flex-1 px-6 py-5 overflow-y-auto space-y-5 custom-scrollbar text-left">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400 font-medium animate-fade-in">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section: Host Ownership & Branding */}
          <div className="space-y-3 rounded-xl border border-brand-border bg-brand-bg/40 p-4">
            <div className="flex items-center gap-2">
              <User size={16} className="text-[color:var(--brand-accent)] shrink-0" />
              <h3 className="text-sm font-semibold text-brand-textMain">Host Ownership &amp; Branding</h3>
            </div>
            <p className="text-xs leading-relaxed text-brand-textMuted">
              Set the host owner's name shown on the login screen and lock screen to indicate that this host is private.
            </p>
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-medium text-brand-textMuted">Host Owner Name</label>
              <input
                type="text"
                autoFocus
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. John Doe"
                className="ui-input w-full text-sm"
              />
            </div>
          </div>

          {/* Section: Web App Authentication (Collapsible / Optional) */}
          <div className="space-y-3 rounded-xl border border-brand-border bg-brand-bg/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-brand-textMuted shrink-0" />
                <h3 className="text-sm font-semibold text-brand-textMain">Web App Authentication</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordSetup(!showPasswordSetup)}
                className="text-xs text-[color:var(--brand-accent)] hover:underline font-medium cursor-pointer"
              >
                {showPasswordSetup ? 'Hide Password Options' : 'Configure Password'}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-brand-textMuted">
              Protects remote web browser logins. Default admin password is{' '}
              <code className="rounded bg-brand-inner-bg px-1.5 py-0.5 font-mono text-brand-textMain">admin</code>.
            </p>

            {showPasswordSetup && (
              <div className="space-y-3 pt-2 border-t border-brand-border/40 animate-fade-in">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-brand-textMuted">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="admin"
                    className="ui-input w-full text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-brand-textMuted">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="ui-input w-full text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-brand-textMuted">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="ui-input w-full text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover rounded-xl transition-colors cursor-pointer"
            >
              Remind Me Later
            </button>
            <button
              type="submit"
              disabled={isSaving || !ownerName.trim()}
              className="ui-btn ui-btn-primary px-5 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RotateCw size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Save &amp; Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
