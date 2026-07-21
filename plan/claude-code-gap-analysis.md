# Claude Code vs SuperAgent — Feature Gap Analysis

**Date:** 2026-07-21
**Source:** https://code.claude.com/docs/en/overview + full docs index
**Purpose:** Identify features Claude Code has that SuperAgent lacks, with improvement scope.

---

## Executive Summary

Claude Code is a mature, enterprise-grade agentic coding platform with deep integration into the software development lifecycle. SuperAgent is a multi-provider AI agent with unique strengths (multimedia, 3D pet, multi-provider routing) but significant gaps in developer-tooling depth, session management, and enterprise features. This document catalogs every meaningful gap.

---

## 1. HOOKS SYSTEM (LIFECYCLE AUTOMATION)

**Claude Code has it. SuperAgent does NOT.**

Claude Code's hooks system is one of its most powerful extensibility features:

- **20+ hook events**: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Stop`, `StopFailure`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, `ElicitationResult`, `MessageDisplay`
- **5 hook handler types**: command (shell), HTTP, MCP tool, prompt (LLM), agent (subagent)
- **Matcher patterns**: tool name, regex, `if` conditions with permission rule syntax
- **Async hooks**: background execution with optional rewake
- **HTTP hooks**: POST to external endpoints
- **Scoped hooks**: project, personal, enterprise, plugin, skill, agent-level
- **Path placeholders**: `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`

### Improvement Scope
- Implement a hooks system with at minimum: `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd` events
- Support command-type hooks (shell scripts)
- Add matcher patterns for tool name filtering
- Scope hooks to project/global levels

---

## 2. SKILLS SYSTEM (ADVANCED)

**Claude Code has advanced skills. SuperAgent has basic skills.**

Claude Code's skills system is far more mature:

- **Dynamic context injection**: `` !`command` `` syntax runs shell commands and injects output into skill content before the LLM sees it
- **Argument system**: `$ARGUMENTS`, `$ARGUMENTS[N]`, named arguments via frontmatter `arguments` field
- **String substitutions**: `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`
- **Invocation control**: `disable-model-invocation`, `user-invocable` fields
- **Tool pre-approval**: `allowed-tools` / `disallowed-tools` in frontmatter
- **Subagent execution**: `context: fork` runs skill in isolated subagent
- **Model/effort override per skill**: `model` and `effort` frontmatter fields
- **Path-scoped activation**: `paths` glob patterns limit when skill activates
- **Skill stacking**: `/code-review /fix-issue 123` loads multiple skills at once
- **Supporting files**: skills can reference separate markdown, scripts, examples
- **Nested/monorepo skills**: skills discovered from subdirectories on demand
- **Bundled skills**: `/doctor`, `/code-review`, `/batch`, `/debug`, `/loop`, `/run`, `/verify`, `/deep-research`
- **Live change detection**: file changes picked up without restart
- **Skill content lifecycle**: persists across turns, survives compaction with budget

### Improvement Scope
- Add dynamic context injection (`` !`command` `` syntax)
- Implement argument system (`$ARGUMENTS`, named args)
- Add `allowed-tools` / `disallowed-tools` per skill
- Support `context: fork` for subagent execution
- Add model/effort override per skill
- Implement skill stacking (multiple skills in one message)
- Add supporting files capability
- Add nested/monorepo skill discovery

---

## 3. SUBAGENTS (ADVANCED)

**Claude Code has advanced subagents. SuperAgent has basic subagents.**

Claude Code's subagent system is deeply integrated:

- **Custom subagent definitions**: YAML frontmatter markdown files in `.claude/agents/`
- **Scoped agents**: enterprise, CLI-flag, project (`.claude/agents/`), user (`~/.claude/agents/`), plugin
- **Frontmatter fields**: `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `color`, `initialPrompt`
- **Worktree isolation**: `isolation: worktree` gives each subagent its own git worktree
- **Persistent memory**: `memory: user|project|local` for cross-session learning per agent
- **Nested subagents**: subagents can spawn their own subagents
- **Built-in agents**: Explore (read-only, fast), Plan (research), General-purpose
- **@-mention invocation**: `@agent-name` in chat
- **Session-wide mode**: `--agent` flag or `agent` setting makes a subagent the main thread
- **Preloaded skills**: `skills` field injects skill content at startup
- **Hooks in subagents**: `PreToolUse`, `PostToolUse`, `Stop` hooks scoped to agent lifecycle
- **MCP server scoping**: subagent-specific MCP servers (inline or reference)
- **Permission mode override**: `permissionMode` per subagent
- **Live change detection**: agent files watched for changes

