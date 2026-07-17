import React from 'react';
import { ShieldAlert, ShieldCheck, FilePen, Terminal } from 'lucide-react';
import { Button } from './ui';

/** A single user-in-the-loop permission request from the agent sandbox. */
export interface PermissionRequest {
  action: string;
  command?: string;
  filePath?: string;
  details?: Record<string, unknown>;
}

export interface PermissionDialogProps {
  isOpen: boolean;
  request: PermissionRequest | null;
  /** Called with the user's decision. `remember` adds the command to the
   *  session allowlist so it won't re-prompt. */
  onResolve: (approved: boolean, remember: boolean) => void;
}

/**
 * Modal that surfaces a sandbox permission prompt — e.g. the agent wants to
 * run a shell command or modify a file outside the safe default. This is the
 * user-in-the-loop half of the Agent Sandbox: the engine never executes a
 * gated action without the user's explicit choice here.
 */
export const PermissionDialog: React.FC<PermissionDialogProps> = ({
  isOpen,
  request,
  onResolve
}) => {
  if (!isOpen || !request) return null;

  const isFile = Boolean(request.filePath);
  const isDangerous = request.details?.riskLevel === 'potentially_dangerous';
  const subject = isFile ? request.filePath : request.command;
  const subjectLabel = isFile ? 'File' : 'Command';

  return (
    <div
      data-testid="permission-modal-overlay"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000]"
    >
      <div
        data-testid="permission-modal-content"
        className="bg-brand-card border border-brand-border rounded-2xl w-[34rem] max-w-[92%] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-brand-textMain text-left animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          {isDangerous
            ? <ShieldAlert className="w-5 h-5 text-[color:var(--neon-attention)] shrink-0" />
            : isFile
              ? <FilePen className="w-5 h-5 text-[color:var(--neon-constructive)] shrink-0" />
              : <Terminal className="w-5 h-5 text-[color:var(--neon-constructive)] shrink-0" />}
          <div>
            <h2 className="text-lg font-bold text-white m-0">
              {isFile ? 'Agent wants to modify a file' : 'Agent wants to run a command'}
            </h2>
            <p className="text-xs text-brand-textMuted mt-0.5">
              {isDangerous
                ? 'This action is potentially destructive. Approve only if you trust it.'
                : 'SuperAgent needs your approval before it proceeds.'}
            </p>
          </div>
        </div>

        {/* The subject being requested */}
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-wide text-brand-textMuted mb-1.5">
            {subjectLabel}
          </div>
          <pre
            data-testid="permission-subject"
            className="bg-black/40 border border-brand-border rounded-lg p-3 text-xs text-brand-textMain whitespace-pre-wrap break-all max-h-44 overflow-auto m-0 font-mono"
          >
            {subject || '(unknown)'}
          </pre>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onResolve(false, false)}
          >
            Deny
          </Button>
          <div className="flex items-center gap-2">
            {!isFile && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onResolve(true, true)}
              >
                Always allow
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => onResolve(true, false)}
            >
              {isDangerous ? 'Approve anyway' : 'Approve'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
