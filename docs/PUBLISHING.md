# 📦 Publishing & Release Management

How to build, publish, and push updates for SuperAgent's two distribution options.

SuperAgent ships in **two** builds that share the same autonomous core:

| Option | Packages | Installed via | Updates via |
| :--- | :--- | :--- | :--- |
| **1. Core + CLI + Web** | `@superagent/core`, `@superagent/cli`, `@superagent/web` | `npm install -g` (one-liner from the site) | `superagent update` (npm) |
| **2. Core + Desktop + Web** | `@superagent/core` + Electron app | native installer (Win/macOS/Linux) | in-app auto-update (GitHub Releases) |

All four packages share one version number (`0.1.0` today). Keep them in lockstep.

---

## 🔧 Prerequisites (one-time, repo-level)

- **`NPM_TOKEN`** (Automation token, public scope) added to
  `Settings → Secrets and variables → Actions → New repository secret`.
  Used by the release workflow to `npm publish`.
- **GitHub Pages enabled**: `Settings → Pages → Source = "GitHub Actions"`.
  The promo site is built and deployed by the `deploy-site.yml` workflow.
- A maintainer with push access to `main` (release tags are cut there).

No extra secret is needed for desktop publishing — the built-in `GITHUB_TOKEN`
(with `contents: write`) lets `electron-builder` create the release and upload
assets.

---

## 🧱 Building locally

```bash
# Install all workspace dependencies once
npm install

# Build every package in dependency order (core → cli → web → desktop)
npm run build

# Build just one package
npm run build --workspace=@superagent/core
npm run build --workspace=@superagent/cli
npm run build --workspace=@superagent/web
npm run build --workspace=@superagent/desktop

# Build the promotion site (served at /AgentApp/ on GitHub Pages)
cd website && npm ci && npm run build
```

The web server lives inside `@superagent/core` (`startWebServer`), so installing
the CLI alone already delivers Core + Web. `superagent --start-web` launches it.

---

## 🔢 Managing versions

Before any release, bump **all four** `version` fields to the same value and keep
the promo-site `VERSION` in sync:

- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/desktop/package.json`
- `packages/web/package.json`
- `website/src/config.js` → `export const VERSION = '…'`

```bash
# Quick manual bump across the workspaces, then edit website/src/config.js to match
npm version patch --workspace=@superagent/core \
                   --workspace=@superagent/cli \
                   --workspace=@superagent/desktop \
                   --workspace=@superagent/web
```

The desktop build emits deterministic artifact names (set in
`packages/desktop/package.json`), so the download buttons on the promo site always
resolve to the right file:

- `SuperAgent-Setup-${version}.exe` (Windows, nsis + portable)
- `SuperAgent-${version}.dmg` (macOS)
- `SuperAgent-${version}.AppImage` (Linux)
- `superagent-${version}-amd64.deb` (Linux)

---

## 🚀 Publishing a release

Publishing is fully automated and triggered by pushing a `v*.*.*` git tag.

```bash
# 1. Make sure you're on an up-to-date main with the version bumps committed
git checkout main
git pull

# 2. Tag and push — this kicks off release.yml
git tag v0.1.0
git push origin main --tags
```

What runs automatically:

- **`release.yml` → `publish-npm`** (Ubuntu): builds core → cli → web, then
  `npm publish`es each (`NPM_TOKEN`). These are the Option 1 packages.
- **`release.yml` → `build-desktop`** (matrix: macOS / Windows / Ubuntu): builds
  core then desktop, then `npm run pack --workspace=@superagent/desktop
  -- --publish=always`. Each runner uploads its OS installers **and** the
  `latest*.yml` auto-update manifests to the GitHub Release `v0.1.0`.
  Installers are **unsigned** for now (`CSC_IDENTITY_AUTO_DISCOVERY=false`); users
  bypass the OS Gatekeeper / SmartScreen warning.
- **`deploy-site.yml`**: rebuilds the promo site with the new `VERSION` (so the
  desktop download buttons point at the new asset names) and deploys to GitHub
  Pages on every push to `main`.

The promo site is published independently of tags — any `main` push that touches
`website/**` redeploys it.

---

## 🔄 Pushing updates to installed users

This is the **sync** between publishing and the update flows. Once a `v*` tag
ships, users update through the channel they installed from — no manual
intervention required beyond cutting the tag.

### Option 2 — Desktop (GitHub Releases auto-update)

The in-app auto-updater (`electron-updater`) reads the `github` publish feed
configured in `packages/desktop/package.json`:

```json
"publish": [{ "provider": "github", "owner": "Aninda7479", "repo": "AgentApp" }]
```

New releases flow straight to **Settings → Updates → Check for Updates** (and
download silently, installing on quit). The `latest*.yml` manifest that
`release.yml` uploads is exactly what the updater consumes — that's the whole
contract. To disable auto-update entirely, set `SUPERAGENT_DISABLE_UPDATER=1`.

### Option 1 — CLI (npm self-update)

`superagent update` re-installs the same `@superagent/cli` and `@superagent/web`
packages the release published, comparing the installed version against
`npm view @superagent/cli version` first:

```bash
superagent update          # install the latest published version
superagent update --check  # report only, don't install
# equivalent manual form:
npm install -g @superagent/cli @superagent/web
```

It degrades gracefully when npm is unreachable, the package isn't published yet,
or a global install hits a permission error (it prints the manual `npm install -g`
line plus a `sudo` / nvm hint).

---

## 🧪 Verifying before you push a tag

Run these locally (no publish) to catch issues early:

```bash
# Site compiles with the /AgentApp/ base path
cd website && npm ci && npm run build

# Install scripts are syntactically valid
bash -n website/public/install.sh
pwsh -Command "Get-Content website/public/install.ps1 | Out-Null"

# The published web bin + shebang are correct
npm pack --dry-run --workspace=@superagent/web
head -2 packages/web/dist/server.js        # should show #!/usr/bin/env node

# Installers build locally (needs the desktop build first)
npm run build --workspace=@superagent/desktop
npm run pack --workspace=@superagent/desktop   # → packages/desktop/dist-release/
```

After pushing the tag, confirm:

- `npm view @superagent/cli version` returns the new version.
- The release at `https://github.com/Aninda7479/AgentApp/releases/tag/v0.1.0`
  has the `.exe`, `.dmg`, `.AppImage`, `.deb`, **and** the `latest*.yml` files.
- The promo site's `/desktop` buttons download the new installers.

---

## 🌐 Custom domain (optional)

The promo site defaults to `https://aninda7479.github.io/AgentApp`. To use e.g.
`https://superagent.ai`:

1. Build with `VITE_SITE_URL=https://superagent.ai BASE_PATH="" npm run build`
   (in `website/`).
2. Add a `CNAME` file containing the domain to `website/public/`.
3. Configure the domain in `Settings → Pages` and point DNS at GitHub Pages.
4. The install one-liners and download buttons pick up `VITE_SITE_URL`
   automatically via `website/src/config.js`.
