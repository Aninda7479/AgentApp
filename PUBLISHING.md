# Publishing SuperAgent

> Full day-to-day management guide (build, publish, push updates, version
> management, troubleshooting): **[`docs/PUBLISHING.md`](docs/PUBLISHING.md)**.

This guide covers cutting a release for both distribution options:

- **Core + CLI + Web** → published to the public npm registry + a one-line installer hosted on the promo site.
- **Core + Desktop + Web** → cross-platform installers built by `electron-builder` and published to GitHub Releases (with in-app auto-update).

Everything is automated by the workflows in `.github/workflows/`. A release is triggered by pushing a `v*.*.*` git tag.

---

## One-time setup (repo secrets & settings)

1. **npm token** — create an *Automation* token at https://www.npmjs.com/settings/tokens (scope: `read/write packages`, public).
   Add it to the repo as a secret named **`NPM_TOKEN`**
   (`Settings → Secrets and variables → Actions → New repository secret`).
   The `@superagent/*` packages are scoped public (`publishConfig.access: public`), so the token only needs publish rights.

2. **GitHub Pages** — enable the promo site: `Settings → Pages → Build and deployment → Source = "GitHub Actions"`.
   The site is built from `website/` by `.github/workflows/deploy-site.yml` on every push to `main`.

No extra secret is needed for desktop publishing — the built-in `GITHUB_TOKEN` (with `contents: write`) is used by `electron-builder` to create the release and upload assets.

---

## Cutting a release

1. **Sync versions.** All four packages must share the same version (currently `0.1.0`):
   `packages/{core,cli,desktop,web}/package.json`, and `VERSION` in `website/src/config.js`.
   Bump them together, e.g. via `npm version` per workspace or by editing the files.

2. **Commit & tag** on `main`:
   ```bash
   git checkout main
   git pull
   # ...apply version bumps...
   git commit -am "chore: release v0.1.0"
   git tag v0.1.0
   git push origin main --tags
   ```

3. **What runs automatically:**
   - `release.yml` → builds and `npm publish`es `@superagent/core`, `@superagent/cli`, `@superagent/web` (job `publish-npm`), and builds + publishes the desktop installers for **Windows / macOS / Linux** to the GitHub Release `v0.1.0` (job `build-desktop`, matrix). Installers are **unsigned** for now (users bypass the OS Gatekeeper/SmartScreen warning).
   - `deploy-site.yml` → rebuilds the promo site with the new `VERSION` (so the desktop download buttons point at the new asset names) and deploys it to GitHub Pages. Push to `main` after the tag, or it deploys on the next `main` push.

4. **Verify:**
   - npm: `npm view @superagent/cli version` returns the new version.
   - Release: https://github.com/Aninda7479/AgentApp/releases/tag/v0.1.0 has the `.exe`, `.dmg`, `.AppImage`, `.deb`, and the `latest*.yml` auto-update manifests.
   - Site: https://aninda7479.github.io/AgentApp/desktop buttons download the new installers.

5. **Updating installed users** (the sync between publishing and the update flows):
   - **Desktop (Option 2):** the in-app auto-updater (`electron-updater`) reads the
     `github` publish feed configured in `packages/desktop/package.json`
     (`owner: Aninda7479`, `repo: AgentApp`). New releases on the `v*` tag flow to
     **Settings → Updates → Check for Updates** automatically. No action needed beyond
     shipping the tag — the `latest*.yml` manifest the release workflow uploads is what
     the updater consumes.
   - **CLI (Option 1):** `superagent update` re-installs the same `@superagent/cli` and
     `@superagent/web` packages the release published (`npm install -g …@latest`). It
     compares the installed version against `npm view @superagent/cli version` and only
     installs when a newer one exists. `superagent update --check` reports without installing.

---

## Promoting to a custom domain (optional)

The promo site defaults to the GitHub Pages project URL `https://aninda7479.github.io/AgentApp`.
To use e.g. `https://superagent.ai`:

1. Build with `VITE_SITE_URL=https://superagent.ai BASE_PATH="" npm run build` (in `website/`).
2. Add a `CNAME` file containing the domain to `website/public/` (Vite copies it to `dist/`).
3. Configure the domain in `Settings → Pages` and point your DNS at GitHub Pages.
4. Update the install one-liners in `README.md` and the `Terminal`/`InstallForks` components automatically pick up `VITE_SITE_URL`.

---

## Local dry-runs (no publish)

- **Site build:** `cd website && npm ci && npm run build`
- **Install scripts:** `bash -n website/public/install.sh` (syntax), `pwsh -Command "Get-Content website/public/install.ps1 | Out-Null"` (PowerShell syntax).
- **npm pack check:** `npm pack --dry-run --workspace=@superagent/web` (confirms `bin`/`files` are valid).
- **Desktop build (local):** `npm run pack --workspace=@superagent/desktop` produces installers in `packages/desktop/dist-release/` (needs the desktop `npm run build` first).
