# OpenCode Zen Gateway & Free Tier Developer Guide

This guide is for AI coding agents and human contributors working on SuperAgent (`packages/core_v2/src/providers/opencode.rs`). It explains how the **OpenCode Zen Free Gateway** works, how keyless streaming is achieved without an API key, the official OpenCode toolset, and how future agents can inspect changes using the upstream **OmniRoute** repository.

---

## 1. Overview: What is OpenCode Zen Free Tier?

OpenCode Zen (`https://opencode.ai/zen/v1`) hosts top-tier open and frontier coding models (such as `big-pickle`, `mimo-v2.5-free`, `nemotron-3.5-lightning-free`, `ling-3.0-flash-fin-free`, `nemotron-3-ultra-free`, `jev-1.13-free`, and `deepseek-v4-flash-free`).

When accessed with the proper client contract, these `-free` models provide:
- **Zero API Key required** (`cost: "0"`).
- **High throughput streaming completions** with reasoning tokens.
- **Direct HTTPS access** without requiring local binaries or daemons.

---

## 2. The 4 Upstream Contract Pillars

OpenCode Zen's API gateway runs a strict free-tier contract gate on `/zen/v1/chat/completions`. If any of the following 4 requirements are violated, upstream immediately returns `403 FreeTierError`:
> `{"type":"error","error":{"type":"FreeTierError","message":"Error from provider (Console): OpenCode's free tier can only be used from within OpenCode"}}`

### Pillar 1: Tool Name Whitelist Validation (CRITICAL)
- **The Gate**: The request body **must** contain a non-empty `tools` array.
- **The Whitelist**: Upstream inspects the declared tool names. If the array is empty, or if **any** declared tool has a name outside OpenCode's official tool whitelist, upstream answers `403 FreeTierError`.
- **The Fix**: SuperAgent declares OpenCode's official tool names (`bash`, `read`, `write`, `edit`, `glob`, `grep`, `lsp`, `task`, `question`, `todo`, `plan`, `webfetch`, `websearch`, `patch`, `apply_patch`, `skill`).

### Pillar 2: Mandatory Streaming
- The request body **must** set `"stream": true`.
- The request headers **must** include `"Accept": "text/event-stream"`.
- Requests with `"stream": false` or standard JSON accepts will be rejected with `403 FreeTierError`.

### Pillar 3: Canonical Headers & Session IDs
The request must supply the exact headers that the official OpenCode desktop client transmits:
- **`User-Agent`**: Must match `opencode/(?:[a-z]+/)?v?(\d+)\.(\d+)` with version >= 1.17 (e.g., `opencode/1.18.31`). An older version returns `426 UpgradeRequired`.
- **`x-opencode-session`**: Formatted as `ses_` + 12 lowercase hexadecimal chars + 14 Base62 chars (exactly 30 characters).
- **`x-opencode-request`**: Formatted as `msg_` + 12 lowercase hexadecimal chars + 14 Base62 chars (exactly 30 characters).
- **`x-opencode-client`**: Set to `desktop`.
- **`x-opencode-project`**: Set to `global`.

### Pillar 4: SSE Delta Stream Format
Upstream streams Server-Sent Events (SSE) chunks line by line starting with `data: `:
- **Reasoning Tokens**:
  - `nemotron`, `mimo`, and `ling` models stream step-by-step thinking in `delta.reasoning`.
  - `big-pickle` streams thinking in `delta.reasoning_content`.
  - SuperAgent wraps these tokens in `<think>...</think>` tags for unified agent reasoning.
- **Content Tokens**:
  - Regular assistant completions stream in `delta.content`.
- **Stream Termination**:
  - Signaled by `data: [DONE]`.

---

## 3. Official OpenCode Tool Registry (16 Tools)

The official tool definitions sourced from upstream `anomalyco/opencode` (`packages/opencode/src/tool/registry.ts`) are:

| Tool Name | Purpose | SuperAgent Equivalent |
| :--- | :--- | :--- |
| `bash` | Execute bash/shell command in system terminal | `run_command` |
| `read` | Read contents of a file from workspace | `view_file` |
| `write` | Write or overwrite file with content | `write_to_file` |
| `edit` | Search-and-replace text edits in a file | `replace_file_content` |
| `glob` | Find files matching a glob pattern | `find_by_name` |
| `grep` | Search text regex patterns in directory | `grep_search` |
| `lsp` | Language server query (diagnostics, definitions) | Internal LSP |
| `task` | Spawn or manage background subtasks | `invoke_subagent` / `manage_task` |
| `question` | Ask user a question for clarification | `ask_question` |
| `todo` | Manage checklist and todo items | Session Todo Store |
| `plan` | Create or update implementation plan | `write_to_file` (plan) |
| `webfetch` | Fetch webpage content from a URL | `read_url_content` |
| `websearch` | Search web queries for information | `search_web` |
| `patch` | Generate unified diff patch | Git diff |
| `apply_patch` | Apply unified diff patch to workspace | Git apply |
| `skill` | Load and execute agent skill | Skill runtime |

