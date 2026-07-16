import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
  SettingsStorage,
  UsageTracker,
  ModelRouter,
  ModelGovStorage,
  PlaywrightBrowserEngine,
  ComputerUse,
  getUserDataDirectory,
  AuthStore,
  ProviderAutoDetector,
  MCP_CATALOG,
  PLUGIN_CATALOG,
  SkillStore
} from '@superagent/core';

import { AgentEngine, AgentEngineConfig, AgentEvent } from './ai-engine.js';
import { readConversationStore, writeConversationStore } from './storage/conversation-store.js';
import { getChatDirectory } from './storage/paths.js';
import * as PartnerStore from './partner-store.js';
import {
  authGate,
  handleLogin,
  handleLogout,
  handleStatus,
  handleSetup,
  handleChangePassword,
  getAuthenticatedUser,
  isAuthDisabled
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Setup JSON parsing limit to accommodate larger buffer contents
app.use(express.json({ limit: '50mb' }));

const userDataDir = getUserDataDirectory();

// Web build version, read from the package manifest at startup.
const WEB_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')).version;
  } catch {
    return '0.0.0';
  }
})();

// ─── VPS Authentication ─────────────────────────────────────────────────────
// Session-based login system. Credentials live in the shared core AuthStore so
// the CLI/Desktop/Web all manage the same admin account. Auth is required by
// default; set SUPERAGENT_DISABLE_AUTH=true for open (local/dev) mode.

// Seed the admin account from env vars on first run (headless provisioning).
if (!isAuthDisabled() && AuthStore.ensureSeededFromEnv()) {
  console.log('[Security] Seeded admin credentials from environment variables.');
}

// Lightweight health check (always public).
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Auth endpoints (must be registered before the gate).
app.post('/api/auth/setup', handleSetup);
app.post('/api/auth/login', handleLogin);
app.post('/api/auth/logout', handleLogout);
app.get('/api/auth/status', handleStatus);
app.post('/api/auth/change-password', handleChangePassword);

// Serve the standalone login/setup page (public; must stay before the gate).
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// NOTE: the account (change-password) page is registered AFTER `app.use(authGate)`
// below, so it is actually session-protected. It was previously registered here
// (before the gate) and was therefore reachable without authentication.

if (isAuthDisabled()) {
  console.log('[Security Warning] SUPERAGENT_DISABLE_AUTH=true — running in OPEN mode with NO authentication.');
} else if (AuthStore.isPasswordSet()) {
  console.log(`[Security] Login enabled — username "${AuthStore.getUsername()}". All routes require an authenticated session.`);
} else {
  console.log('[Security] Login enabled with the default password "admin" — set a custom one via `superagent password set` or the /account page.');
}

// Gate everything else behind a valid session.
app.use(authGate);

// Serve the account (change-password) page. Registered AFTER the gate so it
// requires an authenticated session — an unauthenticated request is redirected
// to /login by the gate above. (This page was previously registered BEFORE the
// gate and was therefore reachable without authentication.)
app.get('/account', (_req, res) => {
  res.sendFile(path.join(__dirname, 'account.html'));
});

// ─── WebSocket Event Hub ────────────────────────────────────────────────────
const connectedSockets = new Set<WebSocket>();

wss.on('connection', (ws) => {
  connectedSockets.add(ws);
  console.log(`[WebSocket] Client connected. Active clients: ${connectedSockets.size}`);

  ws.on('close', () => {
    connectedSockets.delete(ws);
    console.log(`[WebSocket] Client disconnected. Active clients: ${connectedSockets.size}`);
  });

  // A socket error (e.g. ECONNRESET, TLS failure) emits 'error' with no listener
  // by default, which becomes an uncaught exception and can crash the server.
  // Swallow it and drop the socket instead.
  ws.on('error', (err) => {
    console.error(`[WebSocket] Client error (dropping socket):`, err);
    connectedSockets.delete(ws);
    try { ws.close(); } catch { /* already closed */ }
  });
});

/** Broadcasts a message to all connected WebSocket clients. */
function broadcast(channel: string, data: any) {
  let payload: string;
  try {
    payload = JSON.stringify({ channel, data });
  } catch {
    // Circular/malformed payload — don't let it break the caller's loop.
    console.error(`[WebSocket] Dropping broadcast on channel "${channel}" (unserializable payload).`);
    return;
  }
  connectedSockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        // Socket died mid-send; clean it up.
        connectedSockets.delete(ws);
      }
    }
  });
}

