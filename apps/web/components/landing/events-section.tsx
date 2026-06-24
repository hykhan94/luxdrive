"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Heart,
  Building,
  Crown,
  MessageCircle,
  Presentation,
} from "lucide-react";

const eventTypes = [
  { icon: Presentation, label: "MICE" },
  { icon: Building, label: "Corporate Events" },
  { icon: Crown, label: "VIP Occasions" },
];

export default function EventsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 },
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src="/images/events-bg.jpg"
          alt="Special events background"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/95 via-[#0a0a0a]/80 to-[#0a0a0a]/60" />
      </div>

      {/* Gold decorative elements */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9A961]/30 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <h2
              className={`text-4xl md:text-5xl font-serif font-bold text-white mb-6 transition-all duration-1000 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              Book for <span className="text-[#C9A961]">Special Events</span>
            </h2>

            <p
              className={`text-lg text-gray-300 mb-8 transition-all duration-1000 delay-200 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              MICE, Corporate Events & VIP Occasions
            </p>

            <p
              className={`text-gray-400 mb-8 leading-relaxed transition-all duration-1000 delay-300 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              Make your special moments unforgettable with our premium fleet and
              professional chauffeurs. We offer custom packages tailored to your
              event needs, ensuring seamless transportation for you and your
              guests.
            </p>

            {/* Event Types */}
            <div
              className={`flex flex-wrap gap-4 mb-10 transition-all duration-1000 delay-400 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              {eventTypes.map((event) => (
                <div
                  key={event.label}
                  className="flex items-center gap-2 px-4 py-2 bg-[#C9A961]/10 border border-[#C9A961]/30 rounded-lg"
                >
                  <event.icon className="w-5 h-5 text-[#C9A961]" />
                  <span className="text-white text-sm font-medium">
                    {event.label}
                  </span>
                </div>
              ))}
            </div>

            {/* WhatsApp CTA */}
            <div
              className={`transition-all duration-1000 delay-500 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              <a
                href="https://wa.me/966545559510?text=Hello%2C%20I%27d%20like%20to%20inquire%20about%20event%20transportation"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20BD5A] transition-all duration-300 shadow-lg shadow-[#25D366]/20 group"
              >
                <MessageCircle className="w-6 h-6" />
                Chat on WhatsApp
              </a>
              <p className="mt-4 text-gray-500 text-sm">
                Get instant quotes and custom packages
              </p>
            </div>
          </div>

          {/* Decorative Right Side - Stats or Image Placeholder */}
          <div
            className={`hidden lg:flex flex-col gap-6 transition-all duration-1000 delay-600 ${
              isVisible
                ? "opacity-100 translate-x-0"
                : "opacity-0 translate-x-12"
            }`}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 bg-[#141414]/80 backdrop-blur-sm rounded-xl border border-[#C9A961]/20 text-center">
                <div className="text-4xl font-serif font-bold text-[#C9A961] mb-2">
                  500+
                </div>
                <div className="text-gray-400 text-sm">Events Served</div>
              </div>
              <div className="p-6 bg-[#141414]/80 backdrop-blur-sm rounded-xl border border-[#C9A961]/20 text-center">
                <div className="text-4xl font-serif font-bold text-[#C9A961] mb-2">
                  50+
                </div>
                <div className="text-gray-400 text-sm">Fleet Vehicles</div>
              </div>
              <div className="p-6 bg-[#141414]/80 backdrop-blur-sm rounded-xl border border-[#C9A961]/20 text-center">
                <div className="text-4xl font-serif font-bold text-[#C9A961] mb-2">
                  100%
                </div>
                <div className="text-gray-400 text-sm">Satisfaction Rate</div>
              </div>
              <div className="p-6 bg-[#141414]/80 backdrop-blur-sm rounded-xl border border-[#C9A961]/20 text-center">
                <div className="text-4xl font-serif font-bold text-[#C9A961] mb-2">
                  24/7
                </div>
                <div className="text-gray-400 text-sm">Support Available</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
