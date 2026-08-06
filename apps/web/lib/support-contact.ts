// ============================================
// lib/support-contact.ts
//
// Opens WhatsApp with a pre-filled message to the Luxakari support/admin
// line. Used where a partner needs to reach a human directly (e.g. asking
// for a city-gated vehicle class) rather than filing an in-app request.
//
// Override the number per environment with NEXT_PUBLIC_SUPPORT_WHATSAPP
// (digits only, incl. country code, no "+"). Falls back to the Luxakari
// WhatsApp line.
// ============================================

const SUPPORT_WHATSAPP =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "966545559510";

export function openWhatsApp(message: string): void {
  if (typeof window === "undefined") return;
  const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
    message,
  )}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
