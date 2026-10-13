import { Link } from 'react-router-dom'
import { REPO } from '../config.js'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand-col">
        <Link className="footer-brand-mark" to="/#top">
          <span className="logo-mark" aria-hidden="true">◆</span>
          <span>SuperAgent</span>
        </Link>
        <p className="footer-tagline">
          © 2026 SuperAgent · Made with restraint. Free under GPL-3.0 / AGPL-3.0.
        </p>
      </div>

      <nav className="footer-links-grouped" aria-label="Footer">
        <div className="footer-link-group">
          <p className="footer-link-heading">Product</p>
          <ul>
            <li><a href="/#principles">Principles</a></li>
            <li><a href="/#product">In practice</a></li>
            <li><a href="/#install">Install</a></li>
            <li><Link to="/desktop">Desktop App</Link></li>
            <li><Link to="/cli">CLI &amp; Daemon</Link></li>
            <li><Link to="/extension">Browser Extension</Link></li>
          </ul>
        </div>

        <div className="footer-link-group">
          <p className="footer-link-heading">Resources</p>
          <ul>
            <li><Link to="/faq">FAQ</Link></li>
            <li><a href={`${REPO}/blob/main/README.md`} target="_blank" rel="noopener noreferrer">Documentation</a></li>
            <li><a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a></li>
            <li><a href={`${REPO}/releases`} target="_blank" rel="noopener noreferrer">Releases</a></li>
            <li><a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">License</a></li>
          </ul>
        </div>
      </nav>

      <p className="footer-signoff" aria-hidden="true">
        Built in 2026.
      </p>
    </footer>
  )
}
