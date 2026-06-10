"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Phone,
  Landmark,
  CreditCard,
  Hash,
  Mail,
  Building2,
  ChevronDown,
  Check,
  AlertCircle,
  Globe,
  Search,
} from "lucide-react";
import {
  formatIncompletePhoneNumber,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from "libphonenumber-js/min";

// ============================================
// components/ui/form-fields.tsx
// Universal formatted form fields for LuxDrive
// KSA-specific: phone, IBAN, bank, CR, VAT, etc.
// Usable across Partner, Vendor, Customer, Admin portals
// ============================================

// ============== KSA BANKS ==============

export const KSA_BANKS = [
  { code: "RJHI", name: "Al Rajhi Bank", swift: "RJHISARI" },
  { code: "NCB", name: "Saudi National Bank (SNB)", swift: "NCBKSAJE" },
  { code: "SABB", name: "Saudi British Bank (SABB)", swift: "SABBSARI" },
  { code: "BSFR", name: "Banque Saudi Fransi", swift: "BSFRSARI" },
  { code: "RIBL", name: "Riyad Bank", swift: "RIBLSARI" },
  { code: "ARNB", name: "Arab National Bank", swift: "ARNBSARI" },
  { code: "ALBI", name: "Saudi Investment Bank", swift: "SIBCSARI" },
  { code: "AAAL", name: "Al Bilad Bank", swift: "ALBISARI" },
  { code: "BJAZ", name: "Bank AlJazira", swift: "BJAZSAJE" },
  { code: "INMA", name: "Alinma Bank", swift: "INMASARI" },
  { code: "GULF", name: "Gulf International Bank", swift: "GULFSARI" },
  { code: "ENBD", name: "Emirates NBD Saudi", swift: "EABORIRI" },
  { code: "FRAB", name: "First Abu Dhabi Bank", swift: "NBADSAJE" },
] as const;

// ============== COUNTRIES ==============
//
// Phone-number country support is backed by libphonenumber-js, which
// covers ~240 territories with up-to-date numbering plans. We don't
// maintain that list ourselves anymore. What we DO maintain is which
// countries float to the top of the dropdown — KSA first since this
// is a Saudi-targeted product, then the rest of the GCC and the
// regions our user base most commonly originates from. Everything
// not in this list still appears further down, alphabetically.
//
// Order matters: the array order is the display order in the
// "Frequent" section of the dropdown.
export const POPULAR_COUNTRIES = [
  "SA", // Saudi Arabia
  "AE", // UAE
  "BH", // Bahrain
  "QA", // Qatar
  "OM", // Oman
  "KW", // Kuwait
  "EG", // Egypt
  "JO", // Jordan
  "PK", // Pakistan
  "IN", // India
  "GB", // United Kingdom
  "US", // United States
] as const;

// ============== HELPERS ==============

// Phone-number formatting and validation is handled by libphonenumber-js.
// We use the `min` metadata bundle (~22kb gzipped) — full country
// coverage but minimal locale data, which is the right tradeoff for
// our use case.
//
// What this gives us versus the old hand-rolled regex:
//   • All ~240 territories instead of 12
//   • Real numbering-plan validation (catches "0000000000" as invalid
//     in US for example), not just digit-count checks
//   • Canonical E.164 output ("+966512345678") for DB storage
//   • Live formatting that handles country-specific groupings
//     groupings without us hardcoding per-country regex
//
// Country names are pulled from Intl.DisplayNames (browser-native,
// zero bundle cost, locale-aware) rather than a hardcoded map.

// Convert ISO-2 country code to flag emoji via regional indicator
// symbols. "SA" → 🇸🇦. Works for any valid ISO-2; returns empty
// string otherwise. The library deals in ISO-2 codes but doesn't
// provide flags, and importing a flag library would be wasteful
// when 6 lines of code do it.
function flagFromIso2(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return "";
  const A = 0x1f1e6; // Regional Indicator Symbol Letter A
  const a = "A".charCodeAt(0);
  return String.fromCodePoint(
    A + (iso2.toUpperCase().charCodeAt(0) - a),
    A + (iso2.toUpperCase().charCodeAt(1) - a),
  );
}

// Resolve a country's display name. Falls back to the ISO-2 code if
// Intl.DisplayNames isn't available (very old browsers) or doesn't
// know the territory.
function countryName(iso2: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(iso2.toUpperCase()) || iso2;
  } catch {
    return iso2;
  }
}

