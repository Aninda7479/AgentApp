import { app, ipcMain, dialog, BrowserWindow, shell, globalShortcut, desktopCapturer, screen, session, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { SettingsStorage, UsageTracker, OrchestratorRouter, OrchestratorStorage, buildRouterPool, buildRequest, isFreeModel, BYOKProviderManager, createProviderAdapter, PlaywrightBrowserEngine, ComputerUse, BrowserLifecycleService, ProviderAutoDetector, enforceNetworkAllowed, MCP_CATALOG, resolveMcpServer, getMcpCatalogEntry, PLUGIN_CATALOG, MARKETPLACE_PLUGINS, SKILL_CATALOG, generateThreeD, ConfirmationHandler, getUserDataDirectory, initializeDirectories, STORAGE_DIRS, providerHealth, AuthStore, startWebServer, stopWebServer, isWebServerRunning, readWebServerLock, WebServerAlreadyRunningError, capabilityRegistry, parseContextLimit, MediaPipelineRouter, AudioTranscriber, resolveProviderFamily, resolveBaseUrl } from '@superagent/core';

// Keep Electron's cache userData in a standard OS location — NOT inside
// ~/.superagent, which is the app's own data directory.
app.setPath('userData', path.join(app.getPath('appData'), 'AgentApp'));
app.setPath('cache', path.join(app.getPath('temp'), 'agentapp-cache'));

// Create all ~/.superagent subdirectories on startup.
initializeDirectories();

import { windowManager } from './main/window';
import { setupAutoUpdater } from './main/updater';
import { readStore, writeStore, StoreData } from './main/store';
import { getChatDirectory } from './main/storage/index.js';
import * as PartnerStore from './main/partner-store';
import * as whisperLocal from './main/whisper-local';
import { petWindowManager } from './main/pet-window';
import { logError, errorMessage, registerErrorToasts, IpcErrorEnvelope } from './main/error-log';
import { getSystemInfo } from './main/system-info';
import { voiceDaemon } from './main/voice-daemon';
import { ArtifactManager } from './main/artifact/artifactManager';
import { ArtifactWindowManager } from './main/artifact/artifactWindow';
import { SystemTrayManager } from './main/tray';
import { SystemTrayCardWindow } from './main/tray/trayWindow';

const artifactManager = new ArtifactManager();
const artifactWinManager = new ArtifactWindowManager();
const systemTrayManager = new SystemTrayManager({ tooltip: 'SuperAgent Artifacts Tray' });
const systemTrayCardWindow = new SystemTrayCardWindow();

// Tracks context-window usage so the pet can show "dark circles" when the
// conversation approaches the model's capacity.
let petContextMax = 0;
let petContextTotal = 0;

/**
 * Resolves the numeric context-window size (in tokens) for the effective model
 * the orchestrator selected. Tries, in order:
 *   1. the core capability registry (`contextWindow` for known models),
 *   2. the user's model catalog `contextLimit` string (e.g. "2M", "128k"),
 *   3. a sensible default (128k).
 * This is what makes the gauge + auto-compaction "adjust with the Model
 * orchestrator" — the denominator follows whichever model routing picks.
 */
function resolveContextWindow(
  modelId: string,
  catalog?: Array<{ id?: string; name?: string; contextLimit?: string }>
): number {
  const stripped = modelId.includes('-') ? modelId.slice(modelId.indexOf('-') + 1) : modelId;
  const fromRegistry = capabilityRegistry.getCapability(modelId)?.contextWindow
    ?? capabilityRegistry.getCapability(stripped)?.contextWindow;
  if (fromRegistry) return fromRegistry;

  const entry = (catalog || []).find((m) => m.id === modelId || m.id === stripped || m.name === modelId);
  const fromCatalog = entry ? parseContextLimit(entry.contextLimit) : undefined;
  if (fromCatalog) return fromCatalog;

  return 128000;
}

// Machine identity used in connection logging (see the agent-run handler below).
const DEVICE_NAME = os.hostname();

async function getMainBrowser(): Promise<PlaywrightBrowserEngine> {
  return await BrowserLifecycleService.getSharedInstance();
}

// ─── IPC: Real AI Agent Streaming ─────────────────────────────────────────────
// Architecture matches OpenCode/Codex: streaming SSE events forwarded to renderer
// via Electron IPC (replaces HTTP SSE in desktop context)

import { AgentEngine, AgentEngineConfig, AgentEvent, resolveWithinAnyRoot, generateChatName } from './main/ai-engine';
import { listSkills, checkSkillsToImport, importSkills } from './main/skills';
import {
  connectServer,
  disconnectServer,
  listServers,
  callTool,
  connectedTools
} from './main/mcp-manager';


// ─── Centralized error handling ───────────────────────────────────────────────
// Every IPC handler is registered through safeHandle/safeOn below. If a handler
// throws, the error is logged to the console as `[ERROR] ipc:<channel> - <message>`
// and forwarded to the renderer as a toast (via the 'app-error' channel) instead
// of rejecting the IPC call and white-screening the UI.

/**
 * Sender validation for privileged IPC. Under contextIsolation the renderer is
 * a separate, unprivileged context loading only our local HTML files, so every
 * invoke/send we honor must originate from one of those windows. Anything else
 * (e.g. an unexpected remote/child frame) is rejected before the handler runs.
 */
function assertSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const frame = event.senderFrame;
  const url = frame?.url ?? '';
  if (!url.startsWith('file://')) {
    throw new Error('rejected IPC from non-file sender: ' + url);
  }
  if (!/(^|\/)(ui|pet|circle-search|tray)\.html([?#].*)?$/.test(url)) {
    throw new Error('rejected IPC from unexpected local page: ' + url);
  }
}


function safeHandle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertSender(event);
      return await handler(event, ...args);
    } catch (err: unknown) {
      logError('ipc:' + channel, err);
      return { __ipcError: true, error: errorMessage(err), channel } as IpcErrorEnvelope;
    }
  });
}

function safeOn(channel: string, handler: (event: IpcMainEvent, ...args: any[]) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertSender(event);
      handler(event, ...args);
    } catch (err: unknown) {
      logError('ipc:' + channel, err);
    }
  });
}

// Forward main-process errors to the renderer so they surface as toasts.
registerErrorToasts((context, message) => {
  const win = windowManager.getMainWindow();
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('app-error', { context, message });
    } catch {
      /* window may already be gone */
    }
  }
});


// Track active agent sessions per window: sessionId → engine
const activeSessions = new Map<string, AgentEngine>();

/**
 * Agent permission-approval bridge. When the sandbox needs the user to
 * confirm a command/file write, the engine's `requestApproval` callback
 * (wired to `buildRequestApproval`) sends `agent-permission-request` to
 * the renderer and resolves when the renderer replies `agent-permission-response`.
 * We keep the pending resolvers here so the response handler (a separate
 * IPC registration) can reach them.
 */
const sessionWindows = new Map<string, BrowserWindow | null>();
interface PendingPermission {
  resolve: (approved: boolean) => void;
  sessionId: string;
  command?: string;
}
const pendingPermissions = new Map<string, PendingPermission>();
let permissionCounter = 0;

/**
 * Builds the `requestApproval` callback for a session. It surfaces a
 * permission prompt in the renderer and resolves true/false when the user
 * responds. If the window is gone or no response arrives within the timeout,
 * it resolves false (deny) so the agent never hangs.
 */
function buildRequestApproval(sessionId: string, win: BrowserWindow | null): ConfirmationHandler {
  return (request) => new Promise<boolean>((resolve) => {
    const id = `perm-${sessionId}-${++permissionCounter}`;
    pendingPermissions.set(id, { resolve, sessionId, command: request.command });
    const target = win && !win.isDestroyed() ? win : windowManager.getMainWindow();
    if (!target || target.isDestroyed()) {
      pendingPermissions.delete(id);
      resolve(false);
      return;
    }
    target.webContents.send('agent-permission-request', { id, sessionId, request });
    // Safety fallback: auto-deny after 10 minutes so a forgotten
    // prompt can't wedge a long-running agent session.
    setTimeout(() => {
      const pending = pendingPermissions.get(id);
      if (pending) {
        pendingPermissions.delete(id);
        pending.resolve(false);
      }
    }, 10 * 60 * 1000);
  });
}

/**
 * agent-run: Start a new agent session or continue an existing one.
 * The engine streams events back using webContents.send('agent-event', event).
 */
