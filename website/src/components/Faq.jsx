import { useRef, useState } from 'react'

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  const aRef = useRef(null)
  const maxHeight = open && aRef.current ? aRef.current.scrollHeight : 0

  return (
    <div className={`faq-item${open ? ' open' : ''}`}>
      <button className="faq-q" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {q}
        <span className="pm" aria-hidden="true" />
      </button>
      <div className="faq-a" ref={aRef} style={{ maxHeight }}>
        {a}
      </div>
    </div>
  )
}

export default function Faq({ items }) {
  return (
    <div className="faq-wrap">
      {items.map((item, i) => (
        <FaqItem key={i} q={item.q} a={item.a} />
      ))}
    </div>
  )
}
