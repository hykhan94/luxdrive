import { Suspense } from "react";
import HeroSection from "@/components/landing/hero-section";
import ServicesShowcase from "@/components/landing/services-showcase";
import FleetShowcase from "@/components/landing/fleet-showcase";
import PartnershipSection from "@/components/landing/partnership-section";
import EventsSection from "@/components/landing/events-section";
import AboutPreview from "@/components/landing/about-preview";
import ContactPreview from "@/components/landing/contact-preview";
import Footer from "@/components/landing/footer";
import LoginModal from "@/components/auth/login-modal";
import LoginRedirectHandler from "@/components/auth/login-redirect-handler";
// Cinematic brand-reveal overlay. Imported normally despite being a
// Client Component — Next.js automatically splits the bundle at the
// 'use client' boundary inside the file. We DON'T wrap it in
// dynamic(..., { ssr: false }) because that's disallowed inside
// Server Components in the App Router (would throw the
// "ssr: false is not allowed with next/dynamic in Server Components"
// build error). The component sidesteps the hydration-mismatch
// concern itself: its initial render returns null until a useEffect
// has had a chance to read sessionStorage, so SSR and the first
// client paint both produce null — they match. After hydration the
// effect runs and the overlay either mounts (first visit) or stays
// null (returning visit). Same end result, no SSR error.
import LandingIntro from "@/components/landing/landing-intro";

export default function Home() {
  return (
    <main className="bg-luxury-dark">
      <LandingIntro />
      <Suspense>
        <LoginRedirectHandler />
      </Suspense>
      <HeroSection />
      <ServicesShowcase />
      <FleetShowcase />
      <PartnershipSection />
      <EventsSection />
      <AboutPreview />
      <ContactPreview />
      <Footer />
      <LoginModal />
    </main>
  );
}
