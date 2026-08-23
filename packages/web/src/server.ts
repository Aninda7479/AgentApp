import express from 'express';
import type { Request, Response } from 'express';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
  SettingsStorage,
  UsageTracker,
  OrchestratorRouter,
  buildRequest,
  OrchestratorStorage,
  buildRouterPool,
  isFreeModel,
  PlaywrightBrowserEngine,
  ComputerUse,
  getUserDataDirectory,
  STORAGE_DIRS,
  AuthStore,
  ProviderAutoDetector,
  MCP_CATALOG,
  MCPCatalogService,
  TriggerEngine,
  PLUGIN_CATALOG,
  MARKETPLACE_PLUGINS,
  SKILL_CATALOG,
  SkillStore,
  providerHealth,
  ArtifactRunner,
  sendTelegramMessage,
  testTelegramConnection,
  getTelegramConfig,
  writeWebServerLock,
  clearWebServerLock,
  readWebServerLock,
  createBrowserAutomationTools,
  type WebServerLauncher
} from '@superagent/core';

import { AgentEngine, AgentEngineConfig, AgentEvent } from './ai-engine.js';
import { readConversationStore, writeConversationStore, readChatSteps } from './storage/conversation-store.js';
import { getChatDirectory, getProjectDirectory } from './storage/paths.js';
import * as PartnerStore from './partner-store.js';
import {
  authGate,
  handleLogin,
  handleLogout,
  handleStatus,
  handleSetup,
  handleChangePassword,
  handleGetDevices,
  handleDeleteDevice,
  handleGetHistory,
  getAuthenticatedUser,
  isAuthDisabled
} from './auth.js';
import { getSystemInfo } from './system-info.js';

const serverFilename = typeof __filename !== 'undefined' ? __filename : (typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '');
const serverDirname = typeof __dirname !== 'undefined' ? __dirname : (serverFilename ? dirname(serverFilename) : process.cwd());

const getWebDistDir = (): string => {
  const candidates = [
    path.join(serverDirname, 'web-dist'),
    path.join(serverDirname, 'node_modules', '@superagent', 'web', 'dist'),
    path.join(path.dirname(process.execPath), 'web-dist'),
    path.join(path.dirname(process.execPath), 'node_modules', '@superagent', 'web', 'dist'),
    path.join(process.cwd(), 'web-dist'),
    path.join(process.cwd(), 'node_modules', '@superagent', 'web', 'dist'),
    path.join(serverDirname, '..', 'web', 'dist'),
    path.join(serverDirname, 'dist'),
    serverDirname,
  ];
  for (const cand of candidates) {
    try {
      if (fs.existsSync(path.join(cand, 'login.html')) && fs.existsSync(path.join(cand, 'index.html'))) {
        return cand;
      }
    } catch {}
  }
  for (const cand of candidates) {
    try {
      if (fs.existsSync(path.join(cand, 'login.html')) || fs.existsSync(path.join(cand, 'index.html'))) {
        return cand;
      }
    } catch {}
  }
  return serverDirname;
};
const webDistDir = getWebDistDir();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Setup JSON parsing limit to accommodate larger buffer contents
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

function isTrustedOrigin(origin: string, reqHost?: string): boolean {
  try {
    const url = new URL(origin);
    // Local loopback hostnames
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') {
      return true;
    }
    // Browser extensions and desktop webviews
    if (
      url.protocol === 'chrome-extension:' ||
      url.protocol === 'moz-extension:' ||
      url.protocol === 'tauri:' ||
      url.protocol === 'vscode-webview:'
    ) {
      return true;
    }
    // Same host
    if (reqHost) {
      const hostWithoutPort = reqHost.split(':')[0];
      if (url.hostname === hostWithoutPort) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// CORS middleware for Browser Extensions, Desktop, and Web
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (isTrustedOrigin(origin, req.headers.host)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cookie');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

const userDataDir = getUserDataDirectory();

const triggerEngine = new TriggerEngine({
  storagePath: path.join(userDataDir, 'config', 'triggers.json'),
  executor: async (trigger, payload) => {
    console.log(`[TriggerEngine] Executing scheduled trigger "${trigger.name}" (${trigger.id})...`);
    const settings = SettingsStorage.loadSettings();
    const defaultModel = settings.models?.find(m => m.enabled) || settings.models?.[0];
    const providerId = defaultModel?.providerId || 'openai';
    const modelId = defaultModel ? OrchestratorRouter.stripProviderPrefix(defaultModel.providerId, defaultModel.id) : 'gpt-4o';
    const byok = settings.providers?.find(p => p.id === providerId);

    const sessionId = `trig-run-${trigger.id}-${Date.now()}`;
    const engine = new AgentEngine({
      provider: providerId as any,
      model: modelId,
      apiKey: byok?.apiKey || '',
      baseUrl: byok?.baseUrl,
      projectRoot: trigger.targetPath || process.cwd(),
      permissionMode: 'auto-approve-edits'
    }, sessionId);

    let outputText = '';
    try {
      const hasKey = Boolean(byok?.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
      if (hasKey && process.env.NODE_ENV !== 'test') {
        await engine.run(trigger.prompt, (event: AgentEvent) => {
          if (event.type === 'token' && event.content) {
            outputText += event.content;
          }
        });
      } else {
        outputText = `Trigger "${trigger.name}" executed successfully.`;
      }
    } catch (err: any) {
      console.warn(`[TriggerEngine] Trigger execution warning for ${trigger.id}:`, err?.message || err);
      outputText = `Executed with warning: ${err?.message || err}`;
    }

    if (trigger.notifyTelegram) {
      const summaryMsg = `🔔 *[Scheduled Routine: ${trigger.name}]*\n\n${outputText.trim() || '(Execution completed without text output)'}`;
      const sendRes = await sendTelegramMessage({
        chatId: trigger.telegramChatId,
        text: summaryMsg,
      });
      if (!sendRes.success) {
        console.warn(`[TriggerEngine] Failed to send Telegram notification for ${trigger.id}:`, sendRes.error);
      } else {
        console.log(`[TriggerEngine] Telegram notification sent for ${trigger.id} (messageId: ${sendRes.messageId})`);
      }
    }

    broadcast('trigger-fired', {
      trigger,
      output: outputText,
      timestamp: new Date().toISOString()
    });
  }
});
triggerEngine.start();

const artifactRunner = new ArtifactRunner(path.join(userDataDir, 'artifacts'));

// Web build version, read from the package manifest at startup.
const WEB_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(serverDirname, '..', 'package.json'), 'utf-8')).version;
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

// Public auth endpoints (must be registered before the gate).
app.post('/api/auth/setup', handleSetup);
app.post('/api/auth/login', handleLogin);
app.post('/api/auth/logout', handleLogout);
app.get('/api/auth/status', handleStatus);

// Serve the standalone login/setup page (public; must stay before the gate).
app.get('/login', (_req, res) => {
  const filePath = path.join(webDistDir, 'login.html');
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(content);
      return;
    }
  } catch {}
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      console.error(`[Web] Error serving login.html from ${filePath}:`, err.message);
      res.status(404).send('login.html not found');
    }
  });
});

