import Orb from '../components/Orb.jsx'
import Terminal from '../components/Terminal.jsx'
import InstallForks from '../components/InstallForks.jsx'
import Features from '../components/Features.jsx'
import CtaBand from '../components/CtaBand.jsx'

export default function Home() {
  return (
    <>
      <section className="hero container">
        <div className="hero-bg" aria-hidden="true" />
        <Orb className="hero-orb" size={520} />
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

      <section className="section container" id="install">
        <InstallForks />
      </section>

      <section className="section container" id="features">
        <Features />
      </section>

      <CtaBand />
    </>
  )
}
