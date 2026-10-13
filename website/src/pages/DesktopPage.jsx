import { Link } from 'react-router-dom'
import { DesktopFork } from '../components/InstallForks.jsx'
import Atmosphere from '../components/Atmosphere.jsx'

export default function DesktopPage() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <Atmosphere variant="dusk" />
      <section className="section" style={{ paddingTop: '120px', minHeight: '85vh', position: 'relative', zIndex: 1 }}>
        <div className="section-inner">
          <p className="eyebrow">— Native Client</p>
          <h1 className="statement-line" style={{ marginBottom: '1rem' }}>
            The desktop <em className="accent">companion</em>.
          </h1>
          <p className="statement-caption" style={{ marginBottom: '2.5rem' }}>
            A native OS client with the complete visual workspace and an interactive 3D companion model. Builds are compiled for Windows, macOS, and Linux.
          </p>

          <div className="fork-grid" style={{ gridTemplateColumns: 'minmax(0, 580px)' }}>
            <DesktopFork />
          </div>

          <div style={{ marginTop: '2.5rem', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link className="btn btn-ghost btn-sm" to="/">← Back to overview</Link>
            <Link className="btn btn-ghost btn-sm" to="/cli">Prefer the CLI? →</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
