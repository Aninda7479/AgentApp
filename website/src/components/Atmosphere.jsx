import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

export default function Atmosphere({ variant = 'dusk', className = '' }) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    setReducedMotion(prefersReducedMotion())
  }, [])

  return (
    <div className={`atmosphere ${variant} ${className}`.trim()} aria-hidden="true">
      <div className="moon" />
      <div className="stars">
        <i style={{ top: '14%', left: '18%', animationDelay: '0s' }}></i>
        <i style={{ top: '22%', left: '42%', animationDelay: '1.4s' }}></i>
        <i style={{ top: '9%', left: '62%', animationDelay: '2.6s' }}></i>
        <i style={{ top: '30%', left: '78%', animationDelay: '0.8s' }}></i>
        <i style={{ top: '18%', left: '88%', animationDelay: '3.4s' }}></i>
        <i style={{ top: '36%', left: '30%', animationDelay: '2s' }}></i>
      </div>
      <svg className="hills" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path
          className="hill-back"
          d="M0,196 C240,150 480,224 720,188 C960,152 1200,216 1440,176 L1440,320 L0,320 Z"
        />
        <path
          className="hill-mid"
          d="M0,238 C200,202 400,266 720,230 C1000,198 1240,256 1440,228 L1440,320 L0,320 Z"
        />
        <path
          className="hill-front"
          d="M0,280 C260,252 520,300 760,276 C1020,250 1240,294 1440,272 L1440,320 L0,320 Z"
        />
      </svg>
    </div>
  )
}
