/**
 * `UpdateService` — drives the Settings → Updates panel. Triggers a manual
 * update check in the main process / Tauri v2 updater and surfaces the result.
 */
import type { AppContext, UpdateStatus } from './types';
import { isTauriEnv } from '../tauriBridge';

let cachedPendingUpdate: any = null;

/**
 * Helper to fetch with an AbortController timeout.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 3500
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller?.signal
    });
    return res;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

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
 * Queries GitHub Releases for the latest published release.
 * Queries API and manifest endpoints in parallel with timeouts for maximum speed.
 */
export async function fetchLatestRelease(): Promise<{ version: string; releaseUrl: string; notes?: string } | null> {
  const tryApi = async () => {
    try {
      const apiRes = await fetchWithTimeout(
        'https://api.github.com/repos/Aninda7479/AgentApp/releases/latest',
        {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store'
        },
        3500
      );
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
    } catch {}
    return null;
  };

  const tryManifest = async () => {
    try {
      const manifestRes = await fetchWithTimeout(
        'https://github.com/Aninda7479/AgentApp/releases/latest/download/latest.json',
        { cache: 'no-store' },
        3500
      );
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
    } catch {}
    return null;
  };

  const [resApi, resManifest] = await Promise.allSettled([tryApi(), tryManifest()]);
  if (resApi.status === 'fulfilled' && resApi.value) return resApi.value;
  if (resManifest.status === 'fulfilled' && resManifest.value) return resManifest.value;
  return null;
}

export class UpdateService {
  /**
   * Triggers a manual update check.
   * - In Tauri (desktop app): uses @tauri-apps/plugin-updater with fast GitHub release fallback.
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
        // Wrap check() in a timeout race so slow DNS/network doesn't stall indefinitely
        const update = await Promise.race([
          check(),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Updater check timeout')), 4000))
        ]);

        if (update) {
          cachedPendingUpdate = update;
          ctx.setUpdateStatus({
            status: 'available',
            version: update.version,
            message: `Version v${update.version} is available!`,
            releaseNotes: update.body || '',
            releaseUrl: `https://github.com/Aninda7479/AgentApp/releases/tag/v${update.version}`
          });
          return;
        }
      } catch (err: any) {
        console.warn('[UpdateService] Tauri plugin-updater check failed, trying fallback check:', err);
      }

      // If Tauri check returned null or threw, verify directly against GitHub releases
      try {
        let currentVersion = '0.39.0';
        if (ctx.ipc) {
          try {
            const v = await ctx.ipc.invoke('app-version');
            if (v) currentVersion = String(v).replace(/^v/, '').trim();
          } catch {}
        }

        const remoteRelease = await fetchLatestRelease();
        if (remoteRelease) {
          if (compareSemver(currentVersion, remoteRelease.version) < 0) {
            ctx.setUpdateStatus({
              status: 'available',
              version: remoteRelease.version,
              currentVersion,
              message: `Version v${remoteRelease.version} is available!`,
              releaseUrl: remoteRelease.releaseUrl,
              releaseNotes: remoteRelease.notes
            });
            return;
          }
        }

        cachedPendingUpdate = null;
        ctx.setUpdateStatus({
          status: 'not-available',
          currentVersion,
          message: 'SuperAgent is up to date.'
        });
      } catch (err: any) {
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        ctx.setUpdateStatus({
          status: 'error',
          message: isOffline
            ? 'No internet connection. Please check your network and try again.'
            : `Update check failed: ${err?.message || String(err)}`
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
          const res = await fetchWithTimeout('/api/update/check', { cache: 'no-store' }, 3000);
          if (res.ok) {
            data = await res.json();
          }
        } catch {
          // Local backend endpoint failed, fallback to direct GitHub check
        }

        if (!data || data.error) {
          data = await fetchLatestRelease();
        }

        let currentVersion = '0.39.0';
        if (data?.current) {
          currentVersion = String(data.current).replace(/^v/, '').trim();
        }

        if (
          data &&
          (data.hasUpdate || (data.version && compareSemver(currentVersion, data.version || data.latest) < 0))
        ) {
          const latestVer = data.latest || data.version;
          ctx.setUpdateStatus({
            status: 'available',
            version: latestVer,
            currentVersion,
            message: `Version v${latestVer} is available!`,
            releaseUrl: data.releaseUrl || `https://github.com/Aninda7479/AgentApp/releases/tag/v${latestVer}`,
            releaseNotes: data.notes || data.releaseNotes || ''
          });
        } else {
          ctx.setUpdateStatus({
            status: 'not-available',
            currentVersion,
            message: 'SuperAgent is up to date.'
          });
        }
      } else {
        ctx.setUpdateStatus({ status: 'unsupported', message: 'Updates are only available in the desktop app.' });
      }
    } catch (err: any) {
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      ctx.setUpdateStatus({
        status: 'error',
        message: isOffline
          ? 'No internet connection. Please check your network and try again.'
          : `Update check failed: ${err?.message || String(err)}`
      });
    }
  }

  /**
   * Downloads and installs the pending update.
   */
  static async downloadAndInstall(ctx: AppContext): Promise<void> {
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      ctx.setUpdateStatus((prev) => ({
        status: 'error',
        version: prev?.version,
        releaseUrl: prev?.releaseUrl,
        releaseNotes: prev?.releaseNotes,
        message: 'Cannot download update while offline. Please check your internet connection and try again.'
      }));
      return;
    }

