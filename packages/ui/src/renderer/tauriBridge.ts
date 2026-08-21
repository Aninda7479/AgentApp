/**
 * Unified IPC & Platform Bridge for SuperAgent UI.
 * Adapts between Tauri v2 Rust IPC and Web HTTP IPC.
 */

export interface SystemInfo {
  os_name: String;
  os_version: String;
  total_memory_mb: number;
  used_memory_mb: number;
  cpu_count: number;
  cpu_usage_percent: number;
  hostname: string;
}

export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauriEnv()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(command, args);
    } catch (err) {
      console.error(`[TauriBridge] Command error (${command}):`, err);
      throw err;
    }
  } else if (typeof window !== 'undefined' && (window as any).superagent?.ipc) {
    return (window as any).superagent.ipc.invoke(command, args);
  } else if (typeof window !== 'undefined' && typeof fetch === 'function') {
    try {
      const res = await fetch(`/api/ipc/${command}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: command, args: args ? [args] : [] }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      return json.data as T;
    } catch (err) {
      console.error(`[HTTPBridge] Command error (${command}):`, err);
      throw err;
    }
  }
  throw new Error(`[PlatformBridge] Unsupported runtime environment for command: ${command}`);
}

export async function getSystemInfo(): Promise<SystemInfo> {
  if (isTauriEnv()) {
    return await invokeCommand<SystemInfo>('get_system_info');
  }
  return {
    os_name: 'Browser',
    os_version: 'Web',
    total_memory_mb: 8192,
    used_memory_mb: 4096,
    cpu_count: 4,
    cpu_usage_percent: 15.0,
    hostname: 'Web-Client'
  };
}

export async function minimizeAppWindow(): Promise<void> {
  if (isTauriEnv()) {
    await invokeCommand('minimize_window');
  }
}

export async function toggleAppWindowMaximize(): Promise<void> {
  if (isTauriEnv()) {
    await invokeCommand('toggle_window_maximize');
  }
}

export async function closeAppWindow(): Promise<void> {
  if (isTauriEnv()) {
    await invokeCommand('close_window');
  }
}

export async function enableAutostart(): Promise<boolean> {
  if (isTauriEnv()) {
    try {
      await invokeCommand('autostart_enable');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function disableAutostart(): Promise<boolean> {
  if (isTauriEnv()) {
    try {
      await invokeCommand('autostart_disable');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function isAutostartEnabled(): Promise<boolean> {
  if (isTauriEnv()) {
    try {
      return await invokeCommand<boolean>('autostart_is_enabled');
    } catch {
      return false;
    }
  }
  return false;
}
