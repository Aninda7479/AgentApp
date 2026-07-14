import { app, ipcMain, dialog, BrowserWindow, shell, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';

// Set custom userData path to organize files in Roaming\OpenSource\AgentApp
const customUserDataPath = path.join(app.getPath('appData'), 'OpenSource', 'AgentApp');
app.setPath('userData', customUserDataPath);

import { windowManager } from './main/window';
import { setupAutoUpdater } from './main/updater';
import { readStore, writeStore, StoreData } from './main/store';
import { SettingsStorage, UsageTracker, ModelRouter, ModelGovStorage, PlaywrightBrowserEngine, ComputerUse, BrowserLifecycleService, ProviderAutoDetector, enforceNetworkAllowed, MCP_CATALOG, resolveMcpServer, getMcpCatalogEntry, PLUGIN_CATALOG } from '@superagent/core';
import { getChatDirectory } from './main/storage/index.js';
import * as PartnerStore from './main/partner-store';
import { petWindowManager } from './main/pet-window';

// Tracks context-window usage so the pet can show "dark circles" when the
// conversation approaches the model's capacity.
let petContextMax = 0;
let petContextTotal = 0;

async function getMainBrowser(): Promise<PlaywrightBrowserEngine> {
  return await BrowserLifecycleService.getSharedInstance();
}

// ─── IPC: Real AI Agent Streaming ─────────────────────────────────────────────
// Architecture matches OpenCode/Codex: streaming SSE events forwarded to renderer
// via Electron IPC (replaces HTTP SSE in desktop context)

import { AgentEngine, AgentEngineConfig, AgentEvent } from './main/ai-engine';
import { listSkills } from './main/skills';
import {
  connectServer,
  disconnectServer,
  listServers,
  callTool,
  connectedTools
} from './main/mcp-manager';


// Track active agent sessions per window: sessionId → engine
const activeSessions = new Map<string, AgentEngine>();

/**
 * agent-run: Start a new agent session or continue an existing one.
 * The engine streams events back using webContents.send('agent-event', event).
 */
ipcMain.handle('agent-run', async (event, {
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
  try {
    // Reuse or create engine
    let engine = activeSessions.get(sessionId);
    if (!engine) {
      let finalConfig = { ...config };
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
      finalConfig.extraTools = connectedTools();
      engine = new AgentEngine(finalConfig, sessionId);
      activeSessions.set(sessionId, engine);
      // Reset context-usage tracking for this run.
      petContextMax = finalConfig.maxTokens ?? 0;
      petContextTotal = 0;
    }

    const win = BrowserWindow.fromWebContents(event.sender);

    // Run agent; emit each event back to renderer
    await engine.run(prompt, (agentEvent: AgentEvent) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('agent-event', agentEvent);
        // Relay to the free-roaming 3D Partner so it reacts in real time.
        const petMood = petWindowManager.moodFromAgentEvent(agentEvent.type);
        if (petMood) petWindowManager.setMood(petMood);

        // Context-window usage → dark circles when near capacity.
        if (agentEvent.usage) {
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
    }, currentAttachments);

    // Clean up after done/error/abort
    activeSessions.delete(sessionId);
    return { success: true };

  } catch (err: unknown) {
    activeSessions.delete(sessionId);
    return { success: false, error: (err as Error).message };
  }
});

/**
 * agent-stop: Abort a running agent session.
 */
ipcMain.handle('agent-stop', (_event, sessionId: string) => {
  const engine = activeSessions.get(sessionId);
  if (engine) {
    engine.abort();
    activeSessions.delete(sessionId);
  }
  return { stopped: true };
});

/**
 * agent-list: List active session IDs.
 */
ipcMain.handle('agent-list', () => {
  return { sessions: Array.from(activeSessions.keys()) };
});

// ─── IPC: Skills discovery (for the Composer slash autocomplete) ──────────────
ipcMain.handle('skills-list', (_event, { dir }: { dir?: string }) => {
  try {
    return listSkills(dir);
  } catch {
    return [];
  }
});

// ─── IPC: MCP server connections ─────────────────────────────────────────────
ipcMain.handle('mcp-connect', async (_event, server: {
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

ipcMain.handle('mcp-disconnect', async (_event, id: string) => {
  await disconnectServer(id);
  return { success: true };
});

ipcMain.handle('mcp-list', () => listServers());

ipcMain.handle('mcp-call', async (_event, { id, tool, args }: {
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
ipcMain.handle('mcp-catalog', () => MCP_CATALOG);

ipcMain.handle('mcp-install', async (_event, { id, keys }: {
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

// ─── IPC: Built-in Plugin catalog ────────────────────────────────────────────
ipcMain.handle('plugins-catalog', () => PLUGIN_CATALOG);



// ─── IPC: Persistent Store ───────────────────────────────────────────────────

ipcMain.handle('store-read', (): StoreData => {
  return readStore();
});

ipcMain.handle('store-write', (_event, data: StoreData): void => {
  writeStore(data);
});

ipcMain.handle('settings-read', () => {
  return SettingsStorage.loadSettings();
});

ipcMain.handle('settings-write', (_event, settings) => {
  SettingsStorage.saveSettings(settings);
});

ipcMain.handle('usage-summary', () => {
  return UsageTracker.getSummary();
});

ipcMain.handle('usage-records', () => {
  return UsageTracker.loadUsage();
});

ipcMain.handle('usage-clear', () => {
  UsageTracker.clearUsage();
});

ipcMain.handle('model-gov-read-instructions', () => {
  return ModelGovStorage.loadInstructions();
});

ipcMain.handle('model-gov-write-instructions', (_event, content: string) => {
  ModelGovStorage.saveInstructions(content);
});

ipcMain.handle('model-gov-update-instructions', async () => {
  return await ModelGovStorage.autoUpdateInstructions();
});

ipcMain.handle('model-gov-optimize-instructions-by-ai', async () => {
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
});

ipcMain.handle('browser-navigate', async (_event, { url }) => {
  try {
    enforceNetworkAllowed({ kind: 'browser', url: url as string, method: 'GET' });
  } catch (err: unknown) {
    return `Blocked by Internet Access policy: ${(err as Error).message}`;
  }
  const browser = await getMainBrowser();
  const res = await browser.navigate(url);
  return `Successfully navigated to ${res.url} (HTTP status: ${res.status}). Page Title: "${res.title}"`;
});

ipcMain.handle('browser-screenshot', async (_event, { fullPage }) => {
  const browser = await getMainBrowser();
  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const screenshotPath = path.join(logsDir, `browser-screenshot-${Date.now()}.png`);
  await browser.takeScreenshot({ path: screenshotPath, fullPage: !!fullPage });
  return `Screenshot captured and saved to: ${screenshotPath}`;
});

ipcMain.handle('screenshot_screen', async () => {
  const p = await ComputerUse.takeScreenshot();
  return `Screenshot captured successfully and saved to: ${p}`;
});

ipcMain.handle('browser-close', async () => {
  await BrowserLifecycleService.closeSharedInstance();
  return 'Browser successfully shut down.';
});

// ─── IPC: App version & update checks ────────────────────────────────────────

ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-external', async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
});

/**
 * check-for-updates: Manually trigger an electron-updater update check.
 * Returns a status object. In dev (no electron-updater) or when disabled, this
 * degrades gracefully to a friendly message instead of throwing.
 */
ipcMain.handle('check-for-updates', async (): Promise<{
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

ipcMain.handle('select-project-folders', async () => {
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

ipcMain.handle('select-files', async () => {
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

ipcMain.handle('copy-file-to-chat', async (_event, { sourcePath, chatId, projectName }) => {
  const targetDir = getChatDirectory(app.getPath('userData'), chatId, projectName || undefined);

  fs.mkdirSync(targetDir, { recursive: true });
  const filename = path.basename(sourcePath);
  const destPath = path.join(targetDir, filename);
  fs.copyFileSync(sourcePath, destPath);
  return {
    filename,
    relativePath: path.relative(app.getPath('userData'), destPath),
    fullPath: destPath
  };
});

ipcMain.handle('read-file-base64', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
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

ipcMain.handle('save-chat-media-buffer', async (_event, { buffer, filename, chatId, projectName }) => {
  const targetDir = getChatDirectory(app.getPath('userData'), chatId, projectName || undefined);

  fs.mkdirSync(targetDir, { recursive: true });
  const destPath = path.join(targetDir, filename);
  fs.writeFileSync(destPath, Buffer.from(buffer));
  return {
    filename,
    relativePath: path.relative(app.getPath('userData'), destPath),
    fullPath: destPath
  };
});

// ─── IPC: Partner / Pet ecosystem (open companion import/export) ─────────────
// Reads/writes partner.json folders under <userData>/pets. The format is fully
// open: anyone can author a Partner and import it here.

ipcMain.handle('partner-list', () => {
  return PartnerStore.listPartners(app.getPath('userData'));
});

ipcMain.handle('partner-get', (_event, id: string) => {
  return PartnerStore.getPartner(app.getPath('userData'), id);
});

ipcMain.handle('partner-install', async () => {
  try {
    const win = windowManager.getMainWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a Partner folder',
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const installed = PartnerStore.installPartnerFolder(app.getPath('userData'), result.filePaths[0]);
    return installed;
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

ipcMain.handle('partner-import-json', (_event, json: string) => {
  try {
    return PartnerStore.importPartnerJson(app.getPath('userData'), json);
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
});

ipcMain.handle('partner-remove', (_event, id: string) => {
  PartnerStore.removePartner(app.getPath('userData'), id);
  return { success: true };
});

ipcMain.handle('partner-set-active', (_event, id: string | null) => {
  PartnerStore.setActivePartner(app.getPath('userData'), id);
  // Push the now-active Partner (with its resolved 3D model / VRM/script paths) to the pet.
  const manifest = id ? PartnerStore.getPartner(app.getPath('userData'), id) : null;
  const modelPath = manifest ? resolvePartnerModelPath(manifest) : null;
  const vrmPath = manifest ? resolvePartnerVrmPath(manifest) : null;
  const scriptPath = manifest ? resolvePartnerScriptPath(manifest) : null;
  petWindowManager.setPartner(manifest as any, modelPath, vrmPath, scriptPath);
  return { success: true };
});

ipcMain.handle('partner-get-active', () => {
  return PartnerStore.getActivePartner(app.getPath('userData'));
});

ipcMain.handle('partner-export', (_event, id: string) => {
  try {
    const folder = PartnerStore.partnerFolderPath(app.getPath('userData'), id);
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
ipcMain.handle('partner-pick-model-file', async () => {
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
ipcMain.handle('partner-import-model', async (_event, { id, sourcePath }: { id: string; sourcePath: string }) => {
  try {
    if (!id || !sourcePath) return { error: 'Missing partner id or model path.' };
    if (!fs.existsSync(sourcePath)) return { error: 'Model file no longer exists.' };

    const ext = path.extname(sourcePath).toLowerCase().replace('.', '');
    if (!['vrm', 'glb', 'gltf'].includes(ext)) {
      return { error: 'Unsupported model file. Use .vrm, .glb, or .gltf.' };
    }

    const folder = PartnerStore.partnerFolderPath(app.getPath('userData'), id);
    if (!fs.existsSync(folder)) return { error: 'Partner folder not found.' };

    const fileName = `character.${ext}`;
    fs.copyFileSync(sourcePath, path.join(folder, fileName));

    // Read, patch, and rewrite the manifest to point at the imported file.
    const manifestPath = path.join(folder, 'partner.json');
    const manifest = PartnerStore.getPartner(app.getPath('userData'), id);
    if (!manifest) return { error: 'Partner manifest not found.' };
    const field = ext === 'vrm' ? 'vrm' : 'model';
    manifest[field] = fileName;
    // A .glb/.gltf model takes precedence over a .vrm for the 3D pet.
    if (field === 'model') delete (manifest as any).vrm;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    // If this is the active Partner, refresh the running pet immediately.
    const activeId = PartnerStore.getActivePartner(app.getPath('userData'));
    if (activeId === id) {
      petWindowManager.setPartner(
        manifest as any,
        resolvePartnerModelPath(manifest),
        resolvePartnerVrmPath(manifest),
        resolvePartnerScriptPath(manifest)
      );
    }

    return { ok: true, model: fileName, field };
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
  const folder = PartnerStore.partnerFolderPath(app.getPath('userData'), id);
  const full = path.join(folder, model);
  return fs.existsSync(full) ? full : null;
}

/** Like resolvePartnerModelPath but for a VRM character file (`vrm` field). */
function resolvePartnerVrmPath(manifest: any): string | null {
  const vrm = manifest && typeof manifest.vrm === 'string' ? manifest.vrm : null;
  if (!vrm) return null;
  const id = manifest && typeof manifest.id === 'string' ? manifest.id : null;
  if (!id) return null;
  const folder = PartnerStore.partnerFolderPath(app.getPath('userData'), id);
  const full = path.join(folder, vrm);
  return fs.existsSync(full) ? full : null;
}

function resolvePartnerScriptPath(manifest: any): string | null {
  const script = manifest && typeof manifest.script === 'string' ? manifest.script : null;
  if (!script) return null;
  const id = manifest && typeof manifest.id === 'string' ? manifest.id : null;
  if (!id) return null;
  const folder = PartnerStore.partnerFolderPath(app.getPath('userData'), id);
  const full = path.join(folder, script);
  return fs.existsSync(full) ? full : null;
}

// ─── IPC: 3D desktop Partner overlay window ─────────────────────────────────
// The pet renderer (separate transparent window) talks back via these channels;
// the app shell pushes the active Partner + visibility here.

['pet-ready', 'pet-drag-start', 'pet-drag-delta', 'pet-drag-end', 'pet-resize-delta', 'pet-behavior', 'pet-mood'].forEach((channel) => {
  ipcMain.on(channel, (_event, payload) => {
    if (channel === 'pet-mood') {
      petWindowManager.setMood(payload);
    } else {
      petWindowManager.handleRendererMessage(channel, payload);
    }
  });
});

ipcMain.handle('pet-set-partner', (_event, manifest) => {
  const modelPath = manifest ? resolvePartnerModelPath(manifest) : null;
  const vrmPath = manifest ? resolvePartnerVrmPath(manifest) : null;
  const scriptPath = manifest ? resolvePartnerScriptPath(manifest) : null;
  petWindowManager.setPartner(manifest, modelPath, vrmPath, scriptPath);
  return { ok: true };
});

ipcMain.handle('pet-say', (_event, text: string) => {
  petWindowManager.say(text);
  return { ok: true };
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
  const activeId = PartnerStore.getActivePartner(app.getPath('userData'));
  if (activeId) {
    const manifest = PartnerStore.getPartner(app.getPath('userData'), activeId);
    if (manifest) {
      petWindowManager.setPartner(
        manifest as any,
        resolvePartnerModelPath(manifest),
        resolvePartnerVrmPath(manifest),
        resolvePartnerScriptPath(manifest)
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

ipcMain.handle('pet-start', () => {
  startPet();
  return { running: petWindowManager.isRunning() };
});

ipcMain.handle('pet-stop', () => {
  stopPet();
  return { running: petWindowManager.isRunning() };
});

ipcMain.handle('pet-status', () => {
  return { running: petWindowManager.isRunning(), enabled: petWindowManager.enabled };
});

ipcMain.handle('pet-set-visible', (_event, visible: boolean) => {
  petWindowManager.setVisible(Boolean(visible));
  return { ok: true };
});

// ─── IPC: Auto-detect local providers on startup ─────────────────────────────
// Delegates to core's ProviderAutoDetector (shared with the Web server) so both
// surfaces discover providers identically.

ipcMain.handle('auto-detect-providers', async () => {
  return ProviderAutoDetector.detect();
});

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
  // Cleanup outdated partner directories to ensure Lily and Waifu are merged
  try {
    const petsDir = path.join(app.getPath('userData'), 'pets');
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
  // NOTE: the 3D Partner does NOT auto-start. The user launches it manually from
  // the Partner page or Settings → Pets (see startPet / the 'pet-start' IPC).
  // Once running, Ctrl+Q closes it and it stays closed until started again.
  // Debug/dev convenience: SUPERAGENT_PET_AUTOSTART=1 (or PET_DEBUG) launches it.
  if (process.env.SUPERAGENT_PET_AUTOSTART === '1' || process.env.SUPERAGENT_PET_DEBUG === '1') {
    setTimeout(() => startPet(), 1200);
  }

  // Auto-update check (no-ops in dev where electron-updater isn't installed).
  setupAutoUpdater();

  // Model Gov startup instructions auto-update check
  try {
    const settings = SettingsStorage.loadSettings();
    if (settings.modelGov?.autoUpdateInstructions) {
      ModelGovStorage.autoUpdateInstructions().catch(e => console.error('Model Gov instructions auto-update failed:', e));
    }
  } catch (e) {
    // Ignore settings errors at startup
  }

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
});
