import * as http from 'node:http';
import { EventEmitter } from 'node:events';

/** A text selection within a file in the IDE. */
export interface IDESelection {
  text: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
}

/** Snapshot of what the user is doing in their IDE at a point in time. */
export interface IDEActiveContext {
  activeFile?: string;
  selection?: IDESelection;
  openFiles?: string[];
  workspaceFolder?: string;
  lastUpdated?: number;
}

/** Options for the IDE context bridge HTTP server. */
export interface IDEContextBridgeOptions {
  port?: number;
  host?: string;
  onContextUpdate?: (context: IDEActiveContext) => void;
}

/** Lightweight HTTP server that receives IDE context updates (VS Code extensions, etc.). */
export class IDEContextBridge extends EventEmitter {
  private server: http.Server | null = null;
  private context: IDEActiveContext = {};
  private port: number;
  private host: string;

  constructor(options: IDEContextBridgeOptions = {}) {
    super();
    this.port = options.port || 3000;
    this.host = options.host || '127.0.0.1';
    if (options.onContextUpdate) {
      this.on('update', options.onContextUpdate);
    }
  }

  public getContext(): IDEActiveContext {
    return { ...this.context };
  }

  public updateContext(partialContext: Partial<IDEActiveContext>): IDEActiveContext {
    this.context = {
      ...this.context,
      ...partialContext,
      lastUpdated: Date.now()
    };
    this.emit('update', this.context);
    return this.context;
  }

  public start(port?: number, host?: string): Promise<void> {
    if (port) this.port = port;
    if (host) this.host = host;

    return new Promise((resolve, reject) => {
      if (this.server) {
        return resolve();
      }

      this.server = http.createServer((req, res) => {
        // CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const urlPath = req.url || '';

        if (req.method === 'GET' && (urlPath === '/ide/context' || urlPath === '/ide' || urlPath === '/context')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, context: this.context }));
          return;
        }

        if (req.method === 'GET' && urlPath === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }

        if (req.method === 'POST' && (urlPath === '/ide/context' || urlPath === '/ide' || urlPath === '/context')) {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const updated = this.updateContext(payload);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, context: updated }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        return resolve();
      }
      this.server.close((err) => {
        this.server = null;
        if (err) return reject(err);
        resolve();
      });
    });
  }
}
