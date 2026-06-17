"use client";

import Link from "next/link";
import {
  Instagram,
  Twitter,
  Linkedin,
  Phone,
  Mail,
  MapPin,
  Clock,
} from "lucide-react";
import Logo from "@/components/shared/logo";

export default function Footer() {
  const quickLinks = [
    { label: "Home", href: "/" },
    { label: "Services", href: "/#services" },
    { label: "Fleet", href: "/#fleet" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Book Now", href: "/#hero" },
    { label: "Track Ride", href: "/contact" },
  ];

  const services = [
    { label: "Airport Transfers", href: "/#services" },
    { label: "Hourly Rentals", href: "/#services" },
    { label: "Umrah & Hajj", href: "/#services" },
    { label: "Corporate Travel", href: "/#services" },
    { label: "Intercity Routes", href: "/#services" },
    { label: "Events", href: "/#services" },
  ];

  return (
    <footer className="bg-[#0a0a0a] border-t border-[#C9A961]/20">
      {/* Gold gradient top border */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#C9A961] to-transparent" />

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Column 1 - Brand */}
          <div className="text-center md:text-left">
            <div className="mb-4">
              <Logo size="lg" showTagline={true} className="inline-flex" />
            </div>
            <p className="text-gray-400 text-sm mb-6 italic">
              &quot;Your Journey, Our Honor&quot;
            </p>

            {/* Social Icons */}
            <div className="flex items-center justify-center md:justify-start gap-4">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-[#C9A961] hover:border-[#C9A961] transition-all duration-300"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-[#C9A961] hover:border-[#C9A961] transition-all duration-300"
                aria-label="Twitter"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-[#C9A961] hover:border-[#C9A961] transition-all duration-300"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="https://wa.me/966500000000"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-[#C9A961] hover:border-[#C9A961] transition-all duration-300"
                aria-label="WhatsApp"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Column 2 - Quick Links */}
          <div className="text-center md:text-left">
            <h3 className="text-white font-semibold mb-6 text-sm uppercase tracking-wider">
              Quick Links
            </h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-gray-400 hover:text-[#C9A961] transition-colors duration-300 text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 - Services */}
          <div className="text-center md:text-left">
            <h3 className="text-white font-semibold mb-6 text-sm uppercase tracking-wider">
              Services
            </h3>
            <ul className="space-y-3">
              {services.map((service) => (
                <li key={service.label}>
                  <Link
                    href={service.href}
                    className="text-gray-400 hover:text-[#C9A961] transition-colors duration-300 text-sm"
                  >
                    {service.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 - Contact */}
          <div className="text-center md:text-left">
            <h3 className="text-white font-semibold mb-6 text-sm uppercase tracking-wider">
              Contact Us
            </h3>
            <ul className="space-y-4">
              <li className="flex items-center justify-center md:justify-start gap-3 text-gray-400">
                <Phone className="w-4 h-4 text-[#C9A961]" />
                <a
                  href="tel:+966545559510"
                  className="text-sm hover:text-[#C9A961] transition-colors"
                >
                  +966545559510
                </a>
              </li>
              <li className="flex items-center justify-center md:justify-start gap-3 text-gray-400">
                <Mail className="w-4 h-4 text-[#C9A961]" />
                <a
                  href="mailto:info@luxdriveksa.com"
                  className="text-sm hover:text-[#C9A961] transition-colors"
                >
                  info@luxdriveksa.com
                </a>
              </li>
              <li className="flex items-start justify-center md:justify-start gap-3 text-gray-400">
                <MapPin className="w-4 h-4 text-[#C9A961] mt-0.5" />
                <span className="text-sm">Riyadh, Saudi Arabia</span>
              </li>
              <li className="flex items-center justify-center md:justify-start gap-3 text-gray-400">
                <Clock className="w-4 h-4 text-[#C9A961]" />
                <span className="text-sm">24/7 Service</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Trust Strip */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Payment Icons */}
            <div className="flex items-center gap-4">
              <span className="text-gray-500 text-xs mr-2">We Accept:</span>
              {/* Visa */}
              <div className="w-12 h-8 bg-white rounded flex items-center justify-center">
                <svg viewBox="0 0 48 48" className="w-10 h-6">
                  <path
                    fill="#1565C0"
                    d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"
                  />
                  <path
                    fill="#FFF"
                    d="M15.186 19l-2.626 7.832c0 0-.667-3.313-.733-3.729-1.495-3.411-3.701-3.221-3.701-3.221L10.726 30v-.002h3.161L18.258 19H15.186zM17.689 30L20.56 30 22.296 19 19.389 19zM38.008 19h-3.021l-4.71 11h2.852l.588-1.571h3.596L37.619 30h2.613L38.008 19zM34.513 26.328l1.563-4.157.818 4.157H34.513zM26.369 22.206c0-.606.498-1.057 1.926-1.057.928 0 1.991.674 1.991.674l.466-2.309c0 0-1.358-.515-2.691-.515-3.019 0-4.576 1.444-4.576 3.272 0 3.306 3.979 2.853 3.979 4.551 0 .291-.231.964-1.888.964-1.662 0-2.759-.609-2.759-.609l-.495 2.216c0 0 1.063.606 3.117.606 2.059 0 4.915-1.54 4.915-3.752C30.354 23.586 26.369 23.394 26.369 22.206z"
                  />
                  <path
                    fill="#FFC107"
                    d="M12.212,24.945l-0.966-4.748c0,0-0.437-1.029-1.573-1.029c-1.136,0-4.44,0-4.44,0S10.894,20.84,12.212,24.945z"
                  />
                </svg>
              </div>
              {/* Mastercard */}
              <div className="w-12 h-8 bg-white rounded flex items-center justify-center">
                <svg viewBox="0 0 48 48" className="w-10 h-6">
                  <path
                    fill="#3F51B5"
                    d="M45,35c0,2.209-1.791,4-4,4H7c-2.209,0-4-1.791-4-4V13c0-2.209,1.791-4,4-4h34c2.209,0,4,1.791,4,4V35z"
                  />
                  <path
                    fill="#FFC107"
                    d="M30 14A10 10 0 1 0 30 34A10 10 0 1 0 30 14Z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M22.014,30c-0.464-0.617-0.863-1.284-1.176-2h6.325c0.278-0.636,0.496-1.304,0.637-2h-7.598c-0.131-0.648-0.209-1.315-0.209-2c0-0.686,0.078-1.353,0.209-2h7.598c-0.14-0.696-0.359-1.364-0.637-2h-6.325c0.313-0.716,0.711-1.383,1.176-2h3.972c-0.534-0.758-1.173-1.434-1.897-2h-0.178c-0.724,0.566-1.362,1.242-1.897,2c-0.464,0.617-0.862,1.284-1.176,2c-0.313,0.716-0.562,1.465-0.71,2.253C17.559,22.211,17.5,23.101,17.5,24c0,0.899,0.059,1.789,0.212,2.753c0.149,0.788,0.397,1.537,0.71,2.253c0.313,0.716,0.711,1.383,1.176,2c0.534,0.758,1.173,1.434,1.897,2h0.178c0.724-0.566,1.362-1.242,1.897-2H22.014z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M18 14A10 10 0 1 0 18 34A10 10 0 1 0 18 14Z"
                  />
                </svg>
              </div>
              {/* Apple Pay */}
              <div className="w-12 h-8 bg-white rounded flex items-center justify-center">
                <svg viewBox="0 0 48 48" className="w-10 h-6">
                  <path d="M24.5,8c1.8,0,3.4-1.2,4-3c-1.7,0.1-3.8,1.2-5,3C23.5,8,24,8,24.5,8z" />
                  <path d="M35.3,25.2c0.1,5.4,4.7,7.2,4.8,7.3c0,0.1-0.8,2.6-2.5,5.1c-1.5,2.2-3,4.4-5.5,4.4c-2.4,0-3.2-1.4-5.9-1.4 c-2.7,0-3.6,1.4-5.9,1.4c-2.4,0.1-4.2-2.4-5.8-4.6c-3.2-4.4-5.6-12.5-2.3-18c1.6-2.7,4.5-4.4,7.7-4.5c2.3,0,4.5,1.6,5.9,1.6 c1.4,0,4.1-1.9,6.9-1.6C33.5,15,35.5,16.1,36.8,18C33.4,20,32.3,22.3,35.3,25.2z" />
                </svg>
              </div>
              {/* STC Pay */}
              <div className="w-12 h-8 bg-[#4B2A84] rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">STC</span>
              </div>
            </div>

            {/* Licensed Badge */}
            <div className="flex items-center gap-2 text-gray-400">
              <svg
                className="w-5 h-5 text-[#C9A961]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-xs">
                Licensed by Saudi Tourism Authority
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-xs">
              &copy; 2025 LuxDrive by Luxakari Hospitality Group. All rights
              reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="#"
                className="text-gray-500 hover:text-[#C9A961] text-xs transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="#"
                className="text-gray-500 hover:text-[#C9A961] text-xs transition-colors"
              >
                Terms of Service
              </Link>
              <Link
                href="#"
                className="text-gray-500 hover:text-[#C9A961] text-xs transition-colors"
              >
                Refund Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
