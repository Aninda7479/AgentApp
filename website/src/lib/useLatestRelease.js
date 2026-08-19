import { useState, useEffect } from 'react'
import { REPO, VERSION, DL, SERVER_DL, EXTENSION_DL, RELEASES_LATEST } from '../config.js'

// Detect Client OS and Arch in browser
export function detectUserPlatform() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { os: 'windows', osLabel: 'Windows', isArm: false }
  }

  const userAgent = (navigator.userAgent || '').toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()

  let os = 'windows'
  let osLabel = 'Windows'

  if (userAgent.includes('mac') || platform.includes('mac')) {
    os = 'macos'
    osLabel = 'macOS'
  } else if (userAgent.includes('linux') || platform.includes('linux')) {
    os = 'linux'
    osLabel = 'Linux'
  }

  // Attempt Apple Silicon detection
  let isArm = false
  if (os === 'macos') {
    if (navigator.userAgentData?.architecture === 'arm') {
      isArm = true
    } else {
      // Default to arm64 for modern macOS as Apple Silicon is most prevalent
      isArm = true
    }
  }

  return { os, osLabel, isArm }
}

const CACHE_KEY = 'superagent_latest_release_v1'
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export function useLatestRelease() {
  const platformInfo = detectUserPlatform()
  
  const defaultState = {
    version: VERSION,
    tagName: `v${VERSION}`,
    publishedAt: null,
    loading: true,
    userOs: platformInfo.os,
    userOsLabel: platformInfo.osLabel,
    isArm: platformInfo.isArm,
    allReleasesUrl: RELEASES_LATEST,
    extension: EXTENSION_DL,
    desktop: {
      win: DL.win,
      winMsi: DL.winMsi,
      mac: platformInfo.isArm ? DL.mac : DL.macIntel,
      macArm: DL.mac,
      macIntel: DL.macIntel,
      linux: DL.linux,
      linuxDeb: DL.deb,
      linuxRpm: `${REPO}/releases/latest/download/SuperAgent-${VERSION}-1.x86_64.rpm`,
    },
    server: {
      linux: SERVER_DL.linux,
      linuxArm: `${REPO}/releases/latest/download/superagent-cli-v${VERSION}-linux-arm64.tar.gz`,
      windows: SERVER_DL.windows,
      mac: SERVER_DL.mac,
      macIntel: `${REPO}/releases/latest/download/superagent-cli-v${VERSION}-macos-x64.zip`,
    }
  }

  const [release, setRelease] = useState(defaultState)

  useEffect(() => {
    let isMounted = true

    // Check sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL && data) {
          setRelease(prev => ({ ...prev, ...data, loading: false }))
          return
        }
      }
    } catch (_) {}

    // Fetch from GitHub Releases API
    fetch('https://api.github.com/repos/Aninda7479/AgentApp/releases/latest', {
      headers: { Accept: 'application/vnd.github.v3+json' }
    })
      .then(res => {
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (!isMounted || !data || !Array.isArray(data.assets)) return

        const assets = data.assets.filter(a => !a.name.endsWith('.sig'))
        const findUrl = (regex) => {
          const item = assets.find(a => regex.test(a.name))
          return item ? item.browser_download_url : null
        }

        const tag = data.tag_name || `v${VERSION}`
        const cleanVer = tag.replace(/^v/, '')

        // Desktop installer links
        const winExe = findUrl(/^SuperAgent.*x64.*\.exe$/i) || `${REPO}/releases/download/${tag}/SuperAgent_${cleanVer}_x64-setup.exe`
        const winMsi = findUrl(/^SuperAgent.*\.msi$/i) || `${REPO}/releases/download/${tag}/SuperAgent_${cleanVer}_x64_en-US.msi`
        const macArm = findUrl(/^SuperAgent.*(aarch64|arm64).*\.dmg$/i) || `${REPO}/releases/download/${tag}/SuperAgent_${cleanVer}_aarch64.dmg`
        const macIntel = findUrl(/^SuperAgent.*(x64|x86_64).*\.dmg$/i) || `${REPO}/releases/download/${tag}/SuperAgent_${cleanVer}_x64.dmg`
        const linuxAppImage = findUrl(/^SuperAgent.*\.AppImage$/i) || `${REPO}/releases/download/${tag}/SuperAgent_${cleanVer}_amd64.AppImage`
        const linuxDeb = findUrl(/^SuperAgent.*\.deb$/i) || `${REPO}/releases/download/${tag}/SuperAgent_${cleanVer}_amd64.deb`
        const linuxRpm = findUrl(/^SuperAgent.*\.rpm$/i) || `${REPO}/releases/download/${tag}/SuperAgent-${cleanVer}-1.x86_64.rpm`

        // CLI / Standalone Server links
        const cliLinuxX64 = findUrl(/^superagent-cli.*linux-x64.*\.tar\.gz$/i) || `${REPO}/releases/download/${tag}/superagent-cli-v${cleanVer}-linux-x64.tar.gz`
        const cliLinuxArm = findUrl(/^superagent-cli.*linux-arm64.*\.tar\.gz$/i) || `${REPO}/releases/download/${tag}/superagent-cli-v${cleanVer}-linux-arm64.tar.gz`
        const cliWin = findUrl(/^superagent-cli.*(win|windows).*\.zip$/i) || `${REPO}/releases/download/${tag}/superagent-cli-v${cleanVer}-windows-x64.zip`
        const cliMacArm = findUrl(/^superagent-cli.*macos-arm64.*\.zip$/i) || `${REPO}/releases/download/${tag}/superagent-cli-v${cleanVer}-macos-arm64.zip`
        const cliMacIntel = findUrl(/^superagent-cli.*macos-x64.*\.zip$/i) || `${REPO}/releases/download/${tag}/superagent-cli-v${cleanVer}-macos-x64.zip`

        // Browser Extension zip package
        const extensionZip = findUrl(/^superagent-browser-extension.*\.zip$/i) || `${REPO}/releases/download/${tag}/superagent-browser-extension-v${cleanVer}.zip`

        const releaseData = {
          version: cleanVer,
          tagName: tag,
          publishedAt: data.published_at,
          allReleasesUrl: data.html_url || RELEASES_LATEST,
          extension: extensionZip,
          desktop: {
            win: winExe,
            winMsi: winMsi,
            mac: platformInfo.isArm ? macArm : (macIntel || macArm),
            macArm: macArm,
            macIntel: macIntel || macArm,
            linux: linuxAppImage,
            linuxDeb: linuxDeb,
            linuxRpm: linuxRpm,
          },
          server: {
            linux: cliLinuxX64,
            linuxArm: cliLinuxArm,
            windows: cliWin,
            mac: cliMacArm,
            macIntel: cliMacIntel,
          }
        }

        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            data: releaseData,
            timestamp: Date.now()
          }))
        } catch (_) {}

        setRelease(prev => ({
          ...prev,
          ...releaseData,
          loading: false
        }))
      })
      .catch(err => {
        console.warn('Could not fetch dynamic latest release, using fallback:', err)
        if (isMounted) {
          setRelease(prev => ({ ...prev, loading: false }))
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  return release
}
