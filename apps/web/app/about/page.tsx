'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Shield, Star, Clock, Heart, Award, Users, CheckCircle, ArrowLeft } from 'lucide-react'

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          const duration = 2000
          const steps = 60
          const increment = target / steps
          let current = 0
          const timer = setInterval(() => {
            current += increment
            if (current >= target) {
              setCount(target)
              clearInterval(timer)
            } else {
              setCount(Math.floor(current))
            }
          }, duration / steps)
        }
      },
      { threshold: 0.5 }
    )

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target])

  return (
    <div ref={ref} className="text-4xl md:text-5xl font-bold text-[#C9A961]">
      {count.toLocaleString()}{suffix}
    </div>
  )
}

const whyLuxDrive = [
  {
    icon: Shield,
    title: 'Safety First',
    description: 'All vehicles undergo rigorous safety checks. Our chauffeurs are background-verified and professionally trained.',
  },
  {
    icon: Star,
    title: 'Unmatched Luxury',
    description: 'Travel in the finest Mercedes fleet with premium amenities, ensuring comfort on every journey.',
  },
  {
    icon: Clock,
    title: 'Always Reliable',
    description: 'Punctuality is our promise. Real-time tracking and 24/7 support guarantee peace of mind.',
  },
]

const stats = [
  { value: 50000, suffix: '+', label: 'Happy Customers' },
  { value: 200, suffix: '+', label: 'Professional Chauffeurs' },
  { value: 500, suffix: '+', label: 'Luxury Vehicles' },
  { value: 10, suffix: '+', label: 'Cities Covered' },
]

const values = [
  { icon: Award, title: 'Excellence', description: 'We strive for perfection in every ride' },
  { icon: Heart, title: 'Integrity', description: 'Honest, transparent service always' },
  { icon: Users, title: 'Hospitality', description: 'Guests, not passengers' },
  { icon: CheckCircle, title: 'Punctuality', description: 'Your time is precious to us' },
]

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Back Navigation */}
      <div className="fixed top-6 left-6 z-50">
        <Link 
          href="/" 
          className="flex items-center gap-2 text-white/70 hover:text-[#C9A961] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to Home</span>
        </Link>
      </div>

      {/* Hero Section */}
      <section className="relative h-[60vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-[#0a0a0a]" />
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: 'url(/images/fleet/business-sedan.jpg)' }}
        />
        <div className="relative z-10 text-center px-4">
          <p className="text-[#C9A961] text-sm tracking-[0.3em] uppercase mb-4">About LuxDrive</p>
          <h1 className="text-4xl md:text-6xl font-serif font-bold mb-4">Driven by Excellence</h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Saudi Arabia&apos;s premier luxury chauffeur service since 2020
          </p>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-6">Our Story</h2>
          <div className="w-16 h-0.5 bg-[#C9A961] mx-auto mb-8" />
          <p className="text-gray-400 text-lg leading-relaxed mb-6">
            Founded in 2020, LuxDrive was born from a vision to redefine luxury transportation in the Kingdom of Saudi Arabia. 
            What started as a small fleet of premium vehicles has grown into the nation&apos;s most trusted chauffeur service, 
            serving discerning travelers, corporate executives, and families across major cities.
          </p>
          <p className="text-gray-400 text-lg leading-relaxed">
            Our mission is simple: to provide unparalleled comfort, safety, and reliability with every journey. 
            Whether you&apos;re heading to the airport, a business meeting, or embarking on a sacred pilgrimage, 
            LuxDrive ensures your travel experience is nothing short of exceptional.
          </p>
        </div>
      </section>

      {/* Why LuxDrive Section */}
      <section className="py-20 px-4 bg-[#111]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-center mb-4">Why LuxDrive</h2>
          <div className="w-16 h-0.5 bg-[#C9A961] mx-auto mb-12" />
          <div className="grid md:grid-cols-3 gap-8">
            {whyLuxDrive.map((item) => (
              <div key={item.title} className="text-center p-8 rounded-xl bg-[#1a1a1a] border border-gray-800 hover:border-[#C9A961]/50 transition-colors">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#C9A961]/10 flex items-center justify-center">
                  <item.icon className="w-8 h-8 text-[#C9A961]" />
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-gray-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                <p className="text-gray-400 mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 px-4 bg-[#111]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-center mb-4">Our Values</h2>
          <div className="w-16 h-0.5 bg-[#C9A961] mx-auto mb-12" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => (
              <div key={value.title} className="p-6 rounded-xl bg-[#1a1a1a] border border-gray-800 hover:border-[#C9A961]/50 transition-colors">
                <div className="w-12 h-12 mb-4 rounded-lg bg-[#C9A961]/10 flex items-center justify-center">
                  <value.icon className="w-6 h-6 text-[#C9A961]" />
                </div>
                <h3 className="text-lg font-bold mb-2">{value.title}</h3>
                <p className="text-gray-400 text-sm">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">Ready to Experience LuxDrive?</h2>
          <p className="text-gray-400 mb-8">Book your premium journey today</p>
          <Link 
            href="/#hero"
            className="inline-flex px-8 py-4 bg-[#C9A961] text-black font-semibold rounded-lg hover:bg-[#b8994d] transition-colors"
          >
            Book Now
          </Link>
        </div>
      </section>
    </main>
  )
}
