import Reveal from './Reveal.jsx'
import { features } from '../data/features.jsx'

export default function Features() {
  return (
    <>
      <Reveal className="sec-head">
        <p className="eyebrow">What it does</p>
        <h2 className="h-section">An agent, not a chatbot</h2>
        <p className="lead">SuperAgent plans, acts, and corrects itself across the tools you already use — then hands you the result.</p>
      </Reveal>

      <div className="feat-grid">
        {features.map((f, i) => (
          <Reveal className="feat" key={i}>
            <div className="ico">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </Reveal>
        ))}
      </div>
    </>
  )
}
