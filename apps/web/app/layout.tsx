import type { Metadata, Viewport } from "next";
import {
  Montserrat,
  Playfair_Display,
  Outfit,
  Cormorant_Garamond,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/lib/auth-context";
import { NotificationProvider } from "@/lib/notification-context";
import { TopLoader } from "@/components/shared/top-loader";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["400", "700", "800"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

// ============================================
// SEO metadata
// ============================================
// metadataBase is required for OG image URLs to be absolute (social
// platforms reject relative paths). Use production URL.
// ============================================
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://luxdriveksa.com";
const SITE_NAME = "LuxDrive";
const SITE_TAGLINE = "Premium Chauffeur Services in Saudi Arabia";
const SITE_DESCRIPTION =
  "Experience luxury travel across the Kingdom of Saudi Arabia with LuxDrive. Premium chauffeur services, executive transfers, and curated journeys with professional drivers and an elite fleet — from Makkah and Madinah to Jeddah and Riyadh.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Luxakari Hospitality Group" }],
  creator: "Luxakari Hospitality Group",
  publisher: "Luxakari Hospitality Group",
  keywords: [
    "luxury chauffeur Saudi Arabia",
    "premium transportation KSA",
    "executive car service Riyadh",
    "airport transfer Jeddah",
    "chauffeur service Makkah",
    "private driver Madinah",
    "luxury fleet Saudi Arabia",
    "Mercedes chauffeur KSA",
    "corporate transportation Saudi",
    "wedding car service Riyadh",
    "VIP transportation Kingdom",
    "LuxDrive",
    "Luxakari",
  ],
  category: "transportation",
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  alternates: {
    canonical: "/",
  },
  // Replace v0 default icons with the LuxDrive brand mark.
  // One unified icon — works in both light- and dark-theme browser chrome.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-icon.png",
  },
  // Open Graph — how the link previews on WhatsApp, Slack, Discord,
  // iMessage, Facebook, LinkedIn, etc.
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: ["ar_SA"],
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    // The image referenced here is auto-generated from app/opengraph-image.tsx
    // at build time. No manual upload needed.
  },
  // Twitter / X card — how the link previews on X (and Mastodon, Bluesky
  // honor twitter:* tags as fallback).
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    creator: "@luxdriveksa",
    // Image auto-pulled from openGraph.images
  },
  // Search-engine indexing rules. Keep open for crawling; restrict
  // certain user-only routes (dashboards, password resets) via individual
  // page-level metadata if needed later.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Verification placeholders — fill in once you set up Search Console
  // and Bing Webmaster Tools (totally optional, can skip for now).
  // verification: {
  //   google: 'your-google-search-console-verification-code',
  //   other: { 'msvalidate.01': 'your-bing-webmaster-tools-code' },
  // },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${playfair.variable} ${outfit.variable} ${cormorant.variable}`}
      // The inline <script> in <head> below mutates this element's
      // attributes (adds data-intro-seen) before React hydrates. That's
      // a deliberate, server-can't-know-about-it divergence, which is
      // exactly what suppressHydrationWarning is designed for. Same
      // pattern Next.js's theme-switcher docs recommend. The
      // suppression is scoped to attributes ON THIS ELEMENT — it does
      // NOT cascade to children, so any real hydration bugs deeper in
      // the tree will still surface.
      suppressHydrationWarning
    >
      <head>
        {/*
          Pre-hydration intro check.

          The landing-intro overlay is rendered server-side from frame
          one (phase initializes to "playing" so the SSR'd HTML
          contains it). This prevents the original FOUC where the main
          landing page was briefly visible before React hydrated and
          mounted the overlay.

          For returning visitors who've already seen the intro this
          session, we don't want the overlay to flash either. This
          inline script runs synchronously before <body> is painted,
          reads sessionStorage, and sets data-intro-seen on <html>.
          The CSS rule below uses that attribute to hide the overlay
          before the browser ever displays it. React hydration then
          dismounts the overlay normally via its own sessionStorage
          check, but by then the user has already been looking at the
          actual landing page — no flash either way.

          Key version (-v6) MUST match SEEN_KEY in landing-intro.tsx.
          If you bump it there, bump it here too.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(sessionStorage.getItem('luxdrive-intro-seen-v6')==='1'){document.documentElement.setAttribute('data-intro-seen','1')}}catch(e){}})();`,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `html[data-intro-seen="1"] #landing-intro-overlay{display:none!important}`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <TopLoader />
        <NotificationProvider>
          <AuthProvider>{children}</AuthProvider>
        </NotificationProvider>
        <Analytics />
      </body>
    </html>
  );
}
