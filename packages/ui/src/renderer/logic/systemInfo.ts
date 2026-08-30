/**
 * System hardware & environment info normalization.
 */

export interface SystemGpuInfo {
  model: string;
  vramGB: number;
}

export interface SystemStorageInfo {
  mount: string;
  type: string;
  freeGB: number;
  sizeGB: number;
}

export interface SystemNpuInfo {
  detected: boolean;
  label: string;
}

export interface SystemOllamaInfo {
  installed: boolean;
  running: boolean;
  version?: string;
  path?: string;
  port?: number;
  baseUrl?: string;
}

export interface SystemInfo {
  cpuBrand: string;
  cpuCores: number;
  cpuSpeedGHz: number;
  cpuUsagePercent?: number;
  ramGB: number;
  ramFreeGB: number;
  totalMemoryMB?: number;
  availableMemoryMB?: number;
  vramBudgetGB: number;
  isUnifiedMemory: boolean;
  gpus: SystemGpuInfo[];
  storage: SystemStorageInfo[];
  npuTpu: SystemNpuInfo;
  ollama?: SystemOllamaInfo;
  arch?: string;
  os_name?: string;
  os_version?: string;
  hostname?: string;
}

/**
 * Normalizes raw system info from Tauri IPC / Backend HTTP into a crash-proof SystemInfo struct.
 */
export function normalizeSystemInfo(raw: any): SystemInfo {
  if (!raw || typeof raw !== 'object') {
    return {
      cpuBrand: 'System Processor',
      cpuCores: 8,
      cpuSpeedGHz: 2.8,
      ramGB: 16,
      ramFreeGB: 8,
      vramBudgetGB: 4,
      isUnifiedMemory: false,
      gpus: [],
      storage: [{ mount: 'System Disk', type: 'SSD', freeGB: 64, sizeGB: 256 }],
      npuTpu: { detected: false, label: '' },
      ollama: { installed: false, running: false, baseUrl: 'http://localhost:11434' },
      arch: 'x86_64',
    };
  }

  const rawRamMB = typeof raw.total_memory_mb === 'number' ? raw.total_memory_mb : (typeof raw.totalMemoryMB === 'number' ? raw.totalMemoryMB : 0);
  const rawUsedMB = typeof raw.used_memory_mb === 'number' ? raw.used_memory_mb : 0;
  const rawAvailMB = typeof raw.available_memory_mb === 'number' ? raw.available_memory_mb : (typeof raw.free_memory_mb === 'number' ? raw.free_memory_mb : (rawRamMB > rawUsedMB ? rawRamMB - rawUsedMB : 0));

  const ramGB = typeof raw.ramGB === 'number'
    ? raw.ramGB
    : rawRamMB > 0
    ? Math.round((rawRamMB / 1024) * 10) / 10
    : 16;

  const ramFreeGB = typeof raw.ramFreeGB === 'number'
    ? raw.ramFreeGB
    : rawAvailMB > 0
    ? Math.round((rawAvailMB / 1024) * 10) / 10
    : Math.round(ramGB * 0.5 * 10) / 10;

  const cpuCores = typeof raw.cpuCores === 'number' ? raw.cpuCores : (typeof raw.cpu_count === 'number' ? raw.cpu_count : (typeof raw.cpuCount === 'number' ? raw.cpuCount : 8));
  const cpuBrand = raw.cpuBrand || raw.cpu_brand || (raw.os_name ? `${raw.os_name} CPU` : 'System CPU');
  const cpuSpeedGHz = typeof raw.cpuSpeedGHz === 'number' ? raw.cpuSpeedGHz : (typeof raw.cpu_speed_ghz === 'number' ? raw.cpu_speed_ghz : 2.8);
  const cpuUsagePercent = typeof raw.cpu_usage_percent === 'number' ? raw.cpu_usage_percent : (typeof raw.cpuUsagePercent === 'number' ? raw.cpuUsagePercent : 0);

  const gpus: SystemGpuInfo[] = Array.isArray(raw.gpus)
    ? raw.gpus.map((g: any) => ({
        model: g?.model || 'Discrete GPU',
        vramGB: typeof g?.vramGB === 'number' ? g.vramGB : 0,
      }))
    : [];

  const storage: SystemStorageInfo[] = Array.isArray(raw.storage) && raw.storage.length > 0
    ? raw.storage.map((s: any) => ({
        mount: s?.mount || '/',
        type: s?.type || 'SSD',
        freeGB: typeof s?.freeGB === 'number' ? s.freeGB : (typeof s?.free_gb === 'number' ? s.free_gb : 64),
        sizeGB: typeof s?.sizeGB === 'number' ? s.sizeGB : (typeof s?.size_gb === 'number' ? s.size_gb : 256),
      }))
    : [{ mount: raw.os_name?.toLowerCase().includes('windows') ? 'C:\\' : '/', type: 'SSD', freeGB: 64, sizeGB: 256 }];

  const npuTpu: SystemNpuInfo = raw.npuTpu && typeof raw.npuTpu === 'object'
    ? {
        detected: Boolean(raw.npuTpu.detected),
        label: raw.npuTpu.label || '',
      }
    : raw.npu_tpu && typeof raw.npu_tpu === 'object'
    ? {
        detected: Boolean(raw.npu_tpu.detected),
        label: raw.npu_tpu.label || '',
      }
    : { detected: false, label: '' };

  const isUnifiedMemory = Boolean(
    raw.isUnifiedMemory ?? raw.is_unified_memory ??
    (raw.os_name?.toLowerCase().includes('darwin') || raw.os_name?.toLowerCase().includes('mac') || raw.cpuBrand?.includes('Apple') || cpuBrand.includes('Apple'))
  );

  const vramBudgetGB = typeof raw.vramBudgetGB === 'number'
    ? raw.vramBudgetGB
    : gpus.length > 0
    ? Math.max(...gpus.map((g) => g.vramGB))
    : isUnifiedMemory
    ? Math.round(ramGB * 0.75 * 10) / 10
    : 0;

  const ollama: SystemOllamaInfo = raw.ollama && typeof raw.ollama === 'object'
    ? {
        installed: Boolean(raw.ollama.installed),
        running: Boolean(raw.ollama.running),
        version: raw.ollama.version || undefined,
        path: raw.ollama.path || undefined,
        port: raw.ollama.port || 11434,
        baseUrl: raw.ollama.baseUrl || 'http://localhost:11434',
      }
    : { installed: false, running: false, baseUrl: 'http://localhost:11434' };

  return {
    cpuBrand,
    cpuCores,
    cpuSpeedGHz,
    cpuUsagePercent,
    ramGB,
    ramFreeGB,
    totalMemoryMB: rawRamMB,
    availableMemoryMB: rawAvailMB,
    vramBudgetGB,
    isUnifiedMemory,
    gpus,
    storage,
    npuTpu,
    ollama,
    arch: raw.arch || (typeof navigator !== 'undefined' && navigator.userAgent?.includes('ARM') ? 'aarch64' : 'x86_64'),
    os_name: raw.os_name,
    os_version: raw.os_version,
    hostname: raw.hostname,
  };
}
