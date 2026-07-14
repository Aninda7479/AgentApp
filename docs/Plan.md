# Feature

## Internet access
To Prevent Agent Do Autonomusly Doing Dangerous Acts. Add a Feature in settings to controll Internet Access. Internet Access Level - None, Observation Only, All.
- [x] **DONE** — `Internet Access` control added to General settings (None / Observation Only / All), persisted via core `SettingsStorage`, and **enforced** server-side: the `web_fetch` tool, browser navigation, and web search all respect the policy. The provider API is always allowed so the assistant still answers. See `packages/core/src/security/internet-access.ts`.

## Random Features

1. Seamless Login / Logout for web. To visit Account.html and other pages and Do Login Logout when work is done, seamlessly without manually typing that URL.
   - [x] **DONE** — in the browser/web build (no Electron), the Help menu now shows **Account** (navigates to `/account`) and **Log out** (POSTs to `/api/auth/logout` then redirects to `/login`). One click, no manual URL typing. Wired in `App.tsx` + `TitleBar.tsx` via `isWebMode`.
2. Communication — Connect Telegram, WhatsApp, etc.
   - [x] **DONE** — added a `WhatsAppChannelAdapter` (Meta Cloud API) alongside the existing Telegram/Discord/Slack adapters, plus a `createDefaultGateway()` factory in `packages/desktop/src/gateway/index.ts`. Supports outbound messages, webhook verification, and inbound parsing. A settings UI to manage connections is still pending.
3. Check For Update In Settings.
   - [x] **DONE** — new `Updates` settings panel shows the app version and a "Check for Updates" button wired to `electron-updater` via the `check-for-updates` IPC. Also reachable from the Help menu in the Top Bar.
4. Make Top Bar — File, Edit, View, Help — Fully Functional.
   - [x] **DONE** — File/Edit/View/Help menus are wired to real actions (New chat `Ctrl+N`, Open folder, Settings, Quit, Undo, Toggle sidebar, Theme, Check for Updates, Documentation, About).
5.
