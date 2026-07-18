import { Link } from 'react-router-dom'

const GH = 'https://github.com/Aninda7479/AgentApp'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <Link className="brand" to="/">
          <img className="mark" src="/icon.svg" alt="SuperAgent Logo" width="26" height="26" />
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
