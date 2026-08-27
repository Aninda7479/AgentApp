import React, { useState, useEffect, useRef } from 'react';
import { Lock, KeyRound, Eye, EyeOff, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { AuthService, AuthStatus } from '../services/AuthService';

interface DesktopLockScreenProps {
  authStatus: AuthStatus;
  onUnlocked?: () => void;
}

export const DesktopLockScreen: React.FC<DesktopLockScreenProps> = ({ authStatus, onUnlocked }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the password field
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  }, [authStatus.passwordSet]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const isSetup = !authStatus.passwordSet;

    if (!password.trim()) {
      setError('Please enter a password.');
      return;
    }

    if (isSetup) {
      if (password.length < 6) {
        setError('Master password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setLoading(true);
      const res = await AuthService.setup(password);
      setLoading(false);

      if (res.ok) {
        setPassword('');
        setConfirmPassword('');
        onUnlocked?.();
      } else {
        setError(res.error || 'Failed to setup password.');
      }
    } else {
      setLoading(true);
      const res = await AuthService.login(password);
      setLoading(false);

      if (res.ok) {
        setPassword('');
        onUnlocked?.();
      } else {
        setError(res.error || 'Incorrect password.');
      }
    }
  };

  const isSetup = !authStatus.passwordSet;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-bg/95 backdrop-blur-xl p-4 select-none">
      {/* Background ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-accent/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-brand-surface/90 border border-brand-border/60 rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center">
        {/* Brand Icon & Lock Header */}
        <div className="relative mb-6">
          <BrandLogo size={56} className="shadow-lg" />
          <div className="absolute -bottom-1 -right-1 bg-brand-accent text-white p-1.5 rounded-full shadow-md">
            {isSetup ? <KeyRound className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          </div>
        </div>

        <h1 className="text-xl font-semibold text-brand-textMain mb-1.5 flex items-center gap-2">
          {isSetup ? 'Set Master Password' : 'SuperAgent Locked'}
        </h1>

        <p className="text-xs text-brand-textMuted max-w-sm mb-6">
          {isSetup
            ? 'Create a secure master password to protect your local agent workspace, digital personas, and settings.'
            : authStatus.ownerName
            ? `Host session of ${authStatus.ownerName}. Enter password to resume workspace.`
            : 'Enter your master password to unlock your autonomous agent session.'}
        </p>

        {/* Error Alert */}
        {error && (
          <div className="w-full mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 text-left animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 text-left">
          <div>
            <label className="block text-[11px] font-medium text-brand-textMuted mb-1.5 uppercase tracking-wider">
              {isSetup ? 'New Master Password' : 'Password'}
            </label>
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                placeholder={isSetup ? 'At least 6 characters' : 'Enter master password'}
                className="w-full bg-brand-bg border border-brand-border/80 rounded-xl px-3.5 py-2.5 text-sm text-brand-textMain placeholder-brand-textMuted/50 focus:outline-none focus:border-brand-accent/80 focus:ring-2 focus:ring-brand-accent/20 transition-all pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-brand-textMuted hover:text-brand-textMain focus:outline-none transition-colors p-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isSetup && (
            <div>
              <label className="block text-[11px] font-medium text-brand-textMuted mb-1.5 uppercase tracking-wider">
                Confirm Password
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={loading}
                  placeholder="Re-enter master password"
                  className="w-full bg-brand-bg border border-brand-border/80 rounded-xl px-3.5 py-2.5 text-sm text-brand-textMain placeholder-brand-textMuted/50 focus:outline-none focus:border-brand-accent/80 focus:ring-2 focus:ring-brand-accent/20 transition-all"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-brand-accent text-white font-medium text-sm flex items-center justify-center gap-2 hover:bg-brand-accent/90 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.99]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isSetup ? 'Setting Password...' : 'Unlocking...'}</span>
              </>
            ) : (
              <>
                {isSetup ? <ShieldCheck className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                <span>{isSetup ? 'Set Password & Unlock' : 'Unlock SuperAgent'}</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Security Badge */}
        <div className="mt-6 flex items-center gap-1.5 text-[11px] text-brand-textMuted/60">
          <ShieldCheck className="w-3.5 h-3.5 text-brand-accent/70" />
          <span>Local daemon encryption active (Port 1469)</span>
        </div>
      </div>
    </div>
  );
};
