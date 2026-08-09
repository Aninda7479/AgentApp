/**
 * Unified IPC & Platform Bridge for SuperAgent UI.
 * Gracefully adapts between Tauri v2 Rust IPC and Electron IPC.
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
  } else if (typeof window !== 'undefined' && (window as any).electron?.ipcRenderer) {
    return (window as any).electron.ipcRenderer.invoke(command, args);
  }
  throw new Error(`[PlatformBridge] Unsupported runtime environment for command: ${command}`);
}

export async function getSystemInfo(): Promise<SystemInfo> {
  if (isTauriEnv()) {
    return await invokeCommand<SystemInfo>('get_system_info');
  } else if (typeof window !== 'undefined' && (window as any).electron?.getSystemInfo) {
    return await (window as any).electron.getSystemInfo();
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
  } else if (typeof window !== 'undefined' && (window as any).electron?.minimizeWindow) {
    (window as any).electron.minimizeWindow();
  }
}

export async function toggleAppWindowMaximize(): Promise<void> {
  if (isTauriEnv()) {
    await invokeCommand('toggle_window_maximize');
  } else if (typeof window !== 'undefined' && (window as any).electron?.toggleWindowMaximize) {
    (window as any).electron.toggleWindowMaximize();
  }
}

export async function closeAppWindow(): Promise<void> {
  if (isTauriEnv()) {
    await invokeCommand('close_window');
  } else if (typeof window !== 'undefined' && (window as any).electron?.closeWindow) {
    (window as any).electron.closeWindow();
  }
}
