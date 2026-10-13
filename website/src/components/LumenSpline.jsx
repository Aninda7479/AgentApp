import { useEffect, useRef, useState } from 'react'

export default function LumenSpline() {
  const containerRef = useRef(null)
  const [typedIndex, setTypedIndex] = useState(0)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const terminalLines = [
    '$ superagent run --workspace',
    '› core_v2 daemon online (:1469)',
    '› mcp tools initialized (18 tools)',
    '● agent ready · listening'
  ]

  // Typewriter effect inside the retro desk monitor
  useEffect(() => {
    const timer = setInterval(() => {
      setTypedIndex((prev) => (prev + 1) % terminalLines.length)
    }, 2800)
    return () => clearInterval(timer)
  }, [])

  // Smooth, throttled mouse-tilt parallax effect (hardware-accelerated)
  const handleMouseMove = (e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setTilt({ x: x * 8, y: -y * 8 })
  }

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 })
  }

  return (
    <div
      className="spline-col"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="spline-wrap" aria-hidden="true">
        <div className="lumen-desk-scene">
          {/* Ambient Lighting & Volumetric Glow */}
          <div className="desk-ambient-glow" />
          <div className="desk-lamp-cone" />

          {/* 3D Isometric Tilt Container */}
          <div
            className="desk-stage"
            style={{
              transform: `perspective(900px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`
            }}
          >
            {/* The Vintage Computer Desk Surface */}
            <div className="desk-surface">
              <div className="desk-edge" />
              <div className="desk-mat" />
            </div>

            {/* The Retro Workstation Monitor */}
            <div className="desk-monitor">
              <div className="monitor-housing">
                <div className="monitor-crt">
                  <div className="crt-scanlines" />
                  <div className="crt-phosphor-glow" />
                  <div className="crt-content">
                    <div className="crt-header">
                      <span className="crt-dot" />
                      <span>SUPERAGENT OS · 1469</span>
                    </div>
                    <div className="crt-body">
                      {terminalLines.map((line, idx) => (
                        <div
                          key={idx}
                          className={`crt-line ${idx <= typedIndex ? 'visible' : ''} ${
                            line.startsWith('●') ? 'online' : ''
                          }`}
                        >
                          {line}
                        </div>
                      ))}
                      <div className="crt-cursor" />
                    </div>
                  </div>
                </div>
                <div className="monitor-badge">◆ SUPERAGENT</div>
              </div>
              <div className="monitor-neck" />
              <div className="monitor-base" />
            </div>

            {/* Keyboard & Mouse Accessories */}
            <div className="desk-keyboard">
              <div className="keyboard-keys" />
            </div>
            <div className="desk-mouse" />

            {/* Retro Desk Lamp with Molten-Orange Warmth */}
            <div className="desk-lamp">
              <div className="lamp-head">
                <div className="lamp-bulb" />
              </div>
              <div className="lamp-arm" />
              <div className="lamp-base" />
            </div>

            {/* Coffee Cup / Companion Accent */}
            <div className="desk-mug">
              <div className="mug-handle" />
              <div className="mug-steam" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
