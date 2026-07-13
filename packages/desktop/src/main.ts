import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

// Set custom userData path to organize files in Roaming\OpenSource\AgentApp
const customUserDataPath = path.join(app.getPath('appData'), 'OpenSource', 'AgentApp');
app.setPath('userData', customUserDataPath);

import { windowManager } from './main/window';
import { readStore, writeStore, StoreData } from './main/store';
import { SettingsStorage, UsageTracker, ModelRouter, ModelGovStorage, PlaywrightBrowserEngine, ComputerUse, BrowserLifecycleService } from '@superagent/core';
import { getChatDirectory } from './main/storage/index.js';

async function getMainBrowser(): Promise<PlaywrightBrowserEngine> {
  return await BrowserLifecycleService.getSharedInstance();
}
import https from 'https';
import http from 'http';

// ─── IPC: Real AI Agent Streaming ─────────────────────────────────────────────
// Architecture matches OpenCode/Codex: streaming SSE events forwarded to renderer
// via Electron IPC (replaces HTTP SSE in desktop context)

import { AgentEngine, AgentEngineConfig, AgentEvent } from './main/ai-engine';


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
      engine = new AgentEngine(finalConfig, sessionId);
      activeSessions.set(sessionId, engine);
    }

    const win = BrowserWindow.fromWebContents(event.sender);

    // Run agent; emit each event back to renderer
    await engine.run(prompt, (agentEvent: AgentEvent) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('agent-event', agentEvent);
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

// ─── IPC: Auto-detect local providers on startup ─────────────────────────────

ipcMain.handle('auto-detect-providers', async () => {
  const detected: Array<{
    id: string;
    name: string;
    type: 'env' | 'key' | 'custom';
    apiKey: string;
    baseUrl: string;
    models: Array<{ id: string; name: string }>;
  }> = [];

  // 1. Check for local Ollama
  try {
    const ollamaModels = await fetchJson('http://localhost:11434/api/tags');
    if (ollamaModels?.models?.length) {
      detected.push({
        id: 'ollama',
        name: 'Ollama (Local)',
        type: 'custom',
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        models: (ollamaModels.models as any[]).map((m: any) => ({
          id: m.name,
          name: m.name
        }))
      });
    }
  } catch {
    // Ollama not running — skip silently
  }

  // 2. Check env vars for cloud providers
  const envProviders: Array<{
    id: string;
    name: string;
    envKey: string;
    modelsUrl: string;
    authHeader: (key: string) => Record<string, string>;
    parseModels: (data: any) => Array<{ id: string; name: string }>;
  }> = [
    {
      id: 'chatgpt',
      name: 'OpenAI (ChatGPT)',
      envKey: 'OPENAI_API_KEY',
      modelsUrl: 'https://api.openai.com/v1/models',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d) => (d?.data ?? []).map((m: any) => ({ id: m.id, name: m.id }))
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      envKey: 'DEEPSEEK_API_KEY',
      modelsUrl: 'https://api.deepseek.com/models',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d) => (d?.data ?? []).map((m: any) => ({ id: m.id, name: m.id }))
    },
    {
      id: 'deepinfra',
      name: 'DeepInfra',
      envKey: 'DEEPINFRA_API_KEY',
      modelsUrl: 'https://api.deepinfra.com/v1/models',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d) => {
        const list = Array.isArray(d) ? d : (d?.data ?? []);
        return list.map((m: any) => ({ id: m.model_name ?? m.id, name: m.model_name ?? m.id }));
      }
    },
    {
      id: 'google',
      name: 'Google Gemini',
      envKey: 'GEMINI_API_KEY',
      modelsUrl: '', // uses key in query param — handled below
      authHeader: (_k) => ({}),
      parseModels: (d) => (d?.models ?? []).map((m: any) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName ?? m.name
      }))
    }
  ];

  for (const prov of envProviders) {
    const apiKey = process.env[prov.envKey];
    if (!apiKey) continue;

    try {
      let data: any;
      if (prov.id === 'google') {
        data = await fetchJson(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
      } else {
        data = await fetchJson(prov.modelsUrl, prov.authHeader(apiKey));
      }
      const models = prov.parseModels(data);
      if (models.length) {
        detected.push({
          id: prov.id,
          name: prov.name,
          type: 'env',
          apiKey,
          baseUrl: '',
          models
        });
      }
    } catch {
      // Key present but API call failed — skip
    }
  }

  return detected;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
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
  initApp();
  setupDevWatcher();

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
  if (process.platform !== 'darwin') app.quit();
});
