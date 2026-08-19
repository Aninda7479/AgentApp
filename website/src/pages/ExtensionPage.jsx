import { useState } from 'react'
import { Link } from 'react-router-dom'
import Atmosphere from '../components/Atmosphere.jsx'
import Reveal from '../components/Reveal.jsx'
import { useCopy } from '../lib/useCopy.js'

const codeStyle = { fontFamily: 'var(--font-mono)' }

function CodeBox({ code, label = 'Command' }) {
  const [copied, copy] = useCopy()
  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--line-2)',
      borderRadius: '12px',
      overflow: 'hidden',
      margin: '12px 0 20px'
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
  const [activeTab, setActiveTab] = useState('chrome')

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <Atmosphere variant="dusk" />

      <section className="section container" style={{ paddingTop: '120px', minHeight: '80vh', position: 'relative', zIndex: 1 }}>
        <div className="sec-head">
          <p className="eyebrow">Chrome · Edge · Brave · Chromium</p>
          <h1 className="h-section">Browser Extension Setup</h1>
          <p className="lead">
            Bring SuperAgent directly into your browsing flow. Get persistent on-the-way chat, autonomous browser automation, site storage access (localStorage, IndexedDB, cookies), and deep DOM & network inspection — connected to your local <code style={codeStyle}>core_v2</code> engine and global memory.
          </p>
        </div>

        {/* ─── Setup Steps Grid ────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', margin: '32px 0 48px' }}>
          {/* Step 1 */}
          <Reveal className="fork">
            <span className="fork-tag"><b>Step 1</b> · Monorepo Build</span>
            <h3>Build the Extension</h3>
            <p>From the root of your AgentApp repository, build the Manifest V3 extension bundle into <code style={codeStyle}>packages/browser-extension/dist</code>:</p>
            <CodeBox code="npm run build:ext" label="Terminal (Monorepo Root)" />
            <div className="best">
              <b>Watch Mode:</b> For live hot-reload development, run <code style={codeStyle}>npm run dev:ext</code>.
            </div>
          </Reveal>

          {/* Step 2 */}
          <Reveal className="fork">
            <span className="fork-tag"><b>Step 2</b> · Load Unpacked</span>
            <h3>Install in Your Browser</h3>
            <p>Load the built extension folder into Chrome, Edge, Brave, or any Chromium browser:</p>
            
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              {['chrome', 'edge', 'brave'].map((b) => (
                <button
                  key={b}
                  onClick={() => setActiveTab(b)}
                  style={{
                    background: activeTab === b ? 'var(--super-dim)' : 'transparent',
                    color: activeTab === b ? 'var(--super)' : 'var(--muted)',
                    border: `1px solid ${activeTab === b ? 'var(--super-glow)' : 'var(--line)'}`,
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

            <ol style={{ paddingLeft: '20px', margin: 0, fontSize: '0.9rem', color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Open <code style={codeStyle}>{activeTab === 'edge' ? 'edge://extensions' : `${activeTab}://extensions`}</code> in a new tab.</li>
              <li>Toggle on <b>Developer mode</b> (top right corner).</li>
              <li>Click <b>Load unpacked</b>.</li>
              <li>Select the directory: <code style={codeStyle}>AgentApp/packages/browser-extension/dist</code>.</li>
            </ol>
            <div className="best" style={{ marginTop: '14px' }}>
              <b>Tip:</b> Pin the SuperAgent icon to your extension toolbar for instant 1-click access.
            </div>
          </Reveal>

          {/* Step 3 */}
          <Reveal className="fork">
            <span className="fork-tag"><b>Step 3</b> · Backend Link</span>
            <h3>Start the Core Server</h3>
            <p>The extension connects seamlessly to the SuperAgent backend on <code style={codeStyle}>localhost:1469</code>:</p>
            <CodeBox code="npm run dev:web" label="Terminal" />
            <div className="best">
              <b>Session Auth:</b> Log in using your admin session password (default: <code style={codeStyle}>admin</code>). Your session is shared across desktop, web, and extension clients!
            </div>
          </Reveal>
        </div>

        {/* ─── Capabilities & Features Breakdown ───────────────────────── */}
        <Reveal style={{ margin: '48px 0' }}>
          <div className="sec-head">
            <p className="eyebrow">Deep Browser Integration</p>
            <h2 className="h-section">What the Extension Can Do</h2>
            <p className="lead">
              Unlike ordinary web chatbots, the SuperAgent extension has full agentic execution rights inside the browser.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '24px' }}>
            <div className="fork" style={{ padding: '24px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>💬</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>On-the-way Side Panel Chat</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', margin: 0 }}>
                Persistent side panel that stays open as you browse between tabs. Includes streaming tokens, active page context attachment, and model selector (GPT-4o, Claude 3.5, Gemini, DeepSeek, Ollama).
              </p>
            </div>

            <div className="fork" style={{ padding: '24px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🗄️</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Site Storage Access</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', margin: 0 }}>
                Direct read/write access to <code style={codeStyle}>localStorage</code>, <code style={codeStyle}>sessionStorage</code>, <code style={codeStyle}>IndexedDB</code>, <code style={codeStyle}>Cookies</code>, and <code style={codeStyle}>Cache Storage</code> on any open site via isolated and main-world bridges.
              </p>
            </div>

            <div className="fork" style={{ padding: '24px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🔍</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Network &amp; Error Telemetry</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', margin: 0 }}>
                Inspect live HTTP requests, filter <code style={codeStyle}>4xx/5xx</code> failures, capture full Chrome DevTools Protocol HAR recordings, and inspect WebSocket frames for API debugging.
              </p>
            </div>

            <div className="fork" style={{ padding: '24px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🎯</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Deep DOM &amp; Element Tools</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', margin: 0 }}>
                Query elements with bounding boxes and visibility flags, extract computed styles, inspect simplified DOM trees, measure box-models, and trigger real simulated clicks and inputs.
              </p>
            </div>

            <div className="fork" style={{ padding: '24px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🧠</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Shared Global Memory</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', margin: 0 }}>
                Synchronized with your core engine’s <code style={codeStyle}>UserProfileStore</code>, <code style={codeStyle}>LearningLoopEngine</code> (learned insights), and <code style={codeStyle}>SkillStore</code> across CLI, Desktop, and Web.
              </p>
            </div>

            <div className="fork" style={{ padding: '24px' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>🔐</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Unified Session Security</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', margin: 0 }}>
                Protected with HMAC-SHA256 tokens and scrypt password hashing. Password rotation on any client automatically updates session versions and revokes outdated tokens.
              </p>
            </div>
          </div>
        </Reveal>

        {/* ─── Navigation Buttons ──────────────────────────────────────── */}
        <p style={{ marginTop: '48px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <Link className="btn btn-ghost btn-sm" to="/">← Back to Home</Link>
          <Link className="btn btn-ghost btn-sm" to="/cli">Install CLI →</Link>
          <Link className="btn btn-ghost btn-sm" to="/desktop">Desktop App →</Link>
        </p>
      </section>
    </div>
  )
}
