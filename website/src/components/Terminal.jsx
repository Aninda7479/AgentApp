import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'
import { useCopy } from '../lib/useCopy.js'
import { INSTALL_SH, INSTALL_PS1 } from '../config.js'

const COMMANDS = {
  powershell: `irm ${INSTALL_PS1} | iex`,
  macos: `curl -fsSL ${INSTALL_SH} | sh`,
  linux: `curl -fsSL ${INSTALL_SH} | sh`
}

const BOOT = [
  { t: '› resolving superagent.ai …', c: '' },
  { t: '› core linked', c: 'ok' },
  { t: '› cli linked', c: 'ok' },
  { t: '● agent online', c: 'online' }
]

export default function Terminal() {
  const [os, setOs] = useState('powershell')
  const [typed, setTyped] = useState('')
  const [bootShown, setBootShown] = useState(BOOT.map(() => false))
  const [copied, copy] = useCopy()

  // Typewriter — re-runs whenever the OS tab changes.
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
        timer = setTimeout(step, 26 + (text[i - 1] === ' ' ? 40 : 0))
      }
    }
    timer = setTimeout(step, 140)
    return () => clearTimeout(timer)
  }, [os])

  // Boot sequence reveals each line after a short stagger.
  useEffect(() => {
    if (prefersReducedMotion()) return
    const timers = BOOT.map((_, i) =>
      setTimeout(() => {
        setBootShown((s) => {
          const next = [...s]
          next[i] = true
          return next
        })
      }, 420 + i * 340)
    )
    return () => timers.forEach(clearTimeout)
  }, [os])

  return (
    <div className="term" aria-label="Live install terminal demo">
      <div className="term-tabs" role="tablist" aria-label="Install command for your OS">
        {Object.keys(COMMANDS).map((key) => (
          <button
            key={key}
            className="term-tab"
            role="tab"
            aria-selected={os === key}
            onClick={() => setOs(key)}
          >
            {key === 'powershell' ? 'PowerShell' : key === 'macos' ? 'macOS' : 'Linux'}
          </button>
        ))}
      </div>

      <div className="term-body">
        <div className="t-bar">
          <div className="t-window" aria-hidden="true"><i></i><i></i><i></i></div>
          <span className="t-title">superagent — terminal</span>
          <button
            className={`t-copy${copied ? ' copied' : ''}`}
            aria-label="Copy install command"
            onClick={() => copy(COMMANDS[os])}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
            <span>{copied ? 'copied ✓' : 'copy'}</span>
          </button>
        </div>

        <div className="t-line">
          <span className="t-prompt">$</span>
          <span className="t-cmd">{typed}</span>
          <span className="t-cursor" aria-hidden="true" />
        </div>

        <div className="t-boot" aria-live="polite">
          {BOOT.map((line, i) => {
            const cls = [
              line.c && line.c !== 'online' ? line.c : '',
              bootShown[i] ? 'show' : ''
            ].join(' ').trim()
            return (
              <div key={i} className={cls}>
                {line.c === 'online'
                  ? <span className="online"><span className="pulse" /> agent online</span>
                  : line.t}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
