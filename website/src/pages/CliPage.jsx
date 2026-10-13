import { Link } from 'react-router-dom'
import Terminal from '../components/Terminal.jsx'
import { CliFork } from '../components/InstallForks.jsx'
import Atmosphere from '../components/Atmosphere.jsx'

export default function CliPage() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <Atmosphere variant="dusk" />
      <section className="section" style={{ paddingTop: '120px', minHeight: '85vh', position: 'relative', zIndex: 1 }}>
        <div className="section-inner">
          <p className="eyebrow">— Terminal &amp; Server</p>
          <h1 className="statement-line" style={{ marginBottom: '1rem' }}>
            Pure speed on your <em className="accent">terminal</em>.
          </h1>
          <p className="statement-caption" style={{ marginBottom: '2.5rem' }}>
            One shell command puts <code style={{ fontFamily: 'var(--font-mono)' }}>superagent</code> on your PATH and serves the local web dashboard at port 1469. Perfect for local dev, headless servers, CI pipelines, and HomeLabs.
          </p>

          <div className="fork-grid">
            <CliFork />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Terminal />
            </div>
          </div>

          <div style={{ marginTop: '2.5rem', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link className="btn btn-ghost btn-sm" to="/">← Back to overview</Link>
            <Link className="btn btn-ghost btn-sm" to="/desktop">Prefer the desktop app? →</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
