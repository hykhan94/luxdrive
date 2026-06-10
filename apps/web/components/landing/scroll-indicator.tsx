'use client'

import { useState, useEffect } from 'react'

export default function ScrollIndicator() {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const handleScroll = () => {
      // Hide when scrolled past 100px (past hero section)
      setIsVisible(window.scrollY < 100)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleScrollToExplore = () => {
    // Scroll to the services section
    const servicesSection = document.getElementById('services')
    if (servicesSection) {
      servicesSection.scrollIntoView({ behavior: 'smooth' })
    } else {
      // Fallback: scroll down by viewport height
      window.scrollBy({ top: window.innerHeight, behavior: 'smooth' })
    }
  }

  if (!isVisible) return null

  return (
    <button 
      onClick={handleScrollToExplore}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 animate-scroll-bounce cursor-pointer hover:opacity-100 transition-opacity"
      aria-label="Scroll to explore services"
    >
      <p className="text-luxury-gold text-xs uppercase tracking-widest font-medium opacity-60">Scroll to explore</p>
      <svg
        className="w-5 h-5 text-luxury-gold"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    </button>
  )
}
