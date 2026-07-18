import { Link } from 'react-router-dom'
import Faq from '../components/Faq.jsx'
import { faqs } from '../data/faq.jsx'

const GH = 'https://github.com/Aninda7479/AgentApp'

export default function FaqPage() {
  return (
    <section className="section container" style={{ paddingTop: '120px' }}>
      <div className="sec-head">
        <p className="eyebrow">Before you install</p>
        <h2 className="h-section">Questions, answered</h2>
        <p className="lead">
          Everything about installing, privacy, and running SuperAgent. Still stuck?{' '}
          <a href={`${GH}/issues`} target="_blank" rel="noopener" style={{ color: 'var(--live)' }}>
            Open an issue on GitHub
          </a>.
        </p>
      </div>

      <Faq items={faqs} />

      <p style={{ marginTop: '32px' }}>
        <Link className="btn btn-ghost btn-sm" to="/">← Back to home</Link>
      </p>
    </section>
  )
}
