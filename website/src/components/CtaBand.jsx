import Reveal from './Reveal.jsx'

const GH = 'https://github.com/Aninda7479/AgentApp'

export default function CtaBand() {
  return (
    <section className="section container">
      <Reveal className="cta-band">
        <h2>Stop doing it by hand.</h2>
        <p>One command and an autonomous agent is awake on your machine — coding, browsing, and building while you do the rest.</p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="/#install">Get SuperAgent</a>
          <a className="btn btn-ghost" href={GH} target="_blank" rel="noopener">View on GitHub</a>
        </div>
      </Reveal>
    </section>
  )
}
