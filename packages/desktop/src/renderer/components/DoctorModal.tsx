import React, { useState, useEffect } from 'react';
import { Stethoscope, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui';
import { ModelConfig } from '../settings/SettingsView';

export interface DoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  byokKeys: Record<string, string>;
  modelsCatalog: ModelConfig[];
  unsandboxedActions: boolean;
}

interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export const DoctorModal: React.FC<DoctorModalProps> = ({
  isOpen,
  onClose,
  byokKeys,
  modelsCatalog,
  unsandboxedActions
}) => {
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);

  const runDiagnostics = () => {
    setLoading(true);
    setTimeout(() => {
      const results: DiagnosticCheck[] = [];

      // 1. Runtime Versions
      const nodeVer = (typeof process !== 'undefined' && process.versions?.node) || 'unknown';
      const chromeVer = (typeof process !== 'undefined' && process.versions?.chrome) || 'unknown';
      const electronVer = (typeof process !== 'undefined' && process.versions?.electron) || 'unknown';
      results.push({
        name: 'App Runtime Environments',
        status: 'pass',
        detail: `Electron v${electronVer} | Node v${nodeVer} | Chrome v${chromeVer}`
      });

      // 2. Provider Keys Check
      const count = Object.values(byokKeys).filter(Boolean).length;
      results.push({
        name: 'Provider API Keys',
        status: count > 0 ? 'pass' : 'warn',
        detail: count > 0 
          ? `${count} provider key(s) configured`
          : 'No API keys configured — set one in the BYOK Provider Settings'
      });

      // 3. Model Catalog Registry
      const modelsCount = modelsCatalog.length;
      results.push({
        name: 'Model Registry',
        status: modelsCount > 0 ? 'pass' : 'warn',
        detail: modelsCount > 0
          ? `${modelsCount} model(s) registered in catalog`
          : 'No models found in catalog — enable providers under AI Config'
      });

      // 4. Execution Sandbox
      results.push({
        name: 'App Execution Sandbox',
        status: unsandboxedActions ? 'warn' : 'pass',
        detail: unsandboxedActions
          ? 'Full system access enabled (unsandboxed actions)'
          : 'Sandboxed mode active (secure execution environment)'
      });

      setChecks(results);
      setLoading(false);
    }, 600);
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen, byokKeys, modelsCatalog, unsandboxedActions]);

  if (!isOpen) return null;

  const isHealthy = checks.every((c) => c.status !== 'fail');

  const getStatusIcon = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    }
  };

  const getStatusStyle = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return 'border-emerald-500/20 bg-emerald-500/5';
      case 'warn':
        return 'border-amber-500/20 bg-amber-500/5';
      case 'fail':
        return 'border-rose-500/20 bg-rose-500/5';
    }
  };

  return (
    <div
      data-testid="doctor-modal-overlay"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000]"
    >
      <div
        data-testid="doctor-modal-content"
        className="bg-brand-card border border-brand-border rounded-2xl w-[550px] max-w-[90%] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-brand-textMain text-left animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 border-b border-brand-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <Stethoscope className="w-5 h-5 text-[var(--brand-highlight)]" />
            <div>
              <h2 className="text-lg font-bold text-white m-0">Doctor Diagnostics</h2>
              <p className="text-xs text-brand-textMuted mt-0.5">
                Setup troubleshooting & configuration diagnostics
              </p>
            </div>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            className="text-lg p-1 h-auto"
          >
            ✕
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <RefreshCw className="w-8 h-8 text-[var(--brand-highlight)] animate-spin" />
            <span className="text-xs text-brand-textMuted font-medium">Running system diagnostics...</span>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="space-y-2.5">
              {checks.map((check) => (
                <div
                  key={check.name}
                  className={`flex items-start gap-3 p-3.5 border rounded-xl transition-all ${getStatusStyle(check.status)}`}
                >
                  {getStatusIcon(check.status)}
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-white">{check.name}</div>
                    <div className="text-[11px] text-brand-textMuted leading-relaxed">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Overall status */}
            <div className={`mt-5 p-3 rounded-lg border text-center text-xs font-semibold ${
              isHealthy 
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/35'
                : 'bg-amber-950/40 text-amber-400 border-amber-800/35'
            }`}>
              {isHealthy 
                ? '🩺 Diagnostics complete — Setup is healthy!'
                : '⚠️ Diagnostics complete — Setup contains recommendations/warnings.'}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center mt-6">
          <Button onClick={runDiagnostics} disabled={loading} variant="secondary" size="sm" className="flex items-center gap-1">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Re-run Checks</span>
          </Button>
          <Button onClick={onClose} variant="primary" size="sm">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
