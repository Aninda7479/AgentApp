import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

const GH = 'https://github.com/Aninda7479/AgentApp'

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="11" stroke="var(--agent)" strokeOpacity=".7" strokeWidth="1.5" />
      <ellipse cx="13" cy="13" rx="11.5" ry="4.2" stroke="rgba(255,255,255,.35)" strokeWidth="1" transform="rotate(-24 13 13)" />
      <circle className="dot" cx="13" cy="13" r="5" />
    </svg>
  )
}

export default function Nav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Close the mobile menu on any navigation.
  const close = () => setOpen(false)

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link className="brand" to="/" aria-label="SuperAgent home" onClick={close}>
          <Mark />
          SuperAgent
        </Link>

        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/#features">Features</NavLink>
          <NavLink to="/#install">Install</NavLink>
          <NavLink to="/faq">FAQ</NavLink>
          <a href={`${GH}/blob/main/README.md`} target="_blank" rel="noopener">Docs</a>
        </nav>

        <div className="nav-right">
          <a className="gh-link" href={GH} target="_blank" rel="noopener" aria-label="GitHub repository">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
            </svg>
            <span>GitHub</span>
          </a>
          <Link className="btn btn-primary btn-sm" to="/#install" onClick={close}>Get SuperAgent</Link>
          <button
            className="nav-toggle"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="mobile-menu" aria-label="Mobile">
          <Link to="/#features" onClick={close}>Features</Link>
          <Link to="/#install" onClick={close}>Install</Link>
          <Link to="/faq" onClick={close}>FAQ</Link>
          <a href={`${GH}/blob/main/README.md`} target="_blank" rel="noopener" onClick={close}>Docs</a>
        </nav>
      )}
    </header>
  )
}