### Improvement Scope
- Implement YAML frontmatter-based agent definitions
- Add scoped agent directories (project, user, plugin)
- Support worktree isolation for subagents
- Add persistent memory per agent (`memory: user|project|local`)
- Implement nested subagent spawning
- Add @-mention invocation
- Support preloaded skills in subagents
- Add MCP server scoping per subagent
- Add hooks in subagent frontmatter

---

## 4. CHECKPOINTING & REWIND

**Claude Code has it. SuperAgent does NOT.**

- **Automatic checkpoints**: Every user prompt creates a snapshot of file state
- **100 recent checkpoints** kept per session
- **Rewind menu** (`/rewind` or double-Esc): lists every prompt in the session
- **Restore options**: Restore code and conversation, Restore conversation only, Restore code only
- **Summarize options**: Summarize from here, Summarize up to here (compress context without losing files)
- **Persistent across resume**: checkpoints saved with conversation, available after resume
- **VS Code integration**: baseline diffs from first snapshot

### Improvement Scope
- Implement automatic file snapshotting before each agent turn
- Add rewind UI (list of prompts, restore code/conversation/both)
- Add summarize-from-here / summarize-up-to-here
- Persist checkpoints with session data

---

## 5. WORKTREES (PARALLEL SESSION ISOLATION)

**Claude Code has it. SuperAgent does NOT.**

- **`--worktree` flag**: Creates isolated git worktree for session
- **Auto-creation**: `.claude/worktrees/<name>/` under repo root
- **Branch management**: Auto-creates `worktree-<name>` branch
- **`.worktreeinclude`**: Copy gitignored files (like `.env`) into worktrees
- **Resume support**: Resuming a worktree session returns to that worktree
- **Subagent isolation**: `isolation: worktree` in subagent frontmatter
- **Configurable base**: `worktree.baseRef: "fresh"|"head"` to branch from default or current HEAD
- **PR branching**: `--worktree "#1234"` branches from a pull request
- **Cleanup**: Auto-cleanup of clean worktrees, prompt for dirty ones
- **Non-git VCS**: `WorktreeCreate`/`WorktreeRemove` hooks for SVN, Perforce, etc.
- **Desktop integration**: Every new desktop session gets its own worktree

### Improvement Scope
- Implement `--worktree` flag and git worktree creation
- Add `.worktreeinclude` support
- Add worktree-based subagent isolation
- Implement worktree cleanup on session exit

---

## 6. DYNAMIC WORKFLOWS (ORCHESTRATION AT SCALE)

**Claude Code has it. SuperAgent does NOT.**

- **JavaScript workflow scripts**: Claude writes orchestration scripts that spawn subagents
- **`agent()` function**: Spawn a single subagent from the script
- **`pipeline()` function**: Run one agent per item in a list
- **Parallel execution**: Up to 16 concurrent agents, 1,000 total per run
- **Background execution**: Session stays responsive while agents work
- **Progress view** (`/workflows`): Drill into phases, agents, token usage
- **Resumable**: Stop and resume within same session
- **Saveable**: Save workflow scripts as reusable commands
- **Approval flow**: View raw script before running
- **Size guidelines**: `small|medium|large|unrestricted` to bound scale
- **Bundled workflow**: `/deep-research` for cross-source investigation
- **Ultracode**: Auto-plans workflows for every substantive task
- **Cost tracking**: Per-agent token usage visible in progress view

### Improvement Scope
- Implement a workflow runtime that executes JavaScript orchestration scripts
- Add `agent()` and `pipeline()` helper functions
- Implement background execution with progress view
- Add workflow saving and reuse as commands

---

## 7. ROUTINES (CLOUD SCHEDULING)

**Claude Code has it. SuperAgent does NOT (only local scheduling).**

- **Cloud execution**: Runs on Anthropic-managed infrastructure, works when laptop is closed
- **Three trigger types**: Schedule (cron), API (HTTP POST endpoint), GitHub (webhook events)
- **Cron support**: Hourly, daily, weekdays, weekly, custom cron expressions
- **One-off runs**: Schedule a single future execution
- **API triggers**: Per-routine HTTP endpoint with bearer token authentication
- **GitHub triggers**: PR opened/closed, release created/published, with filters (author, labels, base branch, etc.)
- **Connectors**: MCP servers available during routine runs
- **Environments**: Network access control, env vars, setup scripts (cached)
- **Branch permissions**: Default `claude/` prefix, optional unrestricted push
- **Multi-repo**: Clone and work across multiple repositories
- **Run management**: View past runs, edit routines, pause/resume schedules
- **CLI integration**: `/schedule` command for creation and management