safeHandle('agent-run', async (event, {
  sessionId,
  prompt,
  config,
  currentAttachments
}: {
  sessionId: string;
  prompt: string;
  config: AgentEngineConfig;
  currentAttachments?: string[];
}) => {
  // Declared in the handler scope (outside `try`) so the `catch` block can read
  // them when engine.run() rejects without emitting a terminal agent-event.
  const win = BrowserWindow.fromWebContents(event.sender);
  sessionWindows.set(sessionId, win);
  let terminalEmitted = false;
  let firstActivity = false;
  let firstEventTimer: ReturnType<typeof setTimeout> | undefined;
  let terminalWatchdog: ReturnType<typeof setTimeout> | undefined;

  try {
    // Log the outgoing user message on the desktop connection (device-tagged).
    console.log(`[desktop] message SENT — connection device: ${DEVICE_NAME} | session: ${sessionId} | model: ${config.model}`);

    // Load settings once for this session so both orchestrator routing AND
    // context-window resolution can read models/providers from the same source.
    const settings = SettingsStorage.loadSettings();

    // Reuse or create engine
    let engine = activeSessions.get(sessionId);
    if (!engine) {
      let finalConfig = { ...config };
      if (config.model === 'auto' || config.model === 'Orchestrator' || config.model === 'Model Governance') {
        // Apply the Orchestrator's default reasoning effort only when the
        // composer/turn didn't set one (caller preference wins). 'off' means
        // leave the per-turn/cascade logic untouched.
        const govEffort = (settings.orchestrator || settings.modelGov)?.reasoningEffort;
        if (!finalConfig.reasoningEffort && govEffort && govEffort !== 'off') {
          finalConfig.reasoningEffort = govEffort;
        }
        // Build a proper RouterModel[] pool (providerId + capability/access
        // signals) from the user's configured models. routeModelForTask reads
        // RouterModel fields that raw settings.models don't always carry, so
        // feeding it the raw list can resolve to a model with no provider.
        const enabledModels = buildRouterPool(settings.models ?? []).filter((m) => m.enabled);
        try {
          const routed = OrchestratorRouter.routeModelForTask(prompt, enabledModels, buildRequest(prompt, currentAttachments));
          if (routed && routed.model) {
            finalConfig.provider = routed.provider as any;
            finalConfig.model = routed.model;
            const byok = settings.providers?.find((p) => p.id === routed.provider);
            if (byok) {
              finalConfig.apiKey = byok.apiKey;
              finalConfig.baseUrl = byok.baseUrl;
            } else if (!finalConfig.apiKey) {
              console.warn(`[desktop] Orchestrator routed to '${routed.provider}' but no API key is configured for it; the reply may fail.`);
            }
          } else {
            throw new Error('Orchestrator could not select a model for this task.');
          }
        } catch (routeErr: unknown) {
          // Never go silently empty: fall back to the first enabled model so the
          // user still gets a real reply instead of a blank turn.
          const fallback = enabledModels[0];
          if (fallback) {
            console.warn(`[desktop] Orchestrator routing failed (${(routeErr as Error).message}); falling back to ${fallback.providerId}/${fallback.id}.`);
            finalConfig.provider = fallback.providerId as any;
            finalConfig.model = OrchestratorRouter.stripProviderPrefix(fallback.providerId, fallback.id);
            const byok = settings.providers?.find((p) => p.id === fallback.providerId);
            if (byok) {
              finalConfig.apiKey = byok.apiKey;
              finalConfig.baseUrl = byok.baseUrl;
            }
          } else {
            // No model configured/enabled — emit a clear error event to the
            // renderer instead of forwarding the literal 'auto' string downstream.
            if (win && !win.isDestroyed()) {
              win.webContents.send('agent-event', {
                type: 'error',
                sessionId,
                error: (routeErr as Error).message || String(routeErr)
              });
            }
            activeSessions.delete(sessionId);
            return { success: false, error: (routeErr as Error).message || String(routeErr) };
          }
        }
      }
      finalConfig.extraTools = connectedTools();
      finalConfig.requestApproval = buildRequestApproval(sessionId, win);
      // Resolve the effective model's context window (orchestrator-aware) so the
      // engine's live usage gauge + auto-compaction use the right denominator.
      finalConfig.contextWindow = resolveContextWindow(finalConfig.model, settings?.models);
      engine = new AgentEngine(finalConfig, sessionId);
      activeSessions.set(sessionId, engine);
      // Reset context-usage tracking for this run.
      petContextMax = finalConfig.contextWindow ?? 0;
      petContextTotal = 0;

      // Asynchronously generate chat name for the first message of the session
      (async () => {
        try {
          const chatName = await generateChatName(prompt, finalConfig);
          
          // Write to chat config file of that folder (if available)
          if (finalConfig.projectRoot) {
            try {
              const fs = require('fs');
              const path = require('path');
              const projectDataDir = path.join(finalConfig.projectRoot, '.superagent');
              if (!fs.existsSync(projectDataDir)) {
                fs.mkdirSync(projectDataDir, { recursive: true });
              }
              const configFilePath = path.join(projectDataDir, 'chat_config.json');
              const { apiKey, requestApproval, extraTools, ...safeConfig } = finalConfig;
              fs.writeFileSync(
                configFilePath,
                JSON.stringify({ chatName, ...safeConfig }, null, 2),
                'utf8'
              );
              console.log(`[desktop] Saved chat config to ${configFilePath}`);
            } catch (fsErr) {
              console.error('[desktop] Failed to write chat_config.json:', fsErr);
            }
          }
          
          // Emit agent-event of type 'chat-name'
          if (win && !win.isDestroyed()) {
            win.webContents.send('agent-event', {
              type: 'chat-name',
              sessionId,
              chatName
            });
          }
        } catch (nameErr) {
          console.error('[desktop] Error in chat name generation sequence:', nameErr);
        }
      })();
    } else {
      // Engine already exists for this session: honor a concrete model switch on
      // this turn WITHOUT losing the conversation history the engine holds in RAM.
      // `updateConfig` mutates the engine's live config in place (read by run() on
      // every turn) so the next message uses the newly picked model while the
      // prior context continues. The orchestrator special models
      // ('auto'/'Orchestrator'/'Model Governance') were resolved to a concrete
      // model at creation time, so we leave those untouched on reuse.
      const isOrchestratorModel =
        config.model === 'Orchestrator' || config.model === 'Model Governance' || config.model === 'auto';
      if (!isOrchestratorModel) {
        engine.updateConfig({
          model: config.model,
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          contextWindow: resolveContextWindow(config.model, settings?.models)
        });
      }
    }

    // Run agent; emit each event back to renderer
    let replyLogged = false;
    // ── Watchdogs ─────────────────────────────────────────────────────────────
    // The renderer only stops the "thinking" animation and surfaces a reason
    // once it receives a terminal `agent-event` (done/error/abort). If the run
    // ends without emitting one — an unhandled rejection from `engine.run`
    // (e.g. a provider 429 before any token, or a setup throw) or a provider
    // request that hangs forever — the UI would spin the thinking animation
    // indefinitely with no reply and no error. These watchdogs emit a terminal
    // error event if the run stalls, so the user always gets a single-line
    // explanation instead of a stuck chat.
    let terminalEmitted = false;
    let firstActivity = false;

    // First-activity watchdog: fail fast with a clear message if the provider
    // never starts responding (dead/hanging connection, auth wall, or a rate
    // limit that holds the socket). The core engine also enforces a 45s connect
    // timeout on the request itself; this is the backstop for stalls that happen
    // before/around the network call. 60s is generous for slow models but short
    // enough that the user isn't left staring at a spinner.
    const FIRST_EVENT_MS = 60_000;
    firstEventTimer = setTimeout(() => {
      if (!terminalEmitted && !firstActivity && win && !win.isDestroyed()) {
        win.webContents.send('agent-event', {
          type: 'error',
          sessionId,
          error: 'The model did not start responding (request timed out). Check the provider connection, API key, and rate limits, then try again.'
        });
      }
      terminalEmitted = true;
      clearTimeout(terminalWatchdog);
    }, FIRST_EVENT_MS);

    // Terminal watchdog: backstop for runs that emit activity but never finish
    // (e.g. a stream that stalls mid-way). Longer because once output is flowing
    // a genuine long generation can take a while.
    const TERMINAL_MS = 120_000;
    terminalWatchdog = setTimeout(() => {
      if (!terminalEmitted && win && !win.isDestroyed()) {
        win.webContents.send('agent-event', {
          type: 'error',
          sessionId,
          error: 'The agent stopped responding before finishing. Check the provider connection and try again.'
        });
      }
      terminalEmitted = true;
      clearTimeout(firstEventTimer);
    }, TERMINAL_MS);

    await engine.run(prompt, (agentEvent: AgentEvent) => {
      // Log the first reply token on the desktop connection (device-tagged).
      if (agentEvent.type === 'token' && !replyLogged) {
        replyLogged = true;
        console.log(`[desktop] message RECEIVED — connection device: ${DEVICE_NAME} | session: ${sessionId}`);
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send('agent-event', { ...agentEvent, sessionId });
        // Relay to the free-roaming 3D Partner so it reacts in real time.
        const petMood = petWindowManager.moodFromAgentEvent(agentEvent.type);
        if (petMood) petWindowManager.setMood(petMood);

        // Context-window usage → dark circles when near capacity. The engine's
        // own `context` estimates are preferred (accurate, model-aware); the raw
        // `usage.totalTokens` from providers is used as a fallback when present.
        if (agentEvent.context) {
          petContextTotal = agentEvent.context.used;
          petContextMax = agentEvent.context.limit;
          petWindowManager.setContext(agentEvent.context.pct / 100);
        } else if (agentEvent.usage) {
          petContextTotal = agentEvent.usage.totalTokens || petContextTotal;
          if (petContextMax > 0) {
            petWindowManager.setContext(petContextTotal / petContextMax);
          }
        }

        // "Needs input" → the pet speaks + plays a sound.
        if (agentEvent.type === 'error' && agentEvent.error &&
            /api key|apikey|permission|approve|confirm|sign ?in|log ?in|needs? input|provide (a|an|your)/i.test(agentEvent.error)) {
          petWindowManager.say(agentEvent.error);
        }
      }

      // Any sign of life stands the first-activity watchdog down.
      if (
        agentEvent.type === 'token' || agentEvent.type === 'thought' ||
        agentEvent.type === 'tool_call' || agentEvent.type === 'context'
      ) {
        firstActivity = true;
        clearTimeout(firstEventTimer);
      }

      // Mark terminal events so the watchdogs (and the catch below) know the run
      // finalized cleanly and no synthetic error should be emitted.
      if (agentEvent.type === 'done' || agentEvent.type === 'error' || agentEvent.type === 'abort') {
        terminalEmitted = true;
        clearTimeout(firstEventTimer);
        clearTimeout(terminalWatchdog);
      }
    }, currentAttachments);

    // Clean up after done/error/abort
    clearTimeout(firstEventTimer);
    clearTimeout(terminalWatchdog);
    activeSessions.delete(sessionId);
    return { success: true };

  } catch (err: unknown) {
    clearTimeout(firstEventTimer);
    clearTimeout(terminalWatchdog);
    activeSessions.delete(sessionId);
    const errMsg = (err as Error).message || String(err);
    // The renderer only stops the "thinking" animation / shows a no-response
    // reason once it receives a terminal agent-event. If engine.run() rejected
    // (e.g. provider 429 before any token, a setup throw) without the engine
    // emitting its own error event, emit one now so the chat never hangs.
    if (!terminalEmitted && win && !win.isDestroyed()) {
      win.webContents.send('agent-event', { type: 'error', sessionId, error: errMsg });
    }
    return { success: false, error: errMsg };
  }
});

/**
 * agent-stop: Abort a running agent session.
 */
safeHandle('agent-stop', (_event, sessionId: string) => {
  const engine = activeSessions.get(sessionId);
  if (engine) {
    engine.abort();
    activeSessions.delete(sessionId);
  }
  return { stopped: true };
});

/**
 * agent-compact: Compact the live conversation history of a running session's
 * engine. Invoked by the desktop `/compact` slash command. Returns the
 * before/after token estimate so the UI can report savings.
 */
safeHandle('agent-compact', (_event, sessionId: string) => {
  const engine = activeSessions.get(sessionId);
  if (!engine) {
    return { compacted: false, tokensBefore: 0, tokensAfter: 0 };
  }
  const result = engine.compactHistory();
  return {
    compacted: true,
    tokensBefore: result.tokensBefore,
    tokensAfter: result.tokensAfter
  };
});

/**
 * agent-list: List active session IDs.
 */
safeHandle('agent-list', () => {
  return { sessions: Array.from(activeSessions.keys()) };
});

/**
 * agent-permission-response: the renderer's answer to an
 * `agent-permission-request`. Resolves the pending approval promise
 * (approve/deny) and, when the user chose "Always allow", adds
 * the command to the session's sandbox allowlist so it won't re-prompt.
 */
safeHandle('agent-permission-response', (_event, {
  id,
  approved,
  remember,
  command
}: {
  id: string;
  approved: boolean;
  remember?: boolean;
  command?: string;
}) => {
  const pending = pendingPermissions.get(id);
  if (!pending) return { ok: false };
  pendingPermissions.delete(id);
  pending.resolve(Boolean(approved));
  if (remember && pending.command) {
    const engine = activeSessions.get(pending.sessionId);
    engine?.getSandbox()?.addSessionAllow(pending.command);
  }
  return { ok: true };
});