function formatIBAN(value: string): string {
  const clean = value.replace(/\s/g, "").toUpperCase().slice(0, 24);
  // Format as: SA00 0000 0000 0000 0000 0000
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

function formatCRNumber(value: string): string {
  // Saudi CR: 10 digits, format as XXXX-XXXXXX
  const clean = value.replace(/\D/g, "").slice(0, 10);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

function formatVATNumber(value: string): string {
  // Saudi VAT: 15 digits, format as XXX-XXX-XXX-XXX-XXX
  const clean = value.replace(/\D/g, "").slice(0, 15);
  return clean.replace(/(.{3})(?=.)/g, "$1-");
}

function validateIBAN(iban: string): { valid: boolean; message: string } {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (!clean) return { valid: true, message: "" };
  if (!clean.startsWith("SA"))
    return { valid: false, message: "KSA IBAN must start with SA" };
  if (clean.length > 0 && clean.length < 24)
    return {
      valid: false,
      message: `${24 - clean.length} more characters needed`,
    };
  if (clean.length === 24) return { valid: true, message: "Valid format" };
  return { valid: true, message: "" };
}

function validateEmail(email: string): { valid: boolean; message: string } {
  if (!email) return { valid: true, message: "" };
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return { valid: false, message: "Invalid email format" };
  return { valid: true, message: "" };
}

// ============== SHARED STYLES ==============

const baseInputClass =
  "w-full bg-neutral-800 border rounded-lg text-white text-sm focus:outline-none transition-colors";
const normalBorder = "border-neutral-700 focus:border-luxury-gold";
const errorBorder = "border-red-500/50 focus:border-red-500";
const validBorder = "border-green-500/30 focus:border-green-500";

// ============== PHONE INPUT ==============
//
// International phone-number input backed by libphonenumber-js. The
// component owns two concerns simultaneously:
//
//   1. UI input — live formatting as the user types ("+966 51 234
//      5678" with spaces inserted at country-specific positions),
//      country picker with searchable dropdown of all ~240
//      territories.
//   2. Canonical output — the value emitted to onChange is always
//      E.164 ("+966512345678", no spaces, no formatting) or an empty
//      string when blank. Parent components and the DB never see the
//      formatted version. Consistent storage downstream lets WhatsApp/
//      SMS providers consume the number without normalization.
//
// Props are intentionally minimal:
//   - value: current value in E.164 (or "")
//   - onChange: receives E.164 (or "") on every change
//   - defaultCountry: ISO-2 code (default "SA") — used only when
//                     `value` is empty and we need a country to start
//                     formatting against
//   - ksaOnly: locks the picker to SA — useful for partner/vendor
//              flows where the contact is required to be Saudi
//
// Validation: a stable, exported `validatePhone()` helper is available
// for parent components to call before submit. The component itself
// only surfaces a green "Valid number" hint when the typed value is a
// real number — it doesn't block typing. Submit-time validation is
// the parent's job.

interface PhoneInputProps {
  value: string;
  onChange: (e164: string) => void;
  label?: string;
  required?: boolean;
  defaultCountry?: string;
  ksaOnly?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

/**
 * Returns whether a stored phone string is a valid number. Use this
 * before submit; the component itself doesn't block typing.
 */
export function validatePhone(e164: string): boolean {
  if (!e164) return false;
  return isValidPhoneNumber(e164);
}

export function PhoneInput({
  value,
  onChange,
  label = "Phone Number",
  required = false,
  defaultCountry = "SA",
  ksaOnly = false,
  disabled = false,
  error = false,
  className = "",
}: PhoneInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Country selection lives in local state. We deliberately don't
  // encode the bare dial code ("+966") into `value` when the user
  // hasn't typed any digits yet — that round-trips badly because
  // parsePhoneNumberFromString("+966") can't find a national number
  // and the bare "966" leaks back into the input.
  //
  // `value` is the canonical E.164 (or "") for the parent / DB.
  // `selectedCountry` is the picker's UI state. They sync in one
  // direction only:
  //   - When `value` arrives with a parseable country, we sync the
  //     picker to that country (handles initial mount + external
  //     value changes).
  //   - When the user picks a country with no digits typed yet, we
  //     only update local state — `value` stays "".
  const initialCountry: CountryCode = (() => {
    if (value) {
      const p = parsePhoneNumberFromString(value);
      if (p && p.country) return p.country as CountryCode;
    }
    return (ksaOnly ? "SA" : defaultCountry) as CountryCode;
  })();
  const [selectedCountry, setSelectedCountry] =
    useState<CountryCode>(initialCountry);

  // Keep the picker in sync if `value` is reassigned from above
  // (e.g. parent loads existing E.164 after an async fetch).
  useEffect(() => {
    if (!value) return;
    const p = parsePhoneNumberFromString(value);
    if (p && p.country && p.country !== selectedCountry) {
      setSelectedCountry(p.country as CountryCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // National number derives from `value`. If `value` parses cleanly
  // we use the library's nationalNumber. If `value` is empty or
  // unparseable we show nothing — never strip-and-show raw digits
  // from a malformed value (that was the source of the "966" leak).
  const nationalNumber = useMemo(() => {
    if (!value) return "";
    const p = parsePhoneNumberFromString(value);
    if (p && p.nationalNumber) return p.nationalNumber;
    // Value exists but isn't a clean E.164 yet. This is the case
    // mid-typing when our handler emits a partial "+966501" that
    // doesn't parse. Strip the dial code prefix if present, else
    // strip all non-digits as last resort.
    const dialCode = `+${getCountryCallingCode(selectedCountry)}`;
    if (value.startsWith(dialCode)) {
      return value.slice(dialCode.length).replace(/\D/g, "");
    }
    return value.replace(/\D/g, "");
  }, [value, selectedCountry]);

  const country = selectedCountry;

  // Live-formatted display string. `formatIncompletePhoneNumber` is
  // the stateless helper from libphonenumber-js — feed it the full
  // E.164 candidate and the country, get back the country-correctly
  // grouped national portion. Strip the leading "+CC" we passed in so
  // the input shows only the national digits with spaces/dashes.
  const formatted = useMemo(() => {
    if (!nationalNumber) return "";
    const callingCode = getCountryCallingCode(country);
    const e164Candidate = `+${callingCode}${nationalNumber}`;
    const full = formatIncompletePhoneNumber(e164Candidate, country);
    // formatIncompletePhoneNumber returns either the formatted full
    // international string ("+966 51 234 5678") or — if it can't
    // group yet — the raw input. Either way, strip the leading
    // "+<calling code>" so only the national portion is shown.
    const stripped = full.replace(`+${callingCode}`, "").trimStart();
    return stripped || nationalNumber;
  }, [country, nationalNumber]);

  // Validity for the green-check hint. Note this is intentionally
  // *not* used to block typing — the user can be mid-entry and the
  // field shouldn't show errors for partial values.
  const isValid = useMemo(() => {
    if (!value) return false;
    return isValidPhoneNumber(value);
  }, [value]);

  // Build the country list once. POPULAR_COUNTRIES drives the top
  // section; the rest are sorted alphabetically by display name.
  // Filter happens on top of this for the search box.
  const allCountries = useMemo(() => {
    if (ksaOnly) {
      return [
        { iso2: "SA" as CountryCode, name: countryName("SA"), popular: true },
      ];
    }
    const popular = new Set<string>(POPULAR_COUNTRIES);
    const popularRows = POPULAR_COUNTRIES.map((iso2) => ({
      iso2: iso2 as CountryCode,
      name: countryName(iso2),
      popular: true,
    }));
    const restRows = getCountries()
      .filter((c) => !popular.has(c))
      .map((c) => ({ iso2: c, name: countryName(c), popular: false }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...popularRows, ...restRows];
  }, [ksaOnly]);

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return allCountries;
    const q = search.toLowerCase().trim();
    return allCountries.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.iso2.toLowerCase().includes(q)) return true;
      // Allow searching by calling code with or without "+"
      const callingCode = getCountryCallingCode(c.iso2);
      if (q.replace(/^\+/, "") === callingCode) return true;
      return false;
    });
  }, [allCountries, search]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // User typed in the input. The input is national-digits-only; the
  // country code is shown next to it via the picker, not inside the
  // input. We strip non-digits as a defensive measure (paste might
  // include spaces or dashes) then emit either E.164 (if the
  // library can parse it) or the partial "+CC<digits>" candidate so
  // typing-in-progress round-trips.
  const handleDigitChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      onChange("");
      return;
    }
    const candidate = `+${getCountryCallingCode(selectedCountry)}${digits}`;
    const parsedCandidate = parsePhoneNumberFromString(candidate);
    onChange(parsedCandidate?.number ?? candidate);
  };

  const handleCountryChange = (newCountry: CountryCode) => {
    // Picker is local state. We update the UI immediately. If the
    // user has digits already typed, re-emit them under the new
    // dial code so the stored E.164 stays consistent with the
    // picker. If there are no digits yet, value stays "" — we do
    // NOT pre-fill the dial code into `value`.
    setSelectedCountry(newCountry);
    setShowDropdown(false);
    setSearch("");
    if (!nationalNumber) {
      // Important: don't write "+966" to value here. The picker
      // already shows the dial code; the input stays empty until
      // the user types digits.
      onChange("");
      return;
    }
    const candidate = `+${getCountryCallingCode(newCountry)}${nationalNumber}`;
    const parsedCandidate = parsePhoneNumberFromString(candidate);
    onChange(parsedCandidate?.number ?? candidate);
  };

  const selectedFlag = flagFromIso2(country);
  const selectedDialCode = `+${getCountryCallingCode(country)}`;
  const placeholder = "Phone number";

  return (
    <div className={className}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <Phone className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className="flex gap-0">
        {/* Country code selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() =>
              !ksaOnly && !disabled && setShowDropdown(!showDropdown)
            }
            disabled={disabled || ksaOnly}
            className={`flex items-center gap-1.5 h-full px-3 bg-neutral-800 border border-r-0 border-neutral-700 rounded-l-lg text-sm ${
              ksaOnly || disabled
                ? "cursor-default"
                : "cursor-pointer hover:bg-neutral-700"
            } transition-colors`}
          >
            <span className="text-base leading-none">{selectedFlag}</span>
            <span className="text-gray-400 text-xs font-mono">
              {selectedDialCode}
            </span>
            {!ksaOnly && <ChevronDown className="w-3 h-3 text-gray-500" />}
          </button>

          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="p-2 border-b border-neutral-800">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search country or code..."
                    className="w-full pl-8 pr-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm text-white focus:border-luxury-gold focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {filteredCountries.length === 0 ? (
                  <p className="text-xs text-gray-500 px-3 py-4 text-center">
                    No countries match &ldquo;{search}&rdquo;
                  </p>
                ) : (
                  filteredCountries.map((c, idx) => {
                    // Insert a divider between the popular section
                    // and the rest of the alphabetical list. Only
                    // when there's no search filter — searching
                    // already flattens the visual hierarchy.
                    const showDivider =
                      !search &&
                      idx > 0 &&
                      filteredCountries[idx - 1].popular &&
                      !c.popular;
                    return (
                      <div key={c.iso2}>
                        {showDivider && (
                          <div className="px-3 py-1 bg-neutral-950 text-[10px] uppercase tracking-wider text-gray-600">
                            All countries
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCountryChange(c.iso2)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-800 transition-colors ${
                            c.iso2 === country
                              ? "bg-luxury-gold/10 text-luxury-gold"
                              : "text-gray-300"
                          }`}
                        >
                          <span className="text-base">
                            {flagFromIso2(c.iso2)}
                          </span>
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-xs text-gray-500 font-mono">
                            +{getCountryCallingCode(c.iso2)}
                          </span>
                          {c.iso2 === country && (
                            <Check className="w-3.5 h-3.5 text-luxury-gold" />
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phone number input */}
        <input
          type="tel"
          value={formatted}
          onChange={(e) => handleDigitChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={`flex-1 px-4 py-3 ${baseInputClass} rounded-l-none ${
            error ? errorBorder : isValid ? validBorder : normalBorder
          } disabled:opacity-50`}
        />
      </div>
      {isValid && (
        <p className="text-[10px] text-green-400/70 mt-1 flex items-center gap-1">
          <Check className="w-2.5 h-2.5" /> Valid number
        </p>
      )}
    </div>
  );
}

// ============== BANK SELECTOR ==============

interface BankSelectorProps {
  value: string | null;
  onChange: (bankName: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function BankSelector({
  value,
  onChange,
  label = "Bank Name",
  required = false,
  disabled = false,
  error = false,
  className = "",
}: BankSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedBank = KSA_BANKS.find((b) => b.name === value);

  const filtered = search
    ? KSA_BANKS.filter(
        (b) =>
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.code.toLowerCase().includes(search.toLowerCase()),
      )
    : KSA_BANKS;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className={className} ref={dropdownRef}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <Landmark className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setShowDropdown(!showDropdown)}
          disabled={disabled}
          className={`w-full flex items-center justify-between px-4 py-3 ${baseInputClass} ${error ? errorBorder : normalBorder} text-left disabled:opacity-50`}
        >
          {selectedBank ? (
            <div className="flex items-center gap-2">
              <span className="text-white">{selectedBank.name}</span>
              <span className="text-xs text-gray-500 font-mono">
                ({selectedBank.code})
              </span>
            </div>
          ) : (
            <span className="text-gray-500">Select a bank...</span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-gray-500 transition-transform ${showDropdown ? "rotate-180" : ""}`}
          />
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-neutral-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bank..."
                  className="w-full pl-8 pr-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm text-white focus:border-luxury-gold focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.map((bank) => (
                <button
                  key={bank.code}
                  onClick={() => {
                    onChange(bank.name);
                    setShowDropdown(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-neutral-800 transition-colors ${
                    value === bank.name ? "bg-luxury-gold/10" : ""
                  }`}
                >
                  <div>
                    <p
                      className={
                        value === bank.name
                          ? "text-luxury-gold font-medium"
                          : "text-white"
                      }
                    >
                      {bank.name}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      SWIFT: {bank.swift}
                    </p>
                  </div>
                  {value === bank.name && (
                    <Check className="w-4 h-4 text-luxury-gold flex-shrink-0" />
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No banks found
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== IBAN INPUT ==============

interface IBANInputProps {
  value: string | null;
  onChange: (iban: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function IBANInput({
  value,
  onChange,
  label = "IBAN",
  required = false,
  disabled = false,
  error = false,
  className = "",
}: IBANInputProps) {
  const raw = (value || "").replace(/\s/g, "");
  const formatted = formatIBAN(raw);
  const validation = validateIBAN(raw);

  const handleChange = (inputVal: string) => {
    const clean = inputVal
      .replace(/\s/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 24);
    onChange(clean);
  };

  return (
    <div className={className}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <CreditCard className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={formatted}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          placeholder="SA00 0000 0000 0000 0000 0000"
          className={`${baseInputClass} px-4 py-3 font-mono tracking-wider ${
            error
              ? errorBorder
              : !raw
                ? normalBorder
                : validation.valid && raw.length === 24
                  ? validBorder
                  : !validation.valid
                    ? errorBorder
                    : normalBorder
          } disabled:opacity-50`}
        />
        {raw.length > 0 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {validation.valid && raw.length === 24 ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : !validation.valid ? (
              <AlertCircle className="w-4 h-4 text-red-400" />
            ) : null}
          </div>
        )}
      </div>
      {raw.length > 0 && validation.message && (
        <p
          className={`text-[10px] mt-1 flex items-center gap-1 ${
            validation.valid ? "text-green-400/70" : "text-red-400/70"
          }`}
        >
          {validation.valid ? (
            <Check className="w-2.5 h-2.5" />
          ) : (
            <AlertCircle className="w-2.5 h-2.5" />
          )}
          {validation.message}
        </p>
      )}
      <p className="text-[10px] text-gray-600 mt-1">
        {raw.length}/24 characters
      </p>
    </div>
  );
}

// ============== ACCOUNT NUMBER INPUT ==============

interface AccountNumberInputProps {
  value: string | null;
  onChange: (accountNo: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function AccountNumberInput({
  value,
  onChange,
  label = "Account Number",
  required = false,
  disabled = false,
  error = false,
  className = "",
}: AccountNumberInputProps) {
  return (
    <div className={className}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <Hash className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        disabled={disabled}
        placeholder="Enter account number"
        className={`${baseInputClass} px-4 py-3 font-mono ${error ? errorBorder : normalBorder} disabled:opacity-50`}
      />
    </div>
  );
}

// ============== CR NUMBER INPUT ==============

interface CRNumberInputProps {
  value: string | null;
  onChange: (crNumber: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function CRNumberInput({
  value,
  onChange,
  label = "Commercial Registration (CR)",
  required = false,
  disabled = false,
  error = false,
  className = "",
}: CRNumberInputProps) {
  const raw = (value || "").replace(/\D/g, "");
  const formatted = formatCRNumber(raw);
  const isComplete = raw.length === 10;

  return (
    <div className={className}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <Building2 className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={formatted}
          onChange={(e) =>
            onChange(e.target.value.replace(/\D/g, "").slice(0, 10))
          }
          disabled={disabled}
          placeholder="1010-XXXXXX"
          className={`${baseInputClass} px-4 py-3 font-mono ${
            error ? errorBorder : isComplete ? validBorder : normalBorder
          } disabled:opacity-50`}
        />
        {isComplete && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Check className="w-4 h-4 text-green-400" />
          </div>
        )}
      </div>
      {raw.length > 0 && (
        <p
          className={`text-[10px] mt-1 ${isComplete ? "text-green-400/70" : "text-gray-500"}`}
        >
          {raw.length}/10 digits {isComplete && "✓"}
        </p>
      )}
    </div>
  );
}

// ============== VAT NUMBER INPUT ==============

interface VATNumberInputProps {
  value: string | null;
  onChange: (vatNumber: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function VATNumberInput({
  value,
  onChange,
  label = "VAT Registration Number",
  required = false,
  disabled = false,
  error = false,
  className = "",
}: VATNumberInputProps) {
  const raw = (value || "").replace(/\D/g, "");
  const formatted = formatVATNumber(raw);
  const isComplete = raw.length === 15;
  const startsCorrectly =
    raw.startsWith("3") && raw.endsWith("3") && raw.length === 15;

  return (
    <div className={className}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <Hash className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={formatted}
          onChange={(e) =>
            onChange(e.target.value.replace(/\D/g, "").slice(0, 15))
          }
          disabled={disabled}
          placeholder="3XX-XXX-XXX-XXX-XX3"
          className={`${baseInputClass} px-4 py-3 font-mono ${
            error
              ? errorBorder
              : isComplete && startsCorrectly
                ? validBorder
                : isComplete && !startsCorrectly
                  ? errorBorder
                  : normalBorder
          } disabled:opacity-50`}
        />
        {isComplete && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {startsCorrectly ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
          </div>
        )}
      </div>
      {raw.length > 0 && (
        <p
          className={`text-[10px] mt-1 ${
            isComplete && startsCorrectly
              ? "text-green-400/70"
              : isComplete
                ? "text-amber-400/70"
                : "text-gray-500"
          }`}
        >
          {raw.length}/15 digits
          {isComplete &&
            !startsCorrectly &&
            " — KSA VAT numbers typically start and end with 3"}
          {isComplete && startsCorrectly && " ✓"}
        </p>
      )}
    </div>
  );
}

// ============== EMAIL INPUT ==============

interface EmailInputProps {
  value: string | null;
  onChange: (email: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function EmailInput({
  value,
  onChange,
  label = "Email Address",
  required = false,
  disabled = false,
  error = false,
  className = "",
}: EmailInputProps) {
  const [touched, setTouched] = useState(false);
  const validation = validateEmail(value || "");

  return (
    <div className={className}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <Mail className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="email"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          placeholder="name@company.com"
          className={`${baseInputClass} px-4 py-3 ${
            error
              ? errorBorder
              : touched && value && !validation.valid
                ? errorBorder
                : touched && value && validation.valid
                  ? validBorder
                  : normalBorder
          } disabled:opacity-50`}
        />
        {touched && value && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {validation.valid ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
          </div>
        )}
      </div>
      {touched && value && !validation.valid && (
        <p className="text-[10px] text-red-400/70 mt-1 flex items-center gap-1">
          <AlertCircle className="w-2.5 h-2.5" /> {validation.message}
        </p>
      )}
    </div>
  );
}

// ============== CHAMBER OF COMMERCE INPUT ==============

interface ChamberNumberInputProps {
  value: string | null;
  onChange: (number: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function ChamberNumberInput({
  value,
  onChange,
  label = "Chamber of Commerce Number",
  required = false,
  disabled = false,
  error = false,
  className = "",
}: ChamberNumberInputProps) {
  const raw = (value || "").replace(/\D/g, "");

  return (
    <div className={className}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <Building2 className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <input
        type="text"
        value={raw}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        disabled={disabled}
        placeholder="Enter chamber number"
        className={`${baseInputClass} px-4 py-3 font-mono ${error ? errorBorder : normalBorder} disabled:opacity-50`}
      />
    </div>
  );
}

// ============== BALADY NUMBER INPUT ==============

interface BaladyNumberInputProps {
  value: string | null;
  onChange: (number: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function BaladyNumberInput({
  value,
  onChange,
  label = "Balady License Number",
  required = false,
  disabled = false,
  error = false,
  className = "",
}: BaladyNumberInputProps) {
  return (
    <div className={className}>
      {label && (
        <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-2">
          <Hash className="w-3.5 h-3.5" />
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Enter Balady license number"
        className={`${baseInputClass} px-4 py-3 ${error ? errorBorder : normalBorder} disabled:opacity-50`}
      />
    </div>
  );
}