### Improvement Scope
- Implement cloud-based routine execution (or enhance local scheduling)
- Add API trigger endpoints for routines
- Add GitHub webhook triggers
- Implement connector support for routine runs
- Add environment configuration for routines

---

## 8. CODE REVIEW (AUTOMATED PR REVIEW)

**Claude Code has it. SuperAgent does NOT.**

- **Multi-agent analysis**: Fleet of specialized agents examine PRs
- **GitHub integration**: Inline comments on specific lines, check runs
- **Severity levels**: Important (red), Nit (yellow), Pre-existing (gray)
- **Review triggers**: On PR creation, on every push, manual (`@claude review`)
- **REVIEW.md**: Repository-level review customization
- **CLAUDE.md integration**: Violations flagged as nits
- **Check run output**: Machine-readable severity counts for CI parsing
- **Analytics dashboard**: PRs reviewed, cost, feedback counts
- **Local review**: `/code-review` command for terminal review
- **Ultrareview**: Deep multi-agent cloud review (`/code-review ultra`)
- **Fix integration**: `--fix` flag applies findings to working tree

### Improvement Scope
- Implement automated PR review pipeline
- Add GitHub PR integration (inline comments, check runs)
- Add severity classification system
- Implement `/code-review` command
- Add REVIEW.md customization support

---

## 9. PLUGINS (MARKETPLACE ECOSYSTEM)

**Claude Code has a mature plugin system. SuperAgent has a basic plugin/skills system.**

Claude Code's plugin system is far more comprehensive:

- **Plugin manifest** (`.claude-plugin/plugin.json`): name, description, version, author
- **Plugin components**: skills, agents, hooks, MCP servers, LSP servers, monitors, settings, executables
- **Marketplace distribution**: Official and community marketplaces
- **Plugin scoping**: Project, personal, managed (enterprise)
- **Namespaced skills**: `/plugin-name:skill-name` prevents conflicts
- **Plugin hooks**: `hooks/hooks.json` at plugin root
- **Plugin MCP servers**: `.mcp.json` at plugin root, auto-connected
- **Plugin LSP servers**: `.lsp.json` for code intelligence
- **Plugin monitors**: `monitors.json` for background watchers
- **Plugin executables**: `bin/` directory added to Bash PATH
- **Plugin settings**: `settings.json` for default configuration
- **Plugin dependencies**: Version constraints on plugin dependencies
- **Plugin validation**: `claude plugin validate` CLI command
- **Plugin loading**: `--plugin-dir`, `--plugin-url`, marketplace install
- **Plugin reload**: `/reload-plugins` for live updates
- **User configuration**: `user_config` values in plugin hooks

### Improvement Scope
- Implement plugin manifest system (`.superagent-plugin/plugin.json`)
- Add marketplace distribution
- Support plugin-scoped hooks, MCP servers, LSP servers
- Add plugin validation CLI
- Implement plugin namespacing

---

## 10. SESSION MANAGEMENT (ADVANCED)

**Claude Code has advanced session management. SuperAgent has basic session persistence.**

- **Session naming**: Name sessions for easy recall
- **Session resuming**: `--continue` (last), `--resume` (picker), named sessions
- **Session forking**: `--fork-session` creates a branch from current state
- **Session branching**: `/branch` command
- **Session search**: Transcript search with `Ctrl+R`
- **Session export**: Export transcripts
- **Session cleanup**: Configurable `cleanupPeriodDays`
- **PR-linked resume**: Paste PR URL into `/resume` to find the session that created it
- **Session teleport**: `claude --teleport` moves session between surfaces
- **Remote Control**: Continue local session from phone/browser
- **Deep links**: `claude-cli://` URLs to open sessions from alerts/dashboards
- **Session directories**: `~/.claude/projects/` organized by project

### Improvement Scope
- Implement session naming and `/resume` picker
- Add session forking (`--fork-session`)
- Add session branching (`/branch`)
- Implement transcript search
- Add session export
- Add deep link support

---

## 11. PERMISSIONS (ADVANCED)

**Claude Code has advanced permissions. SuperAgent has basic permission modes.**

