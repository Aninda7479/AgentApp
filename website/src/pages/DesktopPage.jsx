import { Link } from 'react-router-dom'
import { DesktopFork } from '../components/InstallForks.jsx'
import Atmosphere from '../components/Atmosphere.jsx'

export default function DesktopPage() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <Atmosphere variant="dusk" />
      <section className="section container" style={{ paddingTop: '120px', minHeight: '80vh', position: 'relative', zIndex: 1 }}>
        <div className="sec-head">
          <p className="eyebrow">Core + Desktop + Web</p>
          <h2 className="h-section">Download the desktop app</h2>
          <p className="lead">
            A native OS client with the full visual workspace and your always-on-top 3D companion.
            Builds are provided for Windows, macOS, and Linux.
          </p>
        </div>

        <div className="fork-grid" style={{ marginTop: '8px', gridTemplateColumns: 'minmax(0, 520px)' }}>
          <DesktopFork />
        </div>

        <p style={{ marginTop: '32px' }}>
          <Link className="btn btn-ghost btn-sm" to="/">← Back to home</Link>
          <Link className="btn btn-ghost btn-sm" to="/cli" style={{ marginLeft: '8px' }}>Want the CLI instead? →</Link>
        </p>
      </section>
    </div>
  )
}
