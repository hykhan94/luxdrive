// ============================================
// !!! DESTINATION PATH: apps/web/components/landing/industry-partner-cta.tsx
// ============================================
"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Building2, Car, Sparkles } from "lucide-react";
import { WhatsappIcon } from "@/lib/social-icons";

// ============================================
// Industry Partner CTA — the hero's right-hand panel.
//
// Replaces the customer-facing BookingForm while the customer
// booking pipeline isn't live for public traffic. The goal is to
// funnel B2B inquiries (vendors with fleets, hotels/concierges
// with guests) into a WhatsApp conversation with the onboarding
// desk — WhatsApp is the dominant business-comms channel in KSA,
// so it lands more reliably than a contact form.
//
// Each role card opens WhatsApp with a pre-filled intro so the
// onboarding side instantly knows which lane the conversation
// belongs in. No customer data, no auth, no backend needed.
// ============================================

const WHATSAPP_NUMBER = "966545559510";

const WHATSAPP_VENDOR_INTRO =
  "Hello LuxDrive — I'd like to onboard my fleet as a vendor on the platform. Please share the next steps.";

const WHATSAPP_PARTNER_INTRO =
  "Hello LuxDrive — I represent a hotel / concierge team and we'd like to partner with you to offer chauffeur services to our guests.";

// The general / "Onboarding Desk" intro is intentionally short and
// open-ended. The two role cards above carry the structured
// messages; this one is the fallback for people who don't yet
// know which lane they belong in, or who want to ask something
// outside the two paths. Ending with a colon-prompt invites the
// user to add their own context before hitting send.
const WHATSAPP_GENERAL_INTRO =
  "Hello LuxDrive — I'd like to learn more about the platform. A bit about me:";

