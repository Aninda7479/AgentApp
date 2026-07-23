import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';

export type TriggerType = 'cron' | 'watcher' | 'webhook';

export interface TriggerConfig {
  id: string;
  name: string;
  type: TriggerType;
  enabled: boolean;
  targetPath?: string;
  cronExpression?: string;
  intervalMs?: number;
  prompt: string;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error' | 'running';
  lastError?: string;
  runCount: number;
}

export interface TriggerExecutionEvent {
  trigger: TriggerConfig;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export class TriggerEngine extends EventEmitter {
  private triggers: Map<string, TriggerConfig> = new Map();
  private storagePath?: string;
  private timerHandles: Map<string, NodeJS.Timeout> = new Map();
  private fsWatchers: Map<string, fs.FSWatcher> = new Map();
  private isRunning: boolean = false;
  private executor?: (trigger: TriggerConfig, payload?: Record<string, unknown>) => Promise<void>;

  constructor(options: { storagePath?: string; executor?: (trigger: TriggerConfig, payload?: Record<string, unknown>) => Promise<void> } = {}) {
    super();
    this.storagePath = options.storagePath;
    this.executor = options.executor;
    if (this.storagePath) {
      this.loadTriggers();
    }
  }

  public setExecutor(executor: (trigger: TriggerConfig, payload?: Record<string, unknown>) => Promise<void>): void {
    this.executor = executor;
  }

  public addTrigger(config: Omit<TriggerConfig, 'id' | 'runCount'>): TriggerConfig {
    const id = `trig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullConfig: TriggerConfig = {
      ...config,
      id,
      runCount: 0,
      enabled: config.enabled ?? true,
    };
    this.triggers.set(id, fullConfig);
    this.saveTriggers();
    if (this.isRunning && fullConfig.enabled) {
      this.activateTrigger(fullConfig);
    }
    return fullConfig;
  }

  public removeTrigger(id: string): boolean {
    this.deactivateTrigger(id);
    const deleted = this.triggers.delete(id);
    if (deleted) {
      this.saveTriggers();
    }
    return deleted;
  }

  public updateTrigger(id: string, updates: Partial<TriggerConfig>): TriggerConfig | null {
    const existing = this.triggers.get(id);
    if (!existing) return null;

    this.deactivateTrigger(id);
    const updated: TriggerConfig = { ...existing, ...updates };
    this.triggers.set(id, updated);
    this.saveTriggers();

    if (this.isRunning && updated.enabled) {
      this.activateTrigger(updated);
    }
    return updated;
  }

  public getTrigger(id: string): TriggerConfig | undefined {
    return this.triggers.get(id);
  }

  public listTriggers(): TriggerConfig[] {
    return Array.from(this.triggers.values());
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    for (const trigger of this.triggers.values()) {
      if (trigger.enabled) {
        this.activateTrigger(trigger);
      }
    }
  }

  public stop(): void {
    this.isRunning = false;
    for (const id of Array.from(this.triggers.keys())) {
      this.deactivateTrigger(id);
    }
  }

  public async triggerWebhook(id: string, payload?: Record<string, unknown>): Promise<void> {
    const trigger = this.triggers.get(id);
    if (!trigger || !trigger.enabled) {
      throw new Error(`Trigger ${id} is disabled or does not exist.`);
    }
    await this.executeTrigger(trigger, payload);
  }

  public async executeTrigger(trigger: TriggerConfig, payload?: Record<string, unknown>): Promise<void> {
    trigger.lastRunAt = new Date().toISOString();
    trigger.lastStatus = 'running';
    trigger.runCount += 1;
    this.saveTriggers();

    const event: TriggerExecutionEvent = {
      trigger: { ...trigger },
      payload,
      timestamp: trigger.lastRunAt,
    };

    this.emit('trigger:fired', event);

    try {
      if (this.executor) {
        await this.executor(trigger, payload);
      }
      trigger.lastStatus = 'success';
      trigger.lastError = undefined;
    } catch (err: any) {
      trigger.lastStatus = 'error';
      trigger.lastError = err?.message || String(err);
      this.emit('trigger:error', { trigger, error: trigger.lastError });
    } finally {
      this.saveTriggers();
    }
  }

  private activateTrigger(trigger: TriggerConfig): void {
    this.deactivateTrigger(trigger.id);

    if (trigger.type === 'cron') {
      const intervalMs = trigger.intervalMs || 60000; // default 1 min
      const handle = setInterval(() => {
        this.executeTrigger(trigger).catch((err) => {
          console.error(`Error running cron trigger ${trigger.id}:`, err);
        });
      }, intervalMs);
      this.timerHandles.set(trigger.id, handle);
    } else if (trigger.type === 'watcher' && trigger.targetPath) {
      if (fs.existsSync(trigger.targetPath)) {
        try {
          const watcher = fs.watch(trigger.targetPath, { recursive: true }, (eventType, filename) => {
            if (filename && (filename.includes('.git') || filename.includes('node_modules'))) {
              return;
            }
            this.executeTrigger(trigger, { eventType, filename }).catch((err) => {
              console.error(`Error running watcher trigger ${trigger.id}:`, err);
            });
          });
          this.fsWatchers.set(trigger.id, watcher);
        } catch (e) {
          console.warn(`Could not setup FS watcher for ${trigger.targetPath}:`, e);
        }
      }
    }
  }

  private deactivateTrigger(id: string): void {
    const handle = this.timerHandles.get(id);
    if (handle) {
      clearInterval(handle);
      this.timerHandles.delete(id);
    }

    const watcher = this.fsWatchers.get(id);
    if (watcher) {
      watcher.close();
      this.fsWatchers.delete(id);
    }
  }

  private loadTriggers(): void {
    if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          this.triggers.set(item.id, item);
        }
      }
    } catch (e) {
      console.warn(`Failed loading triggers from ${this.storagePath}:`, e);
    }
  }

  private saveTriggers(): void {
    if (!this.storagePath) return;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(Array.from(this.triggers.values()), null, 2));
    } catch (e) {
      console.warn(`Failed saving triggers to ${this.storagePath}:`, e);
    }
  }
}
