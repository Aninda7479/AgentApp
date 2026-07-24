import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import net from 'net';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  ArtifactManifest,
  ArtifactRuntimeState,
  CreateArtifactParams,
  isValidArtifactManifest
} from './artifactManifest.js';
import { getArtifactDirectory } from '../storage/locations.js';

interface ActiveRunner {
  server?: http.Server;
  process?: ChildProcess;
  port: number;
}

/**
 * Core runner/manager for custom micro-apps / artifacts in ~/.superagent/artifact/<artifact-id>
 */
export class ArtifactRunner extends EventEmitter {
  private baseDir: string;
  private states: Map<string, ArtifactRuntimeState> = new Map();
  private runners: Map<string, ActiveRunner> = new Map();

  constructor(customDir?: string) {
    super();
    this.baseDir = customDir || getArtifactDirectory();
  }

  public getStoreDirectory(): string {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    return this.baseDir;
  }

  /**
   * Helper to locate available Python binary (py launcher, python3, or python).
   */
  public findPythonExecutable(): string {
    const candidates = process.platform === 'win32'
      ? ['py', 'python', 'python3']
      : ['python3', 'python'];

    for (const bin of candidates) {
      try {
        const res = spawnSync(bin, ['--version'], { encoding: 'utf-8' });
        if (res.status === 0) {
          return bin;
        }
      } catch {
        // Continue checking
      }
    }
    throw new Error('Python runtime not found. Please install Python (python, python3, or py launcher).');
  }

  /**
   * Scans the artifact directory for manifests and loads states.
   */
  public async scanArtifacts(): Promise<ArtifactRuntimeState[]> {
    const storeDir = this.getStoreDirectory();
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(storeDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const currentIds = new Set<string>();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const artifactId = entry.name;
      const manifestPath = path.join(storeDir, artifactId, 'manifest.json');

      if (!fs.existsSync(manifestPath)) continue;

      try {
        const content = fs.readFileSync(manifestPath, 'utf-8');
        const manifestObj = JSON.parse(content);

        if (isValidArtifactManifest(manifestObj)) {
          currentIds.add(manifestObj.id);
          const existingState = this.states.get(manifestObj.id);

          if (existingState) {
            existingState.manifest = manifestObj;
          } else {
            this.states.set(manifestObj.id, {
              id: manifestObj.id,
              manifest: manifestObj,
              status: 'stopped'
            });
          }
        }
      } catch (err) {
        // Skip invalid manifest
      }
    }

    // Clean up removed folders
    for (const [id] of this.states) {
      if (!currentIds.has(id)) {
        await this.stopArtifact(id);
        this.states.delete(id);
      }
    }

    // Trigger autoStart micro-apps
    for (const state of this.states.values()) {
      if (state.manifest.autoStart && state.status === 'stopped') {
        try {
          await this.startArtifact(state.id);
        } catch {
          // Ignore autoStart failure during background scan
        }
      }
    }

    const result = Array.from(this.states.values());
    this.emit('scanned', result);
    return result;
  }

