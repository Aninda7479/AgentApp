import { Link } from 'react-router-dom'
import Faq from '../components/Faq.jsx'
import { faqs } from '../data/faq.jsx'
import Atmosphere from '../components/Atmosphere.jsx'
import { REPO } from '../config.js'

export default function FaqPage() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <Atmosphere variant="faq-view" />
      <section className="section" style={{ paddingTop: '120px', minHeight: '85vh', position: 'relative', zIndex: 1 }}>
        <div className="section-inner">
          <p className="eyebrow">— Clarifications</p>
          <h1 className="statement-line" style={{ marginBottom: '1rem' }}>
            Questions, <em className="accent">answered</em>.
          </h1>
          <p className="statement-caption" style={{ marginBottom: '2.5rem' }}>
            Everything about running locally, privacy, LLM keys, and security. Need more help?{' '}
            <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
              Open an issue on GitHub
            </a>.
          </p>

          <Faq items={faqs} />

          <div style={{ marginTop: '2.5rem' }}>
            <Link className="btn btn-ghost btn-sm" to="/">← Back to overview</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
