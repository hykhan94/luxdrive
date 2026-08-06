"use client";

// --------------------------------------------------------------
// Unified assignment + customer cards, shared by the admin, partner,
// and vendor booking-detail views so the three portals render driver,
// vehicle, and customer identically (and can't drift apart).
//
// Everything is driven off a normalized shape — each portal maps its
// own payload into these props and passes only what it's allowed to
// show (e.g. the partner can omit the driver phone). Fields left null
// degrade gracefully: no photo → avatar icon, no rating → hidden, etc.
// Portal-specific actions (vendor's WhatsApp / Add-to-Calendar) plug in
// through the `driverActions` slot rather than being baked in here.
// --------------------------------------------------------------

import type { ReactNode } from "react";
import { User, Phone, Star, Car, Mail, Users, Building2 } from "lucide-react";

export interface AssignmentDriver {
  name: string;
  phone?: string | null;
  photoUrl?: string | null;
  rating?: number | null;
}
export interface AssignmentVehicle {
  name: string; // e.g. "Mercedes S-Class"
  plateNumber?: string | null;
  year?: number | null;
  color?: string | null;
  seats?: number | null;
  category?: string | null;
}
export interface AssignmentCustomer {
  name: string;
  phone?: string | null;
  email?: string | null;
  partnerName?: string | null;
}

const cardCls =
  "rounded-xl border border-luxury-gold/20 bg-gradient-to-br from-luxury-gold/[0.04] to-transparent p-4";
const labelCls =
  "text-[10px] tracking-[0.2em] uppercase text-luxury-gold/80 mb-3 font-medium";
const humanize = (s?: string | null) =>
  s ? s.replace(/_/g, " ").toLowerCase() : "";

// Map common vehicle colour names to a display swatch colour. Mirrors the
// per-portal helper the vendor/partner panels used before this component.
function vehicleColorToCss(name: string): string {
  const map: Record<string, string> = {
    white: "#f5f5f5",
    "pearl white": "#f7f4ec",
    black: "#1a1a1a",
    "obsidian black": "#0a0a0a",
    silver: "#c5c5c5",
    "metallic silver": "#b8b8b8",
    gray: "#808080",
    grey: "#808080",
    "space gray": "#5a5a5a",
    red: "#b91c1c",
    "ruby red": "#9b1c1c",
    blue: "#1d4ed8",
    "navy blue": "#1e3a8a",
    navy: "#1e3a8a",
    gold: "#c9a961",
    champagne: "#e3d19c",
    beige: "#d9c5a0",
    brown: "#78350f",
    green: "#15803d",
  };
  return map[name.toLowerCase().trim()] ?? "#9ca3af";
}

