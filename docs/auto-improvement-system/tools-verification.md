# Tools Verification — Deep Dive

What each tool does in the loop, how to verify it, and how to fix failures.

---

## Tool Matrix

| Tool | Required By | What Fails Without It |
|------|-------------|----------------------|
| `node >= 18` | All skills | Skills can't run — built on Node.js |
| `npm run build` | All skills | Can't verify changes before committing |
| `claude` CLI | Claude-driver | Can't run skills headlessly |
| `claude` auth | Claude-driver | Skills authenticate to Anthropic to make AI calls |
| `gh` CLI | All drivers | Can't create draft PRs — must push branch + create manually |
| `git push` access | All drivers | Changes stay local, never reach GitHub |
| `superagent` CLI | SA-driver | SA-driver falls back to claude — not fatal |
| Lock file RW | All skills | Race condition between concurrent runs → cross-commit |
| Branch create | All drivers | Can't create per-cycle branch |
| `WebSearch` | All 8 skills | Research step skips or fails — reduces improvement quality |

---

## 1. `node >= v18`

**What it does**: Skills run `npm run build`, `npm test`, `npx vitest`, etc. — all Node.js.

**Verify**:
```powershell
node --version   # must be v18.x, v20.x, v22.x, etc.
```

**Fix**: Download LTS from [nodejs.org](https://nodejs.org). On Windows, prefer the installer.
After installing, restart your terminal (PATH update).

---

## 2. `npm run build`

**What it does**: Skills build the project before committing to verify their changes don't break compilation.

**Verify**:
```powershell
npm run build    # should exit 0 with no TypeScript errors
```

**Fix**: If build fails on a clean checkout, there's a pre-existing bug. Run `npm run build 2>&1 | tail -30`
to see the TypeScript errors and fix them before starting the loop.

---

## 3. `claude` CLI

**What it does**: The primary loop driver calls `claude -p /skill-name` to run each skill headlessly.

**Verify**:
```powershell
claude --version
```

**Install**:
```powershell
npm install -g @anthropic-ai/claude-code
```

**Fix**: If `claude` is not found after install, the npm global bin directory may not be in PATH.
```powershell
npm config get prefix    # e.g. C:\Users\anind\AppData\Roaming\npm
# Add that path + \bin to your system PATH
```

---

## 4. `claude` CLI Authentication

**What it does**: The `claude` process makes API calls to Anthropic on each tool call
(WebSearch, Read, Edit, Bash, etc.). Without auth, every call fails with 401.

**Verify**:
```powershell
# Interactive test — should print something coherent
echo "Say OK" | claude --max-turns 1
```

**Fix options**:
- **Option A** (OAuth — recommended for long-running loops):
  ```powershell
  claude login    # opens browser for interactive auth
  ```
  This stores a long-lived token locally. No need to set `ANTHROPIC_API_KEY`.

- **Option B** (API key — for VPS/CI):
  Set `ANTHROPIC_API_KEY=sk-ant-...` in `autodev\superagent-auto-improve.env`.

---

## 5. `gh` CLI (GitHub CLI)

**What it does**: After each cycle, the driver calls `gh pr create --draft` to open a PR
from the cycle branch to `agent-development`. Without `gh`, branches are pushed but no PR is created
(you'd need to open the PR manually on GitHub).

**Verify**:
```powershell
gh auth status    # should say "Logged in to github.com"
```

**Install**: [cli.github.com](https://cli.github.com) or `winget install GitHub.cli`

**Authenticate**:
```powershell
gh auth login
# Choose: GitHub.com → HTTPS → Login with a web browser
```

**Fix if `gh pr create` fails with label error**:
The workflow tries to create an `auto-generated` label if it doesn't exist. If you get a
403 error, you need `write:org` scope. Re-auth:
```powershell
gh auth login --scopes "repo,write:org"
```

---

## 6. `git push` Access

**What it does**: After committing, the driver pushes the per-cycle branch to `origin`. Without
push access, the branch stays local and no PR can be created.

**Verify**:
```powershell
git push --dry-run    # should say "Everything up-to-date" or list objects to push
```

**Fix**: If you get "Permission denied" or "Authentication failed":
- Make sure you're authenticated with git credential manager
- Run: `git credential reject` then `git push` again to re-enter credentials
- Or configure SSH keys for GitHub and switch remote to SSH:
  ```powershell
  git remote set-url origin git@github.com:Aninda7479/AgentApp.git
  ```

---

## 7. `superagent` CLI (Optional)

**What it does**: Used by `run-auto-improve-superagent.sh/.ps1` to make the loop self-hosting —
SuperAgent improves itself using its own engine. If not found, this driver automatically falls
back to `claude` CLI.

**Verify**:
```powershell
superagent --version    # should print version
```

**Build it** (if not installed globally):
```powershell
npm run build            # build all packages
node packages/cli/dist/bin/main.js --version
```

---

## 8. Lock File System

**What it does**: Prevents two concurrent loop cycles from both editing and committing
simultaneously (cross-commit hazard). The TypeScript `tryAcquireAutoImproveLock()` and the
bash `$LOCK` check both write to `.claude/.auto-improve.lock`.

**Verify**:
```powershell
# Create and delete the lock file
$lockPath = ".claude\.auto-improve.lock"
New-Item -ItemType Directory -Path ".claude" -Force | Out-Null
Set-Content -Path $lockPath -Value '{"test":true}'
Remove-Item $lockPath
```

**Fix**: Usually a permissions issue. Make sure your user owns the `.claude/` directory:
```powershell
icacls .claude /grant "$env:USERNAME:(OI)(CI)F"
```

**Stuck lock** (a crashed cycle left the lock file):
```powershell
Remove-Item .claude\.auto-improve.lock -ErrorAction SilentlyContinue
```
The 9-minute staleness check in `tryAcquireAutoImproveLock()` handles this automatically,
but you can remove it manually if you know the previous cycle is dead.

---

## 9. `WebSearch` / `WebFetch`

**What it does**: Every skill's mandatory Step 2 (Online Research) uses `WebSearch` to find
URLs and `WebFetch` to read them. Without these tools working, the research gate blocks the cycle.

**Verify**:
```powershell
# Real search test — should return a URL-containing response
echo "Search for: current Node.js LTS version site:nodejs.org" |
    claude --max-turns 2 --allowedTools "WebSearch,WebFetch"
```

**What can go wrong**:
- `WebSearch` is a Claude Code built-in. It works whenever `claude` auth works.
- If Claude Code blocks WebSearch for any reason, add it explicitly:
  `--allowedTools "Read,Grep,Glob,Edit,Write,Bash,WebSearch,WebFetch,TodoWrite"`
  The drivers already pass this flag.

**If research cache files are empty**: The skill ran but the research gate was bypassed.
Check the skill's Step 2 output in the cycle log. The gate is enforced by skill text —
if Claude skipped it, it's a model-behavior issue. The research-cache file will be missing
for that cycle.

---

## Common Failure Scenarios

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Branch created but no PR | `gh` not authenticated | Run `gh auth login` |
| Skills commit nothing | Lock held by crashed previous run | `rm .claude/.auto-improve.lock` |
| Context crash mid-cycle | Playwright snapshot in art-director/ux-critic | This is fixed — those skills no longer call Playwright directly. Update to latest SKILL.md |
| Research log is empty | Step 2 was skipped by model | Check skill SKILL.md — mandatory gate must be present |
| Build fails after update | dependency-guardian broke something | Revert: `git checkout package.json package-lock.json` |
| CI fails on PR | Loop committed non-compiling code | Don't merge — the loop should have caught this via Step 5 |
