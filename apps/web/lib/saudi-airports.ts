// ============================================
// lib/saudi-airports.ts
//
// Shared Saudi airport detection + terminal metadata. Used by the
// booking-modify drawer today, and intended for the main partner
// Book-a-Ride form and the future customer booking flow — so airport
// detection, terminal options, and the arrivals/departures default all
// live in one place instead of being copied per form.
//
// Terminal distribution (verified; airline↔terminal assignments shift,
// so treat these as pre-fill hints — the driver confirms on the day):
//   RUH  King Khalid Intl, Riyadh        — Terminals 1–5
//   JED  King Abdulaziz Intl, Jeddah     — Terminal 1 / North / Hajj
//                                          (South Terminal closed 2020)
//   DMM  King Fahd Intl, Dammam          — single Passenger Terminal
//   MED  Prince Mohammad, Madinah        — single Main Terminal
//   Regional (AHB/TIF/YNB/TUU/GIZ/ELQ/HAS) — single Main Terminal
// ============================================

export interface SaudiAirport {
  /** IATA-style code, or "GENERIC" when an airport is detected but not named. */
  code: string;
  /** Display name for the detected airport. */
  name: string;
  /** Common passenger terminals; empty for the generic fallback. */
  terminals: string[];
}

// Internal shape carries the matcher; detectAirport returns it stripped.
interface AirportPattern extends SaudiAirport {
  match: RegExp;
}

export const SAUDI_AIRPORTS: AirportPattern[] = [
  {
    code: "RUH",
    name: "King Khalid Intl — Riyadh",
    match: /king khalid|\bruh\b|riyadh (international )?airport/i,
    terminals: [
      "Terminal 1",
      "Terminal 2",
      "Terminal 3",
      "Terminal 4",
      "Terminal 5",
    ],
  },
  {
    code: "JED",
    name: "King Abdulaziz Intl — Jeddah",
    match: /king abdulaziz|\bjed\b|kaia|jeddah (international )?airport/i,
    terminals: ["Terminal 1", "North Terminal", "Hajj Terminal"],
  },
  {
    code: "DMM",
    name: "King Fahd Intl — Dammam",
    match: /king fahd|\bdmm\b|dammam (international )?airport/i,
    terminals: ["Passenger Terminal"],
  },
  {
    code: "MED",
    name: "Prince Mohammad bin Abdulaziz — Madinah",
    match: /prince mohammad|\bmed\b|mad(i|e)nah (international )?airport/i,
    terminals: ["Main Terminal"],
  },
  {
    code: "AHB",
    name: "Abha Intl",
    match: /\bahb\b|abha (international )?airport/i,
    terminals: ["Main Terminal"],
  },
  {
    code: "TIF",
    name: "Taif Intl",
    match: /\btif\b|taif (international )?airport/i,
    terminals: ["Main Terminal"],
  },
  {
    code: "YNB",
    name: "Yanbu",
    match: /\bynb\b|yanbu airport/i,
    terminals: ["Main Terminal"],
  },
  {
    code: "TUU",
    name: "Tabuk",
    match: /\btuu\b|tabuk airport/i,
    terminals: ["Main Terminal"],
  },
  {
    code: "GIZ",
    name: "Jazan",
    match: /\bgiz\b|ja?zan airport/i,
    terminals: ["Main Terminal"],
  },
  {
    code: "ELQ",
    name: "Qassim",
    match: /\belq\b|qassim airport|buraidah airport/i,
    terminals: ["Main Terminal"],
  },
  {
    code: "HAS",
    name: "Hail",
    match: /\bhas\b|ha'?il airport/i,
    terminals: ["Main Terminal"],
  },
];

// Fallback: matches an airport-ish address that isn't a named airport
// above, so the form can still surface flight/terminal fields (with a
// free-text terminal).
export const GENERIC_AIRPORT_RE =
  /\b(airport|intl|international|terminal|kaia)\b/i;

const GENERIC_AIRPORT: SaudiAirport = {
  code: "GENERIC",
  name: "Airport",
  terminals: [],
};

/**
 * Detect the airport referenced by an address string. Returns the matched
 * Saudi airport (with its terminals), a generic airport marker when it's
 * airport-ish but unnamed, or null when it isn't an airport at all.
 */
export function detectAirport(text: string): SaudiAirport | null {
  if (!text) return null;
  for (const a of SAUDI_AIRPORTS) {
    if (a.match.test(text)) {
      const { match: _match, ...airport } = a;
      return airport;
    }
  }
  if (GENERIC_AIRPORT_RE.test(text)) return GENERIC_AIRPORT;
  return null;
}

/** True when the address looks like an airport (named or generic). */
export function isAirportAddress(text: string): boolean {
  return detectAirport(text) !== null;
}

export const TERMINAL_LOCATIONS = ["Arrivals", "Departures"] as const;
export type TerminalLocation = (typeof TERMINAL_LOCATIONS)[number];

/**
 * Suggest arrivals vs departures for an airport trip: pickup at the
 * airport ⇒ the passenger is arriving; drop-off at the airport ⇒ they're
 * departing. Returns "" when neither endpoint is an airport.
 */
export function suggestTerminalLocation(
  pickupAddress: string,
  dropoffAddress: string,
): TerminalLocation | "" {
  if (isAirportAddress(pickupAddress)) return "Arrivals";
  if (isAirportAddress(dropoffAddress)) return "Departures";
  return "";
}
