# SuperAgent

> An open-source autonomous AI agent for modern coding, browser automation, multimodal media generation, and terminal workflows — cross-platform on Desktop and Web, with a responsive UI that works on phones, tablets, and desktops.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🚀 Install

SuperAgent ships in **two** builds that share the same autonomous core — both include the web UI.

**Option 1 — Core + CLI + Web** (terminal, scripts, servers, CI). One command, no installers:

```bash
# Windows (PowerShell)
irm https://aninda7479.github.io/AgentApp/install.ps1 | iex

# macOS / Linux
curl -fsSL https://aninda7479.github.io/AgentApp/install.sh | sh
```

To uninstall:
```bash
# Windows (PowerShell)
irm https://aninda7479.github.io/AgentApp/uninstall.ps1 | iex

# macOS / Linux
curl -fsSL https://aninda7479.github.io/AgentApp/uninstall.sh | sh
```

Then run `superagent` (interactive TUI) or `superagent --serve` / `superagent --start-web` (local web UI at `http://localhost:1469`).
See the [CLI install page](https://aninda7479.github.io/AgentApp/cli).

**Option 2 — Core + Desktop + Web** (native app for Windows / macOS / Linux):

Download an installer for your OS from the [desktop download page](https://aninda7479.github.io/AgentApp/desktop)
or the [latest GitHub release](https://github.com/Aninda7479/AgentApp/releases/latest).
Installers auto-update in place.

**Option 3 — Core + Browser Extension** (Manifest V3 for Chrome / Edge / Brave):

Build and load the extension into your browser for persistent on-the-way side panel chat, site storage access, and DOM element/network inspection:
```bash
npm run build:ext
```
Then load `packages/browser-extension/dist` as an unpacked extension at `chrome://extensions` (Developer Mode). See the [Extension Setup Guide](https://aninda7479.github.io/AgentApp/extension).

> Building from source? See **Quick Start** below.

---

## 🔄 Updating

**CLI** (Option 1): the CLI self-updates from npm — pulling the same `@superagent/cli`
and `@superagent/web` packages the release workflow publishes:

```bash
superagent update          # install the latest published version
superagent update --check  # just check, don't install
# or manually:
npm install -g @superagent/cli @superagent/web
```

**Desktop** (Option 2): updates download automatically from GitHub Releases in the
packaged app and install when you quit. Use **Settings → Updates → Check for Updates**
to check on demand. Set `SUPERAGENT_DISABLE_UPDATER=1` to turn auto-update off.


---

## 🌟 Features

- 🧠 **Autonomous Agentic Workflows**: Multi-step reasoning, execution, and self-correction.
- 🔌 **Model Context Protocol (MCP)**: Seamlessly connect external tools, APIs, and databases.
- 💻 **Cross-Platform**: Powerful CLI tools and interactive desktop interface.
- 🔒 **Privacy First & Open Source**: Free for everyone under open-source copyleft licenses.

---

## 📦 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- `npm` or `pnpm`

### Installation

```bash
# Clone the repository
git clone https://github.com/Aninda7479/AgentApp.git

# Navigate to project directory
cd AgentApp

# Install dependencies
npm install

# Build packages
npm run build
```

---

## Start

### Start Desktop
```bash
npm run start --workspace=@superagent/desktop
```

### Start Web(In Cloud Server/VPS for remote access)
```bash
npm run start --workspace=@superagent/web
# or with live reload during development:
npm run dev --workspace=@superagent/web
```

The server binds to **all network interfaces** (`0.0.0.0`) by default, so it is
reachable from other devices on your LAN — the startup log prints a
`Network (LAN) URL` (e.g. `http://192.168.x.x:1469`) you can open on a phone or
another machine. To restrict it to the local machine only, set `HOST=127.0.0.1`.
Both `PORT` (default `1469`) and `HOST` are configurable via environment variables.

The web UI is fully responsive and works on phones, tablets, and desktops
(the sidebar becomes a slide-over drawer on small screens).

#### 🔐 Securing the Web/VPS deployment (Login System)

When exposing the server publicly, enable the built-in session login by setting
a password. Authentication protects **every route and the live WebSocket**.

The login is **password-only** — there is no username field. Possession of the
single admin password is the only proof of identity, so you only ever enter the
password (in the browser) to sign in.

Credentials are managed by the shared core `AuthStore` and persisted to
`<userData>/config/auth.json` (scrypt-hashed, 0600). The **same** store is used
by the Web server *and* the CLI, so you can set or rotate the password from
either side.

**First-run setup (recommended):** start the server with no password, open
`/login`, and you will be guided through creating the password. After that,
`/login` is the normal sign-in page and `Settings → Web App` (`/settings/web-app`)
lets you manage host branding, change the password, inspect active sessions, and sign out.

**Headless / Docker seeding:** provide the password via environment variables
before the first start. The server seeds the store once and then the persisted
file is authoritative.

```bash
# Windows (PowerShell)
$env:SUPERAGENT_PASSWORD = "your-strong-password"
npm run start --workspace=@superagent/web

# Linux / macOS
SUPERAGENT_PASSWORD='your-strong-password' \
npm run start --workspace=@superagent/web
```

**Manage credentials from the CLI** (operates on the same store):

```bash
superagent password status   # is a custom password configured?
superagent password set      # set / overwrite the password (interactive)
```

**Default password.** When no custom password has been configured, the login
password defaults to `admin` — so you can sign in out of the box, then set a
stronger one with `superagent password set` (or the `Settings → Web App` page). Once a
custom password is set, the default no longer works.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `SUPERAGENT_PASSWORD` | Login password (seeds the store on first run) | — |
| `SUPERAGENT_WEB_PASSWORD` | Alias for `SUPERAGENT_PASSWORD` | — |
| `SUPERAGENT_SESSION_SECRET` | Secret used to sign session cookies (set this to keep sessions across restarts; auto-generated and persisted otherwise) | random |

Sessions use signed, `HttpOnly` cookies with constant-time credential checks.
If no password is configured the server runs in **open mode** (`isAuthDisabled()`)
and prints a security warning.

---

## 📖 User Guide

### Running the CLI
```bash
npx @superagent/cli
```

### Web Server / Homelab (CLI flags)

| Flag | Alias | Description |
| :--- | :--- | :--- |
| `--serve` | `--start-web` | Start the self-hosted web server |
| `--serve-port <port>` | `--web-port <port>` | Port to bind (default `1469`) |
| `--stop-web` | — | Stop the running web server |
| `--web-status` | — | Print server status & PID |

```bash
# Quickest homelab start:
superagent --serve

# Custom port:
superagent --serve --serve-port 8080

# Original flags still work:
superagent --start-web --web-port 8080

# Stop / inspect:
superagent --stop-web
superagent --web-status
```


## 🤝 Contributing

We welcome contributions! Please read our [Developer Guide](docs/DEVELOPMENT.md) and [Contribution Guidelines](CONTRIBUTING.md) to get started.

**Community & governance docs:**
- [Code of Conduct](./CODE_OF_CONDUCT.md) — expected behavior in this community
- [Acceptable Use Policy](./ACCEPTABLE_USE.md) — what this project may and may not be used for
- [Security Policy](./SECURITY.md) — how to privately report a vulnerability (do **not** open a public issue)

---

## 📜 License & Attribution

SuperAgent is licensed under the [Apache License 2.0](./LICENSE).

You are free to use, modify, and redistribute this project, including
commercially. If you redistribute a modified version (including hosting it
as a service), you must retain the attribution notices in [NOTICE](./NOTICE)
— crediting the original SuperAgent project and linking back to
https://github.com/Aninda7479/AgentApp — as required by License Section 4(d).

**Disclaimer:** This software is provided "AS IS", without warranty of any kind.
SuperAgent is a general-purpose orchestration tool. You are solely responsible
for the actions your configured agent takes and for complying with all applicable
laws in your jurisdiction — see [ACCEPTABLE_USE.md](./ACCEPTABLE_USE.md).
