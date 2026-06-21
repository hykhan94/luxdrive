// ============================================
// !!! DESTINATION PATH: apps/web/lib/social-icons.tsx
// ============================================
// ============================================
// apps/web/lib/social-icons.tsx
//
// Single source of truth for LuxDrive's social presence. Both the
// public contact page and the landing footer import the same list,
// so adding/removing a network is a one-line change here rather
// than two parallel edits that can drift.
//
// Icons: lucide-react covers Instagram, LinkedIn, Facebook, and
// YouTube directly. TikTok and Snapchat aren't first-party in
// lucide, so they're inline SVGs below — `currentColor` for fill
// keeps them stylable from the consuming component the same way
// the lucide icons are.
// ============================================

import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type SocialLink = {
  name: string;
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

// TikTok brand mark — official path, simplified to one fill.
// 24×24 viewBox so it sizes consistently with lucide icons.
export function TiktokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z" />
    </svg>
  );
}

// Snapchat ghost mark — simplified single-path glyph that sits
// well at small sizes (the multi-path official version doesn't
// shrink cleanly to 16px).
export function SnapchatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M12.206 1.5c.733 0 4.4.082 6.04 3.69.553 1.218.418 3.288.31 4.95l-.012.18c-.013.197-.025.39-.034.575.085.05.234.108.464.108.336-.013.726-.115 1.13-.296.16-.077.336-.115.515-.114.215 0 .433.043.617.122l.013.005c.526.187.876.557.882 1.043.007.616-.523 1.146-1.577 1.563-.106.042-.234.08-.37.122-.484.149-1.216.373-1.408.83-.1.236-.066.541.103.913l.012.025c.063.146 1.555 3.625 4.948 4.184.272.045.464.281.45.554a.624.624 0 0 1-.05.207c-.288.674-1.534 1.171-3.81 1.521-.07.105-.144.476-.196.738-.05.247-.103.502-.18.776-.085.305-.31.45-.654.45h-.024c-.156 0-.378-.027-.66-.077-.418-.07-.93-.157-1.61-.157-.385 0-.785.027-1.187.083-.685.097-1.281.495-1.948.945-.892.6-1.908 1.281-3.42 1.281-.066 0-.13-.003-.198-.007l-.176.005c-1.51 0-2.524-.682-3.418-1.282-.671-.45-1.265-.847-1.948-.944a8.4 8.4 0 0 0-1.187-.084c-.733 0-1.31.115-1.69.19-.264.05-.477.094-.633.094-.46 0-.642-.281-.71-.448-.077-.273-.13-.526-.18-.776-.054-.262-.13-.633-.196-.738-2.275-.35-3.521-.847-3.81-1.521a.605.605 0 0 1-.05-.207.563.563 0 0 1 .45-.554c3.394-.559 4.886-4.038 4.948-4.184l.013-.025c.169-.371.203-.677.103-.913-.192-.456-.924-.681-1.408-.83a4.886 4.886 0 0 1-.37-.122c-1.385-.546-1.6-1.18-1.566-1.6a.969.969 0 0 1 .882-.881c.184-.079.402-.122.617-.122.179.001.355.038.515.115.404.18.795.283 1.13.296.232 0 .38-.058.464-.108-.009-.185-.021-.378-.034-.575l-.012-.18c-.108-1.66-.243-3.732.31-4.951C7.806 1.582 11.474 1.495 12.206 1.5z" />
    </svg>
  );
}

// WhatsApp brand mark — official phone-in-speech-bubble glyph.
// lucide-react doesn't include WhatsApp (it's a brand mark rather
// than a generic icon), so we inline the same SVG path used by the
// booking-share WhatsApp button for consistency across surfaces.
export function WhatsappIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.465 3.488" />
    </svg>
  );
}

// Authoritative ordering — visual platforms first (Instagram,
// Facebook, TikTok, Snapchat), then video (YouTube), then
// professional (LinkedIn). Reads naturally on both desktop and
// mobile and keeps related networks adjacent.
//
// To add/remove a network: edit this array. Both contact page and
// footer pick up the change with no further edits required.
export const luxdriveSocials: SocialLink[] = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/luxakari/",
    Icon: Instagram,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/luxakarihospitalitygroup",
    Icon: Facebook,
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@luxakarihospitalitygroup",
    Icon: TiktokIcon,
  },
  //   {
  //     name: "Snapchat",
  //     href: "https://www.snapchat.com/add/luxakari",
  //     Icon: SnapchatIcon,
  //   },
  {
    name: "WhatsApp",
    // wa.me requires digits-only, no `+`. The KSA dispatch line
    // doubles as the WhatsApp business number; tapping the icon
    // opens a chat thread on the user's WhatsApp.
    href: "https://wa.me/966545559510",
    Icon: WhatsappIcon,
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@Luxakari",
    Icon: Youtube,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/luxakari/",
    Icon: Linkedin,
  },
];
