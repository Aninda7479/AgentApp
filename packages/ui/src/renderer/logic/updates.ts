/**
 * `UpdateService` — drives the Settings → Updates panel. Triggers a manual
 * update check in the main process / Tauri v2 updater and surfaces the result.
 */
import type { AppContext, UpdateStatus } from './types';
import { isTauriEnv } from '../tauriBridge';

let cachedPendingUpdate: any = null;

/**
 * Compares two semantic version strings (e.g. "0.27.1" vs "0.28.0" or "v0.1.0").
 * Returns:
 *   -1 if v1 < v2 (update available)
 *    1 if v1 > v2
 *    0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (s: string): number[] => {
    return (s || '')
      .replace(/^v/i, '')
      .split('.')
      .map(part => parseInt(part.replace(/\D.*$/, ''), 10))
      .map(n => (Number.isNaN(n) ? 0 : n));
  };
  const p1 = parse(v1);
  const p2 = parse(v2);
  const maxLen = Math.max(p1.length, p2.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

/**
 * Queries GitHub Releases directly for the latest published release.
 */
export async function fetchLatestRelease(): Promise<{ version: string; releaseUrl: string; notes?: string } | null> {
  // 1. Try latest.json manifest
  try {
    const manifestRes = await fetch('https://github.com/Aninda7479/AgentApp/releases/latest/download/latest.json', { cache: 'no-store' });
    if (manifestRes.ok) {
      const manifest = await manifestRes.json();
      if (manifest.version) {
        const cleanVer = String(manifest.version).replace(/^v/, '').trim();
        return {
          version: cleanVer,
          releaseUrl: `https://github.com/Aninda7479/AgentApp/releases/tag/v${cleanVer}`,
          notes: manifest.notes || ''
        };
      }
    }
  } catch {
    // Continue to next fallback
  }

  // 2. Try GitHub API
  try {
    const apiRes = await fetch('https://api.github.com/repos/Aninda7479/AgentApp/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (apiRes.ok) {
      const release = await apiRes.json();
      if (release.tag_name) {
        const cleanVer = String(release.tag_name).replace(/^v/, '').trim();
        return {
          version: cleanVer,
          releaseUrl: release.html_url || `https://github.com/Aninda7479/AgentApp/releases/tag/${release.tag_name}`,
          notes: release.body || ''
        };
      }
    }
  } catch {
    // Network or offline
  }

  return null;
}

export class UpdateService {
  /**
   * Triggers a manual update check.
   * - In Tauri (desktop app): uses @tauri-apps/plugin-updater with GitHub release fallback.
   * - In Web / Desktop IPC: queries IPC or API endpoint with fallback.
   */
  static async check(ctx: AppContext): Promise<void> {
    ctx.setActiveTab('settings');
    ctx.setSettingsCategory('updates');
    ctx.setUpdateStatus({ status: 'checking', message: 'Checking GitHub releases for updates…' });

    // 1. Tauri v2 Desktop Environment
    if (isTauriEnv()) {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();

        if (update) {
          cachedPendingUpdate = update;
          ctx.setUpdateStatus({
            status: 'available',
            version: update.version,
            message: `Version v${update.version} is available!`
          });
          return;
        }
      } catch (err: any) {
        console.warn('[UpdateService] Tauri plugin-updater check failed, trying fallback check:', err);
      }

      // If Tauri check returned null or threw (e.g. running in dev mode or platform manifest issue),
      // verify directly against GitHub releases
      try {
        const remoteRelease = await fetchLatestRelease();
        if (remoteRelease) {
          let currentVersion = '0.27.1';
          if (ctx.ipc) {
            try {
              const v = await ctx.ipc.invoke('app-version');
              if (v) currentVersion = String(v).replace(/^v/, '').trim();
            } catch {}
          }

          if (compareSemver(currentVersion, remoteRelease.version) < 0) {
            ctx.setUpdateStatus({
              status: 'available',
              version: remoteRelease.version,
              message: `Version v${remoteRelease.version} is available!`
            });
            return;
          }
        }

        cachedPendingUpdate = null;
        ctx.setUpdateStatus({
          status: 'not-available',
          message: 'SuperAgent is up to date.'
        });
      } catch (err: any) {
        ctx.setUpdateStatus({
          status: 'error',
          message: `Update check failed: ${err?.message || String(err)}`
        });
      }
      return;
    }

    // 2. Web / Desktop IPC Environment
    if (ctx.ipc) {
      try {
        const res = await ctx.ipc.invoke('check-for-updates');
        if (res) {
          ctx.setUpdateStatus(res);
          return;
        }
      } catch (err: any) {
        console.warn('[UpdateService] IPC check-for-updates error, falling back to HTTP:', err);
      }
    }

