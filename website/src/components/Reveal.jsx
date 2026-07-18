import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

// Wraps content in a scroll-triggered fade/slide reveal. Renders any tag
// (defaults to div) so it can stand in for section/div/article elements.
export default function Reveal({ as: Tag = 'div', className = '', children, ...rest }){
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion() || !('IntersectionObserver' in window)){
      el.classList.add('is-visible')
      return
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting){
          e.target.classList.add('is-visible')
          io.unobserve(e.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={`reveal ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  )
}