  /**
   * Creates seed micro-apps (Quick Calculator and Scratchpad) if no artifacts exist.
   */
  public async ensureSeedArtifacts(): Promise<void> {
    const seedCalc: CreateArtifactParams = {
      id: 'quick-calc',
      name: 'Quick Calculator',
      description: 'Glassmorphism dark scientific mini-calculator',
      type: 'static',
      entry: 'index.html',
      port: 3080,
      logo: 'calc.png',
      files: {
        'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick Scientific Calculator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
    .calc { background: rgba(30, 41, 59, 0.8); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; width: 100%; max-width: 320px; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .display { background: #020617; border-radius: 12px; padding: 16px; text-align: right; font-size: 28px; font-weight: 600; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05); min-height: 64px; overflow-x: auto; word-break: break-all; color: #38bdf8; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    button { background: rgba(51, 65, 85, 0.6); color: #f8fafc; border: 1px solid rgba(255,255,255,0.08); padding: 14px; font-size: 18px; font-weight: 600; border-radius: 10px; cursor: pointer; transition: all 0.15s ease; }
    button:hover { background: rgba(71, 85, 105, 0.8); transform: translateY(-1px); }
    button:active { transform: translateY(1px); }
    button.op { background: rgba(14, 165, 233, 0.2); color: #38bdf8; border-color: rgba(56, 189, 248, 0.3); }
    button.eq { background: #0284c7; color: #fff; grid-column: span 2; }
    button.clear { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(248, 113, 113, 0.3); }
  </style>
</head>
<body>
  <div class="calc">
    <div class="display" id="display">0</div>
    <div class="grid">
      <button class="clear" onclick="clearDisplay()">C</button>
      <button onclick="append('(')">(</button>
      <button onclick="append(')')">)</button>
      <button class="op" onclick="append('/')">÷</button>
      <button onclick="append('7')">7</button>
      <button onclick="append('8')">8</button>
      <button onclick="append('9')">9</button>
      <button class="op" onclick="append('*')">×</button>
      <button onclick="append('4')">4</button>
      <button onclick="append('5')">5</button>
      <button onclick="append('6')">6</button>
      <button class="op" onclick="append('-')">-</button>
      <button onclick="append('1')">1</button>
      <button onclick="append('2')">2</button>
      <button onclick="append('3')">3</button>
      <button class="op" onclick="append('+')">+</button>
      <button onclick="append('0')">0</button>
      <button onclick="append('.')">.</button>
      <button class="eq" onclick="calculate()">=</button>
    </div>
  </div>
  <script>
    const display = document.getElementById('display');
    let expr = '0';
    function update() { display.innerText = expr || '0'; }
    function append(v) {
      if (expr === '0' && v !== '.') expr = '';
      expr += v;
      update();
    }
    function clearDisplay() { expr = '0'; update(); }
    function calculate() {
      try {
        expr = String(Function('"use strict";return (' + expr + ')')());
      } catch(e) {
        expr = 'Error';
      }
      update();
    }
  </script>
</body>
</html>`
      }
    };

    const seedNotes: CreateArtifactParams = {
      id: 'scratchpad',
      name: 'Super Scratchpad',
      description: 'Persistent local markdown notepad artifact',
      type: 'static',
      entry: 'index.html',
      port: 3081,
      logo: 'notes.png',
      files: {
        'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Super Scratchpad</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    body { background: #090d16; color: #e2e8f0; height: 100vh; display: flex; flex-direction: column; padding: 16px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    h2 { font-size: 18px; color: #a855f7; display: flex; align-items: center; gap: 8px; }
    .status { font-size: 12px; color: #94a3b8; }
    textarea { flex: 1; background: #131b2e; color: #f1f5f9; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; font-size: 14px; line-height: 1.6; resize: none; outline: none; }
    textarea:focus { border-color: #a855f7; }
  </style>
</head>
<body>
  <header>
    <h2>📝 Super Scratchpad</h2>
    <span class="status" id="status">Auto-saved locally</span>
  </header>
  <textarea id="note" placeholder="Type your ideas, snippets, or code scratch notes here..."></textarea>
  <script>
    const ta = document.getElementById('note');
    const st = document.getElementById('status');
    ta.value = localStorage.getItem('scratch_note') || '';
    ta.addEventListener('input', () => {
      localStorage.setItem('scratch_note', ta.value);
      st.innerText = 'Saved at ' + new Date().toLocaleTimeString();
    });
  </script>
</body>
</html>`
      }
    };

    await this.createArtifact(seedCalc);
    await this.createArtifact(seedNotes);
  }

  /**
   * Creates a new artifact folder, writes files, and saves manifest.json.
   */
  public async createArtifact(params: CreateArtifactParams): Promise<ArtifactRuntimeState> {
    const storeDir = this.getStoreDirectory();
    const artifactDir = path.join(storeDir, params.id);

    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }

    // Write internal files
    for (const [relativePath, content] of Object.entries(params.files)) {
      const filePath = path.join(artifactDir, relativePath);
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    const manifest: ArtifactManifest = {
      id: params.id,
      name: params.name,
      description: params.description,
      version: '1.0.0',
      type: params.type || 'static',
      entry: params.entry || 'index.html',
      port: params.port || 3080,
      logo: params.logo,
      autoStart: params.autoStart,
      windowWidth: params.windowWidth,
      windowHeight: params.windowHeight,
      resizable: params.resizable,
      tags: params.tags,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(
      path.join(artifactDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    const state: ArtifactRuntimeState = {
      id: manifest.id,
      manifest,
      status: 'stopped'
    };

    this.states.set(manifest.id, state);
    this.emit('created', state);
    return state;
  }

  /**
   * Starts an artifact (HTTP static server, Node process, or Python process).
   */
  public async startArtifact(id: string): Promise<ArtifactRuntimeState> {
    const state = this.states.get(id);
    if (!state) {
      throw new Error(`Artifact "${id}" not found`);
    }

    if (state.status === 'running') {
      return state;
    }

    state.status = 'starting';
    this.emit('stateChanged', state);

    try {
      const artifactDir = path.join(this.getStoreDirectory(), id);
      const preferredPort = state.manifest.port || 3080;
      const actualPort = await this.findAvailablePort(preferredPort);

      if (state.manifest.type === 'static') {
        const server = http.createServer((req, res) => {
          let reqPath = req.url || '/';
          if (reqPath.includes('?')) {
            reqPath = reqPath.split('?')[0];
          }

          let decodedPath = '/';
          try {
            decodedPath = decodeURIComponent(reqPath);
          } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('400 Bad Request');
            return;
          }

          const safeArtifactDir = path.resolve(artifactDir);
          let filePath = path.resolve(
            safeArtifactDir,
            decodedPath === '/' ? state.manifest.entry : decodedPath.startsWith('/') ? decodedPath.slice(1) : decodedPath
          );

          // Path containment check to prevent directory traversal attacks
          if (!filePath.startsWith(safeArtifactDir + path.sep) && filePath !== safeArtifactDir) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('403 Forbidden: Access outside artifact directory denied');
            return;
          }

          if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(safeArtifactDir, state.manifest.entry);
          }

          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.mjs': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.wasm': 'application/wasm',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf'
          };

          const contentType = mimeTypes[ext] || 'application/octet-stream';

          try {
            const data = fs.readFileSync(filePath);
            res.writeHead(200, {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*'
            });
            res.end(data);
          } catch (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          }
        });

        await new Promise<void>((resolve, reject) => {
          server.listen(actualPort, '127.0.0.1', () => resolve());
          server.on('error', (err) => reject(err));
        });

        this.runners.set(id, { server, port: actualPort });
        state.status = 'running';
        state.actualPort = actualPort;
        state.url = `http://127.0.0.1:${actualPort}`;
        state.startedAt = new Date().toISOString();
      } else if (state.manifest.type === 'node' || state.manifest.type === 'python') {
        const entryPath = path.join(artifactDir, state.manifest.entry);
        const bin = state.manifest.type === 'node' ? process.execPath : this.findPythonExecutable();
        const logPath = path.join(artifactDir, 'app.log');
        const logStream = fs.createWriteStream(logPath, { flags: 'a' });

        const envVars = {
          ...process.env,
          PORT: String(actualPort),
          ...(state.manifest.type === 'python' ? { PYTHONUNBUFFERED: '1' } : {}),
          ...(state.manifest.env || {})
        };

        const child = spawn(bin, [entryPath], {
          cwd: artifactDir,
          env: envVars,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        child.stdout?.pipe(logStream);
        child.stderr?.pipe(logStream);

        let stderrBuf = '';
        child.stderr?.on('data', (chunk) => {
          stderrBuf += chunk.toString();
        });

        child.on('exit', (code) => {
          this.runners.delete(id);
          const current = this.states.get(id);
          if (current) {
            current.status = code === 0 ? 'stopped' : 'error';
            if (code !== 0 && stderrBuf) {
              current.errorMessage = stderrBuf.slice(-300);
            }
            current.actualPort = undefined;
            current.url = undefined;
            this.emit('stateChanged', current);
          }
        });

        this.runners.set(id, { process: child, port: actualPort });
        state.status = 'running';
        state.actualPort = actualPort;
        state.url = `http://127.0.0.1:${actualPort}`;
        state.startedAt = new Date().toISOString();
      }

      this.emit('stateChanged', state);
      return state;
    } catch (err: any) {
      state.status = 'error';
      state.errorMessage = err.message || 'Failed to start artifact';
      this.emit('stateChanged', state);
      throw err;
    }
  }

  /**
   * Stops a running artifact.
   */
  public async stopArtifact(id: string): Promise<ArtifactRuntimeState> {
    const state = this.states.get(id);
    const runner = this.runners.get(id);

    if (runner) {
      if (runner.server) {
        runner.server.close();
      }
      if (runner.process) {
        runner.process.kill('SIGTERM');
      }
      this.runners.delete(id);
    }

    if (state) {
      state.status = 'stopped';
      state.actualPort = undefined;
      state.url = undefined;
      state.startedAt = undefined;
      this.emit('stateChanged', state);
    }

    return state || {
      id,
      manifest: {
        id,
        name: id,
        description: '',
        version: '1.0.0',
        type: 'static',
        entry: 'index.html',
        createdAt: new Date().toISOString()
      },
      status: 'stopped'
    };
  }

  /**
   * Deletes an artifact directory and stops any running instance.
   */
  public async deleteArtifact(id: string): Promise<boolean> {
    await this.stopArtifact(id);
    this.states.delete(id);
    const storeDir = this.getStoreDirectory();
    const artifactDir = path.join(storeDir, id);
    if (fs.existsSync(artifactDir)) {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
    this.emit('deleted', id);
    return true;
  }

  /**
   * Returns recent log lines from the app.log file.
   */
  public getArtifactLogs(id: string, maxLines = 50): string {
    const storeDir = this.getStoreDirectory();
    const logPath = path.join(storeDir, id, 'app.log');
    if (!fs.existsSync(logPath)) {
      return '';
    }
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n');
      return lines.slice(-maxLines).join('\n');
    } catch {
      return '';
    }
  }

  public getArtifactState(id: string): ArtifactRuntimeState | undefined {
    return this.states.get(id);
  }

  public listArtifactStates(): ArtifactRuntimeState[] {
    return Array.from(this.states.values());
  }

  /**
   * Helper to check port availability.
   */
  private async findAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve) => {
      const checkPort = (port: number) => {
        const server = net.createServer();
        server.once('error', () => {
          checkPort(port + 1);
        });
        server.once('listening', () => {
          server.close(() => resolve(port));
        });
        server.listen(port, '127.0.0.1');
      };
      checkPort(startPort);
    });
  }

  /**
   * Stop all running artifacts on application shutdown.
   */
  public async destroyAll(): Promise<void> {
    for (const id of Array.from(this.runners.keys())) {
      await this.stopArtifact(id);
    }
  }
}
