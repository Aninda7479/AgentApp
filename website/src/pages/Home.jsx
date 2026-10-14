import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import LumenSpline from '../components/LumenSpline.jsx'
import Terminal from '../components/Terminal.jsx'
import InstallForks, { DesktopFork, CliFork } from '../components/InstallForks.jsx'
import Features from '../components/Features.jsx'
import Roadmap from '../components/Roadmap.jsx'
import CtaBand from '../components/CtaBand.jsx'
import { useLatestRelease } from '../lib/useLatestRelease.js'

export default function Home() {
  const release = useLatestRelease()
  const [downloadType, setDownloadType] = useState('native') // 'native' | 'classic'
  const userOs = release.userOs || 'windows'

  const directDownloadUrl =
    downloadType === 'native'
      ? (userOs === 'macos' ? release.native?.mac : userOs === 'linux' ? release.native?.linux : release.native?.win)
      : (userOs === 'macos' ? release.classic?.mac : userOs === 'linux' ? release.classic?.linux : release.classic?.win)

  const directDownloadLabel =
    downloadType === 'native'
      ? (userOs === 'macos' ? 'Download Native macOS (SwiftUI)' : userOs === 'linux' ? 'Download Native Linux (GTK4)' : 'Download Native Windows (WinUI 3)')
      : (userOs === 'macos' ? 'Download Classic macOS (.dmg)' : userOs === 'linux' ? 'Download Classic Linux (.AppImage)' : 'Download Classic Windows (.exe)')

  // Interactive mock state
  const [mockStep, setMockStep] = useState(1)
  const [activeFile, setActiveFile] = useState('rate-limit.ts')
  const windowRef = useRef(null)

  const handleMouseMove = (e) => {
    const cursor = document.querySelector('[data-cursor]')
    if (!cursor) return
    cursor.style.transform = `translate3d(${e.clientX - 12}px, ${e.clientY - 12}px, 0)`
    cursor.classList.add('is-active')
  }

  const handleMouseLeave = () => {
    const cursor = document.querySelector('[data-cursor]')
    if (cursor) cursor.classList.remove('is-active')
  }

  return (
    <>
      {/* ================================================================
          HERO SECTION — Split Copy + 3D Spline Scene
          ================================================================ */}
      <section className="hero" id="top">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">— Introducing SuperAgent</p>
            <h1 className="hero-h1">
              <span className="h1-line">
                <span className="word">AI</span> <span className="word">that</span>
              </span>
              <span className="h1-line">
                <span className="word">lives</span> <span className="word">on</span> <span className="word">your</span>
              </span>
              <span className="h1-line">
                <em className="word accent">desktop</em>.
              </span>
            </h1>

            <p className="subtext">
              Lives where you work. Sees what you see. Acts when you ask. Open-source, local-first intelligence that plans, codes, and automates workflows on your machine.
            </p>

            <div className="ctas">
              <a
                className="btn btn-primary"
                href={directDownloadUrl}
                download
                title={`Direct download for ${release.userOsLabel} v${release.version}`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '8px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {directDownloadLabel}
              </a>
              <a className="btn btn-ghost" href="#product">
                See it think
              </a>
            </div>

            {/* Flavor Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Package:</span>
              <button
                type="button"
                onClick={() => setDownloadType('native')}
                style={{
                  background: downloadType === 'native' ? 'rgba(217, 160, 102, 0.16)' : 'transparent',
                  color: downloadType === 'native' ? 'var(--accent)' : 'var(--muted)',
                  border: '1px solid ' + (downloadType === 'native' ? 'rgba(217, 160, 102, 0.35)' : 'transparent'),
                  borderRadius: '6px', fontSize: '0.72rem', padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                  fontWeight: downloadType === 'native' ? '600' : '400'
                }}
              >
                ⚡ Dedicated Native
              </button>
              <button
                type="button"
                onClick={() => setDownloadType('classic')}
                style={{
                  background: downloadType === 'classic' ? 'rgba(217, 160, 102, 0.16)' : 'transparent',
                  color: downloadType === 'classic' ? 'var(--accent)' : 'var(--muted)',
                  border: '1px solid ' + (downloadType === 'classic' ? 'rgba(217, 160, 102, 0.35)' : 'transparent'),
                  borderRadius: '6px', fontSize: '0.72rem', padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                  fontWeight: downloadType === 'classic' ? '600' : '400'
                }}
              >
                📦 Classic Tauri
              </button>
            </div>

            <div className="hero-meta" style={{ marginTop: '14px' }}>
              <span>v{release.version}</span>
              <span>•</span>
              <a href="#install">All downloads &amp; CLI options ↓</a>
            </div>

            <div className="stat-strip">
              <span>GPL-3.0 / AGPL-3.0</span>
              <span>Local-first</span>
              <span>Windows · macOS · Linux</span>
              <span>Zero telemetry</span>
            </div>
          </div>

          <LumenSpline />
        </div>
      </section>

      {/* ================================================================
          SECTION 01 / 05 — The Manifesto Statement
          ================================================================ */}
      <section className="section section--statement" id="statement" aria-labelledby="statement-heading">
        <p className="section-index" aria-hidden="true">— 01 / 05</p>
        <p className="section-aside" aria-hidden="true">Manifesto · 2026</p>
        <div className="section-inner">
          <p className="eyebrow">— The idea</p>
          <h2 id="statement-heading" className="statement-line">
            The interface disappears.<br />
            The <em className="accent">thinking</em> stays.
          </h2>
          <span className="statement-rule" aria-hidden="true"></span>
          <p className="statement-caption">
            An ambient assistant. Next to your code, your terminal, your browser tabs — quiet until it has something worth saying or executing.
          </p>
        </div>
      </section>

      {/* ================================================================
          SECTION 02 / 05 — The Three Principles
          ================================================================ */}
      <section className="section section--principles" id="principles" aria-labelledby="principles-heading">
        <p className="section-index" aria-hidden="true">— 02 / 05</p>
        <p className="section-aside" aria-hidden="true">Core Foundations</p>
        <div className="section-inner">
          <p className="eyebrow">— Principles</p>
          <div className="principles-grid">
            <article className="principle">
              <p className="principle-number">01</p>
              <h3 className="principle-title">Speaks first, acts second.</h3>
              <p className="principle-desc">
                Reads what you're working on. Suggests the next step, writes the diff, or executes the pipeline before you frame the question.
              </p>
              <div className="principle-detail principle-detail--shortcut">
                <kbd className="kbd">⌘</kbd><kbd className="kbd">.</kbd>
                <span className="principle-detail-label">from any app</span>
              </div>
            </article>

            <article className="principle">
              <p className="principle-number">02</p>
              <h3 className="principle-title">Lives in your context.</h3>
              <p className="principle-desc">
                Files, browser tabs, terminal output, databases — SuperAgent sees what you see through local MCP and OS accessibility.
              </p>
              <div className="principle-detail principle-detail--tags">
                <span className="tag">current file</span>
                <span className="tag">selection</span>
                <span className="tag">terminal</span>
                <span className="tag">MCP tools</span>
                <span className="tag">clipboard</span>
              </div>
            </article>

            <article className="principle">
              <p className="principle-number">03</p>
              <h3 className="principle-title">Learns your shorthand.</h3>
              <p className="principle-desc">
                The more you use it, the less you have to say. Custom commands, your phrasing, your local models, your stack.
              </p>
              <div className="principle-detail principle-detail--examples">
                <div className="shorthand-row">
                  <code className="shorthand-key">build</code>
                  <span className="shorthand-arrow">→</span>
                  <span className="shorthand-val">cargo build --workspace</span>
                </div>
                <div className="shorthand-row">
                  <code className="shorthand-key">ship it</code>
                  <span className="shorthand-arrow">→</span>
                  <span className="shorthand-val">runs CI, opens PR</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ================================================================
          SECTION 03 / 05 — Product Moment ("In Practice")
          ================================================================ */}
      <section className="section section--product" id="product" aria-labelledby="product-heading">
        <p className="section-index" aria-hidden="true">— 03 / 05</p>
        <p className="section-aside" aria-hidden="true">Interactive Demo</p>
        <div className="section-inner">
          <div className="product-header">
            <p className="eyebrow">— In practice</p>
            <h2 id="product-heading" className="product-h2">Open it. Ask it. Move on.</h2>
            <p className="product-caption">
              Live demo — press <kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd> or trigger from your terminal.
            </p>
          </div>

          <div
            className="window-chrome"
            ref={windowRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <div className="window-tabs" aria-hidden="true">
              <div className="window-controls">
                <span className="window-dot" style={{ background: '#ff5f56' }}></span>
                <span className="window-dot" style={{ background: '#ffbd2e' }}></span>
                <span className="window-dot" style={{ background: '#27c93f' }}></span>
              </div>
              <div className="window-tab window-tab--active">
                <span>{activeFile}</span>
                <span className="window-tab-meta">main · 42:1</span>
              </div>
              <div className="window-tab">
                <span>superagent.config.json</span>
              </div>
            </div>

            <div className="window-body">
              <aside className="window-rail" aria-hidden="true">
                <div className="rail-section">
                  <p className="rail-heading">Context</p>
                  <ul className="rail-list">
                    {['rate-limit.ts', 'edge.config.ts', 'next.config.mjs', 'package.json'].map((f) => (
                      <li
                        key={f}
                        className={`rail-item ${activeFile === f ? 'rail-item--active' : ''}`}
                        onClick={() => setActiveFile(f)}
                      >
                        <span className="rail-icon"></span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rail-section">
                  <p className="rail-heading">Recent</p>
                  <ul className="rail-list">
                    {['dashboard.tsx', 'schema.prisma'].map((f) => (
                      <li
                        key={f}
                        className={`rail-item ${activeFile === f ? 'rail-item--active' : ''}`}
                        onClick={() => setActiveFile(f)}
                      >
                        <span className="rail-icon"></span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>

              <div className="window-main">
                <div className="mock">
                  <div className="mock-line">
                    <span className="mock-tag">you</span>
                    <div className="mock-text">Where did we drop the rate-limit middleware?</div>
                  </div>

                  <div className="mock-line">
                    <span className="mock-tag mock-tag--accent">agent</span>
                    <div className="mock-text">
                      <p>Found it — <code>server/middleware/rate-limit.ts:42</code>, removed in PR #4821 when you switched to edge runtime.</p>
                      <pre className="mock-diff">
<span className="diff-meta">server/middleware/rate-limit.ts</span>
<span className="diff-rm">- <span className="kw">import</span> &#123; rateLimit &#125; <span className="kw">from</span> <span className="str">'./rate-limit'</span></span>
<span className="diff-rm">- <span className="kw">export const</span> middleware = rateLimit(&#123; limit: <span className="num">100</span> &#125;)</span>
<span className="diff-add">+ <span className="kw">import</span> &#123; withEdgeRateLimit &#125; <span className="kw">from</span> <span className="str">'./edge-rate'</span></span>
<span className="diff-add">+ <span className="kw">export const</span> middleware = withEdgeRateLimit(&#123; limit: <span className="num">100</span> &#125;)</span>
                      </pre>
                      <p>Want me to re-enable it and run local verification tests?</p>
                      <div className="mock-actions">
                        <button
                          className={`chip ${mockStep >= 2 ? 'chip--primary' : ''}`}
                          type="button"
                          onClick={() => setMockStep(2)}
                        >
                          Yes, draft a PR
                        </button>
                        <button
                          className="chip"
                          type="button"
                          onClick={() => setMockStep(1)}
                        >
                          Show routes first
                        </button>
                      </div>
                    </div>
                  </div>

                  {mockStep >= 2 && (
                    <>
                      <div className="mock-line">
                        <span className="mock-tag">you</span>
                        <div className="mock-text">Yes, draft the PR.</div>
                      </div>

                      <div className="mock-line">
                        <span className="mock-tag mock-tag--accent">agent</span>
                        <div className="mock-text">
                          <ul className="mock-checklist">
                            <li>
                              <svg className="check" viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M3.5 8.5l3 3 6-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Created branch <code>fix/rate-limit-api</code>
                            </li>
                            <li>
                              <svg className="check" viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M3.5 8.5l3 3 6-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Re-enabled middleware for <code>/api/*</code>
                            </li>
                            <li>
                              <svg className="check" viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M3.5 8.5l3 3 6-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Verified 14 tests passing locally
                            </li>
                            <li>
                              <svg className="check" viewBox="0 0 16 16" aria-hidden="true">
                                <path d="M3.5 8.5l3 3 6-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Opened PR <code>#4877</code> → main
                            </li>
                          </ul>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="window-status" aria-hidden="true">
              <span className="status-left">
                <span className="status-dot"></span>
                <span>superagent ready</span>
              </span>
              <span className="status-right">daemon :1469 · local-first · 0 telemetry</span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          SECTION 04 / 05 — Installation & Terminal Forks
          ================================================================ */}
      <section className="section" id="install" aria-labelledby="install-heading">
        <p className="section-index" aria-hidden="true">— 04 / 05</p>
        <p className="section-aside" aria-hidden="true">Zero configuration</p>
        <div className="section-inner">
          <p className="eyebrow">— Quick install</p>
          <h2 id="install-heading" className="statement-line">
            One command. Awake on your <em className="accent">machine</em>.
          </h2>
          <p className="statement-caption" style={{ marginTop: '0.75rem', marginBottom: '2.5rem' }}>
            Choose the native desktop client or the headless CLI. Both connect to the pure-Rust core daemon and run local-first.
          </p>

          <InstallForks />

          <div style={{ marginTop: '2.5rem' }}>
            <Terminal />
          </div>
        </div>
      </section>

      {/* ================================================================
          FEATURES & ARCHITECTURE SECTION
          ================================================================ */}
      <section className="section" id="features" aria-labelledby="features-heading">
        <p className="section-index" aria-hidden="true">— Features</p>
        <p className="section-aside" aria-hidden="true">System architecture</p>
        <div className="section-inner">
          <Features />
        </div>
      </section>

      {/* ================================================================
          ROADMAP & MILESTONES
          ================================================================ */}
      <section className="section" id="roadmap" aria-labelledby="roadmap-heading">
        <p className="section-index" aria-hidden="true">— Roadmap</p>
        <p className="section-aside" aria-hidden="true">Development vector</p>
        <div className="section-inner">
          <p className="eyebrow">— Evolution</p>
          <h2 id="roadmap-heading" className="statement-line">
            Where we are. Where we're <em className="accent">headed</em>.
          </h2>
          <Roadmap />
        </div>
      </section>

      {/* ================================================================
          SECTION 05 / 05 — Closing CTA
          ================================================================ */}
      <CtaBand />
    </>
  )
}
