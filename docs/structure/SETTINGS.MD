# ⚙️ Settings & Configuration Architecture

This document describes how SuperAgent stores, governs, and synchronizes user preferences, API keys, model lists, and permission levels across the CLI, Web, and Desktop interfaces.

---

## 📂 Storage Architecture & Locations

SuperAgent segregates configurations into two files in the user's config directory to prevent large catalog data from slowing down frequent UI state writes:

1. **`settings.json`**: Stores general preferences, theme, voice configs, provider endpoints, and API keys.
2. **`models.json`**: Stores the list of discovered and configured AI models, their parameters (context limits, pricing, modalities), and active toggles.

### Path Resolution
Unlike standard Electron applications that write to OS-specific cache directories (like AppData or Application Support), SuperAgent uses an OS-agnostic design. All directories are resolved relative to the user's home directory (`os.homedir()`):

**Global Configuration Path**: `~/.superagent/config/`
* **Windows**: `C:\Users\<username>\.superagent\config\`
* **macOS**: `/Users/<username>/.superagent/config/`
* **Linux**: `/home/<username>/.superagent/config/`

### Complete `~/.superagent/` Directory Structure

When initialized, SuperAgent sets up the following directories inside `~/.superagent`:

| Directory Name | Path | Purpose |
|:---|:---|:---|
| `config` | `~/.superagent/config/` | Primary settings storage (`settings.json`, `models.json` & backups) |
| `partners` | `~/.superagent/partners/` | Configured AI partners and desktop pet companion definitions |
| `conversation` | `~/.superagent/conversation/` | Local conversation transcript histories and metadata (cached on disk) |
| `models` | `~/.superagent/models/` | Downloaded on-device models (e.g. Whisper files for local speech-to-text) |
| `tasks` | `~/.superagent/tasks/` | Scheduled tasks definitions and logs |
| `skills` | `~/.superagent/skills/` | Project-independent user-defined agent skills |
| `plugins` | `~/.superagent/plugins/` | Downloaded custom third-party integrations and tools |
| `connectors` | `~/.superagent/connectors/` | Configuration files for external chat platform gateways (e.g. Telegram, Discord) |
| `logs` | `~/.superagent/logs/` | Daemon execution and debug output logs |
| `3d-studio` | `~/.superagent/3d-studio/` | Locally generated 3D character mesh files and textures |

---

## 🛡️ Atomic Write & Backup Strategy

To prevent data corruption during unexpected application shutdowns or OS crashes:
* **Atomic Writes**: Writes are directed to a temporary file (`.tmp`). Once writing completes, the existing file is replaced using an atomic `fs.renameSync` swap.
* **Auto-Recovery**: If a file read fails due to parsing issues or corruption, SuperAgent automatically falls back to reading the corresponding backup files (`settings.json.bak` and `models.json.bak`).

---

## 📋 JSON Schema & Data Models

The configuration schema is strictly defined in TypeScript within the core storage library.

### Root Object (`AppSettings`)
```typescript
export interface AppSettings {
  theme?: ThemeSettings;
  providers?: ProviderSettings[];
  models?: ModelSettings[];
  lastUsedModel?: LastUsedModelSettings;
  general?: GeneralAppSettings;
  orchestrator?: OrchestratorSettings;
  modelGov?: ModelGovSettings;
  browserUse?: BrowserUseSettings;
  computerUse?: ComputerUseSettings;
  internetAccess?: InternetAccessSettings;
  plugins?: PluginsSettings;
  threeD?: ThreeDSettings;
  webApp?: WebAppSettings;
  voice?: VoiceSettings;
  circleSearch?: CircleSearchSettings;
  chatTitle?: ChatTitleSettings;
}
```

### 1. General & Safety Settings (`GeneralAppSettings`)
Governs workflow styling, auto-start, and agent safety gates.
```typescript
export interface GeneralAppSettings {
  workMode?: 'coding' | 'everyday';
  confirmShellCommands?: boolean; // User-in-the-loop gate for terminal execution
  autoReviewPlan?: boolean;       // Require approval on agent plans
  unsandboxedActions?: boolean;   // Allow tasks outside sandbox directory
  openAtLogin?: boolean;
  closeToTray?: boolean;
  hotkeyOverlayEnabled?: boolean;
  hotkeyOverlayShortcut?: string;
  globalMemory?: string;          // Persistent custom memory block
}
```

### 2. Internet Access Governance (`InternetAccessSettings`)
Governs outbound network calls made by the agent's web search or browser tools:
```typescript
export type InternetAccessLevel = 'all' | 'observation' | 'none';

export interface InternetAccessSettings {
  level?: InternetAccessLevel;
}
```
* **`all`**: Unrestricted outbound network access.
* **`observation`**: Read-only network calls (GET/HEAD requests only). Mutating calls (POST, form submits, uploads) are blocked.
* **`none`**: Fully air-gapped. All agent-initiated network requests are blocked. (Core AI provider endpoints remain open so the agent can still think).

### 3. Model Configuration (`ModelSettings`)
Defines the parameters for active models.
```typescript
export interface ModelSettings {
  id: string;
  name: string;
  providerId: string;
  enabled: boolean;
  description?: string;
  contextLimit?: string;
  outputLimit?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  pricing?: ModelPricing;
  caching?: boolean;
}
```

### 4. Voice & Speech Settings (`VoiceSettings`)
Governs dictate-to-compose functions.
```typescript
export interface VoiceSettings {
  engine?: 'auto' | 'browser' | 'model' | 'local';
  providerId?: string; // Target cloud provider
  model?: string;      // Cloud STT model (e.g. whisper-1)
  language?: string;
  dictionary?: VoiceDictionary; // Bias spelling for special terms
  localWhisper?: LocalWhisperSettings; // On-device transcription config
  typingEnabled?: boolean;
  typingShortcut?: string;
}
```

---

## ⚡ IPC Sync & Hot-Reloading

The settings lifecycle behaves differently depending on the process side:

### Main Process (Backend)
Registers the IPC handlers for reading and writing configs. Whenever settings are patched via `settings-write`, the main process triggers **hot-reloading logic** for affected modules:
1. **Circle-to-Search**: Automatically registers or unregisters the global shortcut listener in the OS.
2. **Local Voice Daemon**: Re-registers keyboard hooks or releases local memory models if the transcription engine is toggled off.

### Renderer Process (Frontend UI)
* Reads settings once on startup via `SettingsService.readInto` to hydrate the React state.
* Persists changes reactively: each UI setting toggle calls `SettingsService.write*` which pushes a patch over Electron IPC.
