# Phase 1: Core Foundation & Execution Sandbox (Steps 001 – 020)

This module details steps 1 through 20 covering monorepo setup, provider authentication, model list querying, security permissions, and basic execution sandboxing.

---

### Step 001: Monorepo & Package Linking Setup
* **Feature**: Configure `npm workspaces` for `@superagent/core`, `@superagent/cli`, and `@superagent/desktop`.
* **Details**: Establish build dependency ordering and shared TS configurations.

### Step 002: Secure BYOK Key Storage Manager
* **Feature**: Encrypted key storage engine for managing user-provided API keys on disk (`~/.superagent/credentials`).

### Step 003: OpenAI Provider Client Adapter
* **Feature**: Support OpenAI API connection (o3-mini, gpt-4o, codex models) using user API key.

### Step 004: Anthropic Provider Client Adapter
* **Feature**: Support Anthropic API connection (Claude 3.7 Sonnet, Opus) using user API key.

### Step 005: Gemini Provider Client Adapter
* **Feature**: Support Google Gemini API connection (Gemini 2.5/3.5 Flash & Pro) using user API key.

### Step 006: DeepSeek & Custom Provider Adapter
* **Feature**: Support DeepSeek API and any OpenAI-compatible custom base URL (Ollama, vLLM, LocalAI).

### Step 007: Dynamic Models List & Capability Registry
* **Feature**: Query and list available models from connected providers dynamically based on configured keys.

### Step 008: Default Model Selection & Fallback Router
* **Feature**: Select default active model and handle automatic failover if a provider encounters rate limits.

### Step 009: Execution Permission Mode Controller
* **Feature**: Manage global execution safety levels: `read-only`, `auto-approve-edits`, and `full-autonomy`.

### Step 010: Terminal Shell Executor (`node-pty` integration)
* **Feature**: Spawn interactive pseudo-terminal sessions to execute bash/powershell commands safely.

### Step 011: Terminal Access Control & Command Whitelisting
* **Feature**: Intercept dangerous terminal commands (`rm -rf /`, `format`) and enforce explicit user confirmation prompts.

### Step 012: Environment Variable Sanitizer
* **Feature**: Prevent AI agent from logging or exposing sensitive tokens and API keys in execution traces.

### Step 013: File System Inspector & Reading Engine
* **Feature**: Safe file viewing utility with 1-indexed line ranges and binary detection.

### Step 014: Atomic File Writer & Patch Engine
* **Feature**: Create and modify files atomically with automated backup rollback on syntax failure.

### Step 015: Structured Unified Diff Generator
* **Feature**: Compute line-by-line unified git diffs between existing file content and proposed edits.

### Step 016: ReAct Agent Reasoning Loop Core
* **Feature**: Implement the primary thought -> action -> observation loop for multi-step problem solving.

### Step 017: Turn Queueing & Message Buffer Architecture
* **Feature**: Support asynchronous prompt queueing (`Tab`) while agent is actively executing a task.

### Step 018: System & User Session Trajectory Logger
* **Feature**: Persist conversation trajectories and execution steps to JSONL transcript logs.

### Step 019: Subagent Manager & Task Forker
* **Feature**: Spawn isolated child subagents with independent context windows for parallel subtasks.

### Step 020: System Diagnostics & Health Checker
* **Feature**: Self-test environment dependencies (Node version, Git binary, terminal permissions) on startup.
