'use client'

import Link from 'next/link'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showTagline?: boolean
  variant?: 'dark' | 'light'
  linkTo?: string | null
  className?: string
}

export default function Logo({ 
  size = 'md', 
  showTagline = true, 
  variant = 'dark',
  linkTo = '/',
  className = ''
}: LogoProps) {
  const sizeClasses = {
    sm: { main: 'text-lg', tagline: 'text-[9px]', spacing: 'tracking-[1px]' },
    md: { main: 'text-2xl', tagline: 'text-[10px]', spacing: 'tracking-[2px]' },
    lg: { main: 'text-3xl', tagline: 'text-xs', spacing: 'tracking-[2px]' },
    xl: { main: 'text-4xl', tagline: 'text-sm', spacing: 'tracking-[3px]' },
  }

  const { main, tagline, spacing } = sizeClasses[size]
  
  // Colors based on variant (dark = dark background, light = light background)
  const luxColor = variant === 'dark' ? 'text-white' : 'text-[#1a1a1a]'
  const driveColor = 'text-[#C9A961]'
  const taglineColor = 'text-gray-500'

  const logoContent = (
    <div className={`flex flex-col ${className}`}>
      <span className={`font-outfit font-bold ${main} ${spacing} leading-none`}>
        <span className={luxColor}>LUX</span>
        <span className={driveColor}>DRIVE</span>
      </span>
      {showTagline && (
        <span className={`font-cormorant ${tagline} ${taglineColor} tracking-[1px] italic mt-0.5`}>
          by Luxakari Hospitality Group
        </span>
      )}
    </div>
  )

  if (linkTo) {
    return (
      <Link href={linkTo} className="inline-block">
        {logoContent}
      </Link>
    )
  }

  return logoContent
}

// Badge variant for compact spaces (favicon, collapsed nav)
export function LogoBadge({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <div 
      className={`border-2 border-[#C9A961] flex items-center justify-center font-outfit ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="text-[#C9A961] font-bold" style={{ fontSize: size * 0.5 }}>L</span>
    </div>
  )
}
