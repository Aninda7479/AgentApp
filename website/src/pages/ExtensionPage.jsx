import { useState } from 'react'
import { Link } from 'react-router-dom'
import Atmosphere from '../components/Atmosphere.jsx'
import Reveal from '../components/Reveal.jsx'
import { useCopy } from '../lib/useCopy.js'
import { useLatestRelease } from '../lib/useLatestRelease.js'
import { VERSION } from '../config.js'

const codeStyle = { fontFamily: 'var(--font-mono)' }

function CodeBox({ code, label = 'Command' }) {
  const [copied, copy] = useCopy()
  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--line-2)',
      borderRadius: '12px',
      overflow: 'hidden',
      margin: '12px 0 16px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid var(--line)',
        background: 'rgba(255,255,255,0.02)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--muted)'
      }}>
        <span>{label}</span>
        <button
          onClick={() => copy(code)}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? 'var(--ok)' : 'var(--text-2)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
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
        fontSize: '0.85rem',
        color: 'var(--super-2)',
        overflowX: 'auto',
        lineHeight: 1.5
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export default function ExtensionPage() {
  const release = useLatestRelease()
  const [browserTab, setBrowserTab] = useState('chrome')

  const extensionUrl = release?.extension || 'https://github.com/Aninda7479/AgentApp/releases/latest'
  const versionLabel = release?.version ? `v${release.version}` : `v${VERSION}`

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <Atmosphere variant="dusk" />

      <section className="section container" style={{ paddingTop: '120px', minHeight: '80vh', position: 'relative', zIndex: 1 }}>
        {/* ─── Hero Section ──────────────────────────────────────────────── */}
        <div className="sec-head" style={{ textAlign: 'center', maxWidth: '820px', margin: '0 auto 40px' }}>
          <p className="eyebrow">Manifest V3 · Chrome · Edge · Brave · Arc · Chromium</p>
          <h1 className="h-section" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', margin: '12px 0 16px' }}>
            SuperAgent Browser Extension
          </h1>
          <p className="lead" style={{ fontSize: '1.1rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
            Bring persistent AI chat, live page understanding, site storage inspection, and autonomous web actions directly into your browser's side panel.
          </p>

          {/* Download CTA Bar */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginTop: '28px' }}>
            <a
              href={extensionUrl}
              className="btn btn-primary"
              style={{
                fontSize: '1rem',
                padding: '12px 24px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 0 24px rgba(235, 107, 42, 0.35)'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download Extension (.ZIP)</span>
              <span style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)'
              }}>
                {versionLabel}
              </span>
            </a>

            <a
              href="https://github.com/Aninda7479/AgentApp/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ padding: '12px 20px', fontSize: '0.95rem' }}
            >
              View GitHub Release →
            </a>
          </div>
        </div>

        {/* ─── 3-Step Visual Setup Flow ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', margin: '48px 0' }}>
          
          {/* Step 1 */}
          <Reveal className="fork" style={{ display: 'flex', flexDirection: 'column', background: 'rgba(23, 33, 51, 0.65)', border: '1px solid var(--line-2)', borderRadius: '16px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span className="fork-tag" style={{ margin: 0 }}><b>Step 1</b> · Install</span>
              <span style={{ fontSize: '1.5rem' }}>📦</span>
            </div>
            <h3 style={{ fontSize: '1.3rem', margin: '0 0 10px', color: 'var(--text)' }}>Load in Your Browser</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 16px' }}>
              Download the release zip and load it as an unpacked extension in 30 seconds:
            </p>

            {/* Browser Selector Tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {['chrome', 'edge', 'brave'].map((b) => (
                <button
                  key={b}
                  onClick={() => setBrowserTab(b)}
                  style={{
                    background: browserTab === b ? 'var(--super-dim)' : 'rgba(255,255,255,0.03)',
                    color: browserTab === b ? 'var(--super)' : 'var(--muted)',
                    border: `1px solid ${browserTab === b ? 'var(--super-glow)' : 'var(--line)'}`,
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {b}
                </button>
              ))}
            </div>

            <ol style={{ paddingLeft: '20px', margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><b>Extract</b> the downloaded <code style={codeStyle}>superagent-browser-extension-*.zip</code> file to a folder.</li>
              <li>Open <code style={codeStyle}>{browserTab === 'edge' ? 'edge://extensions' : `${browserTab}://extensions`}</code> in a new browser tab.</li>
              <li>Turn ON the <b>Developer mode</b> toggle switch (top right).</li>
              <li>Click <b>Load unpacked</b> and select the extracted extension folder.</li>
            </ol>

            <div className="best" style={{ marginTop: 'auto' }}>
              <b>Pro Tip:</b> Click the puzzle icon in your toolbar and <b>Pin</b> SuperAgent for instant access.
            </div>
          </Reveal>

          {/* Step 2 */}
          <Reveal className="fork" style={{ display: 'flex', flexDirection: 'column', background: 'rgba(23, 33, 51, 0.65)', border: '1px solid var(--line-2)', borderRadius: '16px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span className="fork-tag" style={{ margin: 0 }}><b>Step 2</b> · Start Engine</span>
              <span style={{ fontSize: '1.5rem' }}>⚡</span>
            </div>
            <h3 style={{ fontSize: '1.3rem', margin: '0 0 10px', color: 'var(--text)' }}>Choose Your Backend</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 16px' }}>
              SuperAgent runs either locally via Desktop app or on a server:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
              {/* Option A */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-2)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--super)', marginBottom: '4px' }}>
                  🖥️ Option A: Desktop App (Zero-Config)
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.4 }}>
                  Open the <b>SuperAgent Desktop App</b>. It automatically starts on <code style={codeStyle}>localhost:1469</code>. No extra setup needed!
                </div>
              </div>

              {/* Option B */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-2)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#38bdf8', marginBottom: '4px' }}>
                  ☁️ Option B: Web Server / Docker
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.4 }}>
                  Run <code style={codeStyle}>npm run start:web</code> or Docker container on your server or VPS.
                </div>
              </div>
            </div>

            <div className="best" style={{ marginTop: 'auto' }}>
              <b>Default Port:</b> SuperAgent communicates on <code style={codeStyle}>http://localhost:1469</code>.
            </div>
          </Reveal>

          {/* Step 3 */}
          <Reveal className="fork" style={{ display: 'flex', flexDirection: 'column', background: 'rgba(23, 33, 51, 0.65)', border: '1px solid var(--line-2)', borderRadius: '16px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span className="fork-tag" style={{ margin: 0 }}><b>Step 3</b> · Connect</span>
              <span style={{ fontSize: '1.5rem' }}>💬</span>
            </div>
            <h3 style={{ fontSize: '1.3rem', margin: '0 0 10px', color: 'var(--text)' }}>Open Side Panel &amp; Chat</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 16px' }}>
              Sign in once to link your browser session with your models and memory:
            </p>

            <ol style={{ paddingLeft: '20px', margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Click the <b>SuperAgent icon</b> in your browser toolbar to open the Side Panel.</li>
              <li>Enter your password (default: <code style={codeStyle}>admin</code>).</li>
              <li><i>(For remote servers only):</i> Click ⚙️ Settings and set your Server URL (e.g. <code style={codeStyle}>https://agent.yourdomain.com</code>).</li>
              <li><b>You're live!</b> Chat with active page context, inspect site storage, or automate navigation.</li>
            </ol>

            <div className="best" style={{ marginTop: 'auto' }}>
              <b>Security:</b> Authenticated with HMAC session tokens and password hashing.
            </div>
          </Reveal>
        </div>

        {/* ─── For Developers: Build from Source ─────────────────────────── */}
        <Reveal className="fork" style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid var(--line-2)', borderRadius: '16px', padding: '28px', margin: '32px 0 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span className="fork-tag"><b>Developer Guide</b> · Build from Source</span>
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>Monorepo</span>
          </div>
          <h3 style={{ fontSize: '1.25rem', margin: '0 0 8px' }}>Build &amp; Package Locally</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', margin: '0 0 16px', lineHeight: 1.5 }}>
            You can build the TypeScript extension bundle or generate a release zip directly from the monorepo root:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <CodeBox code="npm run build:ext" label="1. Build Dist Bundle" />
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Compiles to <code style={codeStyle}>packages/browser-extension/dist</code></span>
            </div>
            <div>
              <CodeBox code="npm run pack:ext" label="2. Create Release ZIP" />
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Generates <code style={codeStyle}>packages/browser-extension/release/*.zip</code></span>
            </div>
          </div>
        </Reveal>

        {/* ─── Capabilities & Features Breakdown ───────────────────────── */}
        <Reveal style={{ margin: '48px 0' }}>
          <div className="sec-head" style={{ textAlign: 'center', marginBottom: '32px' }}>
            <p className="eyebrow">Deep Browser Integration</p>
            <h2 className="h-section" style={{ fontSize: '2rem' }}>What the Extension Can Do</h2>
            <p className="lead" style={{ maxWidth: '640px', margin: '0 auto', fontSize: '1rem' }}>
              Unlike ordinary web chatbots, the SuperAgent extension has full agentic execution rights inside the browser.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            <div className="fork" style={{ padding: '24px', borderRadius: '14px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>💬</div>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>On-the-way Side Panel Chat</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                Persistent side panel that stays open as you browse between tabs. Includes streaming tokens, active page context attachment, and model selector (GPT-4o, Claude 3.5, Gemini, DeepSeek, Ollama).
              </p>
            </div>

            <div className="fork" style={{ padding: '24px', borderRadius: '14px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🗄️</div>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Site Storage Access</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                Direct read/write access to <code style={codeStyle}>localStorage</code>, <code style={codeStyle}>sessionStorage</code>, <code style={codeStyle}>IndexedDB</code>, <code style={codeStyle}>Cookies</code>, and <code style={codeStyle}>Cache Storage</code> on any open site via isolated and main-world bridges.
              </p>
            </div>

            <div className="fork" style={{ padding: '24px', borderRadius: '14px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🔍</div>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Network &amp; Error Telemetry</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                Inspect live HTTP requests, filter <code style={codeStyle}>4xx/5xx</code> failures, capture full Chrome DevTools Protocol HAR recordings, and inspect WebSocket frames for API debugging.
              </p>
            </div>

            <div className="fork" style={{ padding: '24px', borderRadius: '14px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🎯</div>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Deep DOM &amp; Element Tools</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                Query elements with bounding boxes and visibility flags, extract computed styles, inspect simplified DOM trees, measure box-models, and trigger real simulated clicks and inputs.
              </p>
            </div>

            <div className="fork" style={{ padding: '24px', borderRadius: '14px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🧠</div>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Shared Global Memory</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                Synchronized with your core engine’s <code style={codeStyle}>UserProfileStore</code>, <code style={codeStyle}>LearningLoopEngine</code> (learned insights), and <code style={codeStyle}>SkillStore</code> across CLI, Desktop, and Web.
              </p>
            </div>

            <div className="fork" style={{ padding: '24px', borderRadius: '14px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🔐</div>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '8px' }}>Unified Session Security</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                Protected with HMAC-SHA256 tokens and scrypt password hashing. Password rotation on any client automatically updates session versions and revokes outdated tokens.
              </p>
            </div>
          </div>
        </Reveal>

        {/* ─── Navigation Footer ───────────────────────────────────────── */}
        <p style={{ marginTop: '48px', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
          <Link className="btn btn-ghost btn-sm" to="/">← Back to Home</Link>
          <Link className="btn btn-ghost btn-sm" to="/desktop">Desktop App →</Link>
          <Link className="btn btn-ghost btn-sm" to="/cli">CLI &amp; Server →</Link>
        </p>
      </section>
    </div>
  )
}
