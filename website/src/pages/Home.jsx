import { Link } from 'react-router-dom'
import Terminal from '../components/Terminal.jsx'
import InstallForks from '../components/InstallForks.jsx'
import Features from '../components/Features.jsx'
import Roadmap from '../components/Roadmap.jsx'
import CtaBand from '../components/CtaBand.jsx'
import Atmosphere from '../components/Atmosphere.jsx'
import { useLatestRelease } from '../lib/useLatestRelease.js'

export default function Home() {
  const release = useLatestRelease()
  const userOs = release.userOs || 'windows'

  const directDownloadUrl = 
    userOs === 'macos' ? release.desktop.mac :
    userOs === 'linux' ? release.desktop.linux :
    release.desktop.win

  const directDownloadLabel =
    userOs === 'macos' ? 'Download for macOS (.dmg)' :
    userOs === 'linux' ? 'Download for Linux (.AppImage)' :
    'Download for Windows (.exe)'

  return (
    <>
      <section className="hero container">
        <Atmosphere variant="dusk" />
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Open-source · Autonomous · Privacy-first</p>
            <h1 className="h-display">An autonomous agent, <span className="accent">running on your terms.</span></h1>
            <p className="lead">SuperAgent codes, drives your browser, generates media, and runs terminal workflows — all on your machine. One command and it’s awake, working, and entirely yours.</p>
            
            <div className="hero-cta" style={{ flexWrap: 'wrap', gap: '10px' }}>
              <a 
                className="btn btn-primary" 
                href={directDownloadUrl} 
                download
                title={`Direct download for ${release.userOsLabel} v${release.version}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '6px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {directDownloadLabel}
              </a>
              <Link className="btn btn-ghost" to="/cli">
                Install CLI
              </Link>
            </div>

            <div style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              <span>v{release.version} &bull; </span>
              <a href="#install" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                All platforms &amp; CLI options ↓
              </a>
            </div>

            <div className="stat-strip">
              <span>GPL-3.0 / AGPL-3.0</span>
              <span>Local-first</span>
              <span>Windows · macOS · Linux</span>
              <span>No telemetry</span>
            </div>
          </div>

          <Terminal />
        </div>
      </section>

      <section id="install" style={{ background: 'linear-gradient(180deg, #143028 0%, #112821 100%)', width: '100%', overflow: 'hidden' }}>
        <div className="section container">
          <InstallForks />
        </div>
      </section>

      <section id="features" style={{ background: 'linear-gradient(180deg, #112821 0%, #0d1f1a 100%)', width: '100%', overflow: 'hidden' }}>
        <div className="section container">
          <Features />
        </div>
      </section>

      <Roadmap />

      <CtaBand />
    </>
  )
}