function waLink(intro: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(intro)}`;
}

type Role = {
  key: string;
  icon: typeof Car;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  href: string;
};

const ROLES: Role[] = [
  {
    key: "vendor",
    icon: Car,
    eyebrow: "You have the vehicles",
    title: "Join as Vendor",
    description: "Plug your fleet into a premium booking stream.",
    bullets: [
      "Weekly payouts, full invoicing handled",
      "Premium client base — hotels & corporate",
      "Dispatch tools, no marketing spend",
    ],
    cta: "Start vendor conversation",
    href: waLink(WHATSAPP_VENDOR_INTRO),
  },
  {
    key: "partner",
    icon: Building2,
    eyebrow: "You have the guests",
    title: "Join as Partner",
    description: "White-glove chauffeur service, branded as yours.",
    bullets: [
      "No fleet, no drivers, no overhead",
      "Direct booking interface for concierge",
      "Trusted by Luxakari Hospitality Group",
    ],
    cta: "Start partner conversation",
    href: waLink(WHATSAPP_PARTNER_INTRO),
  },
];

// Operating cities — pulled inline rather than from config since
// the public landing should reflect the *advertised* footprint, not
// a runtime read of where bookings happen to be active. Update here
// when expanding into new regions. Conventional KSA ordering: holy
// cities first (Makkah, Madinah), then commercial centres.
const OPERATING_CITIES = ["Makkah", "Madinah", "Jeddah", "Riyadh"];

export default function IndustryPartnerCTA() {
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => setIsLoaded(true), []);

  return (
    <div
      className={`relative w-full max-w-xl mx-auto transition-all duration-1000 ${
        isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      {/* Outer card — dark glass with gold gradient frame.
          The double-layer construction (gradient border behind solid
          inner) gives the gold-rim effect without rendering as a
          flat box border. */}
      <div className="relative">
        {/* Gold gradient frame */}
        <div
          className="absolute -inset-px rounded-2xl bg-gradient-to-br from-luxury-gold/40 via-luxury-gold/10 to-transparent"
          aria-hidden
        />
        {/* Soft gold glow */}
        <div
          className="absolute -inset-4 rounded-3xl bg-luxury-gold/5 blur-2xl"
          aria-hidden
        />

        {/* Solid inner panel */}
        <div className="relative rounded-2xl bg-[#0a0a0a]/95 backdrop-blur-sm p-5 sm:p-7 lg:p-8">
          {/* ===== TOP — live indicator + headline ===== */}
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[10px] tracking-[0.2em] uppercase text-emerald-400 font-semibold">
              Now Onboarding
            </span>
            <span className="text-[10px] text-gray-500">·</span>
            <span className="text-[10px] tracking-wider text-gray-400 uppercase">
              Saudi Arabia
            </span>
          </div>

          <div className="flex items-start gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-luxury-gold mt-1 flex-shrink-0" />
            <p className="text-[10px] sm:text-xs tracking-[0.25em] uppercase text-luxury-gold font-medium">
              Partner with LuxDrive
            </p>
          </div>

          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white leading-tight mb-1">
            Build the journey
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-luxury-gold to-luxury-gold/60">
              with us.
            </span>
          </h2>

          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-6">
            We connect premium vehicles with premium guests. Pick the side
            you&apos;re on — we&apos;ll take it from there.
          </p>

          {/* ===== TWO ROLE CARDS — stack on mobile, side-by-side from sm ===== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <a
                  key={role.key}
                  href={role.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative rounded-xl border border-gray-800 hover:border-luxury-gold/60 bg-gradient-to-b from-[#141414] to-[#0d0d0d] hover:from-[#1a1a1a] hover:to-[#0f0f0f] p-4 sm:p-5 transition-all duration-300 hover:-translate-y-0.5"
                >
                  {/* Hover gold corner accent */}
                  <div
                    className="absolute top-0 right-0 w-12 h-12 rounded-tr-xl bg-gradient-to-bl from-luxury-gold/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-hidden
                  />

                  {/* Icon tile */}
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-luxury-gold/10 border border-luxury-gold/20 group-hover:bg-luxury-gold/20 group-hover:border-luxury-gold/40 flex items-center justify-center mb-3 transition-colors">
                    <Icon className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-luxury-gold" />
                  </div>

                  {/* Eyebrow + title */}
                  <p className="text-[10px] tracking-[0.15em] uppercase text-gray-500 mb-1">
                    {role.eyebrow}
                  </p>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-1.5 leading-tight">
                    {role.title}
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3">
                    {role.description}
                  </p>

                  {/* Bullets */}
                  <ul className="space-y-1.5 mb-4">
                    {role.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-[11px] text-gray-300 leading-snug"
                      >
                        <span
                          className="mt-1.5 inline-block w-1 h-1 rounded-full bg-luxury-gold/70 flex-shrink-0"
                          aria-hidden
                        />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div className="flex items-center gap-1.5 text-luxury-gold text-xs font-medium group-hover:gap-2.5 transition-all">
                    <span>{role.cta}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </a>
              );
            })}
          </div>

          {/* ===== OR DIVIDER ===== */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
              or speak with us
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
          </div>

          {/* ===== WHATSAPP CTA ===== */}
          <a
            href={waLink(WHATSAPP_GENERAL_INTRO)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-gradient-to-r from-[#25D366]/10 to-[#25D366]/5 border border-[#25D366]/30 hover:border-[#25D366]/60 hover:from-[#25D366]/15 hover:to-[#25D366]/10 transition-all"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#25D366]/15 border border-[#25D366]/30 flex items-center justify-center flex-shrink-0">
              <WhatsappIcon className="w-5 h-5 text-[#25D366]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] tracking-[0.15em] uppercase text-[#25D366]/80 font-medium">
                Onboarding Desk
              </p>
              <p className="text-sm sm:text-base font-semibold text-white tracking-wide">
                +966 54 555 9510
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#25D366] group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </a>

          {/* ===== OPERATING FOOTPRINT ===== */}
          <div className="mt-5 pt-4 border-t border-gray-800/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] tracking-[0.2em] uppercase text-gray-500 font-medium">
                Operating
              </span>
              {OPERATING_CITIES.map((city, i) => (
                <span key={city} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-300">{city}</span>
                  {i < OPERATING_CITIES.length - 1 && (
                    <span className="text-gray-700 text-[10px]">·</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
