# 🛠️ Developer Guide

This guide provides technical details on setting up, building, and developing SuperAgent locally.

---

## 🏗️ Monorepo Architecture

SuperAgent uses an `npm` workspace monorepo layout:

- **`packages/core`**: Core AI orchestration engine, LLM integration, prompt engineering, and MCP tool handling.
- **`packages/cli`**: Terminal user interface (TUI) and CLI commands for terminal automation.
- **`packages/desktop`**: GUI client for desktop interaction.

---

## 💻 Local Development Setup

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Workspace Initialization
Clone your fork and install dependencies for all packages:
```bash
git clone https://github.com/your-username/SuperAgent.git
cd SuperAgent
npm install
```

### 3. Building Packages
To build all workspaces in dependency order:
```bash
npm run build
```

### 4. Running Tests
Run tests across all workspaces:
```bash
npm test
```

---

## 🧪 Coding Standards & Quality

- **TypeScript Strict Mode**: All code must maintain strict type checking (`noImplicitAny`).
- **Single Responsibility**: Keep functions small, testable, and modular.
- **Decoupled Logic**: Framework logic should remain cleanly separated from core AI decision engines.
