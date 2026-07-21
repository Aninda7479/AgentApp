# SuperAgent Improvement Plan — Based on Claude Code Gap Analysis

**Date:** 2026-07-21
**Reference:** `claude-code-gap-analysis.md`

---

## Phase 1: Core Developer Experience (Weeks 1-4)

### 1.1 Hooks System
- [ ] Define hook events: `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `Stop`
- [ ] Implement command-type hooks (shell script execution)
- [ ] Add matcher patterns (tool name, regex)
- [ ] Add hook handler types: command, HTTP
- [ ] Scope hooks to project/global settings
- [ ] Add hook input/output JSON format

### 1.2 Checkpoints & Rewind
- [ ] Auto-snapshot files before each agent turn
- [ ] Keep 100 most recent checkpoints per session
- [ ] Implement `/rewind` command with checkpoint list
- [ ] Add restore options: code, conversation, both
- [ ] Add summarize-from-here / summarize-up-to-here
- [ ] Persist checkpoints with session data

### 1.3 Advanced Session Management
- [ ] Implement session naming
- [ ] Add `--resume` with session picker UI
- [ ] Add `--fork-session` for session branching
- [ ] Implement transcript search (Ctrl+R)
- [ ] Add session export
- [ ] Add `--continue` for last session

---

## Phase 2: Skills & Agents (Weeks 5-8)

### 2.1 Advanced Skills
- [ ] Add dynamic context injection (`` !`command` `` syntax)
- [ ] Implement argument system (`$ARGUMENTS`, `$ARGUMENTS[N]`, named args)
- [ ] Add `allowed-tools` / `disallowed-tools` in frontmatter
- [ ] Support `context: fork` for subagent execution
- [ ] Add model/effort override per skill
- [ ] Implement skill stacking (multiple `/skills` in one message)
- [ ] Add supporting files capability
- [ ] Add nested/monorepo skill discovery

### 2.2 Advanced Subagents
- [ ] Implement YAML frontmatter agent definitions
- [ ] Add scoped agent directories (`.superagent/agents/`, `~/.superagent/agents/`)
- [ ] Support `isolation: worktree` for git worktree isolation
- [ ] Add `memory: user|project|local` per agent
- [ ] Implement nested subagent spawning
- [ ] Add @-mention invocation
- [ ] Support `skills` field for preloaded skills
- [ ] Add `mcpServers` field for scoped MCP servers
- [ ] Add `hooks` in agent frontmatter

---

## Phase 3: Parallel Execution (Weeks 9-12)

### 3.1 Worktrees
- [ ] Implement `--worktree` flag
- [ ] Add `.worktreeinclude` for gitignored file copying
- [ ] Add worktree-based subagent isolation
- [ ] Implement worktree cleanup on session exit
- [ ] Add PR-branching from worktree (`--worktree "#1234"`)

### 3.2 Dynamic Workflows
- [ ] Implement workflow runtime (JavaScript execution)
- [ ] Add `agent()` and `pipeline()` helper functions
- [ ] Implement background execution with progress view
- [ ] Add `/workflows` command for progress monitoring
- [ ] Add workflow saving as reusable commands
- [ ] Add size guidelines (`small|medium|large`)
- [ ] Implement `/deep-research` bundled workflow

---

## Phase 4: Automation & Integration (Weeks 13-16)

### 4.1 Routines (Cloud Scheduling)
- [ ] Implement cloud-based routine execution
- [ ] Add schedule triggers (cron expressions)
- [ ] Add API trigger endpoints (HTTP POST)
- [ ] Add GitHub webhook triggers (PR, release events)
- [ ] Add connector support for routine runs
- [ ] Add environment configuration (network, env vars, setup scripts)

### 4.2 Code Review
- [ ] Implement multi-agent PR analysis
- [ ] Add GitHub PR integration (inline comments, check runs)
- [ ] Add severity classification (Important, Nit, Pre-existing)
- [ ] Implement `/code-review` command
- [ ] Add REVIEW.md customization
- [ ] Add analytics dashboard

### 4.3 Advanced MCP
- [ ] Add MCP connectors (cloud-hosted servers)
- [ ] Add managed MCP configuration
- [ ] Add MCP tool search for large tool sets
- [ ] Add MCP authentication flow
- [ ] Add MCP in hooks

---

## Phase 5: Enterprise & Polish (Weeks 17-20)

### 5.1 Plugin Marketplace
- [ ] Implement plugin manifest (`.superagent-plugin/plugin.json`)
- [ ] Add marketplace distribution
- [ ] Support plugin-scoped hooks, MCP servers
- [ ] Add plugin validation CLI
- [ ] Implement plugin namespacing (`/plugin:skill`)

### 5.2 Permissions
- [ ] Implement auto mode with background classifier
- [ ] Add permission rule syntax (`Tool(arg pattern)`)
- [ ] Add managed policies for enterprise
- [ ] Add workspace trust dialog
- [ ] Add plan mode (read-only exploration)

### 5.3 Memory
- [ ] Implement hierarchical instruction files (root + subdirectory)
- [ ] Add auto-memory extraction and persistence
- [ ] Add @import syntax for additional files
- [ ] Add path-specific rules
- [ ] Add lazy loading of instructions

---

## Phase 6: Advanced Features (Weeks 21-24)

### 6.1 CI/CD Integration
- [ ] Add GitLab CI/CD integration
- [ ] Add GitHub Enterprise Server support
- [ ] Enhance pipe/chain mode

### 6.2 Multi-Surface
- [ ] Add VS Code extension
- [ ] Add JetBrains plugin
- [ ] Add mobile app (iOS/Android)
- [ ] Add Remote Control for cross-device sessions

### 6.3 Enterprise Features
- [ ] Add LLM gateway support
- [ ] Add analytics dashboard
- [ ] Add accessibility features
- [ ] Add output styles
- [ ] Add status line
- [ ] Add prompt library

---

## Key Design Decisions

1. **Maintain multi-provider advantage** — Never lose the 18+ provider support that differentiates SuperAgent
2. **Keep unique features** — 3D pet, multimedia generation, voice dictation are differentiators
3. **Prioritize developer experience** — Hooks, checkpoints, and session management are table stakes
4. **Enterprise readiness** — Managed policies, gateway, analytics are needed for enterprise adoption
5. **Incremental delivery** — Each phase delivers standalone value

---

## Success Metrics

- **Phase 1**: Users can automate workflows with hooks and safely rewind mistakes
- **Phase 2**: Skills and agents are composable, shareable, and powerful
- **Phase 3**: Parallel execution scales to large codebases
- **Phase 4**: Automated routines and code review reduce manual toil
- **Phase 5**: Enterprise features enable team/org adoption
- **Phase 6**: Multi-surface and advanced features match Claude Code's breadth
