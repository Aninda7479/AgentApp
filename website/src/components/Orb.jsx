// The SuperAgent "core" — a luminous agent orb with three slowly orbiting
// rings. Hand-authored SVG so it themes from the palette and stays crisp at
// any size. Built as the brand's signature mark: calm, autonomous, alive.
export default function Orb({ size = 320, className = '', ariaLabel = 'SuperAgent core' }) {
  return (
    <svg
      className={`orb ${className}`.trim()}
      viewBox="0 0 320 320"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <radialGradient id="saCore" cx="46%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#FFE9BD" />
          <stop offset="34%" stopColor="#FFB23E" />
          <stop offset="74%" stopColor="#8C7BFF" />
          <stop offset="100%" stopColor="#2E2658" />
        </radialGradient>
        <radialGradient id="saHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,178,62,.55)" />
          <stop offset="48%" stopColor="rgba(140,123,255,.20)" />
          <stop offset="100%" stopColor="rgba(140,123,255,0)" />
        </radialGradient>
      </defs>

      {/* breathing halo */}
      <circle className="halo" cx="160" cy="160" r="150" fill="url(#saHalo)" />

      {/* three orbital rings, each tilted and spun by CSS */}
      <g className="ring ring-a">
        <ellipse cx="160" cy="160" rx="124" ry="48" fill="none" stroke="rgba(255,255,255,.20)" strokeWidth="1.2" />
        <circle cx="284" cy="160" r="4.4" fill="#FFB23E" />
      </g>
      <g className="ring ring-b" transform="rotate(58 160 160)">
        <ellipse cx="160" cy="160" rx="124" ry="48" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="1.2" />
        <circle cx="284" cy="160" r="4.4" fill="#8C7BFF" />
      </g>
      <g className="ring ring-c" transform="rotate(122 160 160)">
        <ellipse cx="160" cy="160" rx="124" ry="48" fill="none" stroke="rgba(255,255,255,.11)" strokeWidth="1.2" />
        <circle cx="284" cy="160" r="3.8" fill="#3DDC97" />
      </g>

      {/* the core */}
      <circle className="core" cx="160" cy="160" r="58" fill="url(#saCore)" />
      <circle cx="160" cy="160" r="58" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1" />
    </svg>
  )
}
