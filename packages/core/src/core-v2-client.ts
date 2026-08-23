import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CoreV2DaemonOptions {
  port?: number;
  workspaceRoot?: string;
  daemonPath?: string;
  quiet?: boolean;
}

export interface CoreV2HealthResponse {
  status: string;
  version: string;
  engine: string;
}

export interface CoreV2SystemInfo {
  os_name: string;
  os_version: string;
  total_memory_mb: number;
  used_memory_mb: number;
  cpu_count: number;
  hostname: string;
}

export interface CoreV2ChatRequest {
  prompt: string;
  system_prompt?: string;
  provider?: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter' | 'deepseek' | 'groq';
  model_id?: string;
  api_key?: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  workspace?: string;
}

/**
 * Resolves the location of the compiled `superagent-core-daemon` binary.
 */
export function locateCoreV2Daemon(): string | null {
  const envOverride = process.env.SUPERAGENT_CORE_DAEMON_PATH;
  if (envOverride && fs.existsSync(envOverride)) {
    return envOverride;
  }

  const isWin = process.platform === 'win32';
  const binName = isWin ? 'superagent-core-daemon.exe' : 'superagent-core-daemon';

  // Check possible relative build paths
  const candidates = [
    path.resolve(process.cwd(), 'packages', 'core_v2', 'target', 'release', binName),
    path.resolve(process.cwd(), 'packages', 'core_v2', 'target', 'debug', binName),
    path.resolve(__dirname, '..', '..', 'core_v2', 'target', 'release', binName),
    path.resolve(__dirname, '..', '..', 'core_v2', 'target', 'debug', binName),
    path.resolve(__dirname, '..', '..', '..', 'packages', 'core_v2', 'target', 'release', binName),
    path.resolve(__dirname, '..', '..', '..', 'packages', 'core_v2', 'target', 'debug', binName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Spawns the Rust `superagent-core-daemon` HTTP/WebSocket server process.
 */
export function startCoreV2Daemon(options: CoreV2DaemonOptions = {}): ChildProcess {
  const daemonPath = options.daemonPath || locateCoreV2Daemon();
  if (!daemonPath) {
    throw new Error(
      'Could not locate superagent-core-daemon binary. Please build core_v2 with "npm run build:core" or "cargo build --manifest-path packages/core_v2/Cargo.toml".'
    );
  }

  const port = options.port || 1469;
  const workspace = options.workspaceRoot || process.cwd();

  const args = ['--server', '--port', String(port), '--workspace', workspace];

  const child = spawn(daemonPath, args, {
    stdio: options.quiet ? 'ignore' : 'inherit',
    detached: false,
  });

  return child;
}

/**
 * Lightweight HTTP client for interacting with the SuperAgent Core v2 Daemon.
 */
export class CoreV2Client {
  private baseUrl: string;

  constructor(port = 1469, host = '127.0.0.1') {
    this.baseUrl = `http://${host}:${port}`;
  }

  /**
   * Health check to verify if the Rust daemon is alive and healthy.
   */
  async checkHealth(): Promise<CoreV2HealthResponse> {
    const res = await fetch(`${this.baseUrl}/api/health`);
    if (!res.ok) {
      throw new Error(`Core v2 daemon health check failed with status: ${res.status}`);
    }
    return res.json() as Promise<CoreV2HealthResponse>;
  }

  /**
   * Retrieves native system telemetry from the Rust core.
   */
  async getSystemInfo(): Promise<CoreV2SystemInfo> {
    const res = await fetch(`${this.baseUrl}/api/system-info`);
    if (!res.ok) {
      throw new Error(`Failed to fetch system info: ${res.status}`);
    }
    return res.json() as Promise<CoreV2SystemInfo>;
  }

  /**
   * Retrieves list of registered tool schemas in the Rust core.
   */
  async getTools(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/tools`);
    if (!res.ok) {
      throw new Error(`Failed to list tools: ${res.status}`);
    }
    return res.json() as Promise<any[]>;
  }

  /**
   * Retrieves auth status from the Rust core.
   */
  async getAuthStatus(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/auth/status`);
    return res.json();
  }

  /**
   * Logs in against the Rust core auth store.
   */
  async login(username: string, password: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  }

  /**
   * Retrieves provider configuration status from the Rust core.
   */
  async getProvidersStatus(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/providers/status`);
    return res.json();
  }

  /**
   * Scans and returns live artifact runtime states.
   */
  async getArtifacts(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/artifacts`);
    return res.json();
  }

  /**
   * Starts a background artifact micro-app runner.
   */
  async startArtifact(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/artifacts/${encodeURIComponent(id)}/start`, {
      method: 'POST',
    });
    return res.json();
  }

  /**
   * Stops an active artifact micro-app runner.
   */
  async stopArtifact(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/artifacts/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
    });
    return res.json();
  }

  /**
   * Dispatches an agent execution request to the Rust daemon with SSE streaming.
   */
  async runChatStream(
    request: CoreV2ChatRequest,
    onEvent: (event: any) => void
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Failed to initiate chat stream: ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr);
              onEvent(event);
            } catch {
              // Ignore malformed chunks
            }
          }
        }
      }
    }
  }
}

