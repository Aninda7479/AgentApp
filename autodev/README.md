# SuperAgent — headless `/auto-improve` loop for a VPS

Drives the skills already in `.claude/skills/` (`auto-improve`, `orchestrator-dev`,
`art-director`, `ux-critic`) via headless Claude Code on a schedule, committing
only to a side branch. Merging that branch into `main` stays a manual decision —
nothing here does it automatically.

## 1. Provision the VPS

```bash
sudo adduser --disabled-password --gecos "" superagent
sudo apt-get update && sudo apt-get install -y jq git

# Node 20 (matches this repo's CI)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Claude Code CLI
sudo npm install -g @anthropic-ai/claude-code
```

## 2. Authenticate Claude Code

Either run `claude setup-token` once (interactively, as the `superagent` user)
and put the resulting token in `CLAUDE_CODE_OAUTH_TOKEN`, or set
`ANTHROPIC_API_KEY` directly. Both go in `/etc/superagent-auto-improve.env`
(see `superagent-auto-improve.env.example`) — **not** inside the repo.

This key belongs to Claude Code, the thing doing the editing. It's separate
from any provider keys you add later inside SuperAgent itself for its own
users — those live in SuperAgent's own settings store.

## 3. Clone the repo and create the side branch

```bash
sudo -u superagent git clone https://github.com/Aninda7479/AgentApp.git /opt/superagent/AgentApp
cd /opt/superagent/AgentApp
sudo -u superagent git checkout -b side-dev origin/main
sudo -u superagent git push -u origin side-dev
```

> The remote currently has `main` and `agent-development` — no `side-dev` yet.
> `agent-development`'s recent history already looks like output from these
> same skills. If that's the branch you've actually been using, set
> `BRANCH=agent-development` in the env file instead of creating a new one.

## 4. Install the driver

```bash
sudo cp run-auto-improve.sh /opt/superagent/run-auto-improve.sh
sudo chmod +x /opt/superagent/run-auto-improve.sh
sudo chown -R superagent:superagent /opt/superagent

sudo cp superagent-auto-improve.env.example /etc/superagent-auto-improve.env
sudo chmod 600 /etc/superagent-auto-improve.env
# edit it: set your token/key, confirm BRANCH

sudo cp superagent-auto-improve@.service /etc/systemd/system/
sudo cp superagent-auto-improve@*.timer /etc/systemd/system/

sudo mkdir -p /var/log/superagent-auto-improve
sudo chown superagent:superagent /var/log/superagent-auto-improve
```

## 5. Test one cycle manually before scheduling anything

```bash
sudo -u superagent -E env $(cat /etc/superagent-auto-improve.env | xargs) \
  SKILL=/auto-improve /opt/superagent/run-auto-improve.sh

cat /var/log/superagent-auto-improve/driver.log
```

Check that it actually committed to `side-dev` (`git log --oneline -5`) and
that the log's `.claude/auto-improve-log.log` entry looks sane before you
let it run unattended.

## 6. Enable the schedule

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now superagent-auto-improve@auto-improve.timer
sudo systemctl enable --now superagent-auto-improve@orchestrator-dev.timer
sudo systemctl enable --now superagent-auto-improve@art-director.timer
sudo systemctl enable --now superagent-auto-improve@ux-critic.timer

systemctl list-timers 'superagent-auto-improve@*'
```

## Operating it

- **Pause instantly**: `touch /opt/superagent/AgentApp/.claude/.auto-improve.pause`
  (any run in progress finishes; new cycles skip until you `rm` the file).
- **Watch it work**: `tail -f /var/log/superagent-auto-improve/driver.log`
- **Per-cycle detail**: JSON files in `/var/log/superagent-auto-improve/`,
  each with `total_cost_usd`, `num_turns`, `is_error`.
- **Shared memory across cycles**: `.claude/auto-improve-log.log` in the repo —
  read its tail to see what the loop thinks it should do next.
- **Getting changes into `main`**: review `side-dev`'s commits yourself
  (`git log main..side-dev`) and open a PR when you're happy with a batch.
  Nothing in this setup merges automatically — deliberately, since your
  installers auto-update from releases built off `main`.
- **Spend caps**: `MAX_TURNS` / `MAX_BUDGET_USD` in the env file are the outer
  guard per cycle; the skill's own context-compaction checkpoints are the
  inner one. Tune both down while you're first trusting this.
- **Flags may drift**: `claude -p --help` on your VPS periodically —
  `--max-budget-usd` and `--permission-mode` are current as of this writing
  but CLI flags do change between Claude Code releases.

## What this deliberately does NOT do

- Auto-merge to `main`.
- Let the loop touch its own guardrails — `/opt/superagent/run-auto-improve.sh`
  and `/etc/superagent-auto-improve.env` live outside `REPO_DIR`, so nothing
  the agent edits inside the repo can change its own budget, schedule, or kill
  switch.
- Give the agent your provider API keys for SuperAgent's own paid models —
  the skill's own rules already restrict live-testing to already-connected,
  free-tagged models only.
