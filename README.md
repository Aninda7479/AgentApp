# SuperAgent 🚀

> An open-source, high-performance AI agent platform designed for modern autonomous coding, browser workflows, and terminal automation.

[![License: GPL v3 / AGPL v3](https://img.shields.io/badge/License-GPLv3%20%2F%20AGPLv3-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

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
git clone https://github.com/your-username/SuperAgent.git

# Navigate to project directory
cd SuperAgent

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
```

The web UI is fully responsive and works on phones, tablets, and desktops
(the sidebar becomes a slide-over drawer on small screens).

#### 🔐 Securing the Web/VPS deployment (Login System)

When exposing the server publicly, enable the built-in session login by setting
a password. Authentication protects every route **and** the live WebSocket.

```bash
# Windows (PowerShell)
$env:SUPERAGENT_USERNAME = "admin"          # optional, defaults to "admin"
$env:SUPERAGENT_PASSWORD = "your-strong-password"
npm run start --workspace=@superagent/web

# Linux / macOS
SUPERAGENT_USERNAME=admin \
SUPERAGENT_PASSWORD='your-strong-password' \
npm run start --workspace=@superagent/web
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `SUPERAGENT_USERNAME` | Login username | `admin` |
| `SUPERAGENT_PASSWORD` | Login password (plaintext) | — |
| `SUPERAGENT_PASSWORD_HASH` | scrypt hash `scrypt$<saltHex>$<hashHex>` (overrides plaintext) | — |
| `SUPERAGENT_SESSION_SECRET` | Secret used to sign session cookies (set this to keep sessions across restarts) | random |
| `SUPERAGENT_SESSION_TTL` | Session lifetime in hours | `168` (7 days) |
| `SUPERAGENT_SECURE_COOKIES` | Set to `true` when served over HTTPS | `false` |

Sessions use signed, `HttpOnly` cookies, constant-time credential checks, and
per-IP brute-force rate limiting. If no password is configured the server runs
in open mode and prints a security warning.

---

## 📖 User Guide

### Running the CLI
```bash
npx @superagent/cli
```

---

## 🤝 Contributing

We welcome contributions! Please read our [Developer Guide](docs/DEVELOPMENT.md) and [Contribution Guidelines](CONTRIBUTING.md) to get started.

---

## 📜 License & Attribution

This project is dual-licensed under both the **GNU General Public License v3.0 (GPL-3.0)** and the **GNU Affero General Public License v3.0 (AGPL-3.0)**. Users and developers may choose either license terms at their option.

**Summary of key terms:**
- **Free to use**: Anyone can use this software for free.
- **Copyleft**: Any modifications or derived works must also be released as open-source under GPL-3.0 or AGPL-3.0.
- **Attribution**: You **must** retain all original copyright notices and credit the original author.
- **Modification Notice**: If you modify this code, you must clearly state what changes and improvements were made.
- **No Warranty**: Provided "AS IS" without liability or warranty.
