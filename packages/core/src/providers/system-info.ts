/**
 * Hardware detection for the Local Model (Ollama) manager.
 *
 * Centralized in Core so that all platforms (Desktop, Web, etc.) can query the
 * same hardware profile reliably. Built on `systeminformation`, which abstracts the
 * per-OS wmi / sysctl / /proc probes.
 *
 * Every probe is wrapped so a single failure degrades gracefully to `null`
 * rather than rejecting the whole IPC call.
 */
import * as si from 'systeminformation';

export interface GpuInfo {
  model: string;
  vendor: string;
  /** Dedicated video memory in GB (0 when the OS reports none, e.g. some iGPUs). */
  vramGB: number;
}

export interface StorageInfo {
  mount: string;
  type: 'SSD' | 'HDD' | 'NVMe' | 'unknown';
  sizeGB: number;
  freeGB: number;
}

export interface SystemInfo {
  platform: NodeJS.Platform;
  arch: string;
  cpuBrand: string;
  cpuManufacturer: string;
  cpuCores: number;
  /** Base clock in GHz (0 when unknown). */
  cpuSpeedGHz: number;
  /** Total system RAM in GB. */
  ramGB: number;
  /** Free system RAM in GB. */
  ramFreeGB: number;
  gpus: GpuInfo[];
  /**
   * True for Apple Silicon (and treated as true for any arm64 macOS): RAM and
   * VRAM share a single pool, so the whole RAM budget is usable as VRAM.
   */
  isUnifiedMemory: boolean;
  /**
   * The VRAM budget a single local inference run can use, in GB. On unified-
   * memory machines this equals total RAM; otherwise it is the largest single
   * discrete GPU's VRAM.
   */
  vramBudgetGB: number;
  /**
   * NPU / TPU presence. systeminformation does not expose a dedicated NPU
   * field across OSes, so we report Apple's Neural Engine on Apple Silicon and
   * otherwise "not detected". The UI treats this as informational only.
   */
  npuTpu: { detected: boolean; label: string };
  storage: StorageInfo[];
  /** True only when every probe above succeeded. */
  fullyDetected: boolean;
}

const GB = (bytes: number): number => (bytes ? bytes / 1_000_000_000 : 0);

/** Map a physical-disk type string to our simplified enum. */
function normalizeDiskType(raw: string | undefined): StorageInfo['type'] {
  if (!raw) return 'unknown';
  const t = raw.toLowerCase();
  if (t.includes('nvme') || t.includes('ssd') || t.includes('flash') || t.includes('pci')) return 'NVMe';
  if (t.includes('hdd') || t.includes('hard') || t.includes('rotational')) return 'HDD';
  return 'unknown';
}

export async function getSystemInfo(): Promise<SystemInfo> {
  // Sensible defaults so a partial failure still returns something.
  const info: SystemInfo = {
    platform: process.platform,
    arch: process.arch,
    cpuBrand: 'Unknown CPU',
    cpuManufacturer: '',
    cpuCores: 0,
    cpuSpeedGHz: 0,
    ramGB: 0,
    ramFreeGB: 0,
    gpus: [],
    isUnifiedMemory: false,
    vramBudgetGB: 0,
    npuTpu: { detected: false, label: 'Not detected' },
    storage: [],
    fullyDetected: false
  };

  let okCount = 0;
  const total = 4; // cpu, mem, graphics, storage (osInfo is advisory)

  try {
    const [cpu, mem, graphics, diskLayout, fsSize] = await Promise.all([
      si.cpu().catch(() => null),
      si.mem().catch(() => null),
      si.graphics().catch(() => null),
      si.diskLayout().catch(() => [] as any[]),
      si.fsSize().catch(() => [] as any[])
    ]);

    if (cpu) {
      okCount++;
      info.cpuBrand = cpu.brand || cpu.manufacturer || 'CPU';
      info.cpuManufacturer = cpu.manufacturer || '';
      info.cpuCores = cpu.cores || cpu.physicalCores || 0;
      info.cpuSpeedGHz = cpu.speed ? Math.round(cpu.speed * 10) / 10 : 0;
    }

    if (mem) {
      okCount++;
      info.ramGB = Math.round(GB(mem.total) * 10) / 10;
      info.ramFreeGB = Math.round(GB(mem.available) * 10) / 10;
    }

    if (graphics) {
      okCount++;
      info.gpus = (graphics.controllers || [])
        .filter((c: any) => c.model && !/microsoft basic|remote|virtual/i.test(c.model))
        .map((c: any) => ({
          model: c.model || 'Unknown GPU',
          vendor: c.vendor || '',
          vramGB: Math.round((c.vram || 0) / 1024) // systeminformation reports vram in MB
        }));
    }

    // Advisory: unified-memory SoCs (Apple Silicon, NVIDIA Spark/Jetson/Orin)
    // share RAM and VRAM in one pool, so the whole RAM budget is usable as VRAM.
    const isAppleSilicon =
      info.cpuManufacturer.toLowerCase().includes('apple') ||
      (process.platform === 'darwin' && process.arch === 'arm64');
    const isNvidiaUnified = info.gpus.some((g) => /spark|jetson|orin|dgx/i.test(g.model));
    info.isUnifiedMemory = isAppleSilicon || isNvidiaUnified;
    if (isAppleSilicon) {
      info.npuTpu = { detected: true, label: 'Apple Neural Engine (unified)' };
    } else if (isNvidiaUnified) {
      info.npuTpu = { detected: true, label: 'NVIDIA unified memory (Spark / Jetson)' };
    }

    // Storage: capacity/free from mounted volumes; type from physical layout.
    if (Array.isArray(fsSize) && fsSize.length) {
      okCount++;
      const typesByDevice = new Map<string, StorageInfo['type']>();
      if (Array.isArray(diskLayout)) {
        for (const d of diskLayout) {
          const type = normalizeDiskType((d as any).type);
          if (type !== 'unknown' && d.device) typesByDevice.set(d.device, type);
        }
      }
      info.storage = fsSize
        .filter((v: any) => v.size > 0)
        .map((v: any) => {
          let type: StorageInfo['type'] = typesByDevice.get(v.fs) || 'unknown';
          if (type === 'unknown') {
            const nm = (v.fs || '').toLowerCase();
            if (nm.includes('nvme') || nm.includes('ssd')) type = 'NVMe';
          }
          return {
            mount: v.mount,
            type,
            sizeGB: Math.round(GB(v.size) * 10) / 10,
            freeGB: Math.round(GB(v.available) * 10) / 10
          };
        });
    }

    // VRAM budget: unified memory => whole RAM; else largest single discrete GPU.
    if (info.isUnifiedMemory) {
      info.vramBudgetGB = info.ramGB;
    } else {
      const maxVram = info.gpus.reduce((m, g) => Math.max(m, g.vramGB), 0);
      info.vramBudgetGB = maxVram;
    }

    info.fullyDetected = okCount >= total - 1; // tolerate one soft miss
    return info;
  } catch (err) {
    console.error('[system-info] detection error:', err);
    return info;
  }
}
