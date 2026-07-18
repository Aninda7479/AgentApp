import Terminal from '../components/Terminal.jsx'
import InstallForks from '../components/InstallForks.jsx'
import Features from '../components/Features.jsx'
import CtaBand from '../components/CtaBand.jsx'
import Atmosphere from '../components/Atmosphere.jsx'

export default function Home() {
  return (
    <>
      <section className="hero container">
        <Atmosphere variant="dusk" />
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Open-source · Autonomous · Privacy-first</p>
            <h1 className="h-display">An autonomous agent, <span className="accent">running on your terms.</span></h1>
            <p className="lead">SuperAgent codes, drives your browser, generates media, and runs terminal workflows — all on your machine. One command and it’s awake, working, and entirely yours.</p>
            <div className="hero-cta">
              <a className="btn btn-primary" href="/#install">Install the CLI</a>
              <a className="btn btn-ghost" href="/#install">Download the app</a>
            </div>
            <div className="stat-strip">
              <span>GPL-3.0 / AGPL-3.0</span>
              <span>Local-first</span>
              <span>Windows · macOS · Linux</span>
              <span>No telemetry</span>
            </div>
          </div>

          <Terminal />
        </div>
      </section>

      <section id="install" style={{ background: 'linear-gradient(180deg, #143028 0%, #112821 100%)', width: '100%', overflow: 'hidden' }}>
        <div className="section container">
          <InstallForks />
        </div>
      </section>

      <section id="features" style={{ background: 'linear-gradient(180deg, #112821 0%, #0d1f1a 100%)', width: '100%', overflow: 'hidden' }}>
        <div className="section container">
          <Features />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
