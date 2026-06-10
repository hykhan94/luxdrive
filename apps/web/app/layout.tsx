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
};

export const metadata: Metadata = {
  title: "LuxDrive - Premium Chauffeur Services in Saudi Arabia",
  description:
    "Experience luxury travel with LuxDrive. Premium chauffeur services across Saudi Arabia with professional drivers and exclusive vehicles.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
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
        <NotificationProvider>
          <AuthProvider>{children}</AuthProvider>
        </NotificationProvider>
        <Analytics />
      </body>
    </html>
  );
}
