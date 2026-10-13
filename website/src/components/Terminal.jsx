import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'
import { useCopy } from '../lib/useCopy.js'
import { detectUserPlatform } from '../lib/useLatestRelease.js'
import { INSTALL_SH, INSTALL_PS1 } from '../config.js'

const COMMANDS = {
  powershell: `irm ${INSTALL_PS1} | iex`,
  macos: `curl -fsSL ${INSTALL_SH} | sh`,
  linux: `curl -fsSL ${INSTALL_SH} | sh`
}

const BOOT = [
  { t: '› checking local environment …', c: '' },
  { t: '› superagent-core daemon online (:1469)', c: 'ok' },
  { t: '› rust engine initialized (zero telemetry)', c: 'ok' },
  { t: '● agent ready · listening for goals', c: 'online' }
]

export default function Terminal() {
  const [os, setOs] = useState(() => {
    const p = detectUserPlatform().os
    if (p === 'macos') return 'macos'
    if (p === 'linux') return 'linux'
    return 'powershell'
  })
  const [typed, setTyped] = useState('')
  const [bootShown, setBootShown] = useState(BOOT.map(() => false))
  const [copied, copy] = useCopy()

  useEffect(() => {
    if (prefersReducedMotion()) {
      setTyped(COMMANDS[os])
      setBootShown(BOOT.map(() => true))
      return
    }
    setTyped('')
    setBootShown(BOOT.map(() => false))
    const text = COMMANDS[os]
    let i = 0
    let timer
    const step = () => {
      i++
      setTyped(text.slice(0, i))
      if (i < text.length) {
        timer = setTimeout(step, 24 + (text[i - 1] === ' ' ? 36 : 0))
      }
    }
    timer = setTimeout(step, 140)
    return () => clearTimeout(timer)
  }, [os])

  useEffect(() => {
    if (prefersReducedMotion()) return
    const timers = BOOT.map((_, i) =>
      setTimeout(() => {
        setBootShown((s) => {
          const next = [...s]
          next[i] = true
          return next
        })
      }, 700 + i * 280)
    )
    return () => timers.forEach(clearTimeout)
  }, [os])

  return (
    <div className="terminal-wrap" role="region" aria-label="Interactive terminal installation preview">
      <div className="terminal-header">
        <div className="window-controls">
          <span className="window-dot" style={{ background: '#ff5f56' }}></span>
          <span className="window-dot" style={{ background: '#ffbd2e' }}></span>
          <span className="window-dot" style={{ background: '#27c93f' }}></span>
        </div>

        <div className="terminal-tabs" role="tablist">
          <button
            className={`term-tab ${os === 'powershell' ? 'active' : ''}`}
            role="tab"
            aria-selected={os === 'powershell'}
            onClick={() => setOs('powershell')}
          >
            Windows
          </button>
          <button
            className={`term-tab ${os === 'macos' ? 'active' : ''}`}
            role="tab"
            aria-selected={os === 'macos'}
            onClick={() => setOs('macos')}
          >
            macOS
          </button>
          <button
            className={`term-tab ${os === 'linux' ? 'active' : ''}`}
            role="tab"
            aria-selected={os === 'linux'}
            onClick={() => setOs('linux')}
          >
            Linux
          </button>
        </div>

        <button
          className="copy-btn"
          onClick={() => copy(COMMANDS[os])}
          aria-label="Copy terminal command"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <div className="terminal-body">
        <div className="terminal-prompt">
          <span className="prompt-symbol">$</span>
          <span className="prompt-typed">{typed}</span>
          <span className="screen-cursor"></span>
        </div>

        <div className="terminal-output">
          {BOOT.map((b, i) => (
            <div
              key={i}
              className={`out-line ${b.c}`}
              style={{
                opacity: bootShown[i] ? 1 : 0,
                transform: bootShown[i] ? 'none' : 'translateY(4px)',
                transition: 'opacity 200ms ease, transform 200ms ease'
              }}
            >
              {b.t}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
