import Reveal from './Reveal.jsx'
import { useCopy } from '../lib/useCopy.js'

const GH_RELEASES = 'https://github.com/Aninda7479/AgentApp/releases'
const CLI_CMD = 'irm https://superagent.ai/install.ps1 | iex'

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function CliFork() {
  const [copied, copy] = useCopy()
  return (
    <Reveal className="fork">
      <span className="fork-tag"><b>Core</b> + CLI + Web</span>
      <h3>The CLI</h3>
      <p>Headless, scriptable, and the full web UI at localhost. Drop it on a server, into CI, or your own shell.</p>
      <div className="cmd-box">
        <code><span className="c-mut">irm</span> https://superagent.ai/install.ps1 <span className="c-mut">|</span> iex</code>
        <button
          className={`cmd-copy${copied ? ' copied' : ''}`}
          aria-label="Copy CLI install command"
          onClick={() => copy(CLI_CMD)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          <span>{copied ? 'copied ✓' : 'copy'}</span>
        </button>
      </div>
      <ul>
        <li><Check /> A <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>superagent</code> command on your PATH</li>
        <li><Check /> Serves the web UI at localhost</li>
        <li><Check /> Ideal for automation, servers, and CI</li>
      </ul>
      <p className="best">Best for <b>developers &amp; infrastructure</b></p>
    </Reveal>
  )
}

function DesktopFork() {
  return (
    <Reveal className="fork">
      <span className="fork-tag"><b>Core</b> + Desktop + Web</span>
      <h3>The Desktop App</h3>
      <p>A native window with the full visual interface and your always-on-top 3D Partner. No terminal required.</p>
      <div className="dl-row">
        <a className="dl-btn" href={GH_RELEASES} target="_blank" rel="noopener">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5a2 2 0 0 1 2-2h10l6 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm12 0v5h5" /></svg> Windows
        </a>
        <a className="dl-btn" href={GH_RELEASES} target="_blank" rel="noopener">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 3c.3 2.3-1 3.7-2.3 4.2 1.5.5 2.3 1.8 2.2 3.4-2.3-.9-3.2-.7-4.2.2-.9 1-.9 2.4-.3 3.6-1.5.3-2.7-.2-3.6-1.3-.8 2.8.3 5.3 2 6.8-1.7.2-3.3-.5-4.4-1.7-.8 2.4.2 4.4 1.8 5.7-1.7.5-3.3.2-4.7-.7" /></svg> macOS
        </a>
        <a className="dl-btn" href={GH_RELEASES} target="_blank" rel="noopener">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4 3.5 6H14v6h-4v-6H8.5L12 6Z" /></svg> Linux
        </a>
      </div>
      <ul>
        <li><Check /> Native window with the full interface</li>
        <li><Check /> On-screen 3D Partner companion</li>
        <li><Check /> Built-in auto-updater</li>
      </ul>
      <p className="best">Best for <b>everyday &amp; visual work</b></p>
    </Reveal>
  )
}

export default function InstallForks() {
  return (
    <>
      <Reveal className="sec-head">
        <p className="eyebrow">Two ways in</p>
        <h2 className="h-section">Pick your build</h2>
        <p className="lead">Both installs share the same autonomous core. The CLI adds a scriptable command line; the Desktop app adds a native window and your on-screen companion. The web UI ships with both.</p>
      </Reveal>

      <div className="fork-grid">
        <CliFork />
        <DesktopFork />
      </div>

      <Reveal className="stack-note" aria-label="What is inside each build">
        <span className="chip core">Core</span>
        <span className="plus">+</span>
        <span className="chip">CLI</span><span className="plus">/</span><span className="chip">Desktop</span>
        <span className="plus">+</span>
        <span className="chip">Web</span>
      </Reveal>
    </>
  )
}