    // 3. Web fallback
    try {
      let data: any = null;
      if (typeof fetch !== 'undefined') {
        try {
          const res = await fetch('/api/update/check');
          if (res.ok) {
            data = await res.json();
          }
        } catch {
          // Local backend endpoint failed, fallback to direct GitHub check
        }

        if (!data || data.error) {
          data = await fetchLatestRelease();
        }

        if (data && (data.hasUpdate || (data.version && compareSemver(data.current || '0.27.1', data.version || data.latest) < 0))) {
          const latestVer = data.latest || data.version;
          ctx.setUpdateStatus({
            status: 'available',
            version: latestVer,
            message: `Version v${latestVer} is available!`
          });
        } else {
          ctx.setUpdateStatus({
            status: 'not-available',
            message: 'SuperAgent is up to date.'
          });
        }
      } else {
        ctx.setUpdateStatus({ status: 'unsupported', message: 'Updates are only available in the desktop app.' });
      }
    } catch (err: any) {
      ctx.setUpdateStatus({
        status: 'error',
        message: `Update check failed: ${err?.message || String(err)}`
      });
    }
  }

  /**
   * Downloads and installs the pending update.
   */
  static async downloadAndInstall(ctx: AppContext): Promise<void> {
    if (isTauriEnv() && cachedPendingUpdate) {
      ctx.setUpdateStatus({
        status: 'downloading',
        message: 'Downloading update...',
        progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 }
      });

      try {
        let downloaded = 0;
        let totalLength = 0;

        await cachedPendingUpdate.downloadAndInstall((event: any) => {
          switch (event.event) {
            case 'Started':
              totalLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (totalLength > 0) {
                const pct = Math.round((downloaded / totalLength) * 100);
                ctx.setUpdateStatus({
                  status: 'downloading',
                  message: `Downloading update (${pct}%)…`,
                  progress: {
                    percent: pct,
                    bytesPerSecond: 0,
                    transferred: downloaded,
                    total: totalLength
                  }
                });
              }
              break;
            case 'Finished':
              ctx.setUpdateStatus({
                status: 'downloaded',
                message: 'Update downloaded and verified! Restart to apply.'
              });
              break;
          }
        });

        ctx.setUpdateStatus({
          status: 'downloaded',
          message: 'Update ready to install. Restart the app to apply.'
        });
      } catch (err: any) {
        ctx.setUpdateStatus({
          status: 'error',
          message: err?.message || 'Download failed'
        });
      }
      return;
    }

    if (ctx.ipc) {
      try {
        await ctx.ipc.invoke('download-update');
      } catch (err: any) {
        ctx.setUpdateStatus({ status: 'error', message: err?.message || 'Download failed' });
      }
      return;
    }

    // 3. Web mode: trigger server-side CLI update via /api/update/apply
    if (typeof fetch !== 'undefined') {
      ctx.setUpdateStatus({
        status: 'downloading',
        message: 'Downloading and updating SuperAgent CLI on server...',
        progress: { percent: 45, bytesPerSecond: 0, transferred: 0, total: 0 }
      });

      try {
        const res = await fetch('/api/update/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        ctx.setUpdateStatus({
          status: 'downloading',
          message: 'Update installed! Server is restarting automatically, reconnecting…',
          progress: { percent: 90, bytesPerSecond: 0, transferred: 0, total: 0 }
        });

        // Automatically poll until the newly updated server comes back online, then reload seamlessly!
        let attempts = 0;
        const checkInterval = setInterval(async () => {
          attempts++;
          try {
            const checkRes = await fetch('/api/update/check', { cache: 'no-store' });
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              clearInterval(checkInterval);
              ctx.setUpdateStatus({
                status: 'not-available',
                version: checkData.current,
                message: `SuperAgent CLI successfully updated to v${checkData.current} and online!`
              });
              setTimeout(() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }, 1200);
            }
          } catch {
            if (attempts > 30) {
              clearInterval(checkInterval);
              ctx.setUpdateStatus({
                status: 'downloaded',
                message: 'Update complete. Please reload your browser page.'
              });
            }
          }
        }, 1500);
      } catch (err: any) {
        ctx.setUpdateStatus({
          status: 'error',
          message: `Update failed: ${err?.message || String(err)}`
        });
      }
    }
  }

  /**
   * Restarts the application and applies the downloaded update.
   */
  static async quitAndInstall(ctx: AppContext): Promise<void> {
    if (isTauriEnv()) {
      try {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch (err: any) {
        console.error('[UpdateService] Relaunch error:', err);
      }
      return;
    }

    if (ctx.ipc) {
      ctx.ipc.invoke('quit-and-install');
      return;
    }

    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}