- **Permission modes**: `default`, `acceptEdits`, `auto`, `plan`, `dontAsk`, `bypassPermissions`
- **Auto mode**: Background classifier reviews commands and writes
- **Auto mode configuration**: Trusted repos, buckets, domains, block/allow rules
- **Permission rules**: Allow/deny with tool-specific syntax (`Bash(git *)`, `Edit(*.ts)`)
- **Managed policies**: Organization-wide permission enforcement
- **Workspace trust**: First-use trust dialog for project directories
- **Permission persistence**: "Don't ask again" saved per project
- **Mode cycling**: Shift+Tab to cycle modes in CLI
- **Plan mode**: Read-only exploration before editing

### Improvement Scope
- Implement auto mode with background classifier
- Add permission rule syntax (`Tool(arg pattern)`)
- Add managed policies for enterprise
- Add workspace trust dialog
- Add plan mode (read-only exploration)

---

## 12. MEMORY (ADVANCED)

**Claude Code has advanced memory. SuperAgent has basic memory.**

- **CLAUDE.md hierarchy**: Root, subdirectory, and nested CLAUDE.md files
- **Auto memory**: Claude saves learnings automatically (build commands, debugging insights)
- **Memory scopes**: Global (`~/.claude/`), project (`.claude/`), nested subdirectory
- **@import syntax**: Import additional files into CLAUDE.md
- **Path-specific rules**: Rules that apply only to specific file patterns
- **Lazy loading**: Instructions loaded on demand during session
- **InstructionsLoaded hook**: Fires when CLAUDE.md files are loaded
- **Memory tool**: Agent-accessible retrieval

### Improvement Scope
- Implement hierarchical CLAUDE.md loading (root + subdirectory)
- Add auto-memory extraction and persistence
- Add @import syntax for additional files
- Add path-specific rules
- Add lazy loading of instructions

---

## 13. MCP (ADVANCED FEATURES)

**Claude Code has advanced MCP features. SuperAgent has basic MCP.**

- **MCP connectors**: Cloud-hosted MCP servers (Slack, Linear, Google Drive, etc.)
- **Connector tool controls**: Organization-level allow/deny/ask per tool
- **Managed MCP**: Organization-wide server configuration
- **MCP tool search**: Discover tools on demand from large tool sets
- **MCP authentication**: `claude mcp login` for OAuth servers
- **MCP resource support**: Read resources by URI
- **MCP prompt support**: List and retrieve prompt templates
- **MCP in subagents**: Scope MCP servers to specific subagents
- **MCP in hooks**: Call MCP tools from hook handlers
- **MCP in routines**: Connectors available during routine runs
- **MCP catalog**: Curated one-click installable servers
- **Per-tool result-size overrides**: Configure max result size per MCP tool
- **Plugin MCP servers**: Auto-connected from plugin `.mcp.json`

### Improvement Scope
- Add MCP connector (cloud-hosted) support
- Add managed MCP configuration
- Add MCP tool search for large tool sets
- Add MCP authentication flow
- Add MCP in hooks

---

## 14. OUTPUT STYLES

**Claude Code has it. SuperAgent does NOT.**

- Customizable output format beyond software engineering
- Adapt Claude for different use cases (writing, analysis, etc.)
- Configurable via settings

### Improvement Scope
- Implement output style system to adapt agent behavior for different domains

---

## 15. STATUS LINE / STATUS BAR

**Claude Code has it. SuperAgent does NOT.**

- Customizable status bar showing context window usage, costs, git status
- `/statusline` command to configure
- Agent-type-specific statusline setup agent

### Improvement Scope
- Implement status bar showing context usage, costs, and git status

---

## 16. SCHEDULED TASKS (LOCAL)

**Claude Code has local scheduled tasks. SuperAgent has basic scheduling.**

- **`/loop` command**: Repeat a prompt within a session for polling
- **Cron scheduling**: Set one-time reminders or recurring tasks within a session
- **Desktop scheduled tasks**: Run on your machine with local file access
- **Task persistence**: Survive across session restarts

### Improvement Scope
- Implement `/loop` command for in-session polling
- Add cron-style scheduling within sessions
- Add desktop scheduled tasks with local file access

---

## 17. GATEWAY / LLM GATEWAY

**Claude Code has gateway support. SuperAgent does NOT.**

