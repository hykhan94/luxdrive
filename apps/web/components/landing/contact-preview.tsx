"use client";

import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

export default function ContactPreview() {
  return (
    <section id="contact" className="py-20 px-4 bg-[#0d0d0d]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-[#C9A961] text-sm tracking-[0.3em] uppercase mb-3">
            Get in Touch
          </p>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-white mb-4">
            Contact Us
          </h2>
          <div className="w-16 h-0.5 bg-[#C9A961] mx-auto mb-6" />
          <p className="text-gray-400 max-w-2xl mx-auto">
            Available 24/7 for your luxury transportation needs. Reach out to us
            anytime.
          </p>
        </div>

        {/* Contact Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="p-6 rounded-xl bg-[#141414] border border-neutral-800 hover:border-[#C9A961]/50 transition-all duration-300 text-center group">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-[#C9A961]/10 flex items-center justify-center group-hover:bg-[#C9A961]/20 transition-colors">
              <Phone className="w-6 h-6 text-[#C9A961]" />
            </div>
            <h3 className="text-white font-semibold mb-2">Call Us</h3>
            <a
              href="tel:+966545559510"
              className="text-gray-400 text-sm hover:text-[#C9A961] transition-colors"
            >
              +966545559510
            </a>
          </div>

          <div className="p-6 rounded-xl bg-[#141414] border border-neutral-800 hover:border-[#C9A961]/50 transition-all duration-300 text-center group">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-[#C9A961]/10 flex items-center justify-center group-hover:bg-[#C9A961]/20 transition-colors">
              <Mail className="w-6 h-6 text-[#C9A961]" />
            </div>
            <h3 className="text-white font-semibold mb-2">Email Us</h3>
            <a
              href="mailto:info@luxdriveksa.com"
              className="text-gray-400 text-sm hover:text-[#C9A961] transition-colors"
            >
              info@luxdriveksa.com
            </a>
          </div>

          <div className="p-6 rounded-xl bg-[#141414] border border-neutral-800 hover:border-[#C9A961]/50 transition-all duration-300 text-center group">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-[#C9A961]/10 flex items-center justify-center group-hover:bg-[#C9A961]/20 transition-colors">
              <MapPin className="w-6 h-6 text-[#C9A961]" />
            </div>
            <h3 className="text-white font-semibold mb-2">Location</h3>
            <p className="text-gray-400 text-sm">
              Level 7, Building 4.07, King Abdullah Financial District, Riyadh,
              Saudi Arabia
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[#141414] border border-neutral-800 hover:border-[#C9A961]/50 transition-all duration-300 text-center group">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-[#C9A961]/10 flex items-center justify-center group-hover:bg-[#C9A961]/20 transition-colors">
              <Clock className="w-6 h-6 text-[#C9A961]" />
            </div>
            <h3 className="text-white font-semibold mb-2">Availability</h3>
            <p className="text-gray-400 text-sm">24/7 Service</p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-[#141414] to-[#1a1a1a] rounded-2xl p-8 border border-neutral-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#C9A961]/10 flex items-center justify-center">
                <MessageSquare className="w-7 h-7 text-[#C9A961]" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-1">
                  Need assistance?
                </h3>
                <p className="text-gray-400 text-sm">
                  Our team is ready to help with any inquiries
                </p>
              </div>
            </div>
            <Link
              href="/contact"
              className="flex items-center gap-2 px-8 py-3 bg-[#C9A961] text-black font-semibold rounded-lg hover:bg-[#d4b872] transition-all duration-300 shadow-lg shadow-[#C9A961]/20"
            >
              Send a Message
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