if (isAuthDisabled()) {
  console.log('[Security Warning] SUPERAGENT_DISABLE_AUTH=true — running in OPEN mode with NO authentication.');
} else if (AuthStore.isPasswordSet()) {
  console.log(`[Security] Login enabled — username "${AuthStore.getUsername()}". All routes require an authenticated session.`);
} else {
  console.log('[Security] Login enabled with the default password "admin" — set a custom one via `superagent password set` or the Settings → Web App page.');
}

// Gate everything else behind a valid session.
app.use(authGate);

// Protected auth endpoints
app.post('/api/auth/change-password', handleChangePassword);
app.get('/api/auth/devices', handleGetDevices);
app.delete('/api/auth/devices/:sessionId', handleDeleteDevice);
app.get('/api/auth/history', handleGetHistory);

// Legacy /account route redirect: account management and password rotation
// are now unified in the in-app Settings → Web App (/settings/web-app) panel.
app.get('/account', (_req, res) => {
  res.redirect(302, '/settings/web-app');
});

// ─── WebSocket Event Hub & Session Resiliency Buffer ─────────────────────────
const connectedSockets = new Set<WebSocket>();

interface SessionStateEntry {
  events: AgentEvent[];
  isRunning: boolean;
  fullAssistantText: string;
  fullThoughtText: string;
  lastUpdated: number;
}

const sessionStateStore = new Map<string, SessionStateEntry>();
const MAX_STORED_SESSIONS = 50;

function recordSessionEvent(sessionId: string, event: AgentEvent) {
  let entry = sessionStateStore.get(sessionId);
  if (!entry) {
    if (sessionStateStore.size >= MAX_STORED_SESSIONS) {
      const oldest = sessionStateStore.keys().next().value;
      if (oldest) sessionStateStore.delete(oldest);
    }
    entry = {
      events: [],
      isRunning: true,
      fullAssistantText: '',
      fullThoughtText: '',
      lastUpdated: Date.now()
    };
    sessionStateStore.set(sessionId, entry);
  }

  entry.lastUpdated = Date.now();
  entry.events.push(event);
  if (entry.events.length > 2000) {
    entry.events.shift();
  }

  if (event.type === 'token' && event.content) {
    entry.fullAssistantText += event.content;
  } else if (event.type === 'replace_tokens' && event.content) {
    entry.fullAssistantText = event.content;
  } else if (event.type === 'thought' && event.content) {
    entry.fullThoughtText += event.content;
  } else if (event.type === 'done' || event.type === 'error' || event.type === 'abort') {
    entry.isRunning = false;
  }
}

interface PendingClientToolEntry {
  id: string;
  tool: string;
  input: any;
  resolve: (val: any) => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

const pendingClientTools = new Map<string, PendingClientToolEntry>();
const pendingSessionTools = new Map<string, PendingClientToolEntry>();

function executeClientToolOnExtension(sessionId: string, tool: string, input: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    // If there is already a pending tool execution for this session, clear it
    const existing = pendingSessionTools.get(sessionId);
    if (existing) {
      clearTimeout(existing.timer);
      pendingClientTools.delete(existing.id);
      pendingSessionTools.delete(sessionId);
    }

    const id = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      pendingClientTools.delete(id);
      pendingSessionTools.delete(sessionId);
      resolve({ success: false, error: `Browser tool "${tool}" timed out after 15s.` });
    }, 15000);

    const entry: PendingClientToolEntry = { id, tool, input, resolve, reject, timer };
    pendingClientTools.set(id, entry);
    pendingSessionTools.set(sessionId, entry);

    broadcast('execute-client-tool', {
      id,
      sessionId,
      tool,
      input
    });
  });
}

wss.on('connection', (ws) => {
  connectedSockets.add(ws);
  console.log(`[WebSocket] Client connected. Active clients: ${connectedSockets.size}`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.action === 'SYNC_SESSION' && msg.sessionId) {
        const entry = sessionStateStore.get(msg.sessionId);
        const pending = pendingSessionTools.get(msg.sessionId);
        const pendingTool = pending ? { id: pending.id, sessionId: msg.sessionId, tool: pending.tool, input: pending.input } : null;

        if (entry) {
          const lastSeq = typeof msg.lastSeq === 'number' ? msg.lastSeq : 0;
          const replayEvents = entry.events.filter((e) => (e.seq ?? 0) > lastSeq);
          ws.send(
            JSON.stringify({
              channel: 'session-sync',
              data: {
                sessionId: msg.sessionId,
                isRunning: entry.isRunning,
                replayEvents,
                fullAssistantText: entry.fullAssistantText,
                fullThoughtText: entry.fullThoughtText,
                pendingTool
              }
            })
          );
        } else {
          ws.send(
            JSON.stringify({
              channel: 'session-sync',
              data: {
                sessionId: msg.sessionId,
                isRunning: false,
                replayEvents: [],
                fullAssistantText: '',
                fullThoughtText: '',
                pendingTool
              }
            })
          );
        }
      } else if (msg.action === 'CLIENT_TOOL_RESULT' && msg.id) {
        const pending = pendingClientTools.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingClientTools.delete(msg.id);
          for (const [sessId, entry] of pendingSessionTools.entries()) {
            if (entry.id === msg.id) {
              pendingSessionTools.delete(sessId);
              break;
            }
          }
          pending.resolve(msg.result);
        }
      } else if (msg.action === 'PING') {
        ws.send(JSON.stringify({ action: 'PONG', timestamp: Date.now() }));
      }
    } catch {}
  });

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
// Map of active agent sessions by session ID (bounded LRU-style cache)
const MAX_ACTIVE_SESSIONS = 50;
const activeSessions = new Map<string, AgentEngine>();