// ─── Browser Automation engine ────────────────────────────────────────────────
let mainSharedBrowser: PlaywrightBrowserEngine | null = null;
/** Lazily initializes and returns the shared Playwright browser instance. */
async function getMainBrowser(): Promise<PlaywrightBrowserEngine> {
  if (!mainSharedBrowser) {
    let config: any = { headless: true };
    try {
      const settings = SettingsStorage.loadSettings();
      if (settings.browserUse) {
        config = {
          headless: settings.browserUse.headless !== false,
          viewport: settings.browserUse.width && settings.browserUse.height
            ? { width: settings.browserUse.width, height: settings.browserUse.height }
            : { width: 1280, height: 720 },
          userAgent: settings.browserUse.userAgent,
          timeout: settings.browserUse.timeout ? settings.browserUse.timeout * 1000 : 30000
        };
      }
    } catch {
      // Fallback
    }
    mainSharedBrowser = new PlaywrightBrowserEngine(config);
  }
  if (!mainSharedBrowser.isInitialized()) {
    await mainSharedBrowser.initialize();
  }
  return mainSharedBrowser;
}

// ─── AI Orchestrator ────────────────────────────────────────────────────────
  // Map of active agent sessions by session ID
  const activeSessions = new Map<string, AgentEngine>();

/** Creates or reuses an AgentEngine for a session and runs it with streaming events. */
async function runAgentEngine(
  sessionId: string,
  prompt: string,
  config: AgentEngineConfig,
  currentAttachments?: string[]
) {
  try {
    let engine = activeSessions.get(sessionId);
    if (!engine) {
      const finalConfig = { ...config };
      // Auto-route model if set to 'auto' or 'Model Governance'
      if (config.model === 'auto' || config.model === 'Model Governance') {
        const settings = SettingsStorage.loadSettings();
        const enabledModels = settings.models?.filter(m => m.enabled) || [];
        const routed = ModelRouter.routeModelForTask(prompt, enabledModels as any);
        if (routed) {
          finalConfig.provider = routed.provider as any;
          finalConfig.model = routed.model;
          const byok = settings.providers?.find(p => p.id === routed.provider);
          if (byok) {
            finalConfig.apiKey = byok.apiKey;
            finalConfig.baseUrl = byok.baseUrl;
          }
        }
      }

        // Resolve model display names to actual IDs for the upstream API
        if (finalConfig.model && /\s/.test(finalConfig.model) && finalConfig.provider) {
        const settings = SettingsStorage.loadSettings();
        const match = (settings.models || []).find(
          m => m.providerId === finalConfig.provider && m.name === finalConfig.model
        );
        if (match) {
          finalConfig.model = match.id.replace(`${finalConfig.provider}-`, '');
        }
      }

      engine = new AgentEngine(finalConfig, sessionId);
      activeSessions.set(sessionId, engine);
    }

    await engine.run(prompt, (agentEvent: AgentEvent) => {
      broadcast('agent-event', agentEvent);
    }, currentAttachments);

    activeSessions.delete(sessionId);
  } catch (err: any) {
    console.error(`[Agent Run Fail] Session ${sessionId}:`, err);
    broadcast('agent-event', {
      type: 'error',
      sessionId,
      error: err.message || String(err)
    });
    activeSessions.delete(sessionId);
  }
}

// ─── Auto-detect Providers ───────────────────────────────────────────────────
// Shared with the Desktop app via core's ProviderAutoDetector (single source of truth).
/** Auto-detects AI providers from environment variables. */
async function autoDetectProviders() {
  return ProviderAutoDetector.detect();
}

