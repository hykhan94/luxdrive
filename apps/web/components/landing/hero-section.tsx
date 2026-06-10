"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Navigation from "./navigation";
import ScrollIndicator from "./scroll-indicator";
import GeometricPattern from "./geometric-pattern";
import BookingForm from "./booking-form";

// Dynamically import Three.js background to avoid SSR issues
const TravelBackground = dynamic(() => import("./travel-background"), {
  ssr: false,
  loading: () => null,
});

export default function HeroSection() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div
      id="hero"
      className="relative min-h-screen bg-luxury-dark overflow-hidden"
    >
      {/* Travel Background - z-0 */}
      <div className="absolute inset-0 z-0">
        <TravelBackground />
      </div>

      {/* Geometric Pattern Background - z-[1], subtle */}
      <div className="absolute inset-0 z-[1] opacity-30">
        <GeometricPattern />
      </div>

      {/* Gradient Overlays for depth - z-[2], reduced opacity */}
      <div className="absolute inset-0 bg-gradient-to-r from-luxury-dark/90 via-luxury-dark/50 to-transparent z-[2]" />
      <div className="absolute inset-0 bg-gradient-to-t from-luxury-dark via-transparent to-luxury-dark/30 z-[2]" />

      {/* Navigation */}
      <Navigation />

      {/* Hero Content */}
      <div className="relative z-[5] min-h-screen flex flex-col items-center justify-center px-4 md:px-8 pt-20">
        <div className="relative w-full max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center py-8">
            {/* Left Content */}
            <div className="flex flex-col justify-center space-y-6 md:space-y-8">
              {/* Headline */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-0.5 w-8 bg-luxury-gold"></div>
                  <span className="text-xs uppercase tracking-widest text-luxury-gold font-medium">
                    Luxury Experiences
                  </span>
                </div>

                <h1
                  className={`text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-serif font-bold text-white leading-tight transition-all duration-1000 ${
                    isLoaded
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: "0.1s" }}
                >
                  Your Journey,
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-luxury-gold to-luxury-gold/60">
                    Our Honor
                  </span>
                </h1>
              </div>

              {/* Subheadline */}
              <p
                className={`text-base md:text-lg text-gray-300 max-w-md leading-relaxed transition-all duration-1000 ${
                  isLoaded
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: "0.2s" }}
              >
                Premium Chauffeur Services Across Saudi Arabia. Experience
                elegance, reliability, and sophistication on every journey.
              </p>

              {/* Features List */}
              <div
                className={`flex flex-wrap gap-6 pt-2 transition-all duration-1000 ${
                  isLoaded
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: "0.3s" }}
              >
                {[
                  { icon: "24/7", label: "Available" },
                  { icon: "50+", label: "Premium Vehicles" },
                  { icon: "100%", label: "Satisfaction" },
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-luxury-gold font-bold text-lg">
                      {feature.icon}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {feature.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Trust Badge */}
              <div
                className={`flex items-center gap-4 pt-4 border-t border-gray-700/50 transition-all duration-1000 ${
                  isLoaded
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: "0.4s" }}
              >
                <div className="text-sm">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">
                    Trusted by
                  </p>
                  <p className="text-white font-semibold">
                    10,000+ Premium Members
                  </p>
                </div>
                <div className="flex -space-x-2">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full bg-gradient-to-br from-luxury-gold to-luxury-gold/60 border-2 border-luxury-dark"
                    ></div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Side - Booking Form */}
            <div
              className={`transition-all duration-1000 ${
                isLoaded
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: "0.3s" }}
            >
              <BookingForm />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <ScrollIndicator />
    </div>
  );
}