/** Creates or reuses an AgentEngine for a session and runs it with streaming events. */
async function runAgentEngine(
  sessionId: string,
  prompt: string,
  config: AgentEngineConfig,
  currentAttachments?: string[]
) {
  try {
    const finalConfig = { ...config };
    // Auto-route model if set to 'auto', 'Orchestrator' or 'Model Governance'
    if (config.model === 'auto' || config.model === 'Orchestrator' || config.model === 'Model Governance') {
      const settings = SettingsStorage.loadSettings();
      const orchestratorCfg = settings.orchestrator || settings.modelGov;
      if (orchestratorCfg?.enabled === false) {
        throw new Error('AI Orchestrator is disabled in Settings. Please select a specific model or enable Orchestrator in Settings → Orchestrator.');
      }
      // Build a proper RouterModel[] pool (providerId + capability/access
      // signals) from the user's configured models. routeModelForTask reads
      // RouterModel fields that raw settings.models don't always carry.
      const enabledModels = buildRouterPool(settings.models ?? []).filter((m) => m.enabled);
      try {
        const routed = OrchestratorRouter.routeModelForTask(prompt, enabledModels, buildRequest(prompt, currentAttachments));
        if (routed && routed.model) {
          finalConfig.provider = routed.provider as any;
          finalConfig.model = routed.model;
          const byok = settings.providers?.find(p => p.id === routed.provider);
          if (byok) {
            finalConfig.apiKey = byok.apiKey;
            finalConfig.baseUrl = byok.baseUrl;
          } else if (!finalConfig.apiKey) {
            console.warn(`[web] Orchestrator routed to '${routed.provider}' but no API key is configured for it; the reply may fail.`);
          }
        } else {
          throw new Error('Orchestrator could not select a model for this task.');
        }
      } catch (routeErr: any) {
        // Never go silently empty: fall back to the first enabled model so the
        // user still gets a real reply instead of a blank turn.
        const fallback = enabledModels[0];
        if (fallback) {
          console.warn(`[web] Orchestrator routing failed (${routeErr?.message}); falling back to ${fallback.providerId}/${fallback.id}.`);
          finalConfig.provider = fallback.providerId as any;
          finalConfig.model = OrchestratorRouter.stripProviderPrefix(fallback.providerId, fallback.id);
          const byok = settings.providers?.find(p => p.id === fallback.providerId);
          if (byok) {
            finalConfig.apiKey = byok.apiKey;
            finalConfig.baseUrl = byok.baseUrl;
          }
        } else {
          // No model configured/enabled — surface a clear, actionable error
          // instead of forwarding the literal 'auto' string to the provider.
          broadcast('agent-event', {
            type: 'error',
            sessionId,
            error: routeErr?.message || String(routeErr)
          });
          return;
        }
      }
    }

    const settings = SettingsStorage.loadSettings();

    // Resolve model display names or IDs to actual upstream IDs and providers
    if (finalConfig.model && finalConfig.model !== 'Orchestrator' && finalConfig.model !== 'auto') {
      const match = (settings.models || []).find(
        m => m.name === finalConfig.model || m.id === finalConfig.model || m.id === `${finalConfig.provider}-${finalConfig.model}`
      );
      if (match) {
        finalConfig.provider = (match.providerId || finalConfig.provider) as any;
        const prefix = `${match.providerId}-`;
        finalConfig.model = match.id.startsWith(prefix) ? match.id.slice(prefix.length) : match.id;
      }
    }

    // Resolve API key and Base URL from providers
    if (finalConfig.provider && !finalConfig.apiKey) {
      const prov = (settings.providers || []).find(
        p => p.id === finalConfig.provider || (finalConfig.provider === 'gemini' && p.id === 'google') || (finalConfig.provider === 'google' && p.id === 'gemini')
      );
      if (prov) {
        finalConfig.apiKey = prov.apiKey;
        if (prov.baseUrl) finalConfig.baseUrl = prov.baseUrl;
      }
    }

    if (sessionId.startsWith('ext-') || (finalConfig as any).browserTools) {
      finalConfig.extraTools = [
        ...(finalConfig.extraTools || []),
        ...createBrowserAutomationTools((tool, input) => executeClientToolOnExtension(sessionId, tool, input))
      ];
    }

    let engine = activeSessions.get(sessionId);
    if (engine) {
      engine.updateConfig(finalConfig);
      // Touch session in map for LRU ordering
      activeSessions.delete(sessionId);
      activeSessions.set(sessionId, engine);
    } else {
      engine = new AgentEngine(finalConfig, sessionId);
      await engine.rehydrateFromStore();
      if (activeSessions.size >= MAX_ACTIVE_SESSIONS) {
        const oldestKey = activeSessions.keys().next().value;
        if (oldestKey) activeSessions.delete(oldestKey);
      }
      activeSessions.set(sessionId, engine);
    }

    let replyLogged = false;
    let didEmitDone = false;
    await engine.run(prompt, (agentEvent: AgentEvent) => {
      // Log the first reply token on the web connection (device-tagged).
      if (agentEvent.type === 'token' && !replyLogged) {
        replyLogged = true;
        console.log(`[web] message RECEIVED — connection device: ${os.hostname()} | session: ${sessionId}`);
      }
      if (agentEvent.type === 'done' || agentEvent.type === 'error') {
        didEmitDone = true;
      }
      recordSessionEvent(sessionId, agentEvent);
      broadcast('agent-event', agentEvent);
    }, currentAttachments);

    if (!didEmitDone) {
      const doneEvt: AgentEvent = { type: 'done', sessionId };
      recordSessionEvent(sessionId, doneEvt);
      broadcast('agent-event', doneEvt);
    }
  } catch (err: any) {
    console.error(`[Agent Run Fail] Session ${sessionId}:`, err);
    const errEvt: AgentEvent = {
      type: 'error',
      sessionId,
      error: err.message || String(err)
    };
    recordSessionEvent(sessionId, errEvt);
    broadcast('agent-event', errEvt);
  }
}

// ─── Auto-detect Providers ───────────────────────────────────────────────────
// Shared with the Desktop app via core's ProviderAutoDetector (single source of truth).
/** Auto-detects AI providers from environment variables. */
async function autoDetectProviders() {
  return ProviderAutoDetector.detect();
}

// ─── Orchestrator Prompt Optimization ────────────────────────────────────────
/** Uses an AI engine to optimize the Orchestrator system prompt. */
async function optimizeInstructionsByAI() {
  const settings = SettingsStorage.loadSettings();
  const orchestratorSettings = settings.orchestrator || settings.modelGov;
  const freeOnly = !!orchestratorSettings?.freeOnly;
  const govEnabledIds = orchestratorSettings?.enabledModels || [];

  const activeModels = (settings.models || []).filter(m =>
    govEnabledIds.includes(m.id) ||
    govEnabledIds.includes(`${m.providerId}-${m.id}`)
  );

  const currentInstructions = OrchestratorStorage.loadInstructions();

  // Free-aware, enabled pool; route a tool-free completion through the
  // orchestrator (auto-fallback across healthy providers). Mirrors the desktop
  // fix: far faster than a full agentic AgentEngine and avoids Gemini's
  // additionalProperties rejection.
  const pool = buildRouterPool(settings.models ?? [])
    .filter((m) => m.enabled && (!freeOnly || isFreeModel(m)));

  const optimizationPrompt = `You are a system prompt optimizer. You are optimizing the Orchestrator System Instructions for a Sakana Fugu-class routing conductor.

Here is the current pool of enabled models:
${activeModels.map(m => `- ${m.name} (${m.providerId}) - Pricing: Input ${m.pricing?.inputPer1M || 'N/A'}, Output ${m.pricing?.outputPer1M || 'N/A'}`).join('\n')}

Here is the current instructions file content:
\`\`\`markdown
${currentInstructions}
\`\`\`

Optimization Goal: ${orchestratorSettings?.optimizationGoal || 'balanced'}
Routing Strategy: ${orchestratorSettings?.routingStrategy || 'router'}
${freeOnly ? 'NOTE: Free-Only mode is enabled. The Orchestrator should only utilize free, local, or custom models. Avoid paid options.' : ''}

Please optimize these system instructions to:
1. Make the categorization boundaries more precise for the specific models in this pool.
2. Formulate explicit conducting guidelines using the Claude Fable 5 escalation structure.
3. Keep the output strictly in Markdown format.
4. Do NOT wrap the output in markdown code blocks (e.g. \`\`\`markdown). Return ONLY the direct markdown text of the system instructions.`;

  const router = new OrchestratorRouter({ reasoningEffort: 'low' });
  const request = { messages: [{ role: 'user' as const, content: optimizationPrompt }] };

  let optimizedContent = '';
  try {
    const res = await router.completeWithFreePool(request, pool, settings.providers ?? []);
    optimizedContent = res.content || '';
  } catch (err: unknown) {
    throw new Error(`AI optimization failed: ${(err as Error).message}`);
  }

  if (!optimizedContent || optimizedContent.trim().length === 0) {
    throw new Error('AI engine returned empty optimization response.');
  }

  optimizedContent = optimizedContent
    .replace(/^```markdown\n?/i, '')
    .replace(/```$/, '')
    .trim();

  OrchestratorStorage.saveInstructions(optimizedContent);
  return optimizedContent;
}

