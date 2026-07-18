import { useState } from 'react'
import Reveal from './Reveal.jsx'
import { useCopy } from '../lib/useCopy.js'
import { INSTALL_SH, INSTALL_PS1, DL, RELEASES_LATEST } from '../config.js'

const COMMANDS = {
  powershell: `irm ${INSTALL_PS1} | iex`,
  bash: `curl -fsSL ${INSTALL_SH} | sh`
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function CliFork() {
  const [shell, setShell] = useState('powershell')
  const [copied, copy] = useCopy()

  return (
    <Reveal className="fork">
      <span className="fork-tag"><b>Core</b> + CLI + Web</span>
      <h3>The CLI</h3>
      <p>Headless, scriptable, and the full web UI served at localhost. Drop it on a server, into CI, or your own local terminal.</p>
      
      <div className="shell-selector" style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        <button 
          className={`term-tab ${shell === 'powershell' ? 'active' : ''}`}
          role="tab"
          aria-selected={shell === 'powershell'}
          onClick={() => setShell('powershell')}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.74rem', padding: '5px 12px',
            background: shell === 'powershell' ? 'rgba(217, 160, 102, 0.12)' : 'transparent',
            color: shell === 'powershell' ? 'var(--accent)' : 'var(--muted)',
            border: '1px solid ' + (shell === 'powershell' ? 'rgba(217, 160, 102, 0.3)' : 'transparent'),
            borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s ease'
          }}
        >
          PowerShell (Win)
        </button>
        <button 
          className={`term-tab ${shell === 'bash' ? 'active' : ''}`}
          role="tab"
          aria-selected={shell === 'bash'}
          onClick={() => setShell('bash')}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.74rem', padding: '5px 12px',
            background: shell === 'bash' ? 'rgba(217, 160, 102, 0.12)' : 'transparent',
            color: shell === 'bash' ? 'var(--accent)' : 'var(--muted)',
            border: '1px solid ' + (shell === 'bash' ? 'rgba(217, 160, 102, 0.3)' : 'transparent'),
            borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s ease'
          }}
        >
          Bash (macOS/Linux)
        </button>
      </div>

      <div className="cmd-box">
        <code>
          {shell === 'powershell' ? (
            <span className="t-cmd">
              <span className="c-mut">irm</span> {INSTALL_PS1} <span className="c-mut">|</span> iex
            </span>
          ) : (
            <span className="t-cmd">
              <span className="c-mut">curl</span> -fsSL {INSTALL_SH} <span className="c-mut">|</span> sh
            </span>
          )}
        </code>
        <button
          className={`cmd-copy${copied ? ' copied' : ''}`}
          aria-label="Copy CLI install command"
          onClick={() => copy(COMMANDS[shell])}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          <span>{copied ? 'copied ✓' : 'copy'}</span>
        </button>
      </div>
      <ul>
        <li><Check /> A <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>superagent</code> command on your PATH</li>
        <li><Check /> Local web UI dashboard at <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>localhost:3000</code></li>
        <li><Check /> Perfect for scripts, servers, workflows, and headless CI runs</li>
      </ul>
      <p className="best">Best for <b>developers &amp; automated workflows</b></p>
    </Reveal>
  )
}

export function DesktopFork() {
  return (
    <Reveal className="fork">
      <span className="fork-tag"><b>Core</b> + Desktop + Web</span>
      <h3>The Desktop App</h3>
      <p>A native OS client featuring the visual workspace and your always-on-top 3D companion pet window.</p>
      
      <div className="dl-row" style={{ marginTop: '27px' }}>
        <a className="dl-btn" href={DL.win} target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: '4px' }}>
            <path d="M0 3.449L9.75 2.1v9.45H0V3.449zM0 12.45h9.75v9.45L0 20.551v-8.1zM10.8 1.95L24 0v11.55H10.8V1.95zM10.8 12.45H24v11.55l-13.2-1.95v-9.6z" />
          </svg>
          Windows
        </a>
        <a className="dl-btn" href={DL.mac} target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: '4px' }}>
            <path d="M17.05 20.28c-.98.95-2.05 1.88-3.08 1.88-1.02 0-1.4-.62-2.55-.62-1.14 0-1.57.6-2.52.62-1.02.02-2.18-.98-3.18-1.93-2.02-1.96-3.57-5.52-3.57-8.87 0-5.3 3.43-8.1 6.8-8.1 1.05 0 2.05.65 2.7.65.63 0 1.83-.78 3.1-.78 1.34 0 2.56.55 3.32 1.48-3.18 1.88-2.65 6.13.52 7.42-1.22 2.92-2.8 5.75-4.14 7.28zM12.03 4.3c.72-1.1 1.48-2.5 1.13-4.3-1.53.08-3.23 1.07-3.9 2.1-1.12 1.55-1.1 2.9-.8 4.3 1.6.02 2.95-.9 3.57-2.1z" />
          </svg>
          macOS
        </a>
        <a className="dl-btn" href={DL.linux} target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '4px' }}>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Linux
        </a>
      </div>
      
      <p className="dl-all" style={{ marginTop: '4px' }}>
        <a href={RELEASES_LATEST} target="_blank" rel="noopener">All releases &amp; version history →</a>
      </p>

      <ul>
        <li><Check /> Native desktop window with the full workspace client</li>
        <li><Check /> 3D companion pet that floats and reacts to actions</li>
        <li><Check /> Automatically handles updates and background execution</li>
      </ul>
      <p className="best" style={{ marginTop: 'auto' }}>Best for <b>daily coding &amp; visual task automation</b></p>
    </Reveal>
  )
}

export default function InstallForks() {
  return (
    <>
      <Reveal className="sec-head">
        <p className="eyebrow">Two ways in</p>
        <h2 className="h-section">Pick your build</h2>
        <p className="lead">Both installation methods share the same underlying autonomous core engine. The CLI adds a lightweight command line tool; the Desktop app adds a native desktop shell window and your visual companion. The web UI is included with both.</p>
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
