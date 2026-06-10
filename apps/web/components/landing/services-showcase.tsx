'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ArrowRight, Briefcase, Plane, Bus, MapPin, Users } from 'lucide-react'

const services = [
  {
    id: 'executive',
    title: 'Executive Transfers',
    description: 'Chauffeur-driven cars for VIPs and corporate guests',
    image: '/images/services/executive-transfer.jpg',
    icon: Briefcase,
  },
  {
    id: 'airport',
    title: 'Airport Transfers',
    description: 'Reliable pick-up and drop-off at major airports',
    image: '/images/services/airport-transfer.jpg',
    icon: Plane,
  },
  {
    id: 'staff',
    title: 'Staff Transportation',
    description: 'Luxury buses/coasters for employee mobility',
    image: '/images/services/staff-transport.jpg',
    icon: Bus,
  },
  {
    id: 'intercity',
    title: 'City-to-City Travel',
    description: 'Comfortable intercity transfers across the Kingdom',
    image: '/images/services/city-to-city.jpg',
    icon: MapPin,
  },
  {
    id: 'tours',
    title: 'Private & Group Tours',
    description: 'Custom-curated tours of Saudi landmarks',
    image: '/images/services/private-tours.jpg',
    icon: Users,
  },
]

export default function ServicesShowcase() {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  // Intersection observer for animations
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
    <section id="services" ref={sectionRef} className="relative bg-[#0a0a0a] py-20 overflow-hidden">
      {/* Hero Banner */}
      <div className="relative h-[400px] md:h-[500px] mb-16">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src="/images/hero-desert.jpg"
            alt="Luxury car in Saudi desert"
            fill
            className="object-cover"
            priority
          />
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-[#0a0a0a]" />
          {/* Gold accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9A961]/50 to-transparent" />
        </div>

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
          <h2 
            className={`text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-4 transition-all duration-1000 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            Premium Ground Transportation,{' '}
            <span className="text-[#C9A961]">Unmatched Excellence</span>
          </h2>
          <p 
            className={`text-lg md:text-xl text-gray-300 max-w-2xl transition-all duration-1000 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            Luxury chauffeur services across Saudi Arabia
          </p>
        </div>
      </div>

      {/* Services Grid */}
      <div className="max-w-7xl mx-auto px-4 mb-20">
        {/* Top row - 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {services.slice(0, 3).map((service, index) => {
            const IconComponent = service.icon
            return (
              <div
                key={service.id}
                className={`group relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-gray-800 hover:border-[#C9A961]/50 transition-all duration-500 h-[340px] flex flex-col ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`}
                style={{ transitionDelay: `${300 + index * 100}ms` }}
              >
                {/* Image */}
                <div className="relative h-44 flex-shrink-0 overflow-hidden">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-black/30 to-transparent" />
                  
                  {/* Icon */}
                  <div className="absolute top-4 left-4 w-12 h-12 rounded-full bg-[#1a1a1a]/80 backdrop-blur-sm flex items-center justify-center border border-[#C9A961]/30">
                    <IconComponent className="w-5 h-5 text-[#C9A961]" />
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col flex-grow">
                  <h3 className="text-xl font-serif text-white mb-2 group-hover:text-[#C9A961] transition-colors">
                    {service.title}
                  </h3>
                  <p className="text-gray-400 text-sm mb-4 leading-relaxed flex-grow">
                    {service.description}
                  </p>
                  <button className="flex items-center gap-2 text-[#C9A961] text-sm font-medium group/btn">
                    Learn More
                    <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                  </button>
                </div>

                {/* Hover border effect */}
                <div className="absolute inset-0 rounded-xl border-2 border-[#C9A961] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              </div>
            )
          })}
        </div>
        
        {/* Bottom row - 2 cards centered */}
        <div className="flex flex-col md:flex-row justify-center gap-6">
          {services.slice(3, 5).map((service, index) => {
            const IconComponent = service.icon
            return (
              <div
                key={service.id}
                className={`group relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-gray-800 hover:border-[#C9A961]/50 transition-all duration-500 h-[340px] flex flex-col w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`}
                style={{ transitionDelay: `${600 + index * 100}ms` }}
              >
                {/* Image */}
                <div className="relative h-44 flex-shrink-0 overflow-hidden">
                  <Image
                    src={service.image}
                    alt={service.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-black/30 to-transparent" />
                  
                  {/* Icon */}
                  <div className="absolute top-4 left-4 w-12 h-12 rounded-full bg-[#1a1a1a]/80 backdrop-blur-sm flex items-center justify-center border border-[#C9A961]/30">
                    <IconComponent className="w-5 h-5 text-[#C9A961]" />
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col flex-grow">
                  <h3 className="text-xl font-serif text-white mb-2 group-hover:text-[#C9A961] transition-colors">
                    {service.title}
                  </h3>
                  <p className="text-gray-400 text-sm mb-4 leading-relaxed flex-grow">
                    {service.description}
                  </p>
                  <button className="flex items-center gap-2 text-[#C9A961] text-sm font-medium group/btn">
                    Learn More
                    <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                  </button>
                </div>

                {/* Hover border effect */}
                <div className="absolute inset-0 rounded-xl border-2 border-[#C9A961] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              </div>
            )
          })}
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-1/2 left-0 w-32 h-32 bg-[#C9A961]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-0 w-48 h-48 bg-[#C9A961]/5 rounded-full blur-3xl" />
    </section>
  )
}
