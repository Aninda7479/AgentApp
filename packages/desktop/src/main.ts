import { app, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

// Set custom userData path to organize files in Roaming\OpenSource\AgentApp
const customUserDataPath = path.join(app.getPath('appData'), 'OpenSource', 'AgentApp');
app.setPath('userData', customUserDataPath);

import { windowManager } from './main/window';
import { readStore, writeStore, StoreData } from './main/store';
import https from 'https';
import http from 'http';

// ─── IPC: Persistent Store ───────────────────────────────────────────────────

ipcMain.handle('store-read', (): StoreData => {
  return readStore();
});

ipcMain.handle('store-write', (_event, data: StoreData): void => {
  writeStore(data);
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
  const base = path.join(app.getPath('userData'), 'Conversation');
  const projectsDir = path.join(base, 'Projects');
  const chatsDir = path.join(base, 'Chats');

  let targetDir = '';
  if (projectName) {
    targetDir = path.join(projectsDir, projectName, chatId);
  } else {
    targetDir = path.join(chatsDir, chatId);
  }

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

app.whenReady().then(() => {
  initApp();
  setupDevWatcher();
  app.on('activate', () => {
    if (windowManager.getAllWindows().length === 0) initApp();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
