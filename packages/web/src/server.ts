import express from 'express';
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
  getUserDataDirectory
} from '@superagent/core';

import { AgentEngine, AgentEngineConfig, AgentEvent } from './ai-engine.js';
import { readConversationStore, writeConversationStore } from './storage/conversation-store.js';
import { getChatDirectory } from './storage/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Setup JSON parsing limit to accommodate larger buffer contents
app.use(express.json({ limit: '50mb' }));

const userDataDir = getUserDataDirectory();

// ─── VPS Authentication Gate ────────────────────────────────────────────────
const password = process.env.SUPERAGENT_PASSWORD || process.env.SUPERAGENT_WEB_PASSWORD;
if (password) {
  console.log('[Security] Exposing app with password authentication enabled.');
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.setHeader('WWW-Authenticate', 'Basic realm="SuperAgent VPS Secure Gate"');
      return res.status(401).send('Authentication required');
    }
    const [type, credentials] = authHeader.split(' ');
    if (type && type.toLowerCase() === 'basic' && credentials) {
      const decoded = Buffer.from(credentials, 'base64').toString('utf-8');
      const parts = decoded.split(':');
      const pass = parts.length > 1 ? parts[1] : parts[0];
      if (pass === password) {
        return next();
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="SuperAgent VPS Secure Gate"');
    return res.status(401).send('Invalid credentials');
  });
} else {
  console.log('[Security Warning] Running without a password! Set SUPERAGENT_PASSWORD env variable to secure your server.');
}

// ─── WebSocket Event Hub ────────────────────────────────────────────────────
const connectedSockets = new Set<WebSocket>();

wss.on('connection', (ws) => {
  connectedSockets.add(ws);
  console.log(`[WebSocket] Client connected. Active clients: ${connectedSockets.size}`);
  
  ws.on('close', () => {
    connectedSockets.delete(ws);
    console.log(`[WebSocket] Client disconnected. Active clients: ${connectedSockets.size}`);
  });
});

function broadcast(channel: string, data: any) {
  const payload = JSON.stringify({ channel, data });
  connectedSockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

// ─── Browser Automation engine ────────────────────────────────────────────────
let mainSharedBrowser: PlaywrightBrowserEngine | null = null;
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
const activeSessions = new Map<string, AgentEngine>();

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
async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function autoDetectProviders() {
  const detected: any[] = [];
  
  // 1. Check local Ollama
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (response.ok) {
      const ollamaModels = await response.json() as any;
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
    }
  } catch {
    // Ollama not running
  }

  // 2. Env cloud providers
  const envProviders = [
    {
      id: 'chatgpt',
      name: 'OpenAI (ChatGPT)',
      envKey: 'OPENAI_API_KEY',
      modelsUrl: 'https://api.openai.com/v1/models',
      authHeader: (k: string) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d: any) => (d?.data ?? []).map((m: any) => ({ id: m.id, name: m.id }))
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      envKey: 'DEEPSEEK_API_KEY',
      modelsUrl: 'https://api.deepseek.com/models',
      authHeader: (k: string) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d: any) => (d?.data ?? []).map((m: any) => ({ id: m.id, name: m.id }))
    },
    {
      id: 'deepinfra',
      name: 'DeepInfra',
      envKey: 'DEEPINFRA_API_KEY',
      modelsUrl: 'https://api.deepinfra.com/v1/models',
      authHeader: (k: string) => ({ Authorization: `Bearer ${k}` }),
      parseModels: (d: any) => {
        const list = Array.isArray(d) ? d : (d?.data ?? []);
        return list.map((m: any) => ({ id: m.model_name ?? m.id, name: m.model_name ?? m.id }));
      }
    },
    {
      id: 'google',
      name: 'Google Gemini',
      envKey: 'GEMINI_API_KEY',
      modelsUrl: '', 
      authHeader: () => ({}),
      parseModels: (d: any) => (d?.models ?? []).map((m: any) => ({
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
        data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      } else {
        data = await fetchJson(prov.modelsUrl, prov.authHeader(apiKey));
      }
      if (data) {
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
      }
    } catch {
      // Key configured but fetch failed
    }
  }

  return detected;
}

// ─── Model Governance Prompt Optimization ────────────────────────────────────
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
app.post('/api/ipc/:channel', async (req, res) => {
  const { channel } = req.params;
  const args = req.body.args || [];
  try {
    let result: any;
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
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
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
        
        // Handle buffer raw formats coming from HTTP
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
      default:
        res.status(404).json({ error: `IPC channel "${channel}" not implemented` });
        return;
    }
    res.json({ data: result });
  } catch (err: any) {
    console.error(`[IPC Error] Channel ${channel} failed:`, err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// ─── Static Web Asset Serving ────────────────────────────────────────────────
const distPath = __dirname;
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── Server Ignition ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/api/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🚀 SuperAgent Web Server ignited at: http://localhost:${PORT}`);
  console.log(`⚙️  Resolving configuration and logs at: ${userDataDir}`);
  console.log(`================================================================`);
});
