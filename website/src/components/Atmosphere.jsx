export default function Atmosphere({ variant = 'dusk', className = '' }) {
  return (
    <div className={`atmosphere ${variant} ${className}`.trim()} aria-hidden="true">
      <div className="ambient-glow" />
    </div>
  )
}
