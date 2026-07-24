import { Link } from 'react-router-dom'
import Terminal from '../components/Terminal.jsx'
import { CliFork } from '../components/InstallForks.jsx'
import Atmosphere from '../components/Atmosphere.jsx'

export default function CliPage() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <Atmosphere variant="dusk" />
      <section className="section container" style={{ paddingTop: '120px', minHeight: '80vh', position: 'relative', zIndex: 1 }}>
        <div className="sec-head">
          <p className="eyebrow">Core + CLI + Web</p>
          <h2 className="h-section">Install the CLI</h2>
          <p className="lead">
            One command puts <code style={{ fontFamily: 'var(--font-mono)' }}>superagent</code> on your PATH and
            bundles the local web dashboard. Perfect for your terminal, scripts, servers, and CI.
          </p>
        </div>

        <div className="fork-grid" style={{ marginTop: '8px' }}>
          <CliFork />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Terminal />
          </div>
        </div>

        <p style={{ marginTop: '32px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Link className="btn btn-ghost btn-sm" to="/">← Back to home</Link>
          <Link className="btn btn-ghost btn-sm" to="/desktop">Prefer the desktop app? →</Link>
        </p>
      </section>
    </div>
  )
}
