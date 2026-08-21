import React, { useState, useEffect } from 'react';
import { Stethoscope, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui';
import { ModelConfig } from '../pages/Settings/SettingsView';
import { DiagnosticsService, DiagnosticCheck } from '../logic/diagnostics';

export interface DoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  byokKeys: Record<string, string>;
  modelsCatalog: ModelConfig[];
  unsandboxedActions: boolean;
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
      setChecks(DiagnosticsService.buildChecks(byokKeys, modelsCatalog.length, unsandboxedActions));
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
        return <CheckCircle2 className="w-4 h-4 text-[color:var(--neon-constructive)] shrink-0" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-[color:var(--neon-attention)] shrink-0" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-[color:var(--neon-destructive)] shrink-0" />;
    }
  };

  const getStatusStyle = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return 'border-[color:var(--neon-constructive)]/20 bg-[color:var(--neon-constructive)]/5';
      case 'warn':
        return 'border-[color:var(--neon-attention)]/20 bg-[color:var(--neon-attention)]/5';
      case 'fail':
        return 'border-[color:var(--neon-destructive)]/20 bg-[color:var(--neon-destructive)]/5';
    }
  };

  return (
    <div
      data-testid="doctor-modal-overlay"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-1000"
    >
      <div
        data-testid="doctor-modal-content"
        className="bg-brand-card border border-brand-border rounded-2xl w-137.5 max-w-[90%] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-brand-textMain text-left animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 border-b border-brand-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <Stethoscope className="w-5 h-5 text-(--brand-highlight)" />
            <div>
              <h2 className="text-lg font-bold text-brand-textMain m-0">Doctor Diagnostics</h2>
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
            <RefreshCw className="w-8 h-8 text-(--brand-highlight) animate-spin" />
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
                    <div className="text-xs font-semibold text-brand-textMain">{check.name}</div>
                    <div className="text-[11px] text-brand-textMuted leading-relaxed">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Overall status */}
            <div className={`mt-5 p-3 rounded-lg border text-center text-xs font-semibold ${
              isHealthy
                ? 'bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)] border-[color:var(--neon-constructive)]/25'
                : 'bg-[color:var(--neon-attention)]/10 text-[color:var(--neon-attention)] border-[color:var(--neon-attention)]/25'
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
