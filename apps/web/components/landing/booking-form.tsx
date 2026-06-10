"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Clock, Calendar, AlertCircle, X, Plane } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

// ============================================
// FORM_READ_ONLY = true makes the booking form display-only. Every
// input rejects typing, every dropdown won't open, both tabs are
// frozen, and the Search button is inert. Visually it still looks
// like the active form (same icons, placeholders, gold pill on the
// One Way tab) — only the interaction is removed.
//
// This is the state for the marketing landing right now while the
// real booking pipeline isn't ready for public traffic. When you're
// ready to take live bookings through this form, flip to false. No
// other changes needed — `disabled={FORM_READ_ONLY}` is wired through
// every interactive element, so toggling the flag re-enables them
// all at once.
// ============================================
const FORM_READ_ONLY = true;

export default function BookingForm() {
  const router = useRouter();
  const { isAuthenticated, setShowLoginModal } = useAuth();
  const [activeTab, setActiveTab] = useState<"oneway" | "hourly">("oneway");
  const [errorMessage, setErrorMessage] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // One Way fields
  const [pickupOneWay, setPickupOneWay] = useState("");
  const [dropoffOneWay, setDropoffOneWay] = useState("");
  const [showFlightOneWay, setShowFlightOneWay] = useState(false);
  const [flightNumberOneWay, setFlightNumberOneWay] = useState("");
  const [terminalNoOneWay, setTerminalNoOneWay] = useState("");
  const [terminalLocationOneWay, setTerminalLocationOneWay] = useState("");
  const [dateOneWay, setDateOneWay] = useState("");
  const [timeOneWay, setTimeOneWay] = useState("");
  const [passengersOneWay, setPassengersOneWay] = useState("1");

  // Hourly fields
  const [pickupHourly, setPickupHourly] = useState("");
  const [showFlightHourly, setShowFlightHourly] = useState(false);
  const [flightNumberHourly, setFlightNumberHourly] = useState("");
  const [terminalNoHourly, setTerminalNoHourly] = useState("");
  const [terminalLocationHourly, setTerminalLocationHourly] = useState("");
  const [dateHourly, setDateHourly] = useState("");
  const [timeHourly, setTimeHourly] = useState("");
  const [duration, setDuration] = useState("");
  const [passengersHourly, setPassengersHourly] = useState("1");

  const handlePickupChangeOneWay = (value: string) => {
    setPickupOneWay(value);
    const isAirport = value.toLowerCase().includes("airport");
    setShowFlightOneWay(isAirport);
    if (!isAirport) {
      setFlightNumberOneWay("");
      setTerminalNoOneWay("");
      setTerminalLocationOneWay("");
    }
  };

  const handlePickupChangeHourly = (value: string) => {
    setPickupHourly(value);
    const isAirport = value.toLowerCase().includes("airport");
    setShowFlightHourly(isAirport);
    if (!isAirport) {
      setFlightNumberHourly("");
      setTerminalNoHourly("");
      setTerminalLocationHourly("");
    }
  };

  const handleSearchOneWay = () => {
    setErrorMessage("");
    if (!pickupOneWay.trim()) {
      setErrorMessage("Please enter a pickup location");
      return;
    }
    if (!dropoffOneWay.trim()) {
      setErrorMessage("Please enter a drop-off location");
      return;
    }
    if (!dateOneWay) {
      setErrorMessage("Please select a travel date");
      return;
    }
    if (!timeOneWay) {
      setErrorMessage("Please select a pickup time");
      return;
    }
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }

    const params = new URLSearchParams({
      type: "oneway",
      pickup: pickupOneWay,
      dropoff: dropoffOneWay,
      date: dateOneWay,
      time: timeOneWay,
      passengers: passengersOneWay,
    });
    if (flightNumberOneWay) params.append("flight", flightNumberOneWay);
    if (terminalNoOneWay) params.append("terminalNo", terminalNoOneWay);
    if (terminalLocationOneWay)
      params.append("terminalLocation", terminalLocationOneWay);
    router.push(`/booking?${params.toString()}`);
  };

  const handleSearchHourly = () => {
    setErrorMessage("");
    if (!pickupHourly.trim()) {
      setErrorMessage("Please enter a pickup location");
      return;
    }
    if (!dateHourly) {
      setErrorMessage("Please select a date");
      return;
    }
    if (!timeHourly) {
      setErrorMessage("Please select a pickup time");
      return;
    }
    if (!duration) {
      setErrorMessage("Please select a duration");
      return;
    }
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }

    const params = new URLSearchParams({
      type: "hourly",
      pickup: pickupHourly,
      date: dateHourly,
      time: timeHourly,
      duration,
      passengers: passengersHourly,
    });
    if (flightNumberHourly) params.append("flight", flightNumberHourly);
    if (terminalNoHourly) params.append("terminalNo", terminalNoHourly);
    if (terminalLocationHourly)
      params.append("terminalLocation", terminalLocationHourly);
    router.push(`/booking?${params.toString()}`);
  };

  const InputField = ({
    icon: Icon,
    label,
    value,
    onChange,
    placeholder,
    type = "text",
    name,
    disabled,
  }: {
    icon: React.ElementType;
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    type?: string;
    name: string;
    disabled?: boolean;
  }) => (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative group">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C9A961] pointer-events-none z-10" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocusedField(name)}
          onBlur={() => setFocusedField(null)}
          placeholder={placeholder}
          disabled={disabled}
          /* When disabled, browser defaults gray the input and dim
             placeholder text. The `disabled:` overrides below preserve
             the active look (white text, normal placeholder, same
             background) and only change cursor + remove focus glow.
             Visual result: indistinguishable from the active state. */
          className="w-full pl-10 pr-4 py-3 bg-black/40 border border-gray-700/50 text-white text-sm placeholder-gray-500 rounded-lg focus:outline-none transition-all duration-300 [color-scheme:dark] disabled:cursor-not-allowed disabled:text-white disabled:placeholder-gray-500 disabled:bg-black/40 disabled:opacity-100"
          style={{ borderColor: focusedField === name ? "#C9A961" : undefined }}
        />
        <div
          className={`absolute bottom-0 left-0 h-0.5 bg-[#C9A961] transition-all duration-300 ${focusedField === name ? "w-full" : "w-0"}`}
        />
      </div>
    </div>
  );

  const SelectField = ({
    icon: Icon,
    label,
    value,
    onChange,
    options,
    placeholder,
    name,
    disabled,
  }: {
    icon: React.ElementType;
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    placeholder: string;
    name: string;
    disabled?: boolean;
  }) => (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative group">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#C9A961] pointer-events-none z-10" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocusedField(name)}
          onBlur={() => setFocusedField(null)}
          disabled={disabled}
          className="w-full pl-10 pr-4 py-3 bg-black/40 border border-gray-700/50 text-white text-sm rounded-lg focus:outline-none appearance-none transition-all duration-300 [color-scheme:dark] disabled:cursor-not-allowed disabled:text-white disabled:bg-black/40 disabled:opacity-100"
          style={{ borderColor: focusedField === name ? "#C9A961" : undefined }}
        >
          <option value="" className="bg-neutral-900">
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-neutral-900">
              {o.label}
            </option>
          ))}
        </select>
        <div
          className={`absolute bottom-0 left-0 h-0.5 bg-[#C9A961] transition-all duration-300 ${focusedField === name ? "w-full" : "w-0"}`}
        />
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Glassmorphism Card */}
      <div className="relative bg-black/60 backdrop-blur-xl rounded-2xl p-5 md:p-6 border border-[#C9A961]/20 shadow-[0_0_60px_-15px_rgba(201,169,97,0.3)]">
        {/* Subtle glow effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-[#C9A961]/10 via-transparent to-[#C9A961]/10 rounded-2xl blur-sm -z-10" />

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-xl md:text-2xl font-serif text-white font-bold">
            Book Your Ride
          </h2>
          <p className="text-gray-400 text-xs mt-1">
            Premium chauffeur services
          </p>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-4 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-red-300 text-xs">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage("")}
              className="text-red-400 hover:text-red-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Pill Toggle Tabs */}
        <div className="bg-black/40 p-1 rounded-full mb-5 flex">
          {[
            { id: "oneway", label: "One Way" },
            { id: "hourly", label: "By the Hour" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "oneway" | "hourly")}
              disabled={FORM_READ_ONLY}
              className={`flex-1 py-2.5 text-sm font-medium rounded-full transition-all duration-300 disabled:cursor-not-allowed ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-[#C9A961] to-[#b89550] text-black shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* One Way Tab */}
        {activeTab === "oneway" && (
          <div className="space-y-4 animate-fade-in">
            <InputField
              icon={MapPin}
              label="Pickup"
              name="pickup-ow"
              value={pickupOneWay}
              onChange={handlePickupChangeOneWay}
              placeholder="Enter pickup location"
              disabled={FORM_READ_ONLY}
            />
            <InputField
              icon={MapPin}
              label="Drop-off"
              name="dropoff-ow"
              value={dropoffOneWay}
              onChange={setDropoffOneWay}
              placeholder="Enter drop-off location"
              disabled={FORM_READ_ONLY}
            />

            {/* Airport Details - Conditional with animation */}
            {showFlightOneWay && (
              <div className="animate-slide-down overflow-hidden space-y-3">
                <InputField
                  icon={Plane}
                  label="Flight Number (Optional)"
                  name="flight-ow"
                  value={flightNumberOneWay}
                  onChange={setFlightNumberOneWay}
                  placeholder="e.g. SV123"
                  disabled={FORM_READ_ONLY}
                />
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    icon={MapPin}
                    label="Terminal No. (Optional)"
                    name="terminal-no-ow"
                    value={terminalNoOneWay}
                    onChange={setTerminalNoOneWay}
                    placeholder="e.g. T1, T2"
                    disabled={FORM_READ_ONLY}
                  />
                  <InputField
                    icon={MapPin}
                    label="Terminal Location (Optional)"
                    name="terminal-loc-ow"
                    value={terminalLocationOneWay}
                    onChange={setTerminalLocationOneWay}
                    placeholder="e.g. Arrivals"
                    disabled={FORM_READ_ONLY}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <InputField
                icon={Calendar}
                label="Date"
                name="date-ow"
                value={dateOneWay}
                onChange={setDateOneWay}
                placeholder=""
                type="date"
                disabled={FORM_READ_ONLY}
              />
              <InputField
                icon={Clock}
                label="Time"
                name="time-ow"
                value={timeOneWay}
                onChange={setTimeOneWay}
                placeholder=""
                type="time"
                disabled={FORM_READ_ONLY}
              />
            </div>

            <button
              onClick={handleSearchOneWay}
              disabled={FORM_READ_ONLY}
              className="w-full py-3.5 mt-2 bg-gradient-to-r from-[#C9A961] to-[#b89550] text-black font-semibold rounded-lg transition-all duration-300 hover:shadow-[0_0_30px_rgba(201,169,97,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:scale-100 disabled:active:scale-100"
            >
              Search Vehicles
            </button>
          </div>
        )}

        {/* By the Hour Tab */}
        {activeTab === "hourly" && (
          <div className="space-y-4 animate-fade-in">
            <InputField
              icon={MapPin}
              label="Pickup"
              name="pickup-hr"
              value={pickupHourly}
              onChange={handlePickupChangeHourly}
              placeholder="Enter pickup location"
              disabled={FORM_READ_ONLY}
            />

            {showFlightHourly && (
              <div className="animate-slide-down overflow-hidden space-y-3">
                <InputField
                  icon={Plane}
                  label="Flight Number (Optional)"
                  name="flight-hr"
                  value={flightNumberHourly}
                  onChange={setFlightNumberHourly}
                  placeholder="e.g. SV123"
                  disabled={FORM_READ_ONLY}
                />
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    icon={MapPin}
                    label="Terminal No. (Optional)"
                    name="terminal-no-hr"
                    value={terminalNoHourly}
                    onChange={setTerminalNoHourly}
                    placeholder="e.g. T1, T2"
                    disabled={FORM_READ_ONLY}
                  />
                  <InputField
                    icon={MapPin}
                    label="Terminal Location (Optional)"
                    name="terminal-loc-hr"
                    value={terminalLocationHourly}
                    onChange={setTerminalLocationHourly}
                    placeholder="e.g. Arrivals"
                    disabled={FORM_READ_ONLY}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <InputField
                icon={Calendar}
                label="Date"
                name="date-hr"
                value={dateHourly}
                onChange={setDateHourly}
                placeholder=""
                type="date"
                disabled={FORM_READ_ONLY}
              />
              <InputField
                icon={Clock}
                label="Time"
                name="time-hr"
                value={timeHourly}
                onChange={setTimeHourly}
                placeholder=""
                type="time"
                disabled={FORM_READ_ONLY}
              />
            </div>

            <SelectField
              icon={Clock}
              label="Duration"
              name="duration-hr"
              value={duration}
              onChange={setDuration}
              placeholder="Select duration"
              options={[2, 4, 6, 8, 10, 12].map((h) => ({
                value: `${h}h`,
                label: `${h} Hours`,
              }))}
              disabled={FORM_READ_ONLY}
            />

            <button
              onClick={handleSearchHourly}
              disabled={FORM_READ_ONLY}
              className="w-full py-3.5 mt-2 bg-gradient-to-r from-[#C9A961] to-[#b89550] text-black font-semibold rounded-lg transition-all duration-300 hover:shadow-[0_0_30px_rgba(201,169,97,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:scale-100 disabled:active:scale-100"
            >
              Search Vehicles
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
