# Phase 2: Context, Memory & Universal MCP (Steps 021 – 040)

This module details steps 21 through 40 covering long-term memory, project rules parsing (`AGENT.md`), trajectory token compaction, and full Model Context Protocol (MCP) integration.

---

### Step 021: Project Guidelines Parser (`AGENT.md` / `CLAUDE.md`)
* **Feature**: Automatically discover and inject project-level coding guidelines from root `.agents/AGENT.md`.

### Step 022: Global User Profile Memory Store
* **Feature**: Maintain cross-project developer profile preferences (preferred stack, formatting rules, age, location).

### Step 023: Dynamic Trajectory Token Counter
* **Feature**: Calculate real-time token usage across system prompt, history, and active tool outputs.

### Step 024: Automatic Trajectory Compactor (`/compact`)
* **Feature**: Summarize older conversation history when context exceeds 80% capacity to preserve fresh token space.

### Step 025: Self-Improving Learning Loop Engine (`/learn`)
* **Feature**: Autonomously codify successful multi-step solutions into permanent reusable skills (`.agents/skills/<name>/SKILL.md`).

### Step 026: Universal Skill Store & Discovery Manager
* **Feature**: Index and load installed skills from global (`~/.superagent/skills`) and project customization roots.

### Step 027: MCP Client Core SDK Integration
* **Feature**: Integrate `@modelcontextprotocol/sdk` client engine into `@superagent/core`.

### Step 028: MCP STDIO Transport Handler
* **Feature**: Connect to local command-line MCP servers spawning sub-processes.

### Step 029: MCP Server-Sent Events (SSE) Transport Handler
* **Feature**: Connect to remote HTTP SSE MCP servers with bearer token authentication.

### Step 030: MCP Streamable HTTP Transport Handler
* **Feature**: Support streaming HTTP MCP transport specification.

### Step 031: MCP Dynamic Tool Discovery & Registration
* **Feature**: Query connected MCP servers and dynamically register exposed tools into SuperAgent's tool registry.

### Step 032: MCP Resource & Prompt Template Manager
* **Feature**: Fetch MCP resources and inject prompt templates exposed by third-party servers.

### Step 033: MCP Access Permission Guard
* **Feature**: Prompt user before executing external high-risk MCP tools (e.g. production DB writes).

### Step 034: IDE Active Context Bridge (`/ide`)
* **Feature**: Provide lightweight HTTP bridge server receiving open files and active editor selections from VS Code.

### Step 035: Playwright Browser Core Engine
* **Feature**: Launch headless/headed Chromium browsers for visual web navigation and automation.

### Step 036: Web Page Content Extractor & Markdown Converter
* **Feature**: Fetch web page DOM and convert to clean Markdown text for model ingestion.

### Step 037: Web Search Tool Integration
* **Feature**: Execute live web searches via Serper / Tavily / SearXNG APIs.

### Step 038: Vector Memory Embedding Engine
* **Feature**: Generate vector embeddings for project documentation and code snippets using fast local models or AI APIs.

### Step 039: Semantic Code & Docs Retriever
* **Feature**: Retrieve relevant codebase context fragments based on vector similarity search.

### Step 040: Context Inspector & Debug Viewer
* **Feature**: Provide raw dump utility showing exactly what system prompts and tool schemas are sent to the LLM.
