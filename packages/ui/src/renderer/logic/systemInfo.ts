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

export interface SystemInfo {
  cpuBrand: string;
  cpuCores: number;
  cpuSpeedGHz: number;
  ramGB: number;
  ramFreeGB: number;
  vramBudgetGB: number;
  isUnifiedMemory: boolean;
  gpus: SystemGpuInfo[];
  storage: SystemStorageInfo[];
  npuTpu: SystemNpuInfo;
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
    };
  }

  const rawRamMB = typeof raw.total_memory_mb === 'number' ? raw.total_memory_mb : 0;
  const rawUsedMB = typeof raw.used_memory_mb === 'number' ? raw.used_memory_mb : 0;

  const ramGB = typeof raw.ramGB === 'number'
    ? raw.ramGB
    : rawRamMB > 0
    ? Math.round((rawRamMB / 1024) * 10) / 10
    : 16;

  const ramFreeGB = typeof raw.ramFreeGB === 'number'
    ? raw.ramFreeGB
    : rawRamMB > 0
    ? Math.max(0, Math.round(((rawRamMB - rawUsedMB) / 1024) * 10) / 10)
    : Math.round(ramGB * 0.5 * 10) / 10;

  const cpuCores = typeof raw.cpuCores === 'number' ? raw.cpuCores : (typeof raw.cpu_count === 'number' ? raw.cpu_count : 8);
  const cpuBrand = raw.cpuBrand || raw.cpu_brand || (raw.os_name ? `${raw.os_name} CPU` : 'System CPU');
  const cpuSpeedGHz = typeof raw.cpuSpeedGHz === 'number' ? raw.cpuSpeedGHz : 2.8;

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
        freeGB: typeof s?.freeGB === 'number' ? s.freeGB : 64,
        sizeGB: typeof s?.sizeGB === 'number' ? s.sizeGB : 256,
      }))
    : [{ mount: raw.os_name?.toLowerCase().includes('windows') ? 'C:\\' : '/', type: 'SSD', freeGB: 64, sizeGB: 256 }];

  const npuTpu: SystemNpuInfo = raw.npuTpu && typeof raw.npuTpu === 'object'
    ? {
        detected: Boolean(raw.npuTpu.detected),
        label: raw.npuTpu.label || '',
      }
    : { detected: false, label: '' };

  const isUnifiedMemory = Boolean(
    raw.isUnifiedMemory ??
    (raw.os_name?.toLowerCase().includes('darwin') || raw.os_name?.toLowerCase().includes('mac') || raw.cpuBrand?.includes('Apple'))
  );

  const vramBudgetGB = typeof raw.vramBudgetGB === 'number'
    ? raw.vramBudgetGB
    : gpus.length > 0
    ? Math.max(...gpus.map((g) => g.vramGB))
    : isUnifiedMemory
    ? Math.round(ramGB * 0.7 * 10) / 10
    : 0;

  return {
    cpuBrand,
    cpuCores,
    cpuSpeedGHz,
    ramGB,
    ramFreeGB,
    vramBudgetGB,
    isUnifiedMemory,
    gpus,
    storage,
    npuTpu,
    os_name: raw.os_name,
    os_version: raw.os_version,
    hostname: raw.hostname,
  };
}