- **Self-hosted gateway**: Centralized credentials, usage tracking, cost controls
- **Claude apps gateway**: Enterprise deployment with SSO, per-group model access, OTLP telemetry
- **LLM gateway protocol**: Forward API calls through organization's existing gateway
- **Gateway rollout**: Managed settings for distributing gateway configuration
- **Spend limits**: Per-developer daily/weekly/monthly caps

### Improvement Scope
- Implement LLM gateway support for enterprise deployments
- Add gateway protocol for forwarding API calls
- Add spend limit configuration

---

## 18. ANALYTICS / COST TRACKING (ADVANCED)

**Claude Code has advanced analytics. SuperAgent has basic usage tracking.**

- **Analytics dashboard**: Usage metrics, adoption tracking, engineering velocity
- **Code Review analytics**: PRs reviewed, cost, feedback counts
- **Per-model cost tracking**: Token usage and cost per model
- **Team usage tracking**: Organization-wide metrics
- **Cost management**: Spend limits, usage credits, overage handling

### Improvement Scope
- Implement analytics dashboard with team metrics
- Add Code Review cost tracking
- Add spend limit configuration per user/team

---

## 19. ACCESSIBILITY

**Claude Code has accessibility features. SuperAgent does NOT.**

- Screen reader support (VoiceOver, NVDA)
- Screen magnifier settings
- Reduced motion mode
- Colorblind-friendly themes

### Improvement Scope
- Add screen reader support
- Add reduced motion mode
- Add colorblind-friendly themes

---

## 20. CI/CD INTEGRATION

**Claude Code has deep CI/CD integration. SuperAgent has basic GitHub Actions.**

- **GitHub Actions**: Official action for PR review, issue triage
- **GitLab CI/CD**: Pipeline integration
- **GitHub Enterprise Server**: Self-hosted GitHub support
- **CI-friendly CLI**: `-p` mode for non-interactive execution
- **Pipe/chain support**: Unix philosophy — pipe logs, chain with tools
- **`claude -p` flags**: `--output-format json`, `--max-turns`, `--allowedTools`

### Improvement Scope
- Add GitLab CI/CD integration
- Add GitHub Enterprise Server support
- Enhance `-p` (pipe) mode with more flags
- Add pipe/chain support for Unix workflow integration

---

## 21. MULTI-SURFACE / CROSS-DEVICE

**Claude Code runs everywhere. SuperAgent has CLI + Desktop + Web.**

- **Terminal CLI**: Full-featured command line
- **VS Code extension**: Inline diffs, @-mentions, plan review
- **JetBrains plugin**: IntelliJ, PyCharm, WebStorm
- **Desktop app**: Standalone with visual diff review
- **Web**: Browser-based, no local setup
- **Mobile**: iOS/Android app for monitoring and steering
- **Remote Control**: Continue local session from any device
- **Dispatch**: Message from phone, open in Desktop
- **Teleport**: Move session between surfaces

### Improvement Scope
- Add VS Code extension
- Add JetBrains plugin
- Add mobile app (iOS/Android)
- Add Remote Control for cross-device session continuation
- Add Teleport for session migration between surfaces

---

## 22. CHANNELS (EVENT PUSH)

**Claude Code has channels. SuperAgent has messaging channels (Discord, Slack, etc.) but differently.**

- **Channel contract**: MCP server that pushes events into running session
- **Supported inputs**: Webhooks, alerts, chat messages, monitoring events
- **Claude reacts while you're away**: Events processed in background
- **Channel reference**: Capability declaration, notification events, reply tools, sender gating

### Improvement Scope
- Implement channel system for pushing events into running sessions
- Add webhook endpoint for external event ingestion
- Add notification processing in background

---

## 23. ARTIFACTS (LIVE PAGES)

**Claude Code has it. SuperAgent does NOT.**

- **Shareable pages**: Turn session output into live interactive pages on claude.ai
- **Privacy controls**: Private, organization-only, or public
- **MCP connectors in artifacts**: Pull live data into published artifacts

### Improvement Scope
- Implement artifact publishing (shareable live pages from session output)

---

## 24. FULLSCREEN RENDERING

**Claude Code has it. SuperAgent does NOT.**

- Flicker-free rendering mode
- Mouse support in terminal
- Stable memory usage in long conversations

### Improvement Scope
- Implement fullscreen rendering mode for CLI

---

## 25. FAST MODE

**Claude Code has it. SuperAgent has reasoning effort but no "fast mode" concept.**

- Toggle for faster responses on expensive models
- Lower latency at the cost of some quality

