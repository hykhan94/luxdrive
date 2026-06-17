"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Clock,
  Instagram,
  Twitter,
  Linkedin,
  Send,
  CheckCircle,
} from "lucide-react";
import { PhoneInput, EmailInput } from "@/components/ui/form-fields";

const subjects = [
  { value: "general", label: "General Inquiry" },
  { value: "booking", label: "Booking Assistance" },
  { value: "corporate", label: "Corporate Services" },
  { value: "feedback", label: "Feedback" },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "general",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Back Navigation */}
      <div className="fixed top-6 left-6 z-50">
        <Link
          href="/"
          className="flex items-center gap-2 text-white/70 hover:text-[#C9A961] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to Home</span>
        </Link>
      </div>

      {/* Hero Section */}
      <section className="pt-24 pb-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[#C9A961] text-sm tracking-[0.3em] uppercase mb-4">
            Get in Touch
          </p>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            Contact Us
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            Have questions or need assistance? We&apos;re here to help 24/7.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div className="bg-[#1a1a1a] rounded-2xl p-8 border border-gray-800">
              {isSubmitted ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-[#C9A961]/20 flex items-center justify-center mb-6">
                    <CheckCircle className="w-8 h-8 text-[#C9A961]" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Message Sent!</h3>
                  <p className="text-gray-400 mb-6">
                    We&apos;ll get back to you within 24 hours.
                  </p>
                  <button
                    onClick={() => {
                      setIsSubmitted(false);
                      setFormData({
                        name: "",
                        email: "",
                        phone: "",
                        subject: "general",
                        message: "",
                      });
                    }}
                    className="text-[#C9A961] hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold mb-6">Send us a Message</h2>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 bg-[#111] border border-gray-700 rounded-lg focus:outline-none focus:border-[#C9A961] transition-colors text-white"
                        placeholder="Your name"
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Email
                        </label>
                        <EmailInput
                          value={formData.email}
                          onChange={(email) =>
                            setFormData((p) => ({ ...p, email }))
                          }
                          label=""
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Phone
                        </label>
                        <PhoneInput
                          value={formData.phone}
                          onChange={(phone) =>
                            setFormData((p) => ({ ...p, phone }))
                          }
                          label=""
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Subject
                      </label>
                      <select
                        name="subject"
                        value={formData.subject}
                        onChange={handleChange}
                        className="w-full px-4 py-3 bg-[#111] border border-gray-700 rounded-lg focus:outline-none focus:border-[#C9A961] transition-colors text-white"
                      >
                        {subjects.map((subject) => (
                          <option key={subject.value} value={subject.value}>
                            {subject.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Message
                      </label>
                      <textarea
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        required
                        rows={5}
                        className="w-full px-4 py-3 bg-[#111] border border-gray-700 rounded-lg focus:outline-none focus:border-[#C9A961] transition-colors text-white resize-none"
                        placeholder="How can we help you?"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-4 bg-[#C9A961] text-black font-semibold rounded-lg hover:bg-[#b8994d] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Send Message
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Contact Info */}
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold mb-6">Contact Information</h2>
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#C9A961]/10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-6 h-6 text-[#C9A961]" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Address</h3>
                      <p className="text-gray-400">
                        King Fahd Road, Al Olaya District
                        <br />
                        Riyadh, Saudi Arabia
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#C9A961]/10 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-6 h-6 text-[#C9A961]" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Phone</h3>
                      <p className="text-gray-400">+966 11 XXX XXXX</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#C9A961]/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 text-[#C9A961]" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Email</h3>
                      <p className="text-gray-400">info@luxdriveksa.com</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#C9A961]/10 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-6 h-6 text-[#C9A961]" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Hours</h3>
                      <p className="text-gray-400">24/7 - Always Available</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Links */}
              <div>
                <h3 className="font-semibold mb-4">Follow Us</h3>
                <div className="flex gap-4">
                  <a
                    href="#"
                    className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-gray-800 flex items-center justify-center hover:border-[#C9A961] hover:text-[#C9A961] transition-colors"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                  <a
                    href="#"
                    className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-gray-800 flex items-center justify-center hover:border-[#C9A961] hover:text-[#C9A961] transition-colors"
                  >
                    <Twitter className="w-5 h-5" />
                  </a>
                  <a
                    href="#"
                    className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-gray-800 flex items-center justify-center hover:border-[#C9A961] hover:text-[#C9A961] transition-colors"
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                </div>
              </div>

              {/* Map Placeholder */}
              <div className="rounded-xl overflow-hidden border border-gray-800">
                <div className="aspect-video bg-[#1a1a1a] flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-12 h-12 text-[#C9A961]/30 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">
                      Google Maps Integration
                    </p>
                    <p className="text-gray-600 text-xs">
                      Riyadh, Saudi Arabia
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
