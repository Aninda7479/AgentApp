import { useEffect } from 'react';

/** Status returned by the main-process update check. */
export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'unsupported' | 'error' | 'downloading' | 'downloaded';
  version?: string;
  message?: string;
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
}

/** Props for the updates/about settings panel. */
interface UpdatesSettingsProps {
  appVersion?: string;
  updateStatus: UpdateStatus | null;
  onCheckForUpdates: () => void;
  onDownloadUpdate?: () => void;
  onRestartApp?: () => void;
  checking: boolean;
}

const REPO_URL = 'https://github.com/Aninda7479/AgentApp';

/** Renders the current version and a "Check for updates" action. */
import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, Info, ExternalLink, Download } from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { getIpc } from '../../lib/ipc';
export const UpdatesSettings: React.FC<UpdatesSettingsProps> = ({
  appVersion,
  updateStatus,
  onCheckForUpdates,
  onDownloadUpdate,
  onRestartApp,
  checking
}) => {
  const [githubUrl] = useState(REPO_URL);
  const [releaseChannel, setReleaseChannel] = useState<'stable' | 'beta'>('stable');

  const ipc = getIpc();

  useEffect(() => {
    if (ipc) {
      ipc.invoke('settings-read').then((settings: any) => {
        if (settings?.general?.releaseChannel) {
          setReleaseChannel(settings.general.releaseChannel);
        }
      }).catch(() => {});
    }
  }, [ipc]);

  const handleChannelChange = async (val: 'stable' | 'beta') => {
    setReleaseChannel(val);
    if (ipc) {
      try {
        const settings = await ipc.invoke('settings-read');
        await ipc.invoke('settings-write', {
          ...settings,
          general: {
            ...settings?.general,
            releaseChannel: val
          }
        });
      } catch (err) {
        console.error('Failed to save release channel:', err);
      }
    }
  };

  const handleDownload = () => {
    if (onDownloadUpdate) {
      onDownloadUpdate();
    } else if (ipc) {
      ipc.invoke('download-update');
    }
  };

  const handleRestart = () => {
    if (onRestartApp) {
      onRestartApp();
    } else if (ipc) {
      ipc.invoke('quit-and-install');
    }
  };

  const openInBrowser = (url: string) => {
    if (ipc) {
      ipc.invoke('open-external', url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  };

  const statusBanner = () => {
    if (!updateStatus) return null;
    const map = {
      checking: { Icon: RefreshCw, cls: 'border-[color:var(--neon-live)]/40 bg-[color:var(--neon-live)]/10 text-[color:var(--neon-live)]', spin: true },
      available: { Icon: AlertTriangle, cls: 'border-[color:var(--neon-attention)]/40 bg-[color:var(--neon-attention)]/10 text-[color:var(--neon-attention)]', spin: false },
      'not-available': { Icon: CheckCircle2, cls: 'border-[color:var(--neon-constructive)]/40 bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)]', spin: false },
      unsupported: { Icon: Info, cls: 'border-brand-border bg-brand-bg text-brand-textMuted', spin: false },
      error: { Icon: AlertTriangle, cls: 'border-[color:var(--neon-destructive)]/40 bg-[color:var(--neon-destructive)]/10 text-[color:var(--neon-destructive)]', spin: false },
      downloading: { Icon: RefreshCw, cls: 'border-[color:var(--neon-live)]/40 bg-[color:var(--neon-live)]/10 text-[color:var(--neon-live)]', spin: true },
      downloaded: { Icon: CheckCircle2, cls: 'border-[color:var(--neon-constructive)]/40 bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)]', spin: false }
    } as const;
    const cfg = map[updateStatus.status] ?? {
      Icon: Info,
      cls: 'border-brand-border bg-brand-bg text-brand-textMuted',
      spin: false
    };
    const { Icon } = cfg;
    return (
      <div className={`mt-4 flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm ${cfg.cls}`}>
        <div className="flex items-start gap-2">
          <Icon size={16} className={`mt-0.5 flex-shrink-0 ${cfg.spin ? 'animate-spin' : ''}`} />
          <div className="flex-1">
            <span>{updateStatus.message || 'Checking for updates…'}</span>
            {updateStatus.status === 'downloading' && updateStatus.progress && (
              <div className="mt-2.5">
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[color:var(--neon-live)] transition-all duration-300"
                    style={{ width: `${updateStatus.progress.percent}%` }}
                  />
                </div>
                {updateStatus.progress.total > 0 && (
                  <div className="mt-1 flex items-center justify-between text-[11px] text-brand-textMuted font-mono">
                    <span>
                      {((updateStatus.progress.transferred || 0) / (1024 * 1024)).toFixed(1)} MB / 
                      {((updateStatus.progress.total || 0) / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <span>{updateStatus.progress.percent}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {updateStatus.status === 'available' && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleDownload}
              className="ui-btn ui-btn-primary btn-sm flex items-center gap-1.5"
            >
              <Download size={13} /> Download and Install
            </button>
          </div>
        )}
        {updateStatus.status === 'downloaded' && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleRestart}
              className="ui-btn ui-btn-primary btn-sm flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> Restart and Install
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[680px] text-left">
      {/* Atmosphere hero — the brand mark over calm, layered depth bands. One focal point. */}
      <div className="relative mb-7 overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 82% -10%, var(--brand-atmo-glow), transparent 55%)' }}
          />
          <svg className="absolute inset-x-0 bottom-0 h-24 w-full" viewBox="0 0 680 96" preserveAspectRatio="none" fill="none">
            <path d="M0 54 C140 36 280 70 420 50 C560 30 620 64 680 46 L680 96 L0 96 Z" fill="var(--brand-atmo-1)" />
            <path d="M0 72 C160 56 300 86 460 68 C580 54 640 82 680 68 L680 96 L0 96 Z" fill="var(--brand-atmo-2)" />
          </svg>
        </div>
        <div className="relative flex items-center gap-4 px-6 py-6">
          <div className="animate-float shrink-0">
            <BrandLogo size={48} />
          </div>
          <div>
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain">Updates</h1>
            <p className="mt-1 text-sm leading-6 text-brand-textMuted">
              SuperAgent updates itself from GitHub Releases. In packaged builds, new versions download
              automatically and install when you quit.
            </p>
          </div>
        </div>
      </div>

      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Current Version</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="mb-0.5 text-sm font-medium text-brand-textMain">SuperAgent</div>
              <div className="text-xs leading-5 text-brand-textMuted">
                v{appVersion || '0.1.0'}
              </div>
            </div>
            <button
              type="button"
              data-testid="check-for-updates"
              disabled={checking}
              onClick={onCheckForUpdates}
              className="ui-btn"
            >
              <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Checking…' : 'Check for Updates'}
            </button>
          </div>
          {statusBanner()}
        </div>
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold text-brand-textMain">Release Channel</h3>
        <div className="rounded-lg border border-brand-border bg-brand-card p-4">
          <p className="mb-4 text-sm text-brand-textMuted">
            Choose which release updates you want to pull. Beta updates may contain experimental features.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="w-full sm:max-w-[240px]">
              <select
                value={releaseChannel}
                onChange={(e) => handleChannelChange(e.target.value as 'stable' | 'beta')}
                className="ui-input w-full"
              >
                <option value="stable">Stable (Release)</option>
                <option value="beta">Beta (Pre-release)</option>
              </select>
            </div>
            <div className="text-xs text-brand-textMuted">
              Stable updates are published on <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  openInBrowser(githubUrl);
                }}
                className="inline-flex cursor-pointer items-center gap-0.5 text-[var(--brand-accent)] hover:underline"
              >
                <ExternalLink size={12} /> GitHub Releases
              </a>.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default UpdatesSettings;