// ─── Model Governance Prompt Optimization ────────────────────────────────────
/** Uses an AI engine to optimize the Model Governance system prompt. */
async function optimizeInstructionsByAI() {
  const settings = SettingsStorage.loadSettings();
  const govEnabledIds = settings.modelGov?.enabledModels || [];
  
  const activeModels = (settings.models || []).filter(m => 
    govEnabledIds.includes(m.id) || 
    govEnabledIds.includes(`${m.providerId}-${m.id}`)
  );

  const currentInstructions = ModelGovStorage.loadInstructions();
  const providers = settings.providers || [];
  const activeProvider = providers.find(p => p.apiKey);
  const activeModelSetting = settings.models?.find(m => m.enabled && m.providerId === activeProvider?.id);

  if (!activeProvider || !activeModelSetting) {
    throw new Error('No active AI provider with configured API key found to perform prompt optimization.');
  }

  const engineConfig = {
    provider: activeProvider.id as any,
    apiKey: activeProvider.apiKey,
    baseUrl: activeProvider.baseUrl,
    model: activeModelSetting.id.replace(`${activeProvider.id}-`, ''),
    systemPrompt: 'You are a professional system prompt optimizer specializing in AI model routing and orchestration.',
    temperature: 0.3
  };

  const engine = new AgentEngine(engineConfig, `optimize-prompt-${Date.now()}`);
  
  const optimizationPrompt = `You are a system prompt optimizer. You are optimizing the Model Governance System Instructions for a Sakana Fugu-class routing conductor.

Here is the current pool of enabled models:
${activeModels.map(m => `- ${m.name} (${m.providerId}) - Pricing: Input ${m.pricing?.inputPer1M || 'N/A'}, Output ${m.pricing?.outputPer1M || 'N/A'}`).join('\n')}

Here is the current instructions file content:
\`\`\`markdown
${currentInstructions}
\`\`\`

Optimization Goal: ${settings.modelGov?.optimizationGoal || 'balanced'}
Routing Strategy: ${settings.modelGov?.routingStrategy || 'router'}

Please optimize these system instructions to:
1. Make the categorization boundaries more precise for the specific models in this pool.
2. Formulate explicit conducting guidelines using the Claude Fable 5 escalation structure.
3. Keep the output strictly in Markdown format.
4. Do NOT wrap the output in markdown code blocks (e.g. \`\`\`markdown). Return ONLY the direct markdown text of the system instructions.`;

  let optimizedContent = '';
  await engine.run(optimizationPrompt, (event) => {
    if (event.type === 'token' && event.content) {
      optimizedContent += event.content;
    }
  });

  if (!optimizedContent || optimizedContent.trim().length === 0) {
    throw new Error('AI engine returned empty optimization response.');
  }

  optimizedContent = optimizedContent
    .replace(/^```markdown\n?/i, '')
    .replace(/```$/, '')
    .trim();

  ModelGovStorage.saveInstructions(optimizedContent);
  return optimizedContent;
}

// ─── API Router mapping Electron IPC ─────────────────────────────────────────
app.post('/api/ipc/:channel', (req, res) => { void handleIpc(req, res); });

/**
 * Handles a single IPC channel invocation over HTTP (mirrors the Electron IPC
 * surface for the web/VPS build). Exported so it can be unit-tested without
 * booting a listener.
 */
