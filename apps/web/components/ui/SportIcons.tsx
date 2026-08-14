// Custom SVG sport icons — padel racket and pickleball paddle

type IconProps = { className?: string; size?: number }

export function PadelIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-label="Pádel"
    >
      {/* Head — rounded rectangle, like a real padel racket */}
      <rect x="2" y="1" width="20" height="16" rx="5" ry="5" />
      {/* Hole grid 3×3 */}
      <circle cx="7.5"  cy="5.5"  r="1.4" fill="white" />
      <circle cx="12"   cy="5.5"  r="1.4" fill="white" />
      <circle cx="16.5" cy="5.5"  r="1.4" fill="white" />
      <circle cx="7.5"  cy="9"    r="1.4" fill="white" />
      <circle cx="12"   cy="9"    r="1.4" fill="white" />
      <circle cx="16.5" cy="9"    r="1.4" fill="white" />
      <circle cx="7.5"  cy="12.5" r="1.4" fill="white" />
      <circle cx="12"   cy="12.5" r="1.4" fill="white" />
      <circle cx="16.5" cy="12.5" r="1.4" fill="white" />
      {/* Handle */}
      <rect x="10" y="17" width="4" height="6" rx="2" />
    </svg>
  )
}

export function PickleballIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-label="Pickleball"
    >
      {/* Head — circle, like a real pickleball paddle */}
      <circle cx="12" cy="9" r="8" />
      {/* Perforations 3×3 */}
      <circle cx="8.5"  cy="6"    r="1.3" fill="white" />
      <circle cx="12"   cy="6"    r="1.3" fill="white" />
      <circle cx="15.5" cy="6"    r="1.3" fill="white" />
      <circle cx="8.5"  cy="9.5"  r="1.3" fill="white" />
      <circle cx="12"   cy="9.5"  r="1.3" fill="white" />
      <circle cx="15.5" cy="9.5"  r="1.3" fill="white" />
      <circle cx="8.5"  cy="13"   r="1.3" fill="white" />
      <circle cx="12"   cy="13"   r="1.3" fill="white" />
      <circle cx="15.5" cy="13"   r="1.3" fill="white" />
      {/* Handle */}
      <rect x="10" y="17" width="4" height="7" rx="2" />
    </svg>
  )
}

// Helper to get sport icon + label
export function SportLabel({ sport, size = 16 }: { sport: string; size?: number }) {
  if (sport === 'padel') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <PadelIcon size={size} />
        Pádel
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <PickleballIcon size={size} />
      Pickleball
    </span>
  )
}
