// ============================================
// !!! DESTINATION PATH: apps/web/app/contact/page.tsx
// ============================================
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { PhoneInput, EmailInput } from "@/components/ui/form-fields";
import { contactApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import { luxdriveSocials } from "@/lib/social-icons";

const subjects = [
  { value: "general", label: "General Inquiry" },
  { value: "booking", label: "Booking Assistance" },
  { value: "corporate", label: "Corporate Services" },
  { value: "feedback", label: "Feedback" },
];

export default function ContactPage() {
  const { showNotification } = useNotification();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "general",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  // Inline error so the user sees what went wrong without losing the
  // form data they typed. Cleared on every fresh submit attempt.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await contactApi.submit({
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        subject: formData.subject,
        message: formData.message,
      });

      if (response.success) {
        setIsSubmitted(true);
        showNotification(
          "success",
          response.message || "Message sent successfully",
        );
      } else {
        // Backend returned success:false (e.g. email send fell over).
        // Surface the backend message so the user knows what to do.
        const msg = response.message || "Failed to send your message.";
        setErrorMessage(msg);
        showNotification("error", msg);
      }
    } catch (err: any) {
      // ApiError thrown by apiFetch for non-2xx responses (validation
      // failures, server errors, network down, etc). The .message
      // surface comes from the backend's BadRequestError where
      // possible — fall back to a generic line otherwise.
      const msg =
        err?.message ||
        "Couldn't reach the server. Please try again, or email info@luxdriveksa.com directly.";
      setErrorMessage(msg);
      showNotification("error", msg);
    } finally {
      setIsSubmitting(false);
    }
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
                      setErrorMessage(null);
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

                  {/* Inline error banner — shown above the form so it's
                       impossible to miss while keeping the typed data
                       intact. Clears when the user submits again. */}
                  {errorMessage && (
                    <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-300">{errorMessage}</p>
                    </div>
                  )}

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
                        maxLength={100}
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
                        maxLength={5000}
                        className="w-full px-4 py-3 bg-[#111] border border-gray-700 rounded-lg focus:outline-none focus:border-[#C9A961] transition-colors text-white resize-none"
                        placeholder="How can we help you?"
                      />
                      <p className="text-xs text-gray-500 mt-1 text-right">
                        {formData.message.length} / 5000
                      </p>
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
                        Level 7, Building 4.07, King Abdullah Financial
                        District,
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
                      <p className="text-gray-400">+966 54 555 9510</p>
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

              {/* Social Links — six tiles, sourced from the shared
                  luxdriveSocials list so contact page + footer stay in
                  lockstep. Adding/removing a network is a one-line
                  change in apps/web/lib/social-icons.tsx. */}
              <div>
                <h3 className="font-semibold mb-4">Follow Us</h3>
                <div className="flex flex-wrap gap-3">
                  {luxdriveSocials.map(({ name, href, Icon }) => (
                    <a
                      key={name}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={name}
                      className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-gray-800 flex items-center justify-center hover:border-[#C9A961] hover:text-[#C9A961] transition-colors"
                    >
                      <Icon className="w-5 h-5" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Embedded Google Map — KAFD Building 4.07 */}
              <div className="rounded-xl overflow-hidden border border-gray-800">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d14500!2d46.6411!3d24.7615!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3e2ee333d2c44a9d%3A0x5ffef14f702c8c9b!2sKAFD!5e0!3m2!1sen!2ssa!4v1718560000000"
                  width="100%"
                  height="100%"
                  style={{ border: 0, minHeight: "280px" }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="aspect-video w-full"
                  title="LuxDrive office location — KAFD, Riyadh"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