export function DriverCard({
  driver,
  actions,
}: {
  driver?: AssignmentDriver | null;
  actions?: ReactNode;
}) {
  return (
    <div className={cardCls}>
      <p className={labelCls}>Driver</p>
      {driver ? (
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 border border-luxury-gold/30 flex items-center justify-center shrink-0">
            {driver.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={driver.photoUrl}
                alt={driver.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-luxury-gold/70" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-semibold text-white truncate">
              {driver.name}
            </h4>
            {driver.rating != null && (
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="w-3.5 h-3.5 text-luxury-gold fill-luxury-gold" />
                <span className="text-xs text-luxury-gold font-medium">
                  {Number(driver.rating).toFixed(1)}
                </span>
              </div>
            )}
            {driver.phone && (
              <a
                href={`tel:${driver.phone}`}
                className="inline-flex items-center gap-1.5 mt-2 text-sm text-gray-300 hover:text-luxury-gold transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                {driver.phone}
              </a>
            )}
            {actions && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {actions}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-gray-400 py-1">
          <div className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-sm text-gray-400">No driver assigned yet</p>
        </div>
      )}
    </div>
  );
}

export function VehicleCard({
  vehicle,
}: {
  vehicle?: AssignmentVehicle | null;
}) {
  const make = vehicle?.name?.trim().split(" ")[0] ?? "";
  const title = vehicle
    ? [vehicle.year, vehicle.name].filter(Boolean).join(" ")
    : "";
  const extra = vehicle
    ? [
        vehicle.seats ? `${vehicle.seats} seats` : null,
        humanize(vehicle.category) || null,
      ].filter(Boolean)
    : [];
  return (
    <div className={cardCls}>
      <p className={labelCls}>Vehicle</p>
      {vehicle ? (
        <div className="flex items-center gap-4">
          {/* Brand wordmark tile — make's first word in serif caps on a
              gold-tinted gradient, closer to how luxury marques present
              than a clip-art car icon. */}
          <div className="relative w-24 h-20 rounded-lg overflow-hidden shrink-0 bg-gradient-to-br from-luxury-gold/20 via-luxury-gold/5 to-neutral-900 border border-luxury-gold/30 flex items-center justify-center">
            {make ? (
              <span
                className="relative font-serif text-base tracking-tight text-luxury-gold uppercase leading-none"
                style={{ letterSpacing: "-0.02em" }}
              >
                {make.slice(0, 8)}
              </span>
            ) : (
              <Car className="relative w-8 h-8 text-luxury-gold" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-semibold text-white truncate">
              {title}
            </h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
              {vehicle.color && (
                <>
                  <span className="flex items-center gap-1.5 text-gray-300">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-gray-500/50 shadow-inner"
                      style={{
                        backgroundColor: vehicleColorToCss(vehicle.color),
                      }}
                      aria-hidden
                    />
                    {vehicle.color}
                  </span>
                  {vehicle.plateNumber && (
                    <span className="text-gray-600">•</span>
                  )}
                </>
              )}
              {vehicle.plateNumber && (
                <span className="font-mono tracking-wider text-luxury-gold">
                  {vehicle.plateNumber}
                </span>
              )}
            </div>
            {extra.length > 0 && (
              <p className="text-xs text-gray-400 mt-1 capitalize">
                {extra.join(" · ")}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-gray-400 py-1">
          <div className="w-24 h-20 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
            <Car className="w-7 h-7 text-gray-500" />
          </div>
          <p className="text-sm text-gray-400">No vehicle assigned yet</p>
        </div>
      )}
    </div>
  );
}

export function CustomerCard({ customer }: { customer: AssignmentCustomer }) {
  return (
    <div className={cardCls}>
      <p className={labelCls}>Customer</p>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-neutral-800 border border-luxury-gold/30 flex items-center justify-center shrink-0">
          <User className="w-6 h-6 text-luxury-gold/70" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <h4 className="text-base font-semibold text-white truncate">
            {customer.name}
          </h4>
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-luxury-gold transition-colors"
            >
              <Phone className="w-3.5 h-3.5 shrink-0" />
              {customer.phone}
            </a>
          )}
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-luxury-gold transition-colors truncate"
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{customer.email}</span>
            </a>
          )}
          {customer.partnerName && (
            <div className="flex items-center gap-1.5 text-sm text-purple-300">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              {customer.partnerName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Convenience wrapper: render whichever cards have data, in a stack.
export default function AssignmentCards({
  driver,
  vehicle,
  customer,
  driverActions,
  includeDriver = true,
  includeVehicle = true,
  includeCustomer = true,
}: {
  driver?: AssignmentDriver | null;
  vehicle?: AssignmentVehicle | null;
  customer?: AssignmentCustomer | null;
  driverActions?: ReactNode;
  includeDriver?: boolean;
  includeVehicle?: boolean;
  includeCustomer?: boolean;
}) {
  return (
    <div className="space-y-3">
      {includeCustomer && customer && <CustomerCard customer={customer} />}
      {includeDriver && <DriverCard driver={driver} actions={driverActions} />}
      {includeVehicle && <VehicleCard vehicle={vehicle} />}
    </div>
  );
}
