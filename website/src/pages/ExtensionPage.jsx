import { useState } from 'react'
import { Link } from 'react-router-dom'
import Atmosphere from '../components/Atmosphere.jsx'
import Reveal from '../components/Reveal.jsx'
import { useCopy } from '../lib/useCopy.js'
import { useLatestRelease } from '../lib/useLatestRelease.js'
import { VERSION, REPO } from '../config.js'

function CodeBox({ code, label = 'Command' }) {
  const [copied, copy] = useCopy()
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.35)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      margin: '12px 0 16px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        background: 'rgba(255, 255, 255, 0.02)',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--fg-muted)'
      }}>
        <span>{label}</span>
        <button
          onClick={() => copy(code)}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? 'var(--status-online)' : 'var(--accent)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0,
        padding: '12px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        color: 'var(--fg)',
        overflowX: 'auto',
        lineHeight: 1.55
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export default function ExtensionPage() {
  const release = useLatestRelease()
  const [browserTab, setBrowserTab] = useState('chrome')

  const extensionUrl = release?.extension || `${REPO}/releases/latest`
  const versionLabel = release?.version ? `v${release.version}` : `v${VERSION}`

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <Atmosphere variant="dusk" />

      <section className="section" style={{ paddingTop: '120px', minHeight: '85vh', position: 'relative', zIndex: 1 }}>
        <div className="section-inner">
          <p className="eyebrow">— Browser Surface</p>
          <h1 className="statement-line" style={{ marginBottom: '1rem' }}>
            Intelligence inside your <em className="accent">browser</em>.
          </h1>
          <p className="statement-caption" style={{ marginBottom: '2.5rem' }}>
            Persistent AI chat, live DOM inspection, site storage access, and autonomous actions inside Chrome, Edge, and Brave.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '3rem' }}>
            <a href={extensionUrl} className="btn btn-primary" download>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '8px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Extension (.zip) · {versionLabel}
            </a>
            <a href={`${REPO}/releases/latest`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              GitHub Release →
            </a>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', margin: '2rem 0' }}>
            {/* Step 1 */}
            <article className="fork">
              <span className="fork-tag">Step 1 · Extract</span>
              <h3>Load in Your Browser</h3>
              <p>Unzip the extension folder or build it directly from source with Vite.</p>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {['chrome', 'edge', 'brave'].map((b) => (
                  <button
                    key={b}
                    className={`term-tab ${browserTab === b ? 'active' : ''}`}
                    onClick={() => setBrowserTab(b)}
                  >
                    {b.charAt(0).toUpperCase() + b.slice(1)}
                  </button>
                ))}
              </div>

              <CodeBox
                code={
                  browserTab === 'chrome' ? 'chrome://extensions' :
                  browserTab === 'edge' ? 'edge://extensions' :
                  'brave://extensions'
                }
                label="Browser Address"
              />
              <p style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
                Enable <b>Developer mode</b> (top-right toggle), then click <b>Load unpacked</b> and select the extracted folder.
              </p>
            </article>

            {/* Step 2 */}
            <article className="fork">
              <span className="fork-tag">Step 2 · Connect</span>
              <h3>Link Core Daemon</h3>
              <p>The extension communicates with the pure-Rust SuperAgent daemon running locally at port 1469.</p>

              <CodeBox
                code="superagent --serve"
                label="Terminal Command"
              />
              <p style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
                Zero setup needed. The extension automatically detects your running daemon and connects over WebSocket.
              </p>
            </article>

            {/* Step 3 */}
            <article className="fork">
              <span className="fork-tag">Step 3 · Automate</span>
              <h3>Side Panel &amp; Hotkey</h3>
              <p>Press the hotkey from any tab to slide out the persistent side panel.</p>

              <div style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <kbd className="kbd">Alt</kbd>
                <span>+</span>
                <kbd className="kbd">S</kbd>
                <span style={{ fontSize: '13px', color: 'var(--fg-muted)', marginLeft: '6px' }}>Toggle Side Panel</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--fg-muted)' }}>
                Ask questions about the current page, inspect network logs, or let the agent fill forms and extract table data.
              </p>
            </article>
          </div>

          <div style={{ marginTop: '2.5rem' }}>
            <Link className="btn btn-ghost btn-sm" to="/">← Back to overview</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
