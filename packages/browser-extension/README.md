# SuperAgent Browser Extension 🌐

> **On-the-way Chat & Autonomous Agentic Work in your Browser**  
> Integrated with SuperAgent's `core_v2` engine, session login protection, global memory (UserProfile & Learned Insights), and deep site storage/network/DOM tool access.

---

## Features

- 💬 **On-the-way Persistent Chat**: Chrome Side Panel chat interface with streaming token response that stays open across tabs and page navigations.
- 🤖 **Agentic Multi-Turn Execution**: Live trajectory step visualization, tool call inspection, and memory recall.
- 🗄️ **Site Storage Access**: Read and write `localStorage`, `sessionStorage`, `IndexedDB`, `Cookies`, and `Cache Storage` on any active website.
- 🔍 **Network & Console Inspector**: Observation of HTTP requests, failed `4xx`/`5xx` responses, and full DevTools HAR / WebSocket frame inspection.
- 🎯 **Deep DOM Element Tools**: Computed styles analysis, simplified DOM tree generation, attribute inspection, and element measurement/highlighting.
- 🔐 **Unified Authentication & Security**: Seamlessly uses the same `sa_session` HMAC-SHA256 token / password security setup as the Desktop and Web VPS clients.
- 🧠 **Global Memory Integration**: Direct access to `UserProfileStore` preferences, `LearningLoopEngine` insights, and `SkillStore`.

---

## Installation & Development

### 1. Build the Extension

From the root of the repository:

```bash
# Build the browser extension bundle (output to packages/browser-extension/dist)
npm run build:ext
```

Or for live development with watch mode:

```bash
npm run dev:ext
```

### 2. Load into Chrome / Edge / Brave

1. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode** toggle in the top right.
3. Click **Load unpacked**.
4. Select the directory: `packages/browser-extension/dist` (or `packages/browser-extension` after building).
5. The SuperAgent icon will appear in your browser toolbar!

### 3. Connect to SuperAgent Backend

1. Ensure the SuperAgent backend is running:
   ```bash
   npm run dev:web
   # or npm run dev (which starts Desktop + Web on port 1469)
   ```
2. Click the SuperAgent toolbar icon or open the Side Panel.
3. If password protection is enabled, sign in using your admin password (default: `admin`).
4. Start chatting or instructing the agent to inspect pages, debug web apps, and automate browser tasks!
