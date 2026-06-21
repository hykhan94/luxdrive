"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Plane,
  Bus,
  MapPin,
  Users,
  X,
  Check,
  Sparkles,
  Clock,
  Shield,
  Phone,
} from "lucide-react";

// ============== SERVICE DATA ==============
//
// Each service has lightweight summary fields (used on the grid card)
// plus richer detail content surfaced when the user clicks "Learn
// More" and the detail panel opens. The detail content is intentionally
// scannable — short paragraphs, checklist of inclusions, ideal-for
// scenarios, and a fleet hint — designed so a visitor can decide
// whether to book within ~15 seconds of opening the panel.

const services = [
  {
    id: "executive",
    title: "Executive Transfers",
    description: "Chauffeur-driven cars for VIPs and corporate guests",
    image: "/images/services/executive-transfer.jpg",
    icon: Briefcase,
    detail: {
      tagline: "Discretion. Punctuality. Distinction.",
      overview:
        "The signature LuxDrive experience — vetted chauffeurs in tailored attire, immaculately presented Mercedes S-Class and BMW 7 Series vehicles, and a service standard calibrated for high-stakes meetings, diplomatic visits, and corporate hospitality.",
      inclusions: [
        "Professional chauffeur in business attire",
        "Premium Mercedes S-Class or BMW 7 Series",
        "Complimentary bottled water & refreshments",
        "Real-time route optimization and ETA tracking",
        "Privacy-screened cabin on request",
        "Multi-stop itinerary planning",
      ],
      idealFor: [
        "C-suite executive transport",
        "VIP airport pickups",
        "Government and diplomatic visits",
        "Corporate hospitality programs",
      ],
      fleetHint: "Mercedes S-Class · BMW 7 Series · Lexus LS",
      note: "Hourly and full-day rates available. Multi-day corporate accounts welcomed.",
    },
  },
  {
    id: "airport",
    title: "Airport Transfers",
    description: "Reliable pick-up and drop-off at major airports",
    image: "/images/services/airport-transfer.jpg",
    icon: Plane,
    detail: {
      tagline: "From terminal to destination, without friction.",
      overview:
        "Flight-tracked pickups across King Khalid (RUH), King Abdulaziz (JED), Prince Mohammad Bin Abdulaziz (MED), and King Fahd (DMM). Our chauffeurs monitor your flight in real time, adjust for delays at no extra charge, and meet you with a personalized name sign at the terminal exit.",
      inclusions: [
        "Live flight tracking with auto-adjusted pickup time",
        "Meet & greet at terminal with name signage",
        "60 minutes of complimentary wait time",
        "Luggage assistance from terminal to vehicle",
        "Fixed transparent pricing — no surge",
        "24/7 booking and dispatch",
      ],
      idealFor: [
        "International and domestic arrivals",
        "Group travel coordination",
        "Late-night and early-morning flights",
        "Frequent business travelers",
      ],
      fleetHint: "Sedan · SUV · Van — sized to your party",
      note: "All major Saudi airports covered. Cross-city airport transfers available.",
    },
  },
  {
    id: "staff",
    title: "Staff Transportation",
    description: "Luxury buses/coasters for employee mobility",
    image: "/images/services/staff-transport.jpg",
    icon: Bus,
    detail: {
      tagline: "Move your workforce in the comfort they deserve.",
      overview:
        "Daily, weekly, or monthly contracted transport for corporate staff, hospitality teams, and event personnel. Modern coaster-class vehicles with professional drivers, air-conditioned interiors, and fixed pickup/dropoff schedules tailored to your shift patterns.",
      inclusions: [
        "Air-conditioned buses and coaster vans",
        "Professional, uniformed drivers",
        "Customizable pickup routes and timings",
        "Monthly invoicing for corporate accounts",
        "Backup vehicles for zero-downtime SLA",
        "Driver vetting and ongoing performance monitoring",
      ],
      idealFor: [
        "Corporate staff commute programs",
        "Hospitality and hotel personnel transport",
        "Event and conference staff mobility",
        "Factory and industrial shift transport",
      ],
      fleetHint: "Toyota Coaster · Mercedes Sprinter · Hyundai HD",
      note: "Long-term contracts unlock preferential rates. Custom routing available.",
    },
  },
  {
    id: "intercity",
    title: "City-to-City Travel",
    description: "Comfortable intercity transfers across the Kingdom",
    image: "/images/services/city-to-city.jpg",
    icon: MapPin,
    detail: {
      tagline: "The Kingdom, traversed in quiet comfort.",
      overview:
        "Long-distance chauffeur transfers between Riyadh, Jeddah, Dammam, Makkah, Madinah, and beyond. Premium vehicles with seasoned drivers familiar with every route — built for the journey, not just the destination.",
      inclusions: [
        "Premium sedan, SUV, or luxury van",
        "Experienced long-distance chauffeur",
        "Onboard Wi-Fi (where available)",
        "Scheduled comfort stops and refreshments",
        "Real-time progress sharing with your office",
        "Optional second driver for overnight routes",
      ],
      idealFor: [
        "Executive intercity meetings",
        "Family and group travel",
        "Religious pilgrimage transfers (Umrah)",
        "Multi-city business itineraries",
      ],
      fleetHint: "Mercedes V-Class · GMC Yukon · BMW 7 Series",
      note: "One-way and round-trip pricing available. Custom itinerary planning included.",
    },
  },
  {
    id: "tours",
    title: "Private & Group Tours",
    description: "Custom-curated tours of Saudi landmarks",
    image: "/images/services/private-tours.jpg",
    icon: Users,
    detail: {
      tagline: "Saudi Arabia, curated for those who notice the details.",
      overview:
        "Bespoke private and small-group tours of the Kingdom's most extraordinary destinations — Diriyah, AlUla, the Edge of the World, Hegra, and the historic quarters of Jeddah. Chauffeur-led, English-speaking guides available, fully customized to your interests and pace.",
      inclusions: [
        "Bespoke itinerary design with our concierge team",
        "Licensed English-speaking guides (on request)",
        "Premium SUV or luxury van for group comfort",
        "Entrance arrangements at landmark sites",
        "Curated refreshment and dining stops",
        "Photography assistance at signature locations",
      ],
      idealFor: [
        "Visiting executives and their families",
        "Diplomatic and trade delegations",
        "Special-occasion celebrations",
        "Private heritage and cultural immersion",
      ],
      fleetHint: "Cadillac Escalade · Mercedes V-Class · GMC Yukon",
      note: "Half-day, full-day, and multi-day packages. Custom routes a specialty.",
    },
  },
];