### Improvement Scope
- Add fast mode toggle for quick responses on premium models

---

## 26. SANDBOXED BASH TOOL

**Claude Code has advanced sandboxing. SuperAgent has basic sandbox.**

- **Sandboxed Bash tool**: Filesystem and network isolation
- **Sandbox environments**: Built-in sandbox, dev containers, Docker, VMs
- **Configurable isolation levels**: Per threat model
- **Dev container support**: Run in consistent isolated environments

### Improvement Scope
- Add dev container support
- Add Docker-based sandboxing
- Add configurable isolation levels

---

## 27. ULTRAPLAN

**Claude Code has it. SuperAgent does NOT.**

- Start a plan from CLI, draft on web, execute remotely or in terminal
- Cloud-based planning with execution flexibility

### Improvement Scope
- Implement ultraplan for cloud-based planning

---

## 28. ULTRAREVIEW

**Claude Code has it. SuperAgent does NOT.**

- Deep multi-agent code review in the cloud
- `/code-review ultra` for enhanced bug finding
- Finds and verifies bugs before merge

### Improvement Scope
- Implement ultrareview for deep cloud-based code review

---

## 29. GOAL TRACKING

**Claude Code has `/goal`. SuperAgent has `/goal` but less mature.**

- Set a completion condition
- Claude keeps working across turns until condition is met
- Persistent across turns

### Improvement Scope
- Enhance goal tracking to be more persistent and reliable across turns

---

## 30. PROMPT LIBRARY

**Claude Code has it. SuperAgent does NOT.**

- Collection of copy-paste prompts tagged by task and role
- Community-contributed prompts

### Improvement Scope
- Implement a prompt library with categorized prompts

---

## Priority Ranking

### Critical (High Impact, Should Implement Soon)
1. **Hooks System** — Foundation for all automation
2. **Advanced Skills** (dynamic context, arguments, tool pre-approval)
3. **Advanced Subagents** (YAML definitions, worktree isolation, persistent memory)
4. **Checkpoints & Rewind** — Critical for developer trust
5. **Advanced Session Management** (naming, resuming, forking)
6. **Worktrees** — Parallel session isolation

### High (Significant Competitive Gap)
7. **Dynamic Workflows** — Large-scale orchestration
8. **Routines** (cloud scheduling with API/GitHub triggers)
9. **Code Review** (automated PR analysis)
10. **Advanced MCP** (connectors, managed config, tool search)
11. **Plugin Marketplace** (distribution, validation, namespacing)
12. **Permission Rules** (auto mode, rule syntax, workspace trust)

### Medium (Nice to Have, Differentiation Opportunities)
13. **CLAUDE.md Hierarchy** (nested, lazy-loaded, @import)
14. **Output Styles**
15. **Status Line**
16. **Scheduled Tasks** (local cron, `/loop`)
17. **Analytics Dashboard**
18. **CI/CD Integration** (GitLab, GitHub Enterprise)
19. **Sandboxed Bash** (dev containers, Docker)

### Low (Advanced Enterprise Features)
20. **Gateway / LLM Gateway**
21. **Accessibility**
22. **Multi-Surface** (VS Code, JetBrains, Mobile)
23. **Channels** (event push into sessions)
24. **Artifacts** (shareable live pages)
25. **Fullscreen Rendering**
26. **Fast Mode**
27. **Ultraplan / Ultrareview**
28. **Prompt Library**

---

## SuperAgent Unique Strengths (Not in Claude Code)

For balance, these are features SuperAgent has that Claude Code does NOT:

1. **Multi-provider support** (18+ providers including Ollama local, OpenRouter free tier)
2. **3D Pet companion** (Three.js + VRM + custom characters)
3. **Multimedia generation** (image, audio, video, PDF, PPT)
4. **Best-of-N ensemble** (multi-model parallel + merge strategies)
5. **53D model generation** (Tripo3D/Meshy/local procedural)
6. **Gateway/messaging** (Discord, Slack, Telegram, WhatsApp integration)
7. **Voice dictation** (global hotkey + local Whisper)
8. **Web server mode** (self-hostable, LAN-accessible)
9. **Auto-improvement system** (8 autonomous self-improvement skills)
10. **System tray** with daemon status
11. **Media gallery** with indexing and search
12. **Vector embeddings** and semantic code retrieval
13. **Partner/Pet system** with import/export/sharing
14. **Internet access policy** (all/observation-only/none)
15. **Provider health tracking** with automatic rerouting
