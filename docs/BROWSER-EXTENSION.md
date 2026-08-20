# SuperAgent Browser Extension Setup & Release Guide 🌐

The **SuperAgent Browser Extension** brings autonomous agentic capabilities, live page summarization, site storage inspection (`localStorage`, `sessionStorage`, `cookies`, `IndexedDB`), network error telemetry, and deep DOM inspection directly into your browser side panel.

---

## 🚀 Quick Setup for Users

### Option A: Desktop App Installed (Zero Configuration)
If you have the **SuperAgent Desktop App** installed on your computer:
1. Open the Desktop App.
2. Install the extension in your browser (Chrome, Edge, Brave, Arc).
3. Click the **SuperAgent** icon in your toolbar to open the Side Panel.
4. Enter your admin password (default: `admin`).
5. **You're connected!** The extension automatically connects to `http://localhost:1469` and shares your local LLM providers, skills, and memory.

---

### Option B: Remote Server / Cloud VPS / Docker
If you host SuperAgent on a server or VPS:
1. Start your server (e.g. `npm run start:web` or Docker container).
2. Open the extension Side Panel and click the **⚙️ Settings** icon in the header (or right-click extension ➔ **Options**).
3. Under **Backend Connection**, change the Server URL:
   ```
   http://localhost:1469  ➔  https://agent.yourdomain.com
   ```
4. Enter your server password and click **Save & Test Connection**.
5. **You're connected!** The extension communicates securely over HTTPS and WebSocket (WSS).

---

## 📦 How to Install the Extension

### Method 1: Load Unpacked / Release ZIP
1. Download `superagent-browser-extension-vX.Y.Z.zip` from [GitHub Releases](https://github.com/Aninda7479/AgentApp/releases) and extract it (or run `npm run pack:ext` from the repo).
2. Open `chrome://extensions/` (or `edge://extensions/` / `brave://extensions/`).
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `packages/browser-extension/dist` folder (or extracted zip folder).
5. Pin the extension to your browser toolbar.

---

## 🛠️ For Developers & Publishing Releases

### 1. Build and Package the Extension
To compile and generate a production `.zip` ready for upload:
```bash
npm run pack:ext
```
This builds TypeScript & Vite into `packages/browser-extension/dist/` and archives it to:
```
packages/browser-extension/release/superagent-browser-extension-v<version>.zip
```

### 2. Store Submission
* **Chrome Web Store**: Upload `superagent-browser-extension-v<version>.zip` to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
* **Microsoft Edge Add-ons**: Upload the zip archive to the [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge).
* **GitHub Releases**: Attach the `.zip` to the release assets.
