'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Building2, Plane, Briefcase, CalendarDays, ArrowRight } from 'lucide-react'

const partners = [
  {
    id: 'hotels',
    title: 'Hotels',
    description: 'Partner with us to provide premium transportation for your guests',
    icon: Building2,
  },
  {
    id: 'travel',
    title: 'Travel Agencies',
    description: 'Offer luxury ground transportation packages to your clients',
    icon: Plane,
  },
  {
    id: 'corporate',
    title: 'Corporate Clients',
    description: 'Dedicated fleet solutions for your business travel needs',
    icon: Briefcase,
  },
  {
    id: 'events',
    title: 'Event Planners',
    description: 'Seamless transportation coordination for your events',
    icon: CalendarDays,
  },
]

export default function PartnershipSection() {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1 }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section id="partnership" ref={sectionRef} className="relative py-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src="/images/partnership-bg.jpg"
          alt="Partnership background"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-black/80 to-[#0a0a0a]" />
      </div>

      {/* Gold decorative elements */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9A961]/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9A961]/30 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 md:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 
            className={`text-4xl md:text-5xl font-serif font-bold text-white mb-4 transition-all duration-1000 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            Exclusive <span className="text-[#C9A961]">Partnership Opportunities</span>
          </h2>
          <p 
            className={`text-lg text-gray-400 max-w-2xl mx-auto transition-all duration-1000 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            Partner With Us
          </p>
        </div>

        {/* Partner Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {partners.map((partner, index) => {
            const IconComponent = partner.icon
            return (
              <div
                key={partner.id}
                className={`group p-6 bg-[#141414]/80 backdrop-blur-sm rounded-xl border border-neutral-800 hover:border-[#C9A961]/50 transition-all duration-500 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`}
                style={{ transitionDelay: `${300 + index * 100}ms` }}
              >
                <div className="w-14 h-14 mb-4 rounded-xl bg-[#C9A961]/10 flex items-center justify-center group-hover:bg-[#C9A961]/20 transition-colors">
                  <IconComponent className="w-7 h-7 text-[#C9A961]" />
                </div>
                <h3 className="text-white text-xl font-serif font-semibold mb-2 group-hover:text-[#C9A961] transition-colors">
                  {partner.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {partner.description}
                </p>
              </div>
            )
          })}
        </div>

        {/* CTA Button */}
        <div 
          className={`text-center transition-all duration-1000 delay-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#C9A961] text-black font-semibold rounded-xl hover:bg-[#C9A961]/90 transition-all duration-300 shadow-lg shadow-[#C9A961]/20 group"
          >
            Contact Us
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  )
}
