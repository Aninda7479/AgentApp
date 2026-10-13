import React, { useState } from 'react';
import { ShieldAlert, KeyRound, AlertTriangle, X, ArrowRight, RotateCw, Eye, EyeOff } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { getIpc } from '../lib/ipc';
import { AuthService } from '../services/AuthService';

export interface DefaultPasswordAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIgnore: () => void;
  onPasswordChanged: () => void;
}

export const DefaultPasswordAlertModal: React.FC<DefaultPasswordAlertModalProps> = ({
  isOpen,
  onClose,
  onIgnore,
  onPasswordChanged,
}) => {
  const ipc = getIpc();
  const [showForm, setShowForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('admin');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUpdatePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      if (ipc) {
        interface PwResult {
          ok?: boolean;
          error?: string;
        }
        const res = (await ipc.invoke('web-change-password', {
          current: currentPassword,
          next: newPassword,
        })) as PwResult | undefined;

        if (res && res.ok === false) {
          setError(res.error || 'Failed to update access password.');
          setIsSaving(false);
          return;
        }
      }

      void AuthService.checkStatus();
      onPasswordChanged();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update password.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans text-brand-textMain">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-amber-500/30 bg-brand-card shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header with Security Atmosphere */}
        <div className="relative border-b border-brand-border/60 px-6 py-5 bg-amber-500/5">
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h2 className="font-outfit text-lg font-semibold tracking-tight text-brand-textMain">
                  Default Password Detected
                </h2>
                <p className="text-xs text-brand-textMuted">
                  Your Web App host access uses the factory default password.
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
        <div className="flex-1 px-6 py-5 overflow-y-auto space-y-4 custom-scrollbar text-left text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-400 font-medium animate-fade-in">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-xl border border-brand-border bg-brand-bg/50 p-4 space-y-2">
            <p className="leading-relaxed text-brand-textMuted">
              SuperAgent Web App currently has the seed admin password (
              <code className="rounded bg-brand-inner-bg px-1.5 py-0.5 font-mono text-amber-300">admin</code>
              ) configured. Anyone on your local network could potentially sign into your host session.
            </p>
            <p className="leading-relaxed text-brand-textMuted">
              We strongly recommend configuring a personalized master password for your environment.
            </p>
          </div>

          {showForm ? (
            <form onSubmit={handleUpdatePassword} className="space-y-3.5 animate-fade-in pt-1">
              <div className="space-y-1">
                <label className="block font-medium text-brand-textMuted">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="admin"
                  className="ui-input w-full font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block font-medium text-brand-textMuted">New Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      autoFocus
                      className="ui-input w-full font-mono text-xs pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-textMuted hover:text-brand-textMain cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-brand-textMuted">Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="ui-input w-full font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !newPassword || newPassword !== confirmPassword}
                  className="ui-btn ui-btn-primary px-4 py-1.5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <RotateCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  Set Password
                </button>
              </div>
            </form>
          ) : (
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="ui-btn ui-btn-primary px-4 py-2 flex items-center justify-center gap-2 cursor-pointer font-semibold flex-1"
              >
                <KeyRound size={14} />
                Set New Password
              </button>
              <button
                type="button"
                onClick={onIgnore}
                className="px-4 py-2 rounded-xl border border-brand-border text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer text-center font-medium"
              >
                Ignore &amp; Don't Show Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-brand-border/40 px-6 py-3 flex items-center justify-between bg-brand-bg/30 text-xs">
          <span className="text-[11px] text-brand-textMuted">
            You can always change your password later in Settings &rarr; Web App.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-brand-textMuted hover:text-brand-textMain hover:underline cursor-pointer text-xs"
          >
            Remind Me Later
          </button>
        </div>
      </div>
    </div>
  );
};
