// Single source of truth for deploy-time URLs used across the site.
// Override SITE_URL for a custom domain by building with
//   VITE_SITE_URL=https://your.domain npm run build
// (and set the matching Vite `base` via BASE_PATH — see vite.config.js).

export const REPO = 'https://github.com/Aninda7479/AgentApp'

// Where the promo site itself is served from. On GitHub Pages project sites
// this is https://<user>.github.io/<repo>; for a custom domain set VITE_SITE_URL.
export const SITE_URL =
  (import.meta.env && import.meta.env.VITE_SITE_URL) ||
  'https://aninda7479.github.io/AgentApp'

// Current published version — keep in sync with the package versions.
export const VERSION = '0.1.0'

// Raw install-script endpoints (served from website/public/).
export const INSTALL_SH = `${SITE_URL}/install.sh`
export const INSTALL_PS1 = `${SITE_URL}/install.ps1`

// Latest GitHub release (used as a fallback / "all downloads" link).
export const RELEASES_LATEST = `${REPO}/releases/latest`

// Deterministic installer asset URLs. Names come from the explicit
// `artifactName` set in packages/desktop/package.json (Phase D).
export const DL = {
  win: `${REPO}/releases/latest/download/SuperAgent-Setup-${VERSION}.exe`,
  winPortable: `${REPO}/releases/latest/download/SuperAgent-Portable-${VERSION}.exe`,
  mac: `${REPO}/releases/latest/download/SuperAgent-${VERSION}.dmg`,
  linux: `${REPO}/releases/latest/download/SuperAgent-${VERSION}.AppImage`,
  deb: `${REPO}/releases/latest/download/superagent-${VERSION}-amd64.deb`
}