export async function handleIpc(req: Request, res: Response): Promise<void> {
  const { channel } = req.params;
  const args = Array.isArray(req.body?.args) ? req.body.args : [];
  // Channels that require a payload argument. Without it they'd dereference
  // `args[0].<field>` and throw inside the try, surfacing as a 500 — return a
  // clear 400 instead (the request is malformed, not the server broken).
  const ARGS_REQUIRED = new Set<string>([
    'browser-navigate',
    'copy-file-to-chat',
    'read-file-base64',
    'save-chat-media-buffer',
    'agent-run',
    'agent-stop'
  ]);
  if (ARGS_REQUIRED.has(channel) && args[0] == null) {
    res.status(400).json({ error: `Channel "${channel}" requires a payload argument.` });
    return;
  }
  // Channels that exist only in the Electron desktop build (native file pickers,
  // 3D model generation, MCP subprocess management, auto-updater, and the 3D pet
  // window). The web build ships the *same* desktop renderer, so it still invokes
  // them — respond with a clear, non-error payload instead of a 404 so the UI
  // degrades gracefully and the browser console stays clean.
  const WEB_UNSUPPORTED = new Set<string>([
    'check-for-updates',
    'browser-close',
    'pick-image-file',
    'partner-install',
    'partner-pick-model-file',
    'partner-pick-model-folder',
    'partner-import-model',
    'partner-import-model-folder',
    'pet-start',
    'pet-stop',
    'pet-set-visible',
    'pet-say',
    'three-d-generate',
    'three-d-delete-model',
    'three-d-import-external-model',
    'three-d-list-models',
    'mcp-connect',
    'mcp-disconnect',
    'mcp-list',
    'mcp-call',
    'mcp-install'
  ]);
  if (WEB_UNSUPPORTED.has(channel)) {
    res.json({ data: { ok: false, unsupported: true, error: 'This feature is not available in the web build.' } });
    return;
  }
  try {
    let result: any;
    // Dispatch IPC channel to the corresponding handler
    switch (channel) {
      case 'store-read':
        result = readConversationStore(userDataDir);
        break;
      case 'store-write':
        writeConversationStore(args[0], userDataDir);
        result = null;
        break;
      case 'settings-read':
        result = SettingsStorage.loadSettings();
        break;
      case 'settings-write':
        SettingsStorage.saveSettings(args[0]);
        result = null;
        break;
      case 'usage-summary':
        result = UsageTracker.getSummary();
        break;
      case 'usage-records':
        result = UsageTracker.loadUsage();
        break;
      case 'usage-clear':
        UsageTracker.clearUsage();
        result = null;
        break;
      case 'model-gov-read-instructions':
        result = ModelGovStorage.loadInstructions();
        break;
      case 'model-gov-write-instructions':
        ModelGovStorage.saveInstructions(args[0]);
        result = null;
        break;
      case 'model-gov-update-instructions':
        result = await ModelGovStorage.autoUpdateInstructions();
        break;
      case 'model-gov-optimize-instructions-by-ai':
        result = await optimizeInstructionsByAI();
        break;
      case 'browser-navigate': {
        const browser = await getMainBrowser();
        const navRes = await browser.navigate(args[0].url);
        result = `Successfully navigated to ${navRes.url} (HTTP status: ${navRes.status}). Page Title: "${navRes.title}"`;
        break;
      }
      case 'browser-screenshot': {
        const browser = await getMainBrowser();
        const logsDir = path.join(userDataDir, 'logs');
        fs.mkdirSync(logsDir, { recursive: true });
        const screenshotPath = path.join(logsDir, `browser-screenshot-${Date.now()}.png`);
        await browser.takeScreenshot({ path: screenshotPath, fullPage: !!args[0]?.fullPage });
        result = `Screenshot captured and saved to: ${screenshotPath}`;
        break;
      }
      case 'screenshot_screen':
        result = await ComputerUse.takeScreenshot();
        break;
      case 'select-project-folders':
        // Web fallback: return current working directory
        result = [path.resolve(process.cwd())];
        break;
      case 'select-files':
        // Web fallback: return empty array (user can paste paths)
        result = [];
        break;
      case 'copy-file-to-chat': {
        const { sourcePath, chatId, projectName } = args[0];
        const targetDir = getChatDirectory(userDataDir, chatId, projectName || undefined);
        fs.mkdirSync(targetDir, { recursive: true });
        const filename = path.basename(sourcePath);
        const destPath = path.join(targetDir, filename);
        fs.copyFileSync(sourcePath, destPath);
        result = {
          filename,
          relativePath: path.relative(userDataDir, destPath),
          fullPath: destPath
        };
        break;
      }
      case 'read-file-base64': {
        const filePath = args[0];
        if (typeof filePath !== 'string') {
          res.status(400).json({ error: 'read-file-base64 requires a file path argument.' });
          return;
        }
        // Confine reads to the project root and the user-data dir (chat media +
        // logs). Reading arbitrary absolute paths would let an authenticated
        // caller exfiltrate any file on disk — inconsistent with the
        // project-root scoping the other file tools now enforce (4b0223f /
        // abbad59 / 64655f9: read_file/list_dir/write_file/grep_search are all
        // scoped). This channel is authenticated but is still reachable over
        // HTTP in the web/VPS build and by the agent surface, so it must not be
        // a free arbitrary-file-read primitive.
        const resolved = path.resolve(filePath);
        const allowedRoots = [path.resolve(process.cwd()), path.resolve(userDataDir)];
        const inside = allowedRoots.some((r) => resolved === r || resolved.startsWith(r + path.sep));
        if (!inside) {
          res.status(400).json({ error: 'File is outside the allowed directories.' });
          return;
        }
        const content = fs.readFileSync(resolved);
        const ext = path.extname(resolved).toLowerCase();
        let mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.svg') mimeType = 'image/svg+xml';
        result = `data:${mimeType};base64,${content.toString('base64')}`;
        break;
      }
      case 'save-chat-media-buffer': {
        const { buffer, filename, chatId, projectName } = args[0];
        const targetDir = getChatDirectory(userDataDir, chatId, projectName || undefined);
        fs.mkdirSync(targetDir, { recursive: true });
        const destPath = path.join(targetDir, filename);
        
  // Handle buffer formats from HTTP (Buffer or {data: Array})
  const buf = Buffer.isBuffer(buffer) 
          ? buffer 
          : Buffer.from(buffer.data || buffer);
          
        fs.writeFileSync(destPath, buf);
        result = {
          filename,
          relativePath: path.relative(userDataDir, destPath),
          fullPath: destPath
        };
        break;
      }
      case 'auto-detect-providers':
        result = await autoDetectProviders();
        break;
      case 'agent-run': {
        const { sessionId, prompt, config, currentAttachments } = args[0];
        // Start engine asynchronously in background
        runAgentEngine(sessionId, prompt, config, currentAttachments);
        result = { status: 'started', sessionId };
        break;
      }
      case 'agent-stop': {
        const sessionId = args[0];
        const engine = activeSessions.get(sessionId);
        if (engine) {
          engine.abort();
          activeSessions.delete(sessionId);
        }
        result = { stopped: true };
        break;
      }
      case 'agent-list':
        result = { sessions: Array.from(activeSessions.keys()) };
        break;

      // ─── App version & catalogs (read-only, shared with desktop) ─────────────
      case 'app-version':
        result = WEB_VERSION;
        break;
      case 'mcp-catalog':
        result = MCP_CATALOG;
        break;
      case 'plugins-catalog':
        result = PLUGIN_CATALOG;
        break;

      // ─── Skills discovery (Composer slash autocomplete) ─────────────────────
      case 'skills-list': {
        const dir = typeof args[0] === 'object' && args[0] ? (args[0] as any).dir : undefined;
        const dirs: string[] = [];
        if (typeof dir === 'string' && fs.existsSync(dir)) dirs.push(dir);
        const userSkills = path.join(userDataDir, 'skills');
        if (fs.existsSync(userSkills)) dirs.push(userSkills);
        const store = new SkillStore();
        for (const d of dirs) {
          try {
            await store.discoverSkills(d);
          } catch {
            /* unreadable directory — skip */
          }
        }
        result = store.listSkills().map((s) => ({
          id: s.id,
          name: s.metadata.name,
          description: s.metadata.description,
          instructions: s.instructions
        }));
        break;
      }

      // ─── Partner store (web-persistent; shared renderer expects these) ───────
      case 'partner-list':
        result = PartnerStore.listPartners(userDataDir);
        break;
      case 'partner-get':
        result = PartnerStore.getPartner(userDataDir, args[0]);
        break;
      case 'partner-get-active':
        result = PartnerStore.getActivePartner(userDataDir);
        break;
      case 'partner-set-active':
        PartnerStore.setActivePartner(userDataDir, args[0] ?? null);
        result = { success: true };
        break;
      case 'partner-remove':
        PartnerStore.removePartner(userDataDir, args[0]);
        result = { success: true };
        break;
      case 'partner-import-json':
        result = PartnerStore.importPartnerJson(userDataDir, args[0]);
        break;
      case 'partner-export':
        // Desktop reveals the folder in the OS file manager; the web build just
        // returns the on-disk path so the caller can surface it.
        result = { success: true, folder: PartnerStore.partnerFolderPath(userDataDir, args[0]) };
        break;

      // ─── Pet (3D desktop companion) — no-op on the web build ─────────────────
      case 'pet-status':
        // No 3D pet window in the web build; report it as disabled so the UI
        // hides the pet controls instead of offering a start that can't work.
        result = { running: false, enabled: false };
        break;
      case 'pet-set-partner':
        // The renderer pushes the active Partner manifest here to drive the pet.
        // Harmless on web (no pet) — acknowledge so the call succeeds.
        result = { ok: true };
        break;

      default:
        res.status(404).json({ error: `IPC channel "${channel}" not implemented` });
        return;
    }
    res.json({ data: result });
  } catch (err: any) {
    console.error(`[IPC Error] Channel ${channel} failed:`, err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

// ─── Static Web Asset Serving ────────────────────────────────────────────────
const distPath = __dirname;
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── Server Ignition ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
// Bind to all interfaces by default so the server is reachable from other devices
// on the local network. Override with HOST=127.0.0.1 to restrict to localhost.
const HOST = process.env.HOST || '0.0.0.0';

/** Returns the machine's non-internal IPv4 addresses (for LAN access URLs). */
function lanAddresses(): string[] {
  const out: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const info of list || []) {
      if ((String(info.family) === 'IPv4' || String(info.family) === '4') && !info.internal) out.push(info.address);
    }
  }
  return out;
}

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/api/ws') {
    // Enforce authentication on the WebSocket handshake too.
    if (!isAuthDisabled() && !getAuthenticatedUser(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(Number(PORT), HOST, () => {
  console.log(`================================================================`);
  console.log(`SuperAgent Web Server ignited at: http://localhost:${PORT}`);
  // Surface the LAN URLs so the server can be opened from phones / other machines.
  for (const addr of lanAddresses()) {
    console.log(`Network (LAN) URL:              http://${addr}:${PORT}`);
  }
  console.log(`Resolving configuration and logs at: ${userDataDir}`);
  console.log(`================================================================`);
  });
}
