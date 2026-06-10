'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Shield, Star, Clock, ChevronDown, ChevronUp, ArrowRight, Award, Users, Heart, CheckCircle } from 'lucide-react'

const highlights = [
  {
    icon: Shield,
    title: 'Safety First',
    description: 'All vehicles undergo rigorous safety checks. Our chauffeurs are background-verified.',
  },
  {
    icon: Star,
    title: 'Unmatched Luxury',
    description: 'Travel in the finest Mercedes fleet with premium amenities.',
  },
  {
    icon: Clock,
    title: 'Always Reliable',
    description: 'Punctuality is our promise. Real-time tracking and 24/7 support.',
  },
]

const values = [
  { icon: Award, title: 'Excellence', description: 'We strive for perfection in every ride' },
  { icon: Heart, title: 'Integrity', description: 'Honest, transparent service always' },
  { icon: Users, title: 'Hospitality', description: 'Guests, not passengers' },
  { icon: CheckCircle, title: 'Punctuality', description: 'Your time is precious to us' },
]

export default function AboutPreview() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <section id="about" className="py-20 px-4 bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-[#C9A961] text-sm tracking-[0.3em] uppercase mb-3">About Us</p>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-white mb-4">
            Driven by Excellence
          </h2>
          <div className="w-16 h-0.5 bg-[#C9A961] mx-auto mb-6" />
          <p className="text-gray-400 max-w-2xl mx-auto">
            Saudi Arabia&apos;s premier luxury chauffeur service since 2020, serving discerning travelers with unparalleled comfort and reliability.
          </p>
        </div>

        {/* Key Highlights - Always Visible */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {highlights.map((item) => (
            <div 
              key={item.title} 
              className="p-6 rounded-xl bg-[#141414] border border-neutral-800 hover:border-[#C9A961]/50 transition-all duration-300 group"
            >
              <div className="w-12 h-12 mb-4 rounded-lg bg-[#C9A961]/10 flex items-center justify-center group-hover:bg-[#C9A961]/20 transition-colors">
                <item.icon className="w-6 h-6 text-[#C9A961]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
              <p className="text-gray-400 text-sm">{item.description}</p>
            </div>
          ))}
        </div>

        {/* Expandable Section */}
        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${
          isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          {/* Our Story */}
          <div className="text-center py-8 px-4 mb-8 bg-[#111] rounded-xl border border-neutral-800">
            <h3 className="text-2xl font-serif font-bold text-white mb-4">Our Story</h3>
            <p className="text-gray-400 max-w-3xl mx-auto leading-relaxed">
              Founded in 2020, LuxDrive was born from a vision to redefine luxury transportation in the Kingdom of Saudi Arabia. 
              What started as a small fleet of premium vehicles has grown into the nation&apos;s most trusted chauffeur service, 
              serving discerning travelers, corporate executives, and families across major cities.
            </p>
          </div>

          {/* Values Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {values.map((value) => (
              <div 
                key={value.title} 
                className="p-5 rounded-xl bg-[#141414] border border-neutral-800 hover:border-[#C9A961]/50 transition-colors"
              >
                <div className="w-10 h-10 mb-3 rounded-lg bg-[#C9A961]/10 flex items-center justify-center">
                  <value.icon className="w-5 h-5 text-[#C9A961]" />
                </div>
                <h4 className="text-md font-bold text-white mb-1">{value.title}</h4>
                <p className="text-gray-400 text-xs">{value.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 px-6 py-3 text-[#C9A961] border border-[#C9A961]/50 hover:bg-[#C9A961]/10 rounded-lg transition-all duration-300"
          >
            {isExpanded ? (
              <>
                Show Less
                <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                Learn More
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
          
          <Link
            href="/about"
            className="flex items-center gap-2 px-6 py-3 text-white bg-[#C9A961]/20 hover:bg-[#C9A961]/30 rounded-lg transition-all duration-300"
          >
            View Full Story
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
