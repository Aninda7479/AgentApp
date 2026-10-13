import { useState } from 'react'
import { Link } from 'react-router-dom'
import { REPO } from '../config.js'

export default function CtaBand() {
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  return (
    <section className="section section--cta" aria-labelledby="cta-heading">
      <p className="section-index" aria-hidden="true">— 05 / 05</p>
      <p className="section-aside" aria-hidden="true">Ready to start</p>
      <div className="section-inner">
        <div className="cta-block">
          <h2 id="cta-heading" className="statement-line">
            Build with someone in the <em className="accent">room</em>.
          </h2>
          <p className="cta-subtext">
            SuperAgent is open-source and runs 100% on your hardware. Takes 20 seconds to install.
          </p>

          <form className="cta-form" onSubmit={handleSubmit}>
            <input
              type="email"
              className="cta-input"
              placeholder={submitted ? "We'll be in touch." : "Enter your email for updates..."}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitted}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={submitted}>
              {submitted ? 'On the list' : 'Get early access'}
            </button>
          </form>

          <div className="cta-meta">
            <p className="cta-trust">
              Free under GPL-3.0 · No credit card · Windows, macOS &amp; Linux · Zero telemetry
            </p>
            <a className="cta-secondary-link" href="#install">
              Direct download packages <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
