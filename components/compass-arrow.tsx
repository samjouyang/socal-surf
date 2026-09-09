// An arrow showing the direction a swell or wind is heading. Input is the
// meteorological "from" bearing; the arrow points in the direction of travel
// (from + 180). North is up, angles increase clockwise.

export function CompassArrow({
  fromDeg,
  size = 30,
  className,
}: {
  fromDeg: number
  size?: number
  className?: string
}) {
  const travel = (fromDeg + 180) % 360
  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      className={className}
      aria-hidden="true"
    >
      <circle cx="0" cy="0" r="46" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="4" />
      <g transform={`rotate(${travel})`} stroke="currentColor" fill="currentColor">
        <line x1="0" y1="30" x2="0" y2="-26" strokeWidth="7" strokeLinecap="round" />
        <path d="M 0 -40 L 16 -14 L 0 -22 L -16 -14 Z" strokeWidth="2" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