// ─── API Router mapping Desktop IPC ─────────────────────────────────────────
app.post('/api/ipc/:channel', (req, res) => { void handleIpc(req, res); });

// ─── Artifacts Dedicated Web Viewer ─────────────────────────────────────────
// Serves artifact static bundles directly with proper headers and isolated origins
app.use('/api/artifacts/:id/view', (req, res) => {
  const artifactId = req.params.id;
  const artDir = path.join(userDataDir, 'artifacts', artifactId);
  const legacyDir = path.join(userDataDir, 'artifact', artifactId);
  const targetDir = fs.existsSync(artDir) ? artDir : fs.existsSync(legacyDir) ? legacyDir : null;

  if (!targetDir) {
    res.status(404).send(`Artifact "${artifactId}" not found in ~/.superagent/artifacts`);
    return;
  }

  let subPath = req.path || '/';
  if (subPath === '/' || !subPath) subPath = '/index.html';
  if (subPath.startsWith('/')) subPath = subPath.slice(1);

  const safeTargetDir = path.resolve(targetDir);
  let filePath = path.resolve(safeTargetDir, subPath);

  if (!filePath.startsWith(safeTargetDir + path.sep) && filePath !== safeTargetDir) {
    res.status(403).send('Forbidden: Access outside artifact directory denied');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    // Fallback to index.html for SPAs
    const fallback = path.join(safeTargetDir, 'index.html');
    if (fs.existsSync(fallback)) {
      filePath = fallback;
    } else {
      res.status(404).send('Not Found');
      return;
    }
  }

  res.sendFile(filePath);
});

// ─── Artifacts Universal Storage REST API & SDK ─────────────────────────────
// Supports persistent storage across browsers, external devices, and iframe sandboxes
const handleArtifactCors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
};

app.use('/api/artifacts/:id/storage', handleArtifactCors);
app.use('/api/artifacts/storage', handleArtifactCors);

// SDK script for seamless client storage
app.get(['/api/artifacts/sdk.js', '/api/artifacts/:id/sdk.js'], (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(`
(function (global) {
  'use strict';
  const pathname = window.location.pathname;
  const inferredId = (pathname.match(/\\/api\\/artifacts\\/([^/]+)/) || [])[1] || '';
  const artifactId = window.__ARTIFACT_ID__ || inferredId;
  const origin = window.__SUPERAGENT_SERVER__ || window.location.origin;

  const storage = {
    get artifactId() { return artifactId; },
    async get(key, defaultValue) {
      if (defaultValue === undefined) defaultValue = null;
      if (!artifactId) return defaultValue;
      try {
        const res = await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key));
        if (!res.ok) return defaultValue;
        const data = await res.json();
        return data.value !== undefined ? data.value : defaultValue;
      } catch (e) {
        console.warn('[SuperAgentStorage] Get error, falling back to localStorage:', e);
        try {
          const local = localStorage.getItem('art_' + artifactId + '_' + key);
          return local ? JSON.parse(local) : defaultValue;
        } catch { return defaultValue; }
      }
    },
    async set(key, value) {
      if (!artifactId) return value;
      try {
        localStorage.setItem('art_' + artifactId + '_' + key, JSON.stringify(value));
      } catch {}
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value })
        });
      } catch (e) {
        console.warn('[SuperAgentStorage] Set failed:', e);
      }
      return value;
    },
    async getAll() {
      if (!artifactId) return {};
      try {
        const res = await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage');
        if (!res.ok) return {};
        const json = await res.json();
        return json.data || {};
      } catch { return {}; }
    },
    async setAll(data) {
      if (!artifactId) return data;
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data })
        });
      } catch (e) {
        console.warn('[SuperAgentStorage] SetAll failed:', e);
      }
      return data;
    },
    async remove(key) {
      if (!artifactId) return false;
      try { localStorage.removeItem('art_' + artifactId + '_' + key); } catch {}
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key), {
          method: 'DELETE'
        });
        return true;
      } catch { return false; }
    },
    async clear() {
      if (!artifactId) return false;
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage', {
          method: 'DELETE'
        });
        return true;
      } catch { return false; }
    }
  };

  global.SuperAgent = global.SuperAgent || {};
  global.SuperAgent.storage = storage;
  global.artifactStorage = storage;
})(window);
  `);
});

// GET full storage
app.get('/api/artifacts/:id/storage', (req, res) => {
  const artifactId = req.params.id;
  const data = artifactRunner.getStorage(artifactId);
  res.json({ ok: true, id: artifactId, data });
});

// POST / PUT set or merge storage
app.post('/api/artifacts/:id/storage', (req, res) => {
  const artifactId = req.params.id;
  const body = req.body || {};
  const payload = body.data !== undefined ? body.data : body;
  const updated = artifactRunner.setStorage(artifactId, payload, req.query.merge === 'true');
  res.json({ ok: true, id: artifactId, data: updated });
});

app.put('/api/artifacts/:id/storage', (req, res) => {
  const artifactId = req.params.id;
  const body = req.body || {};
  const payload = body.data !== undefined ? body.data : body;
  const updated = artifactRunner.setStorage(artifactId, payload, false);
  res.json({ ok: true, id: artifactId, data: updated });
});

// GET single key
app.get('/api/artifacts/:id/storage/:key', (req, res) => {
  const { id: artifactId, key } = req.params;
  const value = artifactRunner.getStorageKey(artifactId, key);
  res.json({ ok: true, id: artifactId, key, value });
});

// PUT single key
app.put('/api/artifacts/:id/storage/:key', (req, res) => {
  const { id: artifactId, key } = req.params;
  const value = req.body?.value !== undefined ? req.body.value : req.body;
  artifactRunner.setStorageKey(artifactId, key, value);
  res.json({ ok: true, id: artifactId, key, value });
});

// DELETE single key
app.delete('/api/artifacts/:id/storage/:key', (req, res) => {
  const { id: artifactId, key } = req.params;
  const deleted = artifactRunner.deleteStorageKey(artifactId, key);
  res.json({ ok: true, id: artifactId, key, deleted });
});

// DELETE all storage
app.delete('/api/artifacts/:id/storage', (req, res) => {
  const artifactId = req.params.id;
  artifactRunner.clearStorage(artifactId);
  res.json({ ok: true, id: artifactId, cleared: true });
});

// Provider connectivity proxy — forwards provider API calls server-side so the
// web/VPS build (which reuses the *same* desktop renderer) can "Test & Connect"
// without being blocked by CORS. The native desktop shell does NOT use this
// (its renderer fetch is privileged and CORS-exempt). Registered behind authGate
// so only authenticated sessions can reach it; restricted to http(s) urls.
app.post('/api/provider-proxy', (req, res) => { void handleProviderProxy(req, res); });

