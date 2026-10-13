import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="section" style={{ paddingTop: '160px', minHeight: '80vh', textAlign: 'center' }}>
      <div className="section-inner">
        <p className="eyebrow" style={{ display: 'inline-block' }}>— 404</p>
        <h1 className="statement-line" style={{ margin: '0 auto 1.5rem' }}>
          This page wandered <em className="accent">off</em>.
        </h1>
        <p className="statement-caption" style={{ margin: '0 auto 2.5rem' }}>
          The route you are looking for doesn't exist or has moved.
        </p>
        <Link className="btn btn-primary" to="/">Return to home</Link>
      </div>
    </section>
  )
}