    if (isTauriEnv()) {
      // If cachedPendingUpdate is null, attempt to fetch fresh updater handle
      if (!cachedPendingUpdate) {
        try {
          ctx.setUpdateStatus((prev) => ({
            status: 'checking',
            version: prev?.version,
            releaseUrl: prev?.releaseUrl,
            releaseNotes: prev?.releaseNotes,
            message: 'Connecting to updater service…'
          }));
          const { check } = await import('@tauri-apps/plugin-updater');
          const update = await Promise.race([
            check(),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Updater connection timeout')), 4000))
          ]);
          if (update) {
            cachedPendingUpdate = update;
          }
        } catch (err) {
          console.warn('[UpdateService] Dynamic re-check failed:', err);
        }
      }

      if (cachedPendingUpdate) {
        ctx.setUpdateStatus((prev) => ({
          status: 'downloading',
          version: cachedPendingUpdate.version || prev?.version,
          releaseUrl:
            prev?.releaseUrl ||
            `https://github.com/Aninda7479/AgentApp/releases/tag/v${cachedPendingUpdate.version || ''}`,
          releaseNotes: prev?.releaseNotes,
          message: 'Downloading update...',
          progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 }
        }));

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
                  ctx.setUpdateStatus((prev) => ({
                    status: 'downloading',
                    version: prev?.version,
                    releaseUrl: prev?.releaseUrl,
                    releaseNotes: prev?.releaseNotes,
                    message: `Downloading update (${pct}%)…`,
                    progress: {
                      percent: pct,
                      bytesPerSecond: 0,
                      transferred: downloaded,
                      total: totalLength
                    }
                  }));
                }
                break;
              case 'Finished':
                ctx.setUpdateStatus((prev) => ({
                  status: 'downloaded',
                  version: prev?.version,
                  releaseUrl: prev?.releaseUrl,
                  releaseNotes: prev?.releaseNotes,
                  message: 'Update downloaded and verified! Restart to apply.'
                }));
                break;
            }
          });

          ctx.setUpdateStatus((prev) => ({
            status: 'downloaded',
            version: prev?.version,
            releaseUrl: prev?.releaseUrl,
            releaseNotes: prev?.releaseNotes,
            message: 'Update ready to install. Restart the app to apply.'
          }));
          return;
        } catch (err: any) {
          console.error('[UpdateService] Tauri download error:', err);
          const errMsg = err?.message || String(err || 'Download failed');
          ctx.setUpdateStatus((prev) => ({
            status: 'error',
            version: prev?.version,
            releaseUrl: prev?.releaseUrl || 'https://github.com/Aninda7479/AgentApp/releases/latest',
            releaseNotes: prev?.releaseNotes,
            message: `Download failed: ${errMsg}. You can retry or download directly from GitHub Releases.`
          }));
          return;
        }
      }

      // If Tauri plugin-updater did not return an update object (e.g. running unsigned build or dev mode)
      // Fallback gracefully to opening release download
      ctx.setUpdateStatus((prev) => {
        const releaseUrl =
          prev?.releaseUrl ||
          (prev?.version
            ? `https://github.com/Aninda7479/AgentApp/releases/tag/v${prev.version}`
            : 'https://github.com/Aninda7479/AgentApp/releases/latest');
        return {
          status: 'available',
          version: prev?.version,
          releaseUrl,
          releaseNotes: prev?.releaseNotes,
          message: `In-app installer is not configured for this build. Please download the release binary (.exe / .dmg / .deb) directly.`
        };
      });

      UpdateService.openReleaseUrl(ctx);
      return;
    }

    if (ctx.ipc) {
      try {
        const res = await ctx.ipc.invoke('download-update');
        if (res && res.status) {
          ctx.setUpdateStatus(res);
          return;
        }
      } catch (err: any) {
        // Fallback to web mode below
      }
    }

    // 3. Web mode: trigger server-side CLI update via /api/update/apply
    if (typeof fetch !== 'undefined') {
      ctx.setUpdateStatus((prev) => ({
        status: 'downloading',
        version: prev?.version,
        releaseUrl: prev?.releaseUrl,
        releaseNotes: prev?.releaseNotes,
        message: 'Downloading and updating SuperAgent CLI on server...',
        progress: { percent: 45, bytesPerSecond: 0, transferred: 0, total: 0 }
      }));

      try {
        const res = await fetch('/api/update/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        ctx.setUpdateStatus((prev) => ({
          status: 'downloading',
          version: prev?.version,
          releaseUrl: prev?.releaseUrl,
          releaseNotes: prev?.releaseNotes,
          message: 'Update installed! Server is restarting automatically, reconnecting…',
          progress: { percent: 90, bytesPerSecond: 0, transferred: 0, total: 0 }
        }));

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
              ctx.setUpdateStatus((prev) => ({
                status: 'downloaded',
                version: prev?.version,
                releaseUrl: prev?.releaseUrl,
                releaseNotes: prev?.releaseNotes,
                message: 'Update complete. Please reload your browser page.'
              }));
            }
          }
        }, 1500);
      } catch (err: any) {
        ctx.setUpdateStatus((prev) => ({
          status: 'error',
          version: prev?.version,
          releaseUrl: prev?.releaseUrl,
          releaseNotes: prev?.releaseNotes,
          message: `Update failed: ${err?.message || String(err)}`
        }));
      }
    }
  }

  /**
   * Opens the release URL in the system browser.
   */
  static openReleaseUrl(ctx: AppContext, url?: string): void {
    const targetUrl = url || 'https://github.com/Aninda7479/AgentApp/releases/latest';
    if (ctx.ipc) {
      try {
        ctx.ipc.invoke('open-external', targetUrl);
        return;
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
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

