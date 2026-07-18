import { Link } from 'react-router-dom'

const GH = 'https://github.com/Aninda7479/AgentApp'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <Link className="brand" to="/">
          <svg className="mark" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <circle cx="13" cy="13" r="11" stroke="var(--agent)" strokeOpacity=".7" strokeWidth="1.5" />
            <ellipse cx="13" cy="13" rx="11.5" ry="4.2" stroke="rgba(255,255,255,.35)" strokeWidth="1" transform="rotate(-24 13 13)" />
            <circle cx="13" cy="13" r="5" fill="var(--super)" />
          </svg>
          SuperAgent
        </Link>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/#features">Features</Link>
          <Link to="/#install">Install</Link>
          <Link to="/faq">FAQ</Link>
          <a href={GH} target="_blank" rel="noopener">GitHub</a>
          <a href={`${GH}/blob/main/LICENSE`} target="_blank" rel="noopener">License</a>
        </nav>
        <p className="copy">© 2026 SuperAgent · Free under GPL-3.0 / AGPL-3.0 · Local-first, open-source, yours to modify.</p>
      </div>
    </footer>
  )
}