type Service = (typeof services)[number];

// ============== DETAIL PANEL ==============
//
// Slide-in drawer that surfaces the rich detail content for a service.
// Behavior:
//   - Mobile: slides up from the bottom (sheet-style), takes 90vh
//   - Desktop: slides in from the right (drawer-style), 540px wide
//   - Closes on Escape, backdrop click, or close button
//   - Locks body scroll while open
//   - Auto-scrolls itself to top each time a new service opens
//
// The content is wrapped in a single scrollable container so long
// content (longer overviews, more inclusions) doesn't push the close
// button off-screen.

function ServiceDetailPanel({
  service,
  onClose,
}: {
  service: Service | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape to close, plus body scroll lock while open. We reset
  // overflow on unmount AND on every service change so the parent
  // page never gets stuck with overflow:hidden.
  useEffect(() => {
    if (!service) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    // Reset scroll inside the panel when a new service is chosen —
    // otherwise scroll position bleeds across services.
    if (panelRef.current) panelRef.current.scrollTop = 0;

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [service, onClose]);

  if (!service) return null;

  const IconComponent = service.icon;
  const { detail } = service;

  return (
    <>
      {/* Backdrop — dimming + blur so the panel feels foregrounded.
          Click anywhere on it to close. */}
      <div
        className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          service ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel container —
          Mobile: bottom sheet (bottom-0, rounded-t-2xl, max-h-[90vh])
          Desktop: right drawer (right-0, h-screen, w-[540px])
          Animations: translate-y on mobile, translate-x on desktop. */}
      <div
        ref={panelRef}
        className={`fixed z-50 overflow-y-auto bg-gradient-to-b from-[#0a0a0a] to-[#111] border-[#C9A961]/20 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] md:shadow-[-20px_0_60px_rgba(0,0,0,0.7)]
          bottom-0 left-0 right-0 rounded-t-2xl border-t max-h-[90vh]
          md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-screen md:rounded-none md:rounded-l-2xl md:border-t-0 md:border-l md:w-[540px] md:max-h-none
          transition-transform duration-500 ease-out
          ${service ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-full"}
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-detail-title"
      >
        {/* Mobile pull-tab — subtle visual cue that this is a sheet
            you can dismiss by swiping (we don't implement swipe, but
            the affordance helps users intuit dismissability). */}
        <div className="md:hidden flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-700 rounded-full" />
        </div>

        {/* Hero image — same image used on the card, intentional to
            create visual continuity across the click transition. */}
        <div className="relative h-56 md:h-64 overflow-hidden">
          <Image
            src={service.image}
            alt={service.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 540px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-black/40 to-transparent" />

          {/* Close button — positioned over hero for visual breathing
              room from the title and easy thumb reach on mobile. */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-[#C9A961] hover:text-black transition-all duration-300"
            aria-label="Close service details"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Icon badge */}
          <div className="absolute bottom-4 left-6 w-14 h-14 rounded-full bg-[#1a1a1a]/90 backdrop-blur-md flex items-center justify-center border border-[#C9A961]/40">
            <IconComponent className="w-6 h-6 text-[#C9A961]" />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 md:px-8 pt-6 pb-10">
          {/* Title + tagline */}
          <div className="mb-6">
            <p className="text-[#C9A961] text-xs tracking-[0.25em] uppercase mb-2">
              LuxDrive Service
            </p>
            <h3
              id="service-detail-title"
              className="text-3xl md:text-4xl font-serif text-white mb-3 leading-tight"
            >
              {service.title}
            </h3>
            <p className="text-[#C9A961]/90 italic font-serif text-lg">
              {detail.tagline}
            </p>
          </div>

          {/* Decorative divider — small gold dot flanked by hairlines.
              A subtle nod to the dark-editorial luxury aesthetic
              already used in the OG image and hero animations. */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#C9A961]/30" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#C9A961]" />
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#C9A961]/30" />
          </div>

          {/* Overview */}
          <p className="text-gray-300 leading-relaxed mb-8 text-[15px]">
            {detail.overview}
          </p>

          {/* Inclusions — visually weighted block with gold checkmarks.
              Two-column grid on desktop for density, single column on
              mobile for legibility. */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#C9A961]" />
              <h4 className="text-white font-semibold text-sm tracking-wider uppercase">
                What&apos;s Included
              </h4>
            </div>
            <ul className="space-y-2.5">
              {detail.inclusions.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-gray-300 text-[14px]"
                >
                  <Check className="w-4 h-4 text-[#C9A961] flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Ideal for */}
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-[#C9A961]" />
              <h4 className="text-white font-semibold text-sm tracking-wider uppercase">
                Ideal For
              </h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.idealFor.map((item) => (
                <span
                  key={item}
                  className="px-3 py-1.5 bg-[#C9A961]/10 border border-[#C9A961]/20 rounded-full text-gray-300 text-xs"
                >
                  {item}
                </span>
              ))}
            </div>
          </section>

          {/* Fleet hint — compact tile with luxury car wordmarks. */}
          <section className="mb-8 p-4 bg-[#1a1a1a] border border-gray-800 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-[#C9A961]" />
              <h4 className="text-white font-semibold text-sm tracking-wider uppercase">
                Typical Fleet
              </h4>
            </div>
            <p className="text-gray-400 text-sm">{detail.fleetHint}</p>
          </section>

          {/* Service note — small italicized line for rate / availability
              callouts. Visually lighter than the body text so it reads
              as supplementary, not primary. */}
          <p className="text-gray-500 text-xs italic mb-8 flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 text-[#C9A961]/60 flex-shrink-0 mt-0.5" />
            <span>{detail.note}</span>
          </p>

          {/* CTAs — primary "Book" + secondary "Contact". Stacked on
              mobile, side-by-side on tablet+. */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* <Link
              href={`/booking?service=${service.id}`}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-[#C9A961] text-black font-semibold rounded-lg hover:bg-[#b8994d] transition-colors"
            >
              Book This Service
              <ArrowRight className="w-4 h-4" />
            </Link> */}
            <Link
              href="tel:+966545559510"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-transparent border border-[#C9A961]/40 text-[#C9A961] font-semibold rounded-lg hover:bg-[#C9A961]/10 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Talk to Concierge
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

// ============== MAIN COMPONENT ==============

export default function ServicesShowcase() {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Intersection observer for the entrance animations
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

  // Renders one card. Extracted because the grid splits into a "top
  // row of 3" and "bottom row of 2 centered" — DRY without losing
  // the visual structure of the existing design.
  const renderCard = (service: Service, index: number, baseDelay: number) => {
    const IconComponent = service.icon;
    return (
      <div
        key={service.id}
        className={`group relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-gray-800 hover:border-[#C9A961]/50 transition-all duration-500 h-[340px] flex flex-col ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        }`}
        style={{ transitionDelay: `${baseDelay + index * 100}ms` }}
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
          <button
            onClick={() => setSelectedService(service)}
            className="flex items-center gap-2 text-[#C9A961] text-sm font-medium group/btn cursor-pointer hover:gap-3 transition-all"
            aria-label={`Learn more about ${service.title}`}
          >
            Learn More
            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
          </button>
        </div>

        {/* Hover border effect */}
        <div className="absolute inset-0 rounded-xl border-2 border-[#C9A961] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      </div>
    );
  };

  return (
    <>
      <section
        id="services"
        ref={sectionRef}
        className="relative bg-[#0a0a0a] py-20 overflow-hidden"
      >
        {/* Hero Banner */}
        <div className="relative h-[400px] md:h-[500px] mb-16">
          <div className="absolute inset-0">
            <Image
              src="/images/hero-desert.jpg"
              alt="Luxury car in Saudi desert"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-[#0a0a0a]" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#C9A961]/50 to-transparent" />
          </div>

          <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
            <h2
              className={`text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-4 transition-all duration-1000 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
            >
              Premium Ground Transportation,{" "}
              <span className="text-[#C9A961]">Unmatched Excellence</span>
            </h2>
            <p
              className={`text-lg md:text-xl text-gray-300 max-w-2xl transition-all duration-1000 delay-200 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
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
            {services
              .slice(0, 3)
              .map((service, index) => renderCard(service, index, 300))}
          </div>

          {/* Bottom row - 2 cards centered */}
          <div className="flex flex-col md:flex-row justify-center gap-6">
            {services.slice(3, 5).map((service, index) => {
              const IconComponent = service.icon;
              return (
                <div
                  key={service.id}
                  className={`group relative rounded-xl overflow-hidden bg-[#1a1a1a] border border-gray-800 hover:border-[#C9A961]/50 transition-all duration-500 h-[340px] flex flex-col w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] ${
                    isVisible
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-12"
                  }`}
                  style={{ transitionDelay: `${600 + index * 100}ms` }}
                >
                  <div className="relative h-44 flex-shrink-0 overflow-hidden">
                    <Image
                      src={service.image}
                      alt={service.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-black/30 to-transparent" />
                    <div className="absolute top-4 left-4 w-12 h-12 rounded-full bg-[#1a1a1a]/80 backdrop-blur-sm flex items-center justify-center border border-[#C9A961]/30">
                      <IconComponent className="w-5 h-5 text-[#C9A961]" />
                    </div>
                  </div>

                  <div className="p-6 flex flex-col flex-grow">
                    <h3 className="text-xl font-serif text-white mb-2 group-hover:text-[#C9A961] transition-colors">
                      {service.title}
                    </h3>
                    <p className="text-gray-400 text-sm mb-4 leading-relaxed flex-grow">
                      {service.description}
                    </p>
                    <button
                      onClick={() => setSelectedService(service)}
                      className="flex items-center gap-2 text-[#C9A961] text-sm font-medium group/btn cursor-pointer hover:gap-3 transition-all"
                      aria-label={`Learn more about ${service.title}`}
                    >
                      Learn More
                      <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                    </button>
                  </div>

                  <div className="absolute inset-0 rounded-xl border-2 border-[#C9A961] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-1/2 left-0 w-32 h-32 bg-[#C9A961]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-48 h-48 bg-[#C9A961]/5 rounded-full blur-3xl" />
      </section>

      {/* Service detail panel — rendered at root level (outside the
          section) so it doesn't inherit any transform/overflow context
          that would interfere with its fixed positioning. */}
      <ServiceDetailPanel
        service={selectedService}
        onClose={() => setSelectedService(null)}
      />
    </>
  );
}