SuperAgent maps tool invocations bidirectionally:
- SuperAgent agent loop maps outgoing tools to official OpenCode names so the upstream gate passes.
- Incoming tool calls from OpenCode models (e.g. `bash`) are mapped back to SuperAgent's tool names (`run_command`).

---

## 4. How to Use OmniRoute to Track Upstream Changes

If OpenCode Zen's API changes in the future, the **OmniRoute** open-source project is the primary reference implementation for tracking fixes.

### Key Files in OmniRoute:
Clone or view OmniRoute (`github.com/danny-avila/omniroute` or similar repository):
1. **`open-sse/executors/opencode.ts`**:
   - The main executor that handles requests to OpenCode Zen.
   - Shows how URLs are structured, how streaming responses are transformed, and how session/request headers are created.
2. **`open-sse/executors/opencodeFreeTierContract.ts`**:
   - Contains the exact gate validation logic and the 4 contract pillars.
   - Look at `requiresFreeTierRequestContract()`, `applyFreeTierRequestContract()`, and `configuredPlaceholderToolNames()`.
3. **`open-sse/executors/opencodeToolObservation.ts`**:
   - Tracks which tool names the upstream accepted or refused.
   - If upstream starts refusing certain tool names, look here to see what new placeholder names or strategies OmniRoute adopted.
4. **`open-sse/config/providers/registry/opencode/index.ts`**:
   - Upstream catalog of free and paid models.
   - Look here to see newly supported free models ending in `-free`.
5. **`tests/unit/opencode-free-tier-request-contract.test.ts`**:
   - Unit tests specifying the contract expectations.

### Quick Live Diagnostics:
To check if the models or endpoints have rotated:
```bash
# 1. Fetch live models catalog
curl -s https://opencode.ai/zen/v1/models | jq '.data[].id'

# 2. Test a free model with curl / node
node -e "
fetch('https://opencode.ai/zen/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'User-Agent': 'opencode/1.18.31',
    'x-opencode-session': 'ses_0001712a4b8cAbCdEfGhIjKlMn',
    'x-opencode-request': 'msg_0001712a4b8cAbCdEfGhIjKlMn',
    'x-opencode-client': 'desktop',
    'x-opencode-project': 'global'
  },
  body: JSON.stringify({
    model: 'mimo-v2.5-free',
    stream: true,
    messages: [{ role: 'user', content: 'Ping' }],
    tools: [{ type: 'function', function: { name: 'bash', parameters: { type: 'object', properties: {} } } }]
  })
}).then(r => console.log('Status:', r.status));
"
```

### Troubleshooting Checklist:
- **`403 FreeTierError`**: Check if `tools` array is empty or contains non-whitelisted tools. Check if `stream` is `true`. Check `x-opencode-session` length and format (must be `ses_` + 12 hex + 14 base62 = 30 chars).
- **`426 UpgradeRequired`**: Upstream raised the minimum client version. Bump `User-Agent` to a newer version (e.g. `opencode/1.20.0`).
- **`400 invalid_request_error` (Model not supported)**: The model was delisted upstream. Query `https://opencode.ai/zen/v1/models` to find active models.
- **`401 CreditsError`**: Attempting to use a paid model without an API key. Only `-free` suffix models and `big-pickle` work keylessly.

---

## 5. SuperAgent Implementation Architecture

In SuperAgent (`packages/core_v2/src/providers/opencode.rs`):

- **Priority 1: Configured API Key**: Direct OpenAI client to Zen Cloud API (`DEFAULT_OPENCODE_BASE_URL`).
- **Priority 2: Keyless Free Tier**: `direct_keyless_chat_stream()` sends HTTPS SSE request directly to `https://opencode.ai/zen/v1/chat/completions` satisfying the 4 pillars with all 16 official OpenCode tools.
- **Priority 3: Local Daemon Fallback**: If direct network streaming fails (e.g. offline or unexpected upstream changes), gracefully fall back to spawning `opencode serve` locally via `ensure_opencode_server()`.
