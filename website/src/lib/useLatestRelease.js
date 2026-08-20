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

function buildReleaseData(version, tag, platformInfo, assets = null, publishedAt = null, allReleasesUrl = null) {
  const cleanVer = (version || VERSION).replace(/^v/, '')
  const tagName = tag || `v${cleanVer}`

  const findUrl = (regex) => {
    if (!Array.isArray(assets)) return null
    const item = assets.find(a => regex.test(a.name))
    return item ? item.browser_download_url : null
  }

  // Desktop installer links
  const winExe = findUrl(/^SuperAgent.*x64.*\.exe$/i) || `${REPO}/releases/download/${tagName}/SuperAgent_${cleanVer}_x64-setup.exe`
  const winMsi = findUrl(/^SuperAgent.*\.msi$/i) || `${REPO}/releases/download/${tagName}/SuperAgent_${cleanVer}_x64_en-US.msi`
  const macArm = findUrl(/^SuperAgent.*(aarch64|arm64).*\.dmg$/i) || `${REPO}/releases/download/${tagName}/SuperAgent_${cleanVer}_aarch64.dmg`
  const macIntel = findUrl(/^SuperAgent.*(x64|x86_64).*\.dmg$/i) || `${REPO}/releases/download/${tagName}/SuperAgent_${cleanVer}_x64.dmg`
  const linuxAppImage = findUrl(/^SuperAgent.*\.AppImage$/i) || `${REPO}/releases/download/${tagName}/SuperAgent_${cleanVer}_amd64.AppImage`
  const linuxDeb = findUrl(/^SuperAgent.*\.deb$/i) || `${REPO}/releases/download/${tagName}/SuperAgent_${cleanVer}_amd64.deb`
  const linuxRpm = findUrl(/^SuperAgent.*\.rpm$/i) || `${REPO}/releases/download/${tagName}/SuperAgent-${cleanVer}-1.x86_64.rpm`

  // CLI / Standalone Server links
  const cliLinuxX64 = findUrl(/^superagent-cli.*linux-x64.*\.tar\.gz$/i) || `${REPO}/releases/download/${tagName}/superagent-cli-v${cleanVer}-linux-x64.tar.gz`
  const cliLinuxArm = findUrl(/^superagent-cli.*linux-arm64.*\.tar\.gz$/i) || `${REPO}/releases/download/${tagName}/superagent-cli-v${cleanVer}-linux-arm64.tar.gz`
  const cliWin = findUrl(/^superagent-cli.*(win|windows).*\.zip$/i) || `${REPO}/releases/download/${tagName}/superagent-cli-v${cleanVer}-windows-x64.zip`
  const cliMacArm = findUrl(/^superagent-cli.*macos-arm64.*\.zip$/i) || `${REPO}/releases/download/${tagName}/superagent-cli-v${cleanVer}-macos-arm64.zip`
  const cliMacIntel = findUrl(/^superagent-cli.*macos-x64.*\.zip$/i) || `${REPO}/releases/download/${tagName}/superagent-cli-v${cleanVer}-macos-x64.zip`

  // Browser Extension zip package
  const extensionZip = findUrl(/^superagent-browser-extension.*\.zip$/i) || `${REPO}/releases/download/${tagName}/superagent-browser-extension-v${cleanVer}.zip`

  return {
    version: cleanVer,
    tagName,
    publishedAt,
    allReleasesUrl: allReleasesUrl || (cleanVer ? `${REPO}/releases/tag/${tagName}` : RELEASES_LATEST),
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
}

export function useLatestRelease() {
  const platformInfo = detectUserPlatform()
  const initialData = buildReleaseData(VERSION, `v${VERSION}`, platformInfo)

  const [release, setRelease] = useState({
    ...initialData,
    loading: true,
    userOs: platformInfo.os,
    userOsLabel: platformInfo.osLabel,
    isArm: platformInfo.isArm,
  })

  useEffect(() => {
    let isMounted = true

    const applyRelease = (data) => {
      if (!isMounted) return
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          data,
          timestamp: Date.now()
        }))
      } catch (_) {}

      setRelease(prev => ({
        ...prev,
        ...data,
        loading: false
      }))
    }

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

    async function fetchLatest() {
      // 1. Primary: GitHub Releases API (provides exact assets & timestamps)
      try {
        const res = await fetch('https://api.github.com/repos/Aninda7479/AgentApp/releases/latest', {
          headers: { Accept: 'application/vnd.github.v3+json' }
        })
        if (res.ok) {
          const data = await res.json()
          if (data && data.tag_name) {
            const assets = Array.isArray(data.assets) ? data.assets.filter(a => !a.name.endsWith('.sig')) : []
            const tag = data.tag_name
            const cleanVer = tag.replace(/^v/, '')
            const releaseData = buildReleaseData(cleanVer, tag, platformInfo, assets, data.published_at, data.html_url)
            applyRelease(releaseData)
            return
          }
        }
      } catch (err) {
        console.warn('GitHub Releases API lookup failed, falling back to raw CDN:', err)
      }

      // 2. Secondary: Fastly CDN raw.githubusercontent.com (zero API rate-limit)
      try {
        const rawRes = await fetch('https://raw.githubusercontent.com/Aninda7479/AgentApp/release/packages/desktop/package.json')
        if (rawRes.ok) {
          const pkg = await rawRes.json()
          if (pkg && pkg.version) {
            const releaseData = buildReleaseData(pkg.version, `v${pkg.version}`, platformInfo)
            applyRelease(releaseData)
            return
          }
        }
      } catch (err) {
        console.warn('Raw GitHub CDN fallback failed:', err)
      }

      // 3. Fallback: Build-time bundled constants
      if (isMounted) {
        setRelease(prev => ({ ...prev, loading: false }))
      }
    }

    fetchLatest()

    return () => {
      isMounted = false
    }
  }, [])

  return release
}
