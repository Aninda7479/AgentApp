import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="section container" style={{ paddingTop: '140px', textAlign: 'center' }}>
      <p className="eyebrow" style={{ justifyContent: 'center' }}>404</p>
      <h2 className="h-section">This page wandered off</h2>
      <p className="lead" style={{ margin: '0 auto 24px' }}>The agent couldn’t find that route.</p>
      <Link className="btn btn-primary" to="/">Back to home</Link>
    </section>
  )
}
