'use client'

export default function GeometricPattern() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Horizontal Grid Lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-5"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#C9A961" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Geometric Shapes */}
      <div className="absolute top-0 right-0 w-1/3 h-1/3 opacity-5">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {/* Rotating hexagon pattern */}
          <g stroke="#C9A961" fill="none" strokeWidth="1">
            <polygon points="100,20 170,60 170,140 100,180 30,140 30,60" opacity="0.3" />
            <polygon points="100,40 155,75 155,145 100,160 45,145 45,75" opacity="0.2" />
            <polygon points="100,60 130,85 130,125 100,140 70,125 70,85" opacity="0.1" />
          </g>
        </svg>
      </div>

      {/* Bottom Left Geometric Elements */}
      <div className="absolute bottom-0 left-0 w-1/4 h-1/4 opacity-4">
        <svg viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <g stroke="#C9A961" fill="none" strokeWidth="1">
            {/* Concentric squares */}
            <rect x="10" y="10" width="130" height="130" />
            <rect x="25" y="25" width="100" height="100" />
            <rect x="40" y="40" width="70" height="70" />
            <rect x="55" y="55" width="40" height="40" />

            {/* Diagonal lines */}
            <line x1="10" y1="10" x2="140" y2="140" />
            <line x1="140" y1="10" x2="10" y2="140" />
          </g>
        </svg>
      </div>

      {/* Top Left Corner Accent */}
      <div className="absolute top-20 left-20 w-48 h-48 opacity-3">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <g stroke="#C9A961" fill="none" strokeWidth="0.8">
            {/* Triangular pattern */}
            <polygon points="100,20 180,180 20,180" opacity="0.4" />
            <polygon points="100,50 150,150 50,150" opacity="0.3" />
            <polygon points="100,80 130,130 70,130" opacity="0.2" />
          </g>
        </svg>
      </div>

      {/* Radial Lines Pattern */}
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 opacity-3">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <g stroke="#C9A961" fill="none" strokeWidth="0.8">
            {/* Radial lines */}
            {[...Array(12)].map((_, i) => {
              const angle = (i / 12) * Math.PI * 2
              const x = Math.round((100 + 90 * Math.cos(angle)) * 100) / 100
              const y = Math.round((100 + 90 * Math.sin(angle)) * 100) / 100
              return <line key={i} x1="100" y1="100" x2={x} y2={y} opacity="0.5" />
            })}

            {/* Concentric circles */}
            <circle cx="100" cy="100" r="30" opacity="0.3" />
            <circle cx="100" cy="100" r="60" opacity="0.2" />
            <circle cx="100" cy="100" r="90" opacity="0.1" />
          </g>
        </svg>
      </div>

      {/* Subtle Border Elements */}
      <div className="absolute top-1/2 left-0 w-2 h-32 bg-gradient-to-b from-luxury-gold/20 via-luxury-gold/5 to-transparent opacity-50"></div>
      <div className="absolute top-0 right-1/3 w-32 h-2 bg-gradient-to-r from-transparent via-luxury-gold/10 to-transparent opacity-50"></div>

      {/* Corner Accent Lines */}
      <div className="absolute top-0 left-0 w-32 h-0.5 bg-gradient-to-r from-luxury-gold/30 to-transparent"></div>
      <div className="absolute top-0 left-0 w-0.5 h-32 bg-gradient-to-b from-luxury-gold/30 to-transparent"></div>
    </div>
  )
}