app.get('/api/update/check', async (_req, res) => {
  const REPO = 'Aninda7479/AgentApp';

  // Read the running version from this package's own package.json.
  let current = '0.0.0';
  try {
    const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
    current = (JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string }).version;
  } catch { /* use default */ }

  const compareVer = (a: string, b: string): number => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  try {
    let latest: string | null = null;

    // 1. Primary: Extract version from web redirect (fast, no rate limits)
    try {
      const redirectRes = await fetch(`https://github.com/${REPO}/releases/latest`, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'superagent-web-server' },
        signal: AbortSignal.timeout(5000)
      });
      const location = redirectRes.headers.get('location');
      if (location) {
        const match = location.match(/\/tag\/v?([^/]+)$/);
        if (match && match[1]) {
          latest = match[1].trim();
        }
      }
    } catch {
      // Fall through to API lookup
    }

    // 2. Fallback: Query GitHub Releases API
    if (!latest) {
      const apiRes = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: {
          'User-Agent': 'superagent-web-server',
          'Accept': 'application/vnd.github+json'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (apiRes.ok) {
        const json = (await apiRes.json()) as { tag_name?: string };
        latest = (json.tag_name ?? '').replace(/^v/, '');
      }
    }

    const hasUpdate = latest ? compareVer(latest, current) > 0 : false;

    if (!res.headersSent) {
      res.json({
        current,
        latest: latest || null,
        hasUpdate,
        releaseUrl: `https://github.com/${REPO}/releases/latest`
      });
    }
  } catch {
    // Graceful fallback if offline or API unreachable — never throw or crash the server
    if (!res.headersSent) {
      res.json({
        current,
        latest: null,
        hasUpdate: false,
        releaseUrl: `https://github.com/${REPO}/releases/latest`
      });
    }
  }
});

// POST /api/update/apply  (behind authGate)
// Executes the CLI installer script to update the SuperAgent CLI binary on the host
// and automatically restarts the background web server process without manual intervention.
app.post('/api/update/apply', (_req, res) => {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'powershell.exe' : 'sh';
  const args = isWin
    ? ['-ExecutionPolicy', 'Bypass', '-Command', 'irm https://aninda7479.github.io/AgentApp/install.ps1 | iex']
    : ['-c', 'curl -fsSL https://aninda7479.github.io/AgentApp/install.sh | sh'];

  try {
    const result = spawnSync(cmd, args, {
      stdio: 'pipe',
      env: { ...process.env, FORCE: '1' },
      timeout: 180000 // 3 minutes
    });

    if (result.status === 0) {
      res.json({
        ok: true,
        message: 'SuperAgent CLI successfully updated! Server is restarting automatically...'
      });

      // Schedule automatic background process restart
      setTimeout(() => {
        try {
          // Clear lock first so the newly spawned process can bind immediately
          if (readWebServerLock()?.pid === process.pid) clearWebServerLock();

          let targetBin = '';
          if (isWin) {
            targetBin = path.join(process.env.USERPROFILE || '', '.local', 'bin', 'superagent.exe');
          } else {
            targetBin = fs.existsSync('/usr/local/bin/superagent')
              ? '/usr/local/bin/superagent'
              : path.join(process.env.HOME || '', '.local', 'bin', 'superagent');
          }

          const execPath = fs.existsSync(targetBin) ? targetBin : process.execPath;
          const port = process.env.PORT || '1469';

          console.log(`[update] Auto-restarting SuperAgent CLI server with ${execPath} on port ${port}...`);

          const child = spawn(execPath, ['--serve', '--serve-port', port], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env }
          });
          child.unref();

          process.exit(0);
        } catch (err) {
          console.error('[update] Error during auto-restart:', err);
          process.exit(0);
        }
      }, 1000);
    } else {
      const errMsg = (result.stderr ? result.stderr.toString() : '') || (result.stdout ? result.stdout.toString() : '');
      res.status(500).json({
        error: `Update script exited with code ${result.status}: ${errMsg}`
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: `Failed to execute update: ${err?.message || String(err)}` });
  }
});

/**
 * Forwards a provider API call server-side so the web/VPS build can test a
 * provider connection without being blocked by CORS (the browser cannot call
 * api.anthropic.com / api.openai.com / etc. directly). Returns a normalized
 * envelope `{ ok, status, statusText, data }` that the renderer adapts into a
 * Response-shaped object. Only ever exercised from the web shell; the native
 * desktop shell keeps its privileged, CORS-exempt direct fetch.
 *
 * Exported so it can be unit-tested without booting a listener.
 */
export async function handleProviderProxy(req: Request, res: Response): Promise<void> {
  const { method = 'GET', url, headers } = (req.body ?? {}) as {
    method?: string;
    url?: unknown;
    headers?: Record<string, string>;
  };
  if (typeof url !== 'string' || !url) {
    res.status(400).json({ error: 'provider-proxy requires a string "url".' });
    return;
  }
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    res.status(400).json({ error: 'provider-proxy "url" is not a valid URL.' });
    return;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    res.status(400).json({ error: 'provider-proxy only allows http(s) urls.' });
    return;
  }
  if (isPrivateHost(target.hostname)) {
    // Prevent the proxy from being used as an SSRF relay to cloud-metadata
    // endpoints (e.g. 169.254.169.254), the highest-risk target. We deliberately
    // do NOT block LAN/loopback ranges here so self-hosted providers (Ollama on
    // localhost, a LAN IP) reachable from the web shell still work. A stricter
    // admin allowlist is an open question — see the auto-improve log.
    res.status(400).json({ error: 'provider-proxy cannot target link-local (cloud-metadata) hosts.' });
    return;
  }
  try {
    let upstream: any;
    try {
      upstream = await fetch(target.toString(), {
        method: (method || 'GET').toUpperCase(),
        headers: (headers && typeof headers === 'object' ? headers : {}) as Record<string, string>,
      } as any);
    } catch (firstErr: any) {
      if (target.hostname === 'localhost') {
        const altUrl = new URL(target.toString());
        altUrl.hostname = '127.0.0.1';
        upstream = await fetch(altUrl.toString(), {
          method: (method || 'GET').toUpperCase(),
          headers: (headers && typeof headers === 'object' ? headers : {}) as Record<string, string>,
        } as any);
      } else {
        throw firstErr;
      }
    }
    const text = await upstream.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* keep raw text when the body is not JSON */
    }
    res.json({ ok: upstream.ok, status: upstream.status, statusText: upstream.statusText, data });
  } catch (e: any) {
    res.status(502).json({ error: e?.message || 'Upstream request failed.', ok: false, status: 502 });
  }
}

/**
 * True for link-local (cloud-metadata) hosts — the highest-risk SSRF target
 * (e.g. 169.254.169.254 on AWS/GCP/Azure). IPv4 literals only; hostnames are not
 * resolved. We do NOT block LAN/loopback ranges so self-hosted providers still
 * work; a stricter admin allowlist can be layered later if needed.
 */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  }
  return false;
}