// ─── IPC: Skills discovery (for the Composer slash autocomplete) ──────────────
safeHandle('skills-list', (_event, { dir }: { dir?: string | string[] }) => {
  try {
    return listSkills(dir);
  } catch {
    return [];
  }
});

safeHandle('skills-import-check', async (_event, { projectRoot }: { projectRoot?: string }) => {
  try {
    return await checkSkillsToImport(projectRoot);
  } catch {
    return { canImport: false, skills: [] };
  }
});

safeHandle('skills-import-perform', async (_event, { projectRoot }: { projectRoot?: string }) => {
  try {
    return await importSkills(projectRoot);
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: MCP server connections ─────────────────────────────────────────────
safeHandle('mcp-connect', async (_event, server: {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  commandOrUrl: string;
}) => {
  try {
    const res = await connectServer(server);
    return { success: true, ...res };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

safeHandle('mcp-disconnect', async (_event, id: string) => {
  await disconnectServer(id);
  return { success: true };
});

safeHandle('mcp-list', () => listServers());

safeHandle('mcp-call', async (_event, { id, tool, args }: {
  id: string;
  tool: string;
  args?: Record<string, any>;
}) => {
  try {
    return await callTool(id, tool, args || {});
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`;
  }
});

// ─── IPC: Curated MCP catalog (one-click install) ────────────────────────────
safeHandle('mcp-catalog', () => MCP_CATALOG);

safeHandle('mcp-install', async (_event, { id, keys }: {
  id: string;
  keys?: Record<string, string>;
}) => {
  const entry = getMcpCatalogEntry(id);
  if (!entry) {
    return { success: false, error: `Unknown MCP server: ${id}` };
  }
  // Validate that all required keys are present.
  const provided = keys || {};
  const missing = entry.envKeys.filter((k) => k.required && !(provided[k.key] && provided[k.key].trim()));
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required key(s): ${missing.map((k) => k.key).join(', ')}`
    };
  }
  const resolved = resolveMcpServer(entry, provided);
  const serverId = `mcp-catalog-${entry.id}`;
  try {
    const res = await connectServer({
      id: serverId,
      name: entry.name,
      transport: resolved.transport,
      commandOrUrl: resolved.commandOrUrl,
      env: resolved.env
    });
    return { success: true, ...res };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
});

// ─── IPC: Built-in + marketplace Plugin catalog ──────────────────────────────
// Built-ins first (enabled by default), then marketplace items (under
// development). Kept as separate Core arrays so PLUGIN_CATALOG's unique-
// capability invariant stays intact; merged only here for the UI.
safeHandle('plugins-catalog', () => [...PLUGIN_CATALOG, ...MARKETPLACE_PLUGINS]);

// ─── IPC: Curated Skill catalog (Settings → Skills; NOT the slash surface) ────
safeHandle('skills-catalog', () => SKILL_CATALOG);



// ─── IPC: Persistent Store ───────────────────────────────────────────────────

safeHandle('store-read', async (): Promise<StoreData> => {
  return await readStore();
});

/**
 * Reads ONLY one chat's trajectory `steps` from disk. Lets the renderer
 * lazy-load a conversation's history when it is actually opened, instead of
 * holding every chat's full steps in RAM forever. The renderer evicts
 * (drops from memory) the steps of chats it is not currently showing; the
 * canonical transcript lives on disk, so nothing is lost.
 */
safeHandle('chat-steps-read', async (_event, chatId: string): Promise<unknown> => {
  if (typeof chatId !== 'string' || !chatId) return [];
  const store = await readStore();
  const chat = (store.chats ?? []).find((c) => c.id === chatId);
  return (chat?.steps as unknown) ?? [];
});

safeHandle('kanban-load', (_event, args: { scope: 'global' | 'project'; projectName?: string }) => {
  const tasksDir = path.join(getUserDataDirectory(), 'tasks');
  let filePath = '';
  if (args.scope === 'project' && args.projectName) {
    filePath = path.join(tasksDir, 'projects', `${args.projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  } else {
    filePath = path.join(tasksDir, 'global.json');
  }

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load kanban tasks:', err);
  }
  return [];
});

safeHandle('kanban-save', (_event, args: { scope: 'global' | 'project'; projectName?: string; cards: any[] }) => {
  const tasksDir = path.join(getUserDataDirectory(), 'tasks');
  let filePath = '';
  let dirPath = tasksDir;
  if (args.scope === 'project' && args.projectName) {
    dirPath = path.join(tasksDir, 'projects');
    filePath = path.join(dirPath, `${args.projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  } else {
    filePath = path.join(tasksDir, 'global.json');
  }

  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(args.cards, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to save kanban tasks:', err);
    return { success: false, error: err.message };
  }
});

safeHandle('store-write', async (_event, data: StoreData): Promise<void> => {
  // The renderer keeps only the ACTIVE chat's full trajectory in RAM and
  // holds every other (dormant) chat metadata-only (steps: []), lazily
  // re-reading them from disk on open. If we wrote those [] verbatim
  // we'd erase dormant transcripts, so merge with the on-disk store:
  // a chat with non-empty steps wins; an empty-steps chat falls back to
  // its on-disk steps (if any); a brand-new chat with no disk record
  // keeps its (empty) steps. This keeps the disk transcript authoritative
  // and lets the renderer drop chats from RAM without data loss.
  const onDisk = await readStore();
  const diskStepsById = new Map<string, unknown>();
  for (const c of (onDisk.chats ?? []) as Array<{ id: string; steps?: unknown }>) {
    if (c.id) diskStepsById.set(c.id, c.steps as unknown);
  }
  const mergedData: StoreData = {
    ...data,
    chats: ((data.chats ?? []) as unknown as Array<Record<string, unknown>>).map((c) => {
      const steps = c.steps;
      if (Array.isArray(steps) && (steps as unknown[]).length > 0) return c as any;
      const diskSteps = diskStepsById.get(String(c.id));
      if (diskSteps) return { ...c, steps: diskSteps } as any;
      return c as any;
    })
  };
  await writeStore(mergedData);
});

safeHandle('settings-read', () => {
  return SettingsStorage.loadSettings();
});

safeHandle('settings-write', (_event, settingsPatch) => {
  const oldSettings = SettingsStorage.loadSettings();
  SettingsStorage.saveSettings(settingsPatch);

  const oldVoice = oldSettings?.voice || {};
  const updatedSettings = SettingsStorage.loadSettings();
  const newVoice = updatedSettings?.voice || {};

  if (
    (oldVoice.localWhisper?.enabled && !newVoice.localWhisper?.enabled) ||
    (oldVoice.localWhisper?.enabled && oldVoice.localWhisper?.size !== newVoice.localWhisper?.size)
  ) {
    void whisperLocal.freePipeline();
  }

  // Hot-reload Circle-to-Search shortcut
  const oldCSSettings = oldSettings?.circleSearch || {};
  const newCSSettings = updatedSettings?.circleSearch || {};
  if (oldCSSettings.shortcut !== newCSSettings.shortcut || oldCSSettings.enabled !== newCSSettings.enabled) {
    try {
      const oldShortcut = oldCSSettings.shortcut || 'CommandOrControl+Shift+Space';
      globalShortcut.unregister(oldShortcut);
    } catch {}
    if (newCSSettings.enabled) {
      try {
        const newShortcut = newCSSettings.shortcut || 'CommandOrControl+Shift+Space';
        globalShortcut.register(newShortcut, () => {
          showCircleSearch();
        });
      } catch (err) {
        console.error('[circle-search] Failed to hot-register global shortcut:', err);
      }
    }
  }

  // Hot-reload Voice Typing daemon
  if (oldVoice.typingEnabled !== newVoice.typingEnabled || oldVoice.typingShortcut !== newVoice.typingShortcut) {
    if (newVoice.typingEnabled) {
      voiceDaemon.setShortcut(newVoice.typingShortcut || 'CommandOrControl+Super');
    } else {
      voiceDaemon.disable();
    }
  }
});

// ── Hardware detection for the Local Model (Ollama) manager ────────────────
// Returns CPU/GPU/RAM/storage/unified-memory details so the renderer can
// recommend models that actually fit the machine. Runs in the main process;
// see ./main/system-info.ts for the per-probe implementation.
safeHandle('system-info', () => getSystemInfo());

safeHandle('usage-summary', () => {
  return UsageTracker.getSummary();
});

safeHandle('usage-records', () => {
  return UsageTracker.loadUsage();
});

safeHandle('usage-clear', () => {
  UsageTracker.clearUsage();
});

safeHandle('usage-pricing', () => {
  return UsageTracker.getPricing();
});

safeHandle('orchestrator-read-instructions', () => {
  return OrchestratorStorage.loadInstructions();
});

safeHandle('orchestrator-write-instructions', (_event, content: string) => {
  OrchestratorStorage.saveInstructions(content);
});

safeHandle('orchestrator-update-instructions', async () => {
  return await OrchestratorStorage.autoUpdateInstructions();
});

safeHandle('orchestrator-optimize-instructions-by-ai', async () => {
  const settings = SettingsStorage.loadSettings();
  const orchestratorSettings = settings.orchestrator || settings.modelGov;
  const freeOnly = !!orchestratorSettings?.freeOnly;
  const govEnabledIds = orchestratorSettings?.enabledModels || [];

  const activeModels = (settings.models || []).filter(m =>
    govEnabledIds.includes(m.id) ||
    govEnabledIds.includes(`${m.providerId}-${m.id}`)
  );
  const currentInstructions = OrchestratorStorage.loadInstructions();

  // Build the free-aware, enabled pool the optimizer routes across. Routing
  // through the orchestrator (instead of a single brittle AgentEngine with all
  // 20+ tools) makes the optimization tool-free, far faster, and resilient to a
  // rate-limited/failing free provider (it auto-fallbacks to the next healthy).
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
    throw new Error(
      'AI engine returned empty optimization response. Verify at least one free provider is reachable (Settings → Orchestrator → Test Connections) and retry.'
    );
  }

  optimizedContent = optimizedContent
    .replace(/^```markdown\n?/i, '')
    .replace(/```$/, '')
    .trim();

  OrchestratorStorage.saveInstructions(optimizedContent);
  return optimizedContent;
});

// Surfaces the orchestrator's live provider-health view (the "can't be banned
// out from under you" resilience signal) so the Settings UI can show which
// providers are available / locked / throttled and why — rather than a flat label.
safeHandle('provider-health-diagnostics', () => {
  return providerHealth.getDiagnostics();
});

/**
 * Test Connection — pings each (optionally free-only) configured provider with a
 * single tiny completion and reports pass/fail + latency. Lets the user verify
 * their free connections are reachable before relying on the Orchestrator, and
 * refreshes provider-health so a previously throttled provider is re-checked
 * for real. Reuses the same adapter primitive the router uses.
 */
safeHandle('provider-test-connection', async (_event, { providerId }: { providerId?: string } = {}) => {
  const settings = SettingsStorage.loadSettings();
  const gov = settings.orchestrator || settings.modelGov;
  const freeOnly = !!gov?.freeOnly;

  const configured = (settings.providers || []).filter((p) =>
    p.apiKey || p.id === 'ollama' || p.id === 'custom' || p.type === 'custom'
  );

  let targets = providerId
    ? configured.filter((p) => p.id === providerId)
    : configured;

  // Free-Only mode: only exercise providers that own at least one free, enabled model.
  if (freeOnly && !providerId) {
    const freeProviderIds = new Set(
      buildRouterPool(settings.models ?? [])
        .filter((m) => m.enabled && isFreeModel(m))
        .map((m) => m.providerId)
    );
    targets = targets.filter((p) => freeProviderIds.has(p.id));
  }

  const results: Array<{ providerId: string; ok: boolean; latencyMs: number; error?: string; status: string }> = [];

  for (const p of targets) {
    const cfg = { provider: p.id as any, apiKey: p.apiKey, baseUrl: p.baseUrl, modelName: undefined as string | undefined };
    const modelSetting =
      (settings.models || []).find((m) => m.providerId === p.id && m.enabled) ||
      (settings.models || []).find((m) => m.providerId === p.id);
    if (modelSetting) cfg.modelName = modelSetting.id.replace(`${p.id}-`, '');

    const startMs = Date.now();
    try {
      const adapter = createProviderAdapter(cfg as any);
      await adapter.complete({
        messages: [{ role: 'user', content: 'Reply with exactly the word: ok' }],
        maxTokens: 4
      });
      const latencyMs = Date.now() - startMs;
      providerHealth.recordSuccess(p.id);
      results.push({ providerId: p.id, ok: true, latencyMs, status: providerHealth.getStatus(p.id) });
    } catch (err: unknown) {
      const latencyMs = Date.now() - startMs;
      providerHealth.recordFailure(p.id, err);
      results.push({
        providerId: p.id,
        ok: false,
        latencyMs,
        error: (err as Error).message || String(err),
        status: providerHealth.getStatus(p.id)
      });
    }
  }

  return results;
});

safeHandle('browser-navigate', async (_event, { url }) => {
  try {
    enforceNetworkAllowed({ kind: 'browser', url: url as string, method: 'GET' });
  } catch (err: unknown) {
    return `Blocked by Internet Access policy: ${(err as Error).message}`;
  }
  const browser = await getMainBrowser();
  const res = await browser.navigate(url);
  return `Successfully navigated to ${res.url} (HTTP status: ${res.status}). Page Title: "${res.title}"`;
});

safeHandle('browser-screenshot', async (_event, { fullPage }) => {
  const browser = await getMainBrowser();
  const logsDir = path.join(getUserDataDirectory(), STORAGE_DIRS.logs);
  fs.mkdirSync(logsDir, { recursive: true });
  const screenshotPath = path.join(logsDir, `browser-screenshot-${Date.now()}.png`);
  await browser.takeScreenshot({ path: screenshotPath, fullPage: !!fullPage });
  return `Screenshot captured and saved to: ${screenshotPath}`;
});

safeHandle('screenshot_screen', async () => {
  const p = await ComputerUse.takeScreenshot();
  return `Screenshot captured successfully and saved to: ${p}`;
});

safeHandle('browser-close', async () => {
  await BrowserLifecycleService.closeSharedInstance();
  return 'Browser successfully shut down.';
});

// ─── IPC: App version & update checks ────────────────────────────────────────

safeHandle('app-version', () => {
  return app.getVersion();
});

safeHandle('open-external', async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
});

// Renderer-side shell.openPath (media/partner open) is routed here so the
// sandboxed renderer never needs the `shell` module directly.
safeHandle('shell-open-path', async (_event, targetPath: string) => {
  try {
    return await shell.openPath(targetPath);
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
});

// Renderer-side .superagent/loop.md (or .claude/loop.md) reads are routed here
// so the sandboxed renderer never needs `fs`/`path`. Basic containment: only
// files named loop.md inside a `.superagent`/`.claude` folder of the given
// workspace path are read.
safeHandle('loop-read', (_event, workspacePath: string): string | null => {
  if (!workspacePath || typeof workspacePath !== 'string') return null;
  const candidates = [
    path.join(workspacePath, '.superagent', 'loop.md'),
    path.join(workspacePath, '.claude', 'loop.md'),
  ];
  for (const file of candidates) {
    // Guard against path traversal slipping past the join above.
    if (!file.startsWith(path.resolve(workspacePath))) continue;
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8').trim();
    } catch {
      /* ignore unreadable */
    }
  }
  return null;
});

/**
 * check-for-updates: Manually trigger an electron-updater update check.
 * Returns a status object. In dev (no electron-updater) or when disabled, this
 * degrades gracefully to a friendly message instead of throwing.
 */
safeHandle('check-for-updates', async (): Promise<{
  status: 'checking' | 'available' | 'not-available' | 'unsupported' | 'error';
  version?: string;
  message?: string;
}> => {
  if (process.env.SUPERAGENT_DISABLE_UPDATER === '1') {
    return { status: 'unsupported', message: 'Auto-updates are disabled in this build.' };
  }

  try {
    // @ts-ignore - optional dependency, present only in packaged builds
    const { autoUpdater } = await import('electron-updater');

    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      return { status: 'unsupported', message: 'Update feed is unavailable.' };
    }

    if (result.isUpdateAvailable) {
      return {
        status: 'available',
        version: result.updateInfo?.version,
        message: `Update available: v${result.updateInfo?.version ?? '?'}`
      };
    }

    return {
      status: 'not-available',
      version: result.updateInfo?.version,
      message: `You are on the latest version (v${result.updateInfo?.version ?? app.getVersion()}).`
    };
  } catch (err: unknown) {
    const message = (err as Error)?.message ?? String(err);
    // A common dev scenario: no publish feed configured.
    if (/Cannot find|ENOTFOUND|getLatestVersion|257|feed/i.test(message)) {
      return { status: 'unsupported', message: 'No update feed configured (this is normal in dev).' };
    }
    return { status: 'error', message };
  }
});

safeHandle('select-project-folders', async () => {
  const win = windowManager.getMainWindow();
  const result = await dialog.showOpenDialog(win!, {
    title: 'Select Folder(s)',
    properties: ['openDirectory', 'multiSelections']
  });
  if (result.canceled) {
    return [];
  }
  return result.filePaths;
});

safeHandle('select-files', async () => {
  const win = windowManager.getMainWindow();
  const result = await dialog.showOpenDialog(win!, {
    title: 'Select Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media Files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'avi', 'mkv', 'mov', 'pdf', 'ppt'] }
    ]
  });
  if (result.canceled) {
    return [];
  }
  return result.filePaths;
});

safeHandle('copy-file-to-chat', async (_event, { sourcePath, chatId, projectName }) => {
  const targetDir = getChatDirectory(getUserDataDirectory(), chatId, projectName || undefined);

  fs.mkdirSync(targetDir, { recursive: true });
  const filename = path.basename(sourcePath);
  const destPath = path.join(targetDir, filename);
  fs.copyFileSync(sourcePath, destPath);
  return {
    filename,
    relativePath: path.relative(getUserDataDirectory(), destPath),
    fullPath: destPath
  };
});

safeHandle('read-file-base64', async (_event, filePath) => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    console.error('Failed to read file as base64: a non-empty file path string is required.');
    return null;
  }
  // Confine reads to the user-data dir (chat media, screenshots, logs) and the
  // user's configured project folders. Reading an arbitrary absolute path would
  // let the agent surface exfiltrate any file on disk — inconsistent with the
  // project-root scoping the other file tools now enforce (4b0223f / abbad59 /
  // 64655f9: read_file/list_dir/write_file/grep_search are all scoped). This
  // mirrors the web fix in e38c276 and reuses the desktop engine's allowlist
  // check (resolveWithinAnyRoot / resolveWithinRoot in ai-engine.ts).
  const userDataDir = getUserDataDirectory();
  const store = await readStore();
  const projectFolders = (store.projects ?? []).flatMap((p) => p.folders ?? []);
  const resolved = resolveWithinAnyRoot(filePath, [userDataDir, ...projectFolders]);
  if (!resolved) {
    console.error(`Refused read-file-base64: ${filePath} is outside the allowed directories.`);
    return null;
  }
  try {
    const content = fs.readFileSync(resolved);
    const ext = path.extname(resolved).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.svg') mimeType = 'image/svg+xml';
    return `data:${mimeType};base64,${content.toString('base64')}`;
  } catch (e) {
    console.error('Failed to read file as base64', e);
    return null;
  }
});

safeHandle('save-chat-media-buffer', async (_event, { buffer, filename, chatId, projectName }) => {
  const targetDir = getChatDirectory(getUserDataDirectory(), chatId, projectName || undefined);

  fs.mkdirSync(targetDir, { recursive: true });
  const destPath = path.join(targetDir, filename);
  fs.writeFileSync(destPath, Buffer.from(buffer));
  return {
    filename,
    relativePath: path.relative(getUserDataDirectory(), destPath),
    fullPath: destPath
  };
});

// ─── IPC: Partner / Pet ecosystem (open companion import/export) ─────────────
// Reads/writes partner.json folders under <userData>/pets. The format is fully
// open: anyone can author a Partner and import it here.

safeHandle('partner-list', () => {
  return PartnerStore.listPartners(getUserDataDirectory());
});

safeHandle('partner-get', (_event, id: string) => {
  return PartnerStore.getPartner(getUserDataDirectory(), id);
});

safeHandle('partner-install', async () => {
  try {
    const win = windowManager.getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a Partner folder',
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const installed = PartnerStore.installPartnerFolder(getUserDataDirectory(), result.filePaths[0]);
    return installed;
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

safeHandle('partner-import-json', (_event, json: string) => {
  try {
    return PartnerStore.importPartnerJson(getUserDataDirectory(), json);
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

safeHandle('partner-remove', (_event, id: string) => {
  PartnerStore.removePartner(getUserDataDirectory(), id);
  return { success: true };
});

safeHandle('partner-set-active', (_event, id: string | null) => {
  PartnerStore.setActivePartner(getUserDataDirectory(), id);
  // Push the now-active Partner (with its resolved 3D model / VRM/script paths) to the pet.
  const manifest = id ? PartnerStore.getPartner(getUserDataDirectory(), id) : null;
  const modelPath = manifest ? resolvePartnerModelPath(manifest) : null;
  const vrmPath = manifest ? resolvePartnerVrmPath(manifest) : null;
  const scriptPath = manifest ? resolvePartnerScriptPath(manifest) : null;
  const modelFolderPath = manifest ? resolvePartnerModelFolderPath(manifest) : null;
  const faceOverlay = manifest ? resolvePartnerFaceOverlay(manifest) : null;
  petWindowManager.setPartner(manifest as any, modelPath, vrmPath, scriptPath, modelFolderPath, faceOverlay);
  return { success: true };
});

safeHandle('partner-get-active', () => {
  return PartnerStore.getActivePartner(getUserDataDirectory());
});

safeHandle('partner-export', (_event, id: string) => {
  try {
    const folder = PartnerStore.partnerFolderPath(getUserDataDirectory(), id);
    if (fs.existsSync(folder)) {
      shell.showItemInFolder(folder);
    }
    return { success: true, folder };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

/**
 * Opens a native file picker so the user can choose a 3D character file
 * (.vrm / .glb / .gltf) to attach to a Partner. Returns the chosen absolute path
 * (or null if cancelled). The actual copy + manifest update happens in
 * 'partner-import-model'.
 */
safeHandle('partner-pick-model-file', async () => {
  try {
    const win = windowManager.getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a 3D model file',
      properties: ['openFile'],
      filters: [{ name: '3D model', extensions: ['vrm', 'glb', 'gltf'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

/**
 * Copies a chosen 3D model file into the Partner's folder, records it in the
 * Partner's manifest (as `vrm` for .vrm, else `model`), and — if this is the
 * active Partner — re-pushes it to the running pet. This persists the user's
 * "which model I imported" choice on disk.
 */
safeHandle('partner-import-model', async (_event, { id, sourcePath }: { id: string; sourcePath: string }) => {
  try {
    if (!id || !sourcePath) return { error: 'Missing partner id or model path.' };
    if (!fs.existsSync(sourcePath)) return { error: 'Model file no longer exists.' };

    const ext = path.extname(sourcePath).toLowerCase().replace('.', '');
    if (!['vrm', 'glb', 'gltf'].includes(ext)) {
      return { error: 'Unsupported model file. Use .vrm, .glb, or .gltf.' };
    }

    const folder = PartnerStore.partnerFolderPath(getUserDataDirectory(), id);
    // The default `lily` Partner is shipped in-memory and may not have an on-disk
    // folder yet — create it lazily so a freshly imported model has a home.
    fs.mkdirSync(folder, { recursive: true });

    const fileName = `character.${ext}`;
    fs.copyFileSync(sourcePath, path.join(folder, fileName));

    // Read, patch, and rewrite the manifest to point at the imported file.
    const manifestPath = path.join(folder, 'partner.json');
    const manifest = PartnerStore.getPartner(getUserDataDirectory(), id);
    if (!manifest) return { error: 'Partner manifest not found.' };
    const field = ext === 'vrm' ? 'vrm' : 'model';
    manifest[field] = fileName;
    // A .glb/.gltf model takes precedence over a .vrm for the 3D pet.
    if (field === 'model') delete (manifest as any).vrm;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    // If this is the active Partner, refresh the running pet immediately.
    const activeId = PartnerStore.getActivePartner(getUserDataDirectory());
    if (activeId === id) {
      petWindowManager.setPartner(
        manifest as any,
        resolvePartnerModelPath(manifest),
        resolvePartnerVrmPath(manifest),
        resolvePartnerScriptPath(manifest),
        resolvePartnerModelFolderPath(manifest)
      );
    }

    return { ok: true, model: fileName, field };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

/**
 * Native file picker for a concept image (PNG/JPG) used as the seed for
 * image-to-3D generation in the 3D Studio. Returns the chosen absolute path.
 */
safeHandle('pick-image-file', async () => {
  try {
    const win = windowManager.getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a concept image',
      properties: ['openFile'],
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (result.canceled || !result.filePaths.length) return { path: null };
    return { path: result.filePaths[0] };
  } catch {
    return { path: null };
  }
});

/**
 * 3D Studio generation entry point. Reads the user's 3D settings (enabled +
 * provider + key) and delegates to the shared `generateThreeD` kernel, writing
 * the produced .glb/.gltf into a dedicated 3D Studio output folder under the
 * app user-data directory. Returns the structured `ThreeDResult`.
 */
safeHandle('three-d-generate', async (_event, args: { name?: string; prompt?: string; imagePath?: string }) => {
  try {
    const settings = SettingsStorage.loadSettings();
    const cfg = settings?.threeD;
    if (!cfg?.enabled) return { ok: false, disabled: true, message: '3D Model Gen is disabled in Settings.' };

    const apiKey = cfg.apiKey?.trim() || undefined;
    const provider = cfg.provider === 'meshy' ? 'meshy' : 'tripo';

    const outDir = path.join(getUserDataDirectory(), STORAGE_DIRS.threeD);
    const res = await generateThreeD({
      name: args?.name || 'character',
      prompt: args?.prompt,
      imagePath: args?.imagePath,
      provider,
      apiKey,
      outDir
    });
    return res;
  } catch (err: unknown) {
    return { ok: false, message: `3D Studio generation failed: ${(err as Error).message}` };
  }
});

// ─── IPC: Voice dictation (speech-to-text) ────────────────────────────────────
// The Workspace composer's mic can transcribe recorded audio through a real STT
// model (Whisper-compatible). The renderer records audio with MediaRecorder and
// sends the raw bytes here; we resolve the provider key/base-URL selected in
// Settings → Voice, then route through the core media pipeline.
const mediaRouter = new MediaPipelineRouter();

// Register the on-device Whisper (transformers.js) transcription backend.
// When a transcription request carries `provider: 'local'`, Core's
// AudioTranscriber delegates to this instead of an HTTP endpoint.
AudioTranscriber.setLocalBackend(async (options, config) => {
  const lw = (config as any).localWhisper;
  const size = (lw?.size as any) || 'tiny';
  const device = (lw?.device as any) || 'auto';
  const cfg = (config as any) || {};
  const res = await whisperLocal.transcribe(
    Buffer.isBuffer(options.audioBuffer) ? options.audioBuffer : Buffer.from(options.audioBuffer as any),
    {
      size,
      language: (lw?.language as string) || (options.language as string) || '',
      autoDetect: lw?.autoDetect !== false,
      device,
      modelDir: (lw?.modelDir as string) || whisperLocal.defaultModelDir(),
      ...cfg
    }
  );
  return {
    id: `local_stt_${Date.now()}`,
    status: 'success' as const,
    text: res.text || '',
    provider: 'local',
    model: `whisper-${size}`,
    createdAt: Date.now()
  };
});

ipcMain.on('voice-daemon-audio-captured', async (event, args: { buffer: ArrayBuffer }) => {
  const settings = SettingsStorage.loadSettings();
  const voice = settings?.voice || {};

  let audioBuffer: Buffer;
  if (args.buffer instanceof ArrayBuffer) {
    audioBuffer = Buffer.from(new Uint8Array(args.buffer));
  } else if (Buffer.isBuffer(args.buffer)) {
    audioBuffer = args.buffer;
  } else {
    console.error('[voice-daemon] Invalid audio buffer format');
    return;
  }

  const mw = BrowserWindow.fromWebContents(event.sender);
  if (!mw || mw.isDestroyed()) return;

  try {
    const result = await mediaRouter.executeTask(
      {
        taskType: 'audio-transcription',
        audioTranscribe: {
          audioBuffer,
          filename: 'voice-typing.wav',
          model: voice.localWhisper?.enabled ? `whisper-${voice.localWhisper.size || 'tiny'}` : voice.model || 'whisper-1',
          language: voice.localWhisper?.enabled && !voice.localWhisper.autoDetect ? voice.localWhisper.language || undefined : voice.language || undefined,
          local: !!voice.localWhisper?.enabled
        }
      },
      {
        provider: voice.localWhisper?.enabled ? 'local' : (voice.providerId || 'openai'),
        apiKey: '',
        baseUrl: undefined,
        modelName: voice.localWhisper?.enabled ? `whisper-${voice.localWhisper.size}` : (voice.model || 'whisper-1'),
        localWhisper: voice.localWhisper
      } as any
    );

    const text = (result as any)?.text || '';
    if (text.trim()) {
      voiceDaemon.injectText(text);
      if (!mw.isDestroyed()) {
        mw.webContents.send('voice-daemon-event', { state: 'done', text });
      }
    } else {
      if (!mw.isDestroyed()) {
        mw.webContents.send('voice-daemon-event', { state: 'done', text: '', error: 'No speech detected' });
      }
    }
  } catch (err: any) {
    console.error('[voice-daemon] Transcription failed:', err);
    if (!mw.isDestroyed()) {
      mw.webContents.send('voice-daemon-event', { state: 'done', text: '', error: err.message || String(err) });
    }
  }
});

safeHandle('media-transcribe', async (_event, args: {
  buffer?: number[] | ArrayBuffer | Uint8Array;
  filename?: string;
  mimeType?: string;
}) => {
  const settings = SettingsStorage.loadSettings();
  const voice = settings?.voice || {};

  // Normalize the incoming audio bytes to a Node Buffer.
  let audioBuffer: Buffer;
  const raw = args?.buffer;
  if (!raw) {
    return { ok: false, error: 'No audio was captured. Try holding the mic a bit longer.' };
  }
  if (Buffer.isBuffer(raw)) {
    audioBuffer = raw;
  } else if (raw instanceof Uint8Array || (raw && typeof raw === 'object' && 'buffer' in (raw as any))) {
    const r = raw as any;
    audioBuffer = Buffer.from(r.buffer, r.byteOffset ?? 0, r.byteLength ?? r.length);
  } else if (raw instanceof ArrayBuffer) {
    audioBuffer = Buffer.from(new Uint8Array(raw));
  } else if (Array.isArray(raw)) {
    audioBuffer = Buffer.from(Uint8Array.from(raw));
  } else {
    return { ok: false, error: 'Unsupported audio payload.' };
  }
  if (audioBuffer.length === 0) {
    return { ok: false, error: 'No audio was captured. Try holding the mic a bit longer.' };
  }

  // Parse custom vocabulary/dictionary first as it may be used by the local Whisper branch.
  const dict = voice.dictionary || {};
  const dictWords: string[] = Array.isArray(dict.words)
    ? dict.words.map((w: unknown) => String(w).trim()).filter(Boolean)
    : [];
  const dictCorrections: { from: string; to: string }[] = Array.isArray(dict.corrections)
    ? dict.corrections
        .map((c: any) => ({ from: String(c?.from ?? '').trim(), to: String(c?.to ?? '').trim() }))
        .filter((c: { from: string; to: string }) => c.from && c.to)
    : [];

  // On-device Whisper branch: when the user enabled local STT, transcribe
  // in-process (transformers.js) instead of over HTTP. The custom
  // dictionary corrections are applied deterministically to the result
  // (transformers.js ASR has no OpenAI `prompt` param).
  if (voice.localWhisper?.enabled) {
    const lw = voice.localWhisper;
    const result = await mediaRouter.executeTask(
      {
        taskType: 'audio-transcription',
        audioTranscribe: {
          audioBuffer,
          filename: args?.filename || 'dictation.wav',
          model: `whisper-${lw.size}`,
          language: lw.autoDetect ? undefined : lw.language?.trim() || undefined,
          local: true
        }
      },
      {
        provider: 'local',
        apiKey: '',
        baseUrl: undefined,
        modelName: `whisper-${lw.size}`,
        localWhisper: lw
      } as any
    );

    if (result.status !== 'success' || !result.result) {
      return { ok: false, error: result.error || 'Local transcription failed.' };
    }
    let text = (result.result as { text?: string }).text || '';
    for (const c of dictCorrections) {
      if (c.from && c.to) {
        text = text.split(c.from).join(c.to);
      }
    }
    return { ok: true, text };
  }

  // Resolve the provider selected for voice from the connected providers.
  const providers = settings?.providers || [];
  const provider = providers.find((p) => p.id === voice.providerId) || providers.find((p) => p.apiKey);
  if (!provider || !provider.apiKey) {
    return {
      ok: false,
      needsSetup: true,
      error: 'No transcription model is configured. Open Settings → Voice & Mic and pick a provider + model (e.g. whisper-1).'
    };
  }

  const model = voice.model?.trim() || 'whisper-1';

  // Build an optional vocabulary-biasing prompt from the user's custom
  // dictionary. Whisper-compatible STT APIs accept a `prompt` that nudges the
  // model toward specific spellings/names and away from gibberish. Preferred
  // words seed the spelling; correction pairs describe the intended fix.
  const promptParts: string[] = [];
  if (dictWords.length > 0) {
    promptParts.push(`Use these spellings: ${dictWords.join(', ')}.`);
  }
  if (dictCorrections.length > 0) {
    promptParts.push(
      dictCorrections.map((c) => `Replace "${c.from}" with "${c.to}".`).join(' ')
    );
  }
  const vocabPrompt = promptParts.join(' ').trim();

  const result = await mediaRouter.executeTask(
    {
      taskType: 'audio-transcription',
      audioTranscribe: {
        audioBuffer,
        filename: args?.filename || 'dictation.webm',
        model,
        language: voice.language?.trim() || undefined,
        prompt: vocabPrompt || undefined,
        responseFormat: 'json'
      }
    },
    {
      provider: (provider.id as any) || 'openai',
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl || undefined,
      modelName: model
    }
  );

  if (result.status !== 'success' || !result.result) {
    return { ok: false, error: result.error || 'Transcription failed.' };
  }
  const text = (result.result as { text?: string }).text || '';
  return { ok: true, text };
});

// ─── IPC: Local Whisper (transformers.js) management ───────────────
safeHandle('whisper-local-status', (_event, args: { size?: string; modelDir?: string }) => {
  try {
    const size = (args?.size as any) || 'tiny';
    const dir = args?.modelDir || whisperLocal.defaultModelDir();
    return { ok: true, status: whisperLocal.getStatus(size, dir) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

safeHandle('whisper-local-download', async (event, args: { size?: string; modelDir?: string }) => {
  try {
    const size = (args?.size as any) || 'tiny';
    const dir = args?.modelDir || whisperLocal.defaultModelDir();
    await whisperLocal.download(size, dir, (progress: number, statusText: string) => {
      try { event.sender?.send('whisper-local-progress', { size, progress, statusText }); } catch { /* noop */ }
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

safeHandle('whisper-local-delete', async (_event, args: { size?: string; modelDir?: string }) => {
  try {
    const size = (args?.size as any) || 'tiny';
    const dir = args?.modelDir || whisperLocal.defaultModelDir();
    await whisperLocal.deleteModel(size, dir);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

safeHandle('whisper-local-setdir', (_event, args: { dir: string }) => {
  try {
    const res = whisperLocal.validateModelDir(args?.dir || '');
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, modelDir: args.dir };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

safeHandle('three-d-list-models', async () => {
  try {
    const outDir = path.join(getUserDataDirectory(), STORAGE_DIRS.threeD);
    if (!fs.existsSync(outDir)) {
      return [];
    }
    const files = fs.readdirSync(outDir);
    const list = files
      .filter(f => f.endsWith('.glb') || f.endsWith('.gltf'))
      .map(f => {
        const fullPath = path.join(outDir, f);
        const stats = fs.statSync(fullPath);
        const parsed = path.parse(f);
        return {
          name: parsed.name,
          path: fullPath,
          format: parsed.ext.replace('.', ''),
          size: stats.size,
          modified: stats.mtimeMs
        };
      });
    return list;
  } catch (err: any) {
    return [];
  }
});

safeHandle('three-d-delete-model', async (_event, args: { filePath: string }) => {
  try {
    const outDir = path.join(getUserDataDirectory(), STORAGE_DIRS.threeD);
    const targetPath = args.filePath;
    // Basic validation to prevent arbitrary file deletion outside 3d-studio
    if (!targetPath.startsWith(outDir)) {
      return { ok: false, message: 'Invalid target path.' };
    }
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return { ok: true };
    }
    return { ok: false, message: 'File not found.' };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
});

safeHandle('three-d-import-external-model', async () => {
  try {
    const win = windowManager.getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import 3D Model',
      properties: ['openFile'],
      filters: [{ name: '3D Model', extensions: ['glb', 'gltf'] }]
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, path: null };
    
    const sourcePath = result.filePaths[0];
    const outDir = path.join(getUserDataDirectory(), STORAGE_DIRS.threeD);
    fs.mkdirSync(outDir, { recursive: true });
    
    const parsed = path.parse(sourcePath);
    const destPath = path.join(outDir, parsed.base);
    
    fs.copyFileSync(sourcePath, destPath);
    
    return {
      ok: true,
      path: destPath,
      name: parsed.name
    };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
});

/**
 * Opens a native folder picker so the user can choose a 3D model folder (one that
 * contains an `index.ts`/`index.js` exporting a `Character` class) to attach to a
 * Partner. Returns the chosen absolute path (or null if cancelled). The copy +
 * compile + manifest update happens in 'partner-import-model-folder'.
 */
safeHandle('partner-pick-model-folder', async () => {
  try {
    const win = windowManager.getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a 3D model folder',
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

/**
 * Imports a 3D model *folder* into a Partner: copies the folder verbatim into the
 * Partner's `src/<name>/` directory, compiles any TypeScript (`index.ts`) to JS in
 * place with esbuild (leaving model binaries untouched), records the folder in the
 * manifest as `modelFolder`, and — if this is the active Partner — re-pushes it to
 * the running pet. The authored `Character` class may load a .vrm/.glb/.gltf from
 * inside the folder, so all three formats are supported.
 */
safeHandle('partner-import-model-folder', async (_event, { id, sourcePath }: { id: string; sourcePath: string }) => {
  try {
    if (!id || !sourcePath) return { error: 'Missing partner id or folder path.' };
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
      return { error: 'Selected path is not a folder.' };
    }

    const hasTs = fs.existsSync(path.join(sourcePath, 'index.ts'));
    const hasJs = fs.existsSync(path.join(sourcePath, 'index.js'));
    if (!hasTs && !hasJs) {
      return { error: 'Folder must contain an index.ts or index.js exporting a Character class.' };
    }

    const folder = PartnerStore.partnerFolderPath(getUserDataDirectory(), id);
    if (!fs.existsSync(folder)) return { error: 'Partner folder not found.' };

    // Sanitize the folder name (basename of the chosen folder) into a safe slug.
    const rawName = path.basename(sourcePath);
    const folderName = rawName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
    const dest = path.join(folder, 'src', folderName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(sourcePath, dest, { recursive: true });

    // Compile TypeScript to JS in place (esbuild bundles the folder's own relative
    // imports and leaves binary assets untouched). Already-compiled folders
    // (index.js only) skip this step.
    //
    // `three` / `three-vrm` must NOT be bundled: the pet scene and the user model
    // have to share ONE THREE instance (otherwise `scene.add(model.object)` and
    // `instanceof` checks break). But the compiled module lives in `userData`,
    // far outside the app tree, so a bare `require('three')` there cannot resolve.
    // The plugin below externalizes those imports to ABSOLUTE paths into the app's
    // own node_modules, so they resolve from anywhere AND hit the single cached
    // instance the pet already loaded.
    if (hasTs) {
      const esbuild = require('esbuild');
      const externalizeThree = {
        name: 'externalize-three',
        setup(build: any) {
          build.onResolve({ filter: /^three(-vrm)?($|\/)/ }, (args: any) => {
            try {
              return { path: require.resolve(args.path), external: true };
            } catch {
              return { path: args.path, external: true };
            }
          });
        }
      };
      await esbuild.build({
        entryPoints: [path.join(dest, 'index.ts')],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'es2022',
        outfile: path.join(dest, 'index.js'),
        plugins: [externalizeThree],
        logLevel: 'silent'
      });
    }

    // Read, patch, and rewrite the manifest with the model folder path.
    const manifestPath = path.join(folder, 'partner.json');
    const manifest = PartnerStore.getPartner(getUserDataDirectory(), id);
    if (!manifest) return { error: 'Partner manifest not found.' };
    const modelFolder = `src/${folderName}`;
    manifest.modelFolder = modelFolder;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const modelFolderPath = path.join(dest, 'index.js');
    // Drop any cached copy so a re-import picks up the new module.
    try { delete require.cache[require.resolve(modelFolderPath)]; } catch { /* not cached */ }

    // If this is the active Partner, refresh the running pet immediately.
    const activeId = PartnerStore.getActivePartner(getUserDataDirectory());
    if (activeId === id) {
      petWindowManager.setPartner(
        manifest as any,
        resolvePartnerModelPath(manifest),
        resolvePartnerVrmPath(manifest),
        resolvePartnerScriptPath(manifest),
        resolvePartnerModelFolderPath(manifest)
      );
    }

    return { ok: true, modelFolder };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

/**
 * Resolves the absolute filesystem path to a Partner's 3D model file (if any),
 * so the pet renderer can load it directly via file:// . Returns null when the
 * Partner has no `model` field, or the file doesn't exist on disk (e.g. a
 * built-in Partner without an on-disk folder, or a missing asset).
 */
function resolvePartnerModelPath(manifest: any): string | null {
  const model = manifest && typeof manifest.model === 'string' ? manifest.model : null;
  if (!model) return null;
  const id = manifest && typeof manifest.id === 'string' ? manifest.id : null;
  if (!id) return null;
  // The built-in Lily ships its 3D model inside the app's own `models/` tree
  // (not under userData), so resolve it from the install location — mirroring
  // how its old `script` field was resolved. This lets the real `girl_*.glb`
  // load without first installing Lily into userData.
  if (id === 'lily' && (model.startsWith('models/') || model.startsWith('dist/'))) {
    const fromInstall = path.join(__dirname, '..', model);
    if (fs.existsSync(fromInstall)) return fromInstall;
    const alt = path.join(__dirname, model);
    if (fs.existsSync(alt)) return alt;
  }
  const folder = PartnerStore.partnerFolderPath(getUserDataDirectory(), id);
  const full = path.join(folder, model);
  return fs.existsSync(full) ? full : null;
}

/** Like resolvePartnerModelPath but for a VRM character file (`vrm` field). */
function resolvePartnerVrmPath(manifest: any): string | null {
  const vrm = manifest && typeof manifest.vrm === 'string' ? manifest.vrm : null;
  if (!vrm) return null;
  const id = manifest && typeof manifest.id === 'string' ? manifest.id : null;
  if (!id) return null;
  const folder = PartnerStore.partnerFolderPath(getUserDataDirectory(), id);
  const full = path.join(folder, vrm);
  return fs.existsSync(full) ? full : null;
}

function resolvePartnerScriptPath(manifest: any): string | null {
  const script = manifest && typeof manifest.script === 'string' ? manifest.script : null;
  if (!script) return null;
  const id = manifest && typeof manifest.id === 'string' ? manifest.id : null;
  if (!id) return null;
  const folder = PartnerStore.partnerFolderPath(getUserDataDirectory(), id);
  const full = path.join(folder, script);
  return fs.existsSync(full) ? full : null;
}

/**
 * Resolves the optional `faceOverlay` flag for a Partner (drives a procedural
 * face on non-VRM GLB/glTF models so expressions still read).
 */
function resolvePartnerFaceOverlay(manifest: any): boolean | { headFrac?: number; frontGap?: number; scale?: number } | null {
  const fo = manifest && manifest.faceOverlay !== undefined ? manifest.faceOverlay : null;
  return fo ?? null;
}

/**
 * Like the other resolvers but for a folder-based 3D model: returns the absolute
 * path to the folder's compiled `index.js` (or `index.ts` if not yet compiled), or
 * null when the Partner has no `modelFolder` field / the folder is missing.
 */
function resolvePartnerModelFolderPath(manifest: any): string | null {
  const modelFolder = manifest && typeof manifest.modelFolder === 'string' ? manifest.modelFolder : null;
  if (!modelFolder) return null;
  const id = manifest && typeof manifest.id === 'string' ? manifest.id : null;
  if (!id) return null;
  const folder = PartnerStore.partnerFolderPath(getUserDataDirectory(), id);
  const jsPath = path.join(folder, modelFolder, 'index.js');
  if (fs.existsSync(jsPath)) return jsPath;
  const tsPath = path.join(folder, modelFolder, 'index.ts');
  return fs.existsSync(tsPath) ? tsPath : null;
}

// ─── IPC: 3D desktop Partner overlay window ─────────────────────────────────
// The pet renderer (separate transparent window) talks back via these channels;
// the app shell pushes the active Partner + visibility here.

['pet-ready', 'pet-drag-start', 'pet-drag-delta', 'pet-drag-end', 'pet-resize-delta', 'pet-behavior', 'pet-mood'].forEach((channel) => {
  safeOn(channel, (_event, payload) => {
    if (channel === 'pet-mood') {
      petWindowManager.setMood(payload);
    } else {
      petWindowManager.handleRendererMessage(channel, payload);
    }
  });
});

safeHandle('pet-set-partner', (_event, manifest) => {
  const modelPath = manifest ? resolvePartnerModelPath(manifest) : null;
  const vrmPath = manifest ? resolvePartnerVrmPath(manifest) : null;
  const scriptPath = manifest ? resolvePartnerScriptPath(manifest) : null;
  const modelFolderPath = manifest ? resolvePartnerModelFolderPath(manifest) : null;
  const faceOverlay = manifest ? resolvePartnerFaceOverlay(manifest) : null;
  petWindowManager.setPartner(manifest, modelPath, vrmPath, scriptPath, modelFolderPath, faceOverlay);
  return { ok: true };
});

safeHandle('pet-say', (_event, text: string) => {
  petWindowManager.say(text);
  return { ok: true };
});

// The pet window has no own toast UI; it forwards its errors here so they surface
// as a desktop toast in the main app.
safeOn('pet-error', (_event, payload: { context?: string; message?: string }) => {
  if (payload?.message) {
    logError('pet:' + (payload.context || ''), payload.message);
  }
});

// ── Manual start / stop of the single 3D pet (never auto-starts) ─────────────

/** Notifies the main window whenever the pet's running state changes. */
function broadcastPetRunning(): void {
  const mw = windowManager.getMainWindow();
  mw?.webContents.send('pet-running', petWindowManager.isRunning());
}

/** Ctrl+Q closes the running pet (registered only while it's up). */
function registerPetQuitShortcut(): void {
  try {
    globalShortcut.register('CommandOrControl+Q', () => stopPet());
  } catch {
    /* ignore registration failures */
  }
}

/** Launches the single pet with the active Partner. No-op if already running. */
function startPet(): boolean {
  if (!petWindowManager.enabled) return false;
  if (petWindowManager.isRunning()) return true; // only one at a time
  const activeId = PartnerStore.getActivePartner(getUserDataDirectory());
  if (activeId) {
    const manifest = PartnerStore.getPartner(getUserDataDirectory(), activeId);
    if (manifest) {
      petWindowManager.setPartner(
        manifest as any,
        resolvePartnerModelPath(manifest),
        resolvePartnerVrmPath(manifest),
        resolvePartnerScriptPath(manifest),
        resolvePartnerModelFolderPath(manifest)
      );
    }
  }
  petWindowManager.create();
  registerPetQuitShortcut();
  broadcastPetRunning();
  return petWindowManager.isRunning();
}

/** Closes the pet and releases the Ctrl+Q shortcut. */
function stopPet(): void {
  petWindowManager.destroy();
  globalShortcut.unregister('CommandOrControl+Q');
  broadcastPetRunning();
}

safeHandle('pet-start', () => {
  startPet();
  return { running: petWindowManager.isRunning() };
});

safeHandle('pet-stop', () => {
  stopPet();
  return { running: petWindowManager.isRunning() };
});

safeHandle('pet-status', () => {
  return { running: petWindowManager.isRunning(), enabled: petWindowManager.enabled };
});

safeHandle('pet-set-visible', (_event, visible: boolean) => {
  petWindowManager.setVisible(Boolean(visible));
  return { ok: true };
});

// ─── IPC: Self-hosted Web App (start / stop / status / password) ─────────────
// The Desktop app can host the same web server the @superagent/web package runs
// (e.g. to let other devices on the LAN open SuperAgent in a browser). The
// server is launched as a child Node process via core's shared `startWebServer`
// helper — identical to the CLI `superagent --start-web` path.

/**
 * Starts the web server on the requested port (default 3000). If one is already
 * running it is left untouched (the renderer toggles Start/Stop instead of
 * restarting). Returns the running status so the UI can refresh immediately.
 */
safeHandle('web-start', (_event, { port }: { port?: number } = {}) => {
  // Cross-process guard: a server started by the CLI (or standalone) also counts.
  if (isWebServerRunning()) {
    const lock = readWebServerLock();
    return {
      ok: true,
      alreadyRunning: true,
      running: true,
      port: lock?.port ?? port,
      startedBy: lock?.startedBy ?? 'standalone'
    };
  }
  const resolvedPort = Number(port) || 3000;
  try {
    startWebServer({ port: resolvedPort, startedBy: 'desktop' });
  } catch (err) {
    // Lost a race with another surface that started between the check and here.
    if (err instanceof WebServerAlreadyRunningError) {
      return {
        ok: true,
        alreadyRunning: true,
        running: true,
        port: err.lock.port,
        startedBy: err.lock.startedBy
      };
    }
    return { ok: false, running: false, error: err instanceof Error ? err.message : String(err) };
  }
  // Persist the chosen port so Settings + auto-start agree.
  try {
    const settings = SettingsStorage.loadSettings();
    SettingsStorage.saveSettings({ ...settings, webApp: { ...settings.webApp, port: resolvedPort } });
  } catch {
    /* settings persistence is best-effort */
  }
  return { ok: true, running: true, port: resolvedPort };
});

/** Stops the web server child process if running. */
safeHandle('web-stop', () => {
  stopWebServer();
  return { ok: true, running: false };
});

/** Reports whether the web server is currently running and on which port/host. */
/** Helper to determine the local machine's primary non-internal IPv4 address (e.g. Wi-Fi / LAN IP). */
function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const info of list || []) {
      if ((String(info.family) === 'IPv4' || String(info.family) === '4') && !info.internal) {
        return info.address;
      }
    }
  }
  return 'localhost';
}

safeHandle('web-status', () => {
  const running = isWebServerRunning();
  // Prefer the live lock (authoritative port + who started it — could be the
  // CLI). Fall back to the persisted Web App setting, then env/default.
  const lock = readWebServerLock();
  let port = Number(process.env.PORT) || 3000;
  try {
    const saved = SettingsStorage.loadSettings().webApp?.port;
    if (saved) port = saved;
  } catch {
    /* ignore */
  }
  if (lock?.port) port = lock.port;
  const localIp = getLocalIpAddress();
  return {
    running,
    port,
    url: `http://localhost:${port}`,
    lanUrl: `http://${localIp}:${port}`,
    startedBy: running ? lock?.startedBy ?? 'standalone' : null
  };
});

/**
 * Changes the Web App admin password. The web server shares core's AuthStore
 * with the Desktop app, so updating it here immediately affects the web login.
 * Requires the current password (the default is "admin" before any is set).
 */
safeHandle('web-change-password', (_event, { current, next }: { current?: string; next?: string } = {}) => {
  if (!next || next.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters.' };
  }
  const result = AuthStore.changePassword(current ?? '', next);
  if (!result.ok) {
    return { ok: false, error: result.error || 'Failed to change password.' };
  }
  return { ok: true };
});

// ─── IPC: Auto-detect local providers on startup ─────────────────────────────
// Delegates to core's ProviderAutoDetector (shared with the Web server) so both
// surfaces discover providers identically.

safeHandle('auto-detect-providers', async () => {
  return ProviderAutoDetector.detect();
});

// ─── Circle-to-Search Overlay Logic ───────────────────────────────────────────

let circleSearchWin: BrowserWindow | null = null;

function getCircleSearchShortcut(): string {
  try {
    const settings = SettingsStorage.loadSettings();
    return settings.circleSearch?.shortcut || 'CommandOrControl+Shift+Space';
  } catch {
    return 'CommandOrControl+Shift+Space';
  }
}

function isCircleSearchEnabled(): boolean {
  try {
    const settings = SettingsStorage.loadSettings();
    return !!settings.circleSearch?.enabled;
  } catch {
    return false;
  }
}

function registerCircleSearchShortcut(): void {
  if (!isCircleSearchEnabled()) return;
  try {
    const shortcut = getCircleSearchShortcut();
    globalShortcut.register(shortcut, () => {
      showCircleSearch();
    });
  } catch (err) {
    console.error('[circle-search] Failed to register global shortcut:', err);
  }
}

function showCircleSearch(): void {
  if (!circleSearchWin || circleSearchWin.isDestroyed()) {
    circleSearchWin = windowManager.createCircleSearchWindow();
    const htmlPath = path.join(app.getAppPath(), 'dist', 'circle-search.html');
    circleSearchWin.loadFile(htmlPath);
  } else {
    circleSearchWin.show();
  }
  circleSearchWin.webContents.send('circle-search-window-shown');
}

function hideCircleSearch(): void {
  if (circleSearchWin && !circleSearchWin.isDestroyed()) {
    circleSearchWin.hide();
  }
}

safeHandle('circle-search-get-screen-image', async () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width), height: Math.round(height) }
  });
  
  if (sources.length > 0) {
    return sources[0].thumbnail.toDataURL();
  }
  throw new Error('No screen capture sources found');
});

// Submit query + image selection to active provider and stream chunks
ipcMain.on('circle-search-submit', async (event, args: { query: string; image: string }) => {
  const targetWin = BrowserWindow.fromWebContents(event.sender);
  if (!targetWin || targetWin.isDestroyed()) return;

  try {
    await streamVisionQuery(args.query, args.image, (text) => {
      if (!targetWin.isDestroyed()) {
        targetWin.webContents.send('circle-search-stream-chunk', { text });
      }
    });
    if (!targetWin.isDestroyed()) {
      targetWin.webContents.send('circle-search-stream-chunk', { done: true });
    }
  } catch (err: any) {
    console.error('[circle-search] Query failed:', err);
    if (!targetWin.isDestroyed()) {
      targetWin.webContents.send('circle-search-stream-chunk', { error: err.message || String(err) });
    }
  }
});

safeOn('circle-search-hide', () => {
  hideCircleSearch();
});

// Unified vision streaming query helper for main process
async function streamVisionQuery(
  query: string,
  imageBase64: string,
  onChunk: (text: string) => void
): Promise<void> {
  const settings = SettingsStorage.loadSettings();
  const providers = settings.providers || [];
  const activeProvider = providers.find(p => p.apiKey) || providers.find(p => p.id === 'ollama');
  const activeModelSetting = settings.models?.find(m => m.enabled && m.providerId === activeProvider?.id);

  if (!activeProvider) {
    throw new Error('No API key configured. Open Settings → Provider and add a key.');
  }

  const providerId = activeProvider.id;
  const modelName = activeModelSetting ? activeModelSetting.id.replace(`${providerId}-`, '') : 'gpt-4o';
  const apiKey = activeProvider.apiKey || '';
  const baseUrl = activeProvider.baseUrl;

  const family = resolveProviderFamily(providerId);

  let mimeType = 'image/jpeg';
  let base64Data = imageBase64;
  if (imageBase64.includes(';base64,')) {
    const parts = imageBase64.split(';base64,');
    mimeType = parts[0].replace('data:', '');
    base64Data = parts[1];
  }

  if (family === 'gemini') {
    const host = resolveBaseUrl('google', baseUrl).replace(/\/+$/, '');
    const targetModel = activeModelSetting?.id.includes('gemini') ? modelName : 'gemini-2.0-flash';
    const url = `${host}/v1beta/models/${targetModel}:streamGenerateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: query },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No body reader');

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned.startsWith('//') || !cleaned) continue;
        try {
          let jsonStr = cleaned;
          if (cleaned.startsWith('[') || cleaned.startsWith(',')) {
            jsonStr = cleaned.slice(1);
          }
          if (jsonStr.endsWith(']')) {
            jsonStr = jsonStr.slice(0, -1);
          }
          const parsed = JSON.parse(jsonStr);
          const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunkText) onChunk(chunkText);
        } catch { /* ignore */ }
      }
    }
  } else if (family === 'anthropic') {
    const host = resolveBaseUrl('anthropic', baseUrl).replace(/\/v1\/?$/, '');
    const url = `${host}/v1/messages`;
    const targetModel = activeModelSetting?.id.includes('claude') ? modelName : 'claude-3-5-sonnet-20241022';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model: targetModel,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Data
              }
            },
            {
              type: 'text',
              text: query
            }
          ]
        }],
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No body reader');

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned.startsWith('data:')) {
          const dataStr = cleaned.slice(5).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              onChunk(parsed.delta.text);
            }
          } catch { /* ignore */ }
        }
      }
    }
  } else {
    const host = resolveBaseUrl(providerId, baseUrl);
    const url = `${host}/chat/completions`;
    const targetModel = modelName;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: query },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`
              }
            }
          ]
        }],
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error: ${errText || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No body reader');

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned.startsWith('data:')) {
          const dataStr = cleaned.slice(5).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            const chunkText = parsed.choices?.[0]?.delta?.content;
            if (chunkText) onChunk(chunkText);
          } catch { /* ignore */ }
        }
      }
    }
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

function initApp() {
  const mainWindow = windowManager.createMainWindow();
  mainWindow.loadFile(path.join(__dirname, 'ui.html'));
}

function setupDevWatcher() {
  const isDev = process.argv.includes('--dev');
  if (!isDev) return;

  const watchPath = path.join(__dirname, 'renderer');
  const cssPath = path.join(__dirname, 'index.css');
  const htmlPath = path.join(__dirname, 'ui.html');

  let reloadTimeout: NodeJS.Timeout | null = null;
  const reloadWindow = () => {
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      const mainWindow = windowManager.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reload();
      }
    }, 100);
  };

  // Watch renderer directory
  if (fs.existsSync(watchPath)) {
    fs.watch(watchPath, { recursive: true }, reloadWindow);
  }
  // Watch CSS file
  if (fs.existsSync(cssPath)) {
    fs.watch(cssPath, reloadWindow);
  }
  // Watch HTML file
  if (fs.existsSync(htmlPath)) {
    fs.watch(htmlPath, reloadWindow);
  }
}

app.whenReady().then(async () => {
  // Lock down the renderer with a Content-Security-Policy. Because every window
  // is context-isolated and loads only our bundled, same-origin assets, a strict
  // policy is safe and meaningfully raises the bar on any XSS that slips through.
  // `webRequest.onHeadersReceived` lets us attach it to each navigation/document
  // response (the <meta> approach is ignored once a header is present).
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
  ].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    // Only clamp the top-level document; sub-resources inherit the policy.
    if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
      (headers as Record<string, string | string[]>)['Content-Security-Policy'] = CSP;
    }
    callback({ cancel: false, responseHeaders: headers });
  });

  // Cleanup outdated partner directories to ensure Lily and Waifu are merged
  try {
    const petsDir = path.join(getUserDataDirectory(), STORAGE_DIRS.partners);
    ['waifu', 'pixel', 'byte', 'nova'].forEach((oldId) => {
      const dir = path.join(petsDir, oldId);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
    // Also reset active partner if it was one of the outdated ones
    const activeFile = path.join(petsDir, 'active.json');
    if (fs.existsSync(activeFile)) {
      const activeData = JSON.parse(fs.readFileSync(activeFile, 'utf-8'));
      if (activeData && (activeData.id === 'waifu' || activeData.id === 'pixel' || activeData.id === 'byte' || activeData.id === 'nova')) {
        fs.writeFileSync(activeFile, JSON.stringify({ id: 'lily' }), 'utf-8');
      }
    }
  } catch (e) {
    console.error('Failed to cleanup outdated pets:', e);
  }

  initApp();
  setupDevWatcher();
  registerCircleSearchShortcut();
  voiceDaemon.init();

  // NOTE: we deliberately do NOT warm up the local Whisper model at
  // startup. `whisperLocal.warmup` loads the ~900 MB ONNX model
  // into a worker thread unconditionally, so enabling local voice typing
  // was pinning ~1 GB of RAM from launch — even for users who
  // never dictate. Transcription already loads the model lazily on the
  // first `transcribe` call (see `whisper-local.ts`), and the worker
  // self-unloads after 5 min idle (`IDLE_UNLOAD_MS`), so the
  // model is "load when needed, offload when done" with zero resident
  // cost at idle.

  // Auto-start the self-hosted Web App if the user enabled it in
  // Settings → Web App. Launched shortly after boot so the main window is up
  // first; failures are logged but never block startup.
  try {
    const webSettings = SettingsStorage.loadSettings().webApp;
    if (webSettings?.autoStart) {
      setTimeout(() => {
        try {
          if (!isWebServerRunning()) {
            startWebServer({ port: webSettings.port || 3000, startedBy: 'desktop' });
            console.log('[web] Auto-started the Web App (port ' + (webSettings.port || 3000) + ').');
          }
        } catch (e) {
          console.error('[web] Auto-start failed:', e);
        }
      }, 1500);
    }
  } catch {
    /* settings read is best-effort */
  }

  // NOTE: the 3D Partner does NOT auto-start. The user launches it manually from
  // the Partner page or Settings → Pets (see startPet / the 'pet-start' IPC).
  // Once running, Ctrl+Q closes it and it stays closed until started again.
  // Debug/dev convenience: SUPERAGENT_PET_AUTOSTART=1 (or PET_DEBUG) launches it.
  if (process.env.SUPERAGENT_PET_AUTOSTART === '1' || process.env.SUPERAGENT_PET_DEBUG === '1') {
    setTimeout(() => startPet(), 1200);
  }

  // Auto-update check (no-ops in dev where electron-updater isn't installed).
  setupAutoUpdater();

  // Orchestrator startup instructions auto-update check
  try {
    const settings = SettingsStorage.loadSettings();
    if ((settings.orchestrator || settings.modelGov)?.autoUpdateInstructions) {
      OrchestratorStorage.autoUpdateInstructions().catch(e => console.error('Orchestrator instructions auto-update failed:', e));
    }
  } catch (e) {
    // Ignore settings errors at startup
  }

  // Initialize Artifact Micro-App Engine & System Tray Popover Card
  void artifactManager.scanArtifacts();
  if (systemTrayManager.initTray()) {
    systemTrayManager.on('click', () => {
      const trayInst = systemTrayManager.getTrayInstance();
      if (trayInst) {
        systemTrayCardWindow.toggle(trayInst);
      }
    });
  }

  artifactManager.on('stateChanged', (state) => {
    const cardWin = systemTrayCardWindow.getOrCreateWindow();
    if (cardWin && !cardWin.isDestroyed()) {
      cardWin.webContents.send('artifact:stateChanged', state);
    }
  });

  safeHandle('artifact:list', async () => {
    return await artifactManager.scanArtifacts();
  });

  safeHandle('artifact:start', async (_, id: string) => {
    return await artifactManager.startArtifact(id);
  });

  safeHandle('artifact:stop', async (_, id: string) => {
    return await artifactManager.stopArtifact(id);
  });

  safeHandle('artifact:open', async (_, id: string) => {
    let state = artifactManager.getArtifactState(id);
    if (!state || state.status !== 'running') {
      state = await artifactManager.startArtifact(id);
    }
    if (!state.url) {
      throw new Error(`Artifact "${id}" url unavailable`);
    }
    artifactWinManager.openArtifactWindow({
      id: state.id,
      title: state.manifest.name,
      url: String(state.url)
    });
    return { success: true };
  });

  safeHandle('artifact:openFolder', async () => {
    const dir = artifactManager.getStoreDirectory();
    await shell.openPath(dir);
    return { success: true };
  });

  safeHandle('artifact:create', async (_, params: any) => {
    return await artifactManager.createArtifact(params);
  });

  app.on('activate', () => {
    if (windowManager.getAllWindows().length === 0) initApp();
  });
});

app.on('window-all-closed', () => {
  petWindowManager.destroy();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  voiceDaemon.dispose();
  void whisperLocal.freePipeline();
  void artifactManager.destroyAll();
  artifactWinManager.closeAll();
  systemTrayCardWindow.destroy();
  systemTrayManager.destroy();
});