/**
 * Handles a single IPC channel invocation over HTTP (mirrors the desktop IPC
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
  // Channels that exist only in the native desktop build (native file pickers,
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
        result = await readConversationStore(userDataDir);
        break;
      case 'store-write':
        await writeConversationStore(args[0], userDataDir);
        result = null;
        break;
      case 'chat-steps-read': {
        const payload = args[0];
        const chatId = typeof payload === 'string' ? payload : payload?.chatId;
        const projectKey = typeof payload === 'object' ? payload?.projectKey : undefined;
        if (!chatId) {
          result = [];
          break;
        }
        result = await readChatSteps(userDataDir, chatId, projectKey);
        break;
      }
      case 'projects-read': {
        const storeData = await readConversationStore(userDataDir);
        result = storeData.projects ?? [];
        break;
      }
      case 'chats-read': {
        const storeData = await readConversationStore(userDataDir);
        result = storeData.chats ?? [];
        break;
      }
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
      case 'usage-pricing':
        result = UsageTracker.getPricing();
        break;
      case 'system-info':
        result = await getSystemInfo();
        break;
      case 'orchestrator-read-instructions':
        result = OrchestratorStorage.loadInstructions();
        break;
      case 'orchestrator-write-instructions':
        OrchestratorStorage.saveInstructions(args[0]);
        result = null;
        break;
      case 'orchestrator-update-instructions':
        result = await OrchestratorStorage.autoUpdateInstructions();
        break;
      case 'orchestrator-optimize-instructions-by-ai':
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
        const logsDir = path.join(userDataDir, STORAGE_DIRS.logs);
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
      case 'provider-health-diagnostics':
        // Mirrors the desktop `provider-health-diagnostics` IPC handler so the
        // shared renderer's Model Gov settings panel can show live provider
        // resilience (available / locked / throttled) on the web/VPS build too.
        result = providerHealth.getDiagnostics();
        break;
      case 'agent-run': {
        const { sessionId, prompt, config, currentAttachments } = args[0];
        // Log the incoming user message on the web connection (device-tagged).
        console.log(`[web] message SENT — connection device: ${os.hostname()} | session: ${sessionId} | model: ${config?.model}`);
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
      case 'agent-permission-response':
        result = { success: true };
        break;
      case 'agent-compact': {
        result = { compacted: false, tokensBefore: 0, tokensAfter: 0 };
        break;
      }

      // ─── App version & catalogs (read-only, shared with desktop) ─────────────
      case 'app-version':
        result = WEB_VERSION;
        break;
      case 'plugins-catalog':
        result = [...PLUGIN_CATALOG, ...MARKETPLACE_PLUGINS];
        break;
      case 'skills-catalog':
        result = SKILL_CATALOG;
        break;

      // ─── Skills discovery & management (Composer slash autocomplete / settings) ─
      case 'skills-list': {
        const dir = typeof args[0] === 'object' && args[0] ? (args[0] as any).dir : undefined;
        const dirs: string[] = [];
        if (typeof dir === 'string' && fs.existsSync(dir)) dirs.push(dir);
        const userSkills = path.join(userDataDir, STORAGE_DIRS.skills);
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
      case 'skills-save': {
        const { name, description, instructions } = args[0] || {};
        if (!name) {
          result = { success: false, error: 'Skill name is required' };
          break;
        }
        const skillId = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
        const skillDir = path.join(userDataDir, STORAGE_DIRS.skills, skillId);
        fs.mkdirSync(skillDir, { recursive: true });
        const content = `---\nname: ${name}\ndescription: ${description || ''}\n---\n\n${instructions || ''}\n`;
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
        result = { success: true };
        break;
      }
      case 'skills-import-check': {
        result = { canImport: false, skills: [] };
        break;
      }
      case 'skills-import-perform': {
        result = { success: true, importedCount: 0 };
        break;
      }

      // ─── Kanban Tasks (Project and Global) ───────────────────────────────────
      case 'kanban-load': {
        const { scope, projectName } = args[0] || {};
        const kanbanFile = scope === 'project' && projectName
          ? path.join(getProjectDirectory(userDataDir, projectName), 'kanban-cards.json')
          : path.join(userDataDir, 'kanban-cards.json');
        if (fs.existsSync(kanbanFile)) {
          try {
            result = JSON.parse(fs.readFileSync(kanbanFile, 'utf-8'));
          } catch {
            result = [];
          }
        } else {
          result = [];
        }
        break;
      }
      case 'kanban-save': {
        const { scope, projectName, cards } = args[0] || {};
        const kanbanFile = scope === 'project' && projectName
          ? path.join(getProjectDirectory(userDataDir, projectName), 'kanban-cards.json')
          : path.join(userDataDir, 'kanban-cards.json');
        fs.mkdirSync(path.dirname(kanbanFile), { recursive: true });
        fs.writeFileSync(kanbanFile, JSON.stringify(cards || [], null, 2), 'utf-8');
        result = { success: true };
        break;
      }

      // ─── MCP Catalog & Plugin Store ───────────────────────────────────────
      case 'mcp-catalog':
        result = MCPCatalogService.getCatalog();
        break;
      case 'mcp-catalog-get':
        result = MCPCatalogService.getItem(args[0]);
        break;

      // ─── Proactive Background Triggers ─────────────────────────────────────
      case 'triggers-list':
      case 'trigger-list':
        result = triggerEngine.listTriggers();
        break;
      case 'triggers-create':
      case 'trigger-add':
        result = triggerEngine.addTrigger(args[0]);
        break;
      case 'triggers-remove':
      case 'trigger-remove': {
        const id = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        result = triggerEngine.removeTrigger(id);
        break;
      }
      case 'trigger-update':
      case 'triggers-update': {
        const id = args[0]?.id;
        const updates = args[0]?.updates !== undefined ? args[0].updates : { ...args[0] };
        if (updates && typeof updates === 'object' && 'id' in updates) {
          delete (updates as Record<string, unknown>).id;
        }
        result = triggerEngine.updateTrigger(id, updates);
        break;
      }
      case 'triggers-toggle': {
        const id = args[0]?.id;
        const enabled = args[0]?.enabled;
        result = triggerEngine.updateTrigger(id, { enabled });
        break;
      }
      case 'triggers-run-now':
      case 'trigger-execute': {
        const id = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        const trig = triggerEngine.getTrigger(id);
        if (!trig) {
          result = { error: 'Trigger not found' };
        } else {
          await triggerEngine.executeTrigger(trig, typeof args[0] === 'object' ? args[0]?.payload : undefined);
          result = { success: true, trigger: triggerEngine.getTrigger(id) };
        }
        break;
      }

      // ─── Telegram Messaging & Verification ────────────────────────────────
      case 'telegram-test': {
        const token = args[0]?.botToken;
        const chatId = args[0]?.chatId;
        const sendTestMessage = args[0]?.sendTestMessage !== false;
        result = await testTelegramConnection(token, chatId, sendTestMessage);
        break;
      }
      case 'telegram-send': {
        const sendOpts = args[0] || {};
        result = await sendTelegramMessage(sendOpts);
        break;
      }
      case 'telegram-config-get': {
        const allSettings = SettingsStorage.loadSettings();
        result = allSettings?.telegram || null;
        break;
      }
      case 'telegram-config-save': {
        const updates = args[0] || {};
        const settings = SettingsStorage.loadSettings();
        settings.telegram = {
          ...(settings.telegram || {}),
          ...updates
        };
        SettingsStorage.saveSettings(settings);
        result = { success: true, telegram: settings.telegram };
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

      // ─── Web App hosting controls (desktop-only; web build self-reports) ─────
      // The shared WebAppSettings renderer polls these. On the desktop build the
      // main process manages a *child* web server (start/stop/status). On the web
      // build there is no child to manage — the server answering this request IS
      // the Web App — so report an honest running status and treat start/stop as
      // no-ops. Without these, the renderer's 3s `web-status` poll 404s forever.
      case 'web-status': {
        const port = Number(process.env.PORT) || 1469;
        const localIp = (() => {
          const addrs = lanAddresses();
          return addrs[0] || 'localhost';
        })();
        // Report who launched this server (cli / desktop / standalone) from the
        // shared lock, so the Desktop UI can say "started from CLI" etc.
        const startedBy = readWebServerLock()?.startedBy ?? 'standalone';
        result = {
          running: true,
          port,
          url: `http://localhost:${port}`,
          lanUrl: `http://${localIp}:${port}`,
          startedBy
        };
        break;
      }
      case 'web-start':
        // Already running (you're connected to it) — acknowledge without acting.
        result = { success: true, running: true };
        break;
      case 'web-stop':
        // The Web App cannot stop itself from within the browser it's serving.
        result = { success: false, error: 'The Web App cannot be stopped from within itself.' };
        break;
      case 'web-change-password': {
        // AuthStore is shared across CLI/Desktop/Web, so this works on the web
        // build too. Mirrors the desktop `web-change-password` handler.
        const { current, next } = (args[0] as { current?: string; next?: string }) ?? {};
        if (!next || next.length < 6) {
          result = { ok: false, error: 'New password must be at least 6 characters.' };
          break;
        }
        const changed = AuthStore.changePassword(current ?? '', next);
        result = changed.ok ? { ok: true } : { ok: false, error: changed.error || 'Failed to change password.' };
        break;
      }

      case 'provider-proxy': {
        const proxyReq = { body: args[0] } as Request;
        let proxyResult: any = null;
        const proxyRes = {
          status: (_code: number) => proxyRes,
          json: (payload: any) => { proxyResult = payload; }
        } as unknown as Response;
        await handleProviderProxy(proxyReq, proxyRes);
        result = proxyResult;
        break;
      }

      // ─── Local Whisper STT Controls ──────────────────────────────────────────
      case 'whisper-local-status': {
        const dir = String(args[0]?.modelDir || path.join(userDataDir, 'whisper-models'));
        const size = String(args[0]?.size || 'base');
        const targetFile = path.join(dir, `ggml-${size}.bin`);
        const exists = fs.existsSync(targetFile);
        result = {
          ok: true,
          status: {
            state: exists ? 'ready' : 'missing',
            progress: exists ? 100 : 0,
            statusText: exists ? 'Model ready' : 'Not downloaded'
          }
        };
        break;
      }
      case 'whisper-local-download': {
        result = { ok: true, status: { state: 'ready', progress: 100, statusText: 'Model ready' } };
        break;
      }
      case 'whisper-local-delete': {
        const dir = String(args[0]?.modelDir || path.join(userDataDir, 'whisper-models'));
        const size = String(args[0]?.size || 'base');
        const targetFile = path.join(dir, `ggml-${size}.bin`);
        if (fs.existsSync(targetFile)) {
          try { fs.unlinkSync(targetFile); } catch {}
        }
        result = { ok: true, status: { state: 'missing', progress: 0, statusText: 'Deleted' } };
        break;
      }
      case 'whisper-local-setdir': {
        result = { ok: true, modelDir: String(args[0]?.dir || '') };
        break;
      }

      // ─── Global Memory Settings ──────────────────────────────────────────────
      case 'global-memory-read': {
        const p = path.join(userDataDir, 'global_memory.json');
        let memData = {
          defaultSystemPrompt: '',
          globalMemoryInstructions: '',
          userProfile: [],
          learnedInsights: [],
          projectInstructions: []
        };
        if (fs.existsSync(p)) {
          try {
            memData = { ...memData, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
          } catch {}
        }
        result = memData;
        break;
      }
      case 'global-memory-save-instructions': {
        const p = path.join(userDataDir, 'global_memory.json');
        let memData: any = {};
        if (fs.existsSync(p)) {
          try { memData = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
        }
        memData.globalMemoryInstructions = args[0]?.instructions || '';
        fs.writeFileSync(p, JSON.stringify(memData, null, 2), 'utf-8');
        result = { ok: true };
        break;
      }
      case 'global-memory-add-profile': {
        const p = path.join(userDataDir, 'global_memory.json');
        let memData: any = {};
        if (fs.existsSync(p)) {
          try { memData = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
        }
        const profile = Array.isArray(memData.userProfile) ? memData.userProfile : [];
        const key = String(args[0]?.key || '').trim();
        const value = String(args[0]?.value || '').trim();
        const category = args[0]?.category || 'user_preference';
        if (key) {
          const idx = profile.findIndex((entry: any) => entry.key === key);
          if (idx >= 0) profile[idx] = { key, value, category };
          else profile.push({ key, value, category });
          memData.userProfile = profile;
          fs.writeFileSync(p, JSON.stringify(memData, null, 2), 'utf-8');
        }
        result = { ok: true };
        break;
      }
      case 'global-memory-delete-profile': {
        const p = path.join(userDataDir, 'global_memory.json');
        let memData: any = {};
        if (fs.existsSync(p)) {
          try { memData = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
        }
        const key = String(args[0]?.key || '').trim();
        if (Array.isArray(memData.userProfile)) {
          memData.userProfile = memData.userProfile.filter((entry: any) => entry.key !== key);
          fs.writeFileSync(p, JSON.stringify(memData, null, 2), 'utf-8');
        }
        result = { ok: true };
        break;
      }
      case 'global-memory-add-insight': {
        const p = path.join(userDataDir, 'global_memory.json');
        let memData: any = {};
        if (fs.existsSync(p)) {
          try { memData = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
        }
        const insights = Array.isArray(memData.learnedInsights) ? memData.learnedInsights : [];
        const topic = String(args[0]?.topic || '').trim();
        const lesson = String(args[0]?.lesson || '').trim();
        const category = args[0]?.category || 'user_preference';
        if (topic && lesson) {
          insights.push({
            id: Date.now().toString(),
            topic,
            lesson,
            category,
            createdAt: new Date().toISOString()
          });
          memData.learnedInsights = insights;
          fs.writeFileSync(p, JSON.stringify(memData, null, 2), 'utf-8');
        }
        result = { ok: true };
        break;
      }
      case 'global-memory-delete-insight': {
        const p = path.join(userDataDir, 'global_memory.json');
        let memData: any = {};
        if (fs.existsSync(p)) {
          try { memData = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
        }
        const id = String(args[0]?.id || '').trim();
        if (Array.isArray(memData.learnedInsights)) {
          memData.learnedInsights = memData.learnedInsights.filter((entry: any) => entry.id !== id);
          fs.writeFileSync(p, JSON.stringify(memData, null, 2), 'utf-8');
        }
        result = { ok: true };
        break;
      }

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

      // ─── Artifacts (Micro-Apps) Manager ─────────────────────────────────────
      // ─── Artifacts (Micro-Apps) Manager ─────────────────────────────────────
      case 'artifact:list':
      case 'artifact_list':
      case 'artifact-list': {
        const list = await artifactRunner.scanArtifacts();
        result = list.map((a) => ({
          ...a,
          url: a.url || `/api/artifacts/${a.id}/view/`
        }));
        break;
      }
      case 'artifact:openFolder':
      case 'artifact_open_folder':
      case 'artifact-open-folder': {
        const artDir = artifactRunner.getStoreDirectory();
        const winPath = artDir.replace(/\//g, '\\');
        const cmd = process.platform === 'win32'
          ? `cmd /c start "" "${winPath}"`
          : process.platform === 'darwin'
          ? `open "${artDir}"`
          : `xdg-open "${artDir}"`;
        exec(cmd, (err) => {
          if (err) {
            console.error('[Artifacts] Failed to open folder in OS:', err);
            if (process.platform === 'win32') {
              exec(`explorer "${winPath}"`);
            }
          }
        });
        result = { success: true, folder: artDir };
        break;
      }
      case 'artifact:open':
      case 'artifact_open':
      case 'artifact-open': {
        const artId = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        try {
          result = await artifactRunner.openArtifact(artId);
        } catch (err: any) {
          console.error('[Artifacts] Failed to open artifact:', err);
          result = { ok: false, error: err.message };
        }
        break;
      }
      case 'artifact:start':
      case 'artifact_start':
      case 'artifact-start': {
        const artId = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        result = await artifactRunner.startArtifact(artId);
        break;
      }
      case 'artifact:stop':
      case 'artifact_stop':
      case 'artifact-stop': {
        const artId = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        result = await artifactRunner.stopArtifact(artId);
        break;
      }
      case 'artifact:delete':
      case 'artifact_delete':
      case 'artifact-delete': {
        const artId = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        await artifactRunner.deleteArtifact(artId);
        result = { success: true };
        break;
      }
      case 'artifact:ensureSeeds':
      case 'artifact_ensure_seeds':
      case 'artifact-ensure-seeds': {
        await artifactRunner.ensureSeedArtifacts();
        const list = await artifactRunner.scanArtifacts();
        result = list.map((a) => ({
          ...a,
          url: a.url || `/api/artifacts/${a.id}/view/`
        }));
        break;
      }
      case 'artifact:logs':
      case 'artifact_logs':
      case 'artifact-logs': {
        const artId = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        result = artifactRunner.getArtifactLogs(artId, args[1] || 50);
        break;
      }
      case 'artifact:getStorage':
      case 'artifact_get_storage':
      case 'artifact-get-storage': {
        const artId = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        result = artifactRunner.getStorage(artId);
        break;
      }
      case 'artifact:setStorage':
      case 'artifact_set_storage':
      case 'artifact-set-storage': {
        const artId = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        const data = args[1] || args[0]?.data;
        result = artifactRunner.setStorage(artId, data, false);
        break;
      }
      case 'artifact:setStorageKey':
      case 'artifact_set_storage_key':
      case 'artifact-set-storage-key': {
        const artId = args[0]?.id || args[0];
        const key = args[0]?.key || args[1];
        const value = args[0]?.value || args[2];
        result = artifactRunner.setStorageKey(artId, key, value);
        break;
      }
      case 'artifact:deleteStorageKey':
      case 'artifact_delete_storage_key':
      case 'artifact-delete-storage-key': {
        const artId = args[0]?.id || args[0];
        const key = args[0]?.key || args[1];
        result = artifactRunner.deleteStorageKey(artId, key);
        break;
      }
      case 'artifact:clearStorage':
      case 'artifact_clear_storage':
      case 'artifact-clear-storage': {
        const artId = typeof args[0] === 'string' ? args[0] : args[0]?.id;
        result = artifactRunner.clearStorage(artId);
        break;
      }

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
const distPath = webDistDir;
app.use(express.static(distPath, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

app.get('*', (req, res) => {
  // If requesting a static asset file with an extension that was not found, return 404
  if (/\.(css|js|map|png|svg|ico|json|woff|woff2|ttf|eot)$/i.test(req.path)) {
    res.status(404).send(`File not found: ${req.path}`);
    return;
  }

  const filePath = path.join(distPath, 'index.html');
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(content);
      return;
    }
  } catch {}
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      console.error(`[Web] Error serving index.html from ${filePath}:`, err.message);
      res.status(404).send('index.html not found');
    }
  });
});

// ─── Server Ignition ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 1469;
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
  const pathname = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`).pathname;
  if (pathname === '/api/ws') {
    const remoteIp = (socket as any).remoteAddress || request.socket?.remoteAddress || '';
    const isLoopback =
      remoteIp === '127.0.0.1' ||
      remoteIp === '::1' ||
      remoteIp === '::ffff:127.0.0.1';

    // Enforce authentication for non-loopback remote/VPS connections.
    if (!isAuthDisabled() && !isLoopback && !getAuthenticatedUser(request)) {
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
  server.on('error', (err: any) => {
    if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
      console.error(`\n❌ [SuperAgent Web Server] Failed to bind to ${HOST}:${PORT} (${err.code}).`);
      if (err.code === 'EACCES') {
        console.error(`👉 On Windows, this usually means port ${PORT} is inside a Hyper-V / Windows NAT excluded port range.`);
        console.error(`👉 Solution 1 (Admin PowerShell): Run "net stop winnat" then "net start winnat" to reset dynamic port reservations.`);
        console.error(`👉 Solution 2: Start with custom PORT (e.g. PORT=14670 npm run dev:all)\n`);
      } else {
        console.error(`👉 Port ${PORT} is currently in use by another process.\n`);
      }
    } else {
      console.error(`❌ [SuperAgent Web Server] Server error:`, err);
    }
    process.exit(1);
  });

  server.listen(Number(PORT), HOST, () => {
  console.log(`================================================================`);
  console.log(`SuperAgent Web Server ignited at: http://localhost:${PORT}`);
  // Surface the LAN URLs so the server can be opened from phones / other machines.
  for (const addr of lanAddresses()) {
    console.log(`Network (LAN) URL:              http://${addr}:${PORT}`);
  }
  console.log(`Resolving configuration and logs at: ${userDataDir}`);
  console.log(`================================================================`);

  // ─── Single-instance lock ownership ────────────────────────────────────────
  // This process now owns the port, so it owns the shared lock. The CLI/Desktop
  // read this file to enforce "only one web server" and to stop us cross-surface.
  const now = Date.now();
  const startedBy = (process.env.SUPERAGENT_WEB_LAUNCHER as WebServerLauncher) || 'standalone';
  const writeLock = (heartbeat: number) =>
    writeWebServerLock({
      pid: process.pid,
      port: Number(PORT),
      host: HOST,
      startedBy,
      startedAt: now,
      heartbeat
    });
  writeLock(now);
  // Refresh the heartbeat so other surfaces see us as alive (staleness = 90s).
  const heartbeat = setInterval(() => writeLock(Date.now()), 30_000);
  heartbeat.unref?.(); // never keep the event loop alive just for the heartbeat

  // Clear the lock on any shutdown path so the port is immediately reclaimable.
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    // Only clear if the lock is still ours (avoid stomping a fast restart).
    if (readWebServerLock()?.pid === process.pid) clearWebServerLock();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  });
}
