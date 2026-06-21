// ============================================
// !!! DESTINATION PATH: apps/server/src/utils/helpers/po.helpers.ts
// ============================================
// ============================================
// apps/server/src/utils/helpers/po.helpers.ts
// ============================================
//
// Shared Purchase Order HTML builder. Used by:
//   - apps/server/src/controller/partner/bookings.controller.ts
//     (downloadBookingPO — partner downloads PO for their own booking)
//   - apps/server/src/controller/admin/booking.controller.ts
//     (downloadBookingPO — admin downloads PO for any booking)
//
// The PO format is identical across both callers. The only branch is
// whether a partner is associated with the booking:
//   - Partner-routed → "Partner Information" section is shown
//   - Direct customer → that section is omitted; the document leads
//     straight to Customer Information
//
// Trip-type tailoring (Service Window for HOURLY, Trip Details for
// ONE_WAY) is identical regardless of who downloaded it.

const PO_STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting Driver/Vehicle Assignment",
  ASSIGNMENT_OFFERED: "Awaiting Driver/Vehicle Assignment",
  ASSIGNMENT_RE_OFFERED: "Awaiting Driver/Vehicle Assignment",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const VEHICLE_CLASS_LABELS_PO: Record<string, string> = {
  ECONOMY_SEDAN: "Economy Sedan",
  BUSINESS_SEDAN: "Business Sedan",
  FIRST_CLASS: "First Class",
  BUSINESS_SUV: "Business SUV",
  HIACE: "Hiace (10-Seater)",
  COASTER: "Coaster (23-Seater)",
  KING_LONG: "King Long (49-Seater)",
  ELECTRIC: "Electric",
};

const CITY_LABELS_PO: Record<string, string> = {
  RIYADH: "Riyadh",
  JEDDAH: "Jeddah",
  MAKKAH: "Makkah",
  MADINAH: "Madinah",
};

function formatTripTypeLabel(tripType: string): string {
  return tripType === "HOURLY" ? "By the Hour" : "One Way";
}

// Compute approximate end-of-service for HOURLY bookings.
// startTime is "HH:MM" 24h. Returns null on malformed input so the
// caller falls back to omitting the line gracefully.
function computeServiceEnd(
  tripDate: Date,
  startTime: string,
  hours: number | null,
): { time: string; sameDay: boolean } | null {
  if (!hours || hours <= 0 || !startTime) return null;
  const [hh, mm] = startTime.split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const start = new Date(tripDate);
  start.setHours(hh, mm, 0, 0);
  const end = new Date(start.getTime() + hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const sameDay =
    end.getDate() === start.getDate() && end.getMonth() === start.getMonth();
  return {
    time: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    sameDay,
  };
}

/**
 * Build the Purchase Order HTML.
 *
 * @param booking  Prisma booking row with vendor/driver/vehicle relations
 *                 included. `hourlyDuration` is read if present.
 * @param partner  The partner row for partner-routed bookings, or null
 *                 for direct customer bookings. When null, the Partner
 *                 Information section is omitted entirely.
 */
// Perspective of the party downloading the PO. Determines which
// counterparty sections render: partner and vendor are mutually
// invisible to each other, only admin sees everything.
//   "admin"   → Partner Information AND Vendor Information visible
//   "partner" → Partner Information visible, Vendor Information HIDDEN
//   "vendor"  → Vendor Information visible, Partner Information HIDDEN
// The "Direct customer" header tag is also admin-only — vendor (and
// partner, though it doesn't normally apply) should not learn from
// the document whether a booking was routed through a partner.
export type POPerspective = "admin" | "partner" | "vendor";

export function buildPOHtml(
  booking: any,
  partner: any | null,
  perspective: POPerspective = "admin",
): string {
  const isHourly = booking.tripType === "HOURLY";
  const hasPartner = !!partner;
  // Visibility gates based on caller perspective. The data may exist
  // (partner is set, vendor is assigned) but we still suppress the
  // section if the viewer shouldn't see the counterparty.
  const showPartnerSection =
    hasPartner && (perspective === "admin" || perspective === "partner");
  const showVendorSection =
    !!booking.vendor && (perspective === "admin" || perspective === "vendor");
  // "Direct customer" header tag — admin-only. Showing this to a
  // vendor would leak whether a booking is partner-routed; partners
  // never see it because their own bookings are always partner-
  // routed (hasPartner always true on partner side).
  const showSourceTag = perspective === "admin" && !hasPartner;

  const basePrice = Number(booking.basePrice);
  const vatAmount = Number(booking.vatAmount);
  const totalPrice = Number(booking.totalPrice);
  const peakMultiplier = Number(booking.peakMultiplier);
  const peakSurcharge = basePrice - basePrice / peakMultiplier;

  const tripDateObj = new Date(booking.tripDate);
  const tripDate = tripDateObj.toLocaleDateString("en-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const createdDate = new Date(booking.createdAt).toLocaleDateString("en-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const driverInfo = booking.driver
    ? `${booking.driver.firstName} ${booking.driver.lastName} — ${booking.driver.phone}`
    : "Not yet assigned";

  const vehicleInfo = booking.vehicle
    ? `${booking.vehicle.make} ${booking.vehicle.model} ${booking.vehicle.year} (${booking.vehicle.plateNumber}) — ${booking.vehicle.color || ""}`
    : "Not yet assigned";

  const tripTypeLabel = formatTripTypeLabel(booking.tripType);
  const vehicleClassLabel =
    VEHICLE_CLASS_LABELS_PO[booking.vehicleClass] || booking.vehicleClass;
  const cityLabel = CITY_LABELS_PO[booking.city] || booking.city;

  // Trip details section body — branches on trip type.
  // HOURLY: Service Window (duration / starts / approx end / pickup only)
  // ONE_WAY: Trip Details (route + pickup + drop-off)
  let tripDetailsBody: string;

  if (isHourly) {
    const serviceEnd = computeServiceEnd(
      tripDateObj,
      booking.tripTime,
      booking.hours,
    );
    const endLine = serviceEnd
      ? `${serviceEnd.time}${serviceEnd.sameDay ? "" : " (next day)"}`
      : "—";
    const durationLine =
      booking.hourlyDuration ||
      (booking.hours
        ? `${booking.hours} hour${booking.hours === 1 ? "" : "s"}`
        : "—");
    tripDetailsBody = `
      <div class="grid">
        <div class="field"><div class="field-label">Trip Type</div><div class="field-value">By the Hour</div></div>
        <div class="field"><div class="field-label">Service City</div><div class="field-value">${cityLabel}</div></div>
        <div class="field"><div class="field-label">Duration</div><div class="field-value">${durationLine}</div></div>
        <div class="field"><div class="field-label">Service Date</div><div class="field-value">${tripDate}</div></div>
        <div class="field"><div class="field-label">Starts</div><div class="field-value">${booking.tripTime}</div></div>
        <div class="field"><div class="field-label">Ends (approx.)</div><div class="field-value">${endLine}</div></div>
      </div>
      <div class="field" style="margin-top: 10px;">
        <div class="field-label">Pickup Location</div>
        <div class="field-value">${booking.pickupAddress}</div>
      </div>
      <p style="font-size: 11px; color: #999; margin-top: 6px; font-style: italic;">
        No fixed drop-off — driver remains on standby for the booked duration.
      </p>
      ${
        booking.flightNumber
          ? `<p style="font-size: 12px; color: #666; margin-top: 8px;">Flight: ${booking.flightNumber}${(booking as any).terminalNo ? ` · Terminal ${(booking as any).terminalNo}` : ""}</p>`
          : ""
      }
    `;
  } else {
    tripDetailsBody = `
      <div class="grid">
        <div class="field"><div class="field-label">Trip Type</div><div class="field-value">One Way</div></div>
        <div class="field"><div class="field-label">City</div><div class="field-value">${cityLabel}</div></div>
        <div class="field"><div class="field-label">Route</div><div class="field-value">${booking.route || "—"}</div></div>
        <div class="field"><div class="field-label">Date & Time</div><div class="field-value">${tripDate} at ${booking.tripTime}</div></div>
      </div>
      <div class="grid" style="margin-top: 10px;">
        <div class="field"><div class="field-label">Pickup</div><div class="field-value">${booking.pickupAddress}</div></div>
        <div class="field"><div class="field-label">Drop-off</div><div class="field-value">${booking.dropoffAddress || "—"}</div></div>
      </div>
      ${
        booking.flightNumber
          ? `<p style="font-size: 12px; color: #666; margin-top: 8px;">Flight: ${booking.flightNumber}${(booking as any).terminalNo ? ` · Terminal ${(booking as any).terminalNo}` : ""}</p>`
          : ""
      }
    `;
  }

  const pricingDescription = isHourly
    ? `By the Hour Service — ${vehicleClassLabel} · ${booking.hours || "?"} hour${booking.hours === 1 ? "" : "s"}`
    : `Base Fare — ${vehicleClassLabel} · ${booking.route || `${booking.pickupAddress} → ${booking.dropoffAddress}`}`;

  // Customer info uses guest fields if no linked customer (direct
  // landing-page bookings keep guest details inline).
  const customerName = booking.customer?.name || booking.guestName || "—";
  const customerPhone = booking.customer?.phone || booking.guestPhone || "—";
  const customerEmail = booking.customer?.email || booking.guestEmail || "—";

  // Partner section is conditional — only present when the booking
  // was routed through a partner. For direct bookings the document
  // leads straight into Customer Information.
  const partnerSection = showPartnerSection
    ? `
  <div class="section">
    <div class="section-title"><span>Partner Information</span></div>
    <div class="grid">
      <div class="field"><div class="field-label">Company</div><div class="field-value">${partner.companyName}</div></div>
      <div class="field"><div class="field-label">CR Number</div><div class="field-value">${partner.crNumber || "—"}</div></div>
      <div class="field"><div class="field-label">VAT Number</div><div class="field-value">${partner.vatNumber || "—"}</div></div>
      <div class="field"><div class="field-label">Contact</div><div class="field-value">${partner.contactPerson || "—"} — ${partner.contactPhone || "—"}</div></div>
    </div>
  </div>`
    : "";

  // Vendor block mirrors the partner block shape (Company / CR / VAT /
  // Contact / optional Address) so the three parties on a PO — buyer
  // (partner or direct customer), guest (rider), and service provider
  // (vendor) — read with consistent typography. Omitted entirely when
  // no vendor has been assigned yet; the absence of this section is
  // itself the signal that admin still needs to dispatch. (The single
  // "Vendor" line was previously buried inside the Vehicle & Driver
  // block, which made the contractually-relevant info read as an
  // asset-metadata footnote. Promoted to its own section to match
  // its importance on a purchase order.)
  const vendorSection = showVendorSection
    ? `
  <div class="section">
    <div class="section-title"><span>Vendor Information</span></div>
    <div class="grid">
      <div class="field"><div class="field-label">Company</div><div class="field-value">${booking.vendor.companyName}</div></div>
      <div class="field"><div class="field-label">CR Number</div><div class="field-value">${booking.vendor.crNumber || "—"}</div></div>
      <div class="field"><div class="field-label">VAT Number</div><div class="field-value">${booking.vendor.vatNumber || "—"}</div></div>
      <div class="field"><div class="field-label">Contact</div><div class="field-value">${booking.vendor.contactPerson || "—"} — ${booking.vendor.contactPhone || "—"}</div></div>
      ${
        booking.vendor.address
          ? `<div class="field" style="grid-column: span 2;"><div class="field-label">Address</div><div class="field-value">${booking.vendor.address}</div></div>`
          : ""
      }
    </div>
  </div>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Purchase Order — ${booking.bookingRef}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #c8a961; padding-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 800; color: #c8a961; letter-spacing: 1px; }
    .logo span { color: #333; }
    .po-info { text-align: right; }
    .po-info h2 { font-size: 20px; color: #333; margin-bottom: 4px; }
    .po-info p { font-size: 12px; color: #666; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 13px; font-weight: 700; color: #c8a961; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .field { margin-bottom: 6px; }
    .field-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { font-size: 14px; color: #1a1a1a; font-weight: 500; }
    .pricing-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .pricing-table th { text-align: left; font-size: 11px; color: #999; text-transform: uppercase; padding: 8px 12px; border-bottom: 1px solid #e5e5e5; }
    .pricing-table td { padding: 8px 12px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
    .pricing-table .total-row td { border-top: 2px solid #c8a961; font-weight: 700; font-size: 16px; color: #c8a961; }
    .pricing-table .amount { text-align: right; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .status-PENDING { background: #fef3c7; color: #92400e; }
    .status-ASSIGNMENT_OFFERED { background: #fef3c7; color: #92400e; }
    .status-ASSIGNMENT_RE_OFFERED { background: #fef3c7; color: #92400e; }
    .status-CONFIRMED { background: #d1fae5; color: #065f46; }
    .status-COMPLETED { background: #dbeafe; color: #1e40af; }
    .status-CANCELLED { background: #fee2e2; color: #991b1b; }
    .status-IN_PROGRESS { background: #e0e7ff; color: #3730a3; }
    .trip-type-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0; }
    .trip-type-HOURLY { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
    .trip-type-ONE_WAY { background: #ccfbf1; color: #115e59; border: 1px solid #5eead4; }
    .source-tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 500; background: #f3f4f6; color: #6b7280; margin-left: 8px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #999; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">LUX<span>DRIVE</span></div>
      <p style="font-size: 12px; color: #666; margin-top: 4px;">Premium Chauffeur Services</p>
    </div>
    <div class="po-info">
      <h2>Purchase Order</h2>
      <p><strong>${booking.bookingRef}</strong>${showSourceTag ? '<span class="source-tag">Direct customer</span>' : ""}</p>
      <p>Date: ${createdDate}</p>
      <p style="margin-top: 6px;">
        <span class="trip-type-badge trip-type-${booking.tripType}">${tripTypeLabel}</span>
        <span class="status-badge status-${booking.status}" style="margin-left: 4px;">${PO_STATUS_LABELS[booking.status] || booking.status}</span>
      </p>
    </div>
  </div>
  ${partnerSection}

  <div class="section">
    <div class="section-title"><span>Customer Information</span></div>
    <div class="grid">
      <div class="field"><div class="field-label">Guest Name</div><div class="field-value">${customerName}</div></div>
      <div class="field"><div class="field-label">Phone</div><div class="field-value">${customerPhone}</div></div>
      <div class="field"><div class="field-label">Email</div><div class="field-value">${customerEmail}</div></div>
    </div>
  </div>

  ${vendorSection}

  <div class="section">
    <div class="section-title">
      <span>${isHourly ? "Service Window" : "Trip Details"}</span>
      <span class="trip-type-badge trip-type-${booking.tripType}">${tripTypeLabel}</span>
    </div>
    ${tripDetailsBody}
  </div>

  <div class="section">
    <div class="section-title"><span>Vehicle &amp; Driver</span></div>
    <div class="grid">
      <div class="field"><div class="field-label">Vehicle Class</div><div class="field-value">${vehicleClassLabel} (${booking.passengers} pax)</div></div>
      <div class="field"><div class="field-label">Assigned Vehicle</div><div class="field-value">${vehicleInfo}</div></div>
      <div class="field"><div class="field-label">Driver</div><div class="field-value">${driverInfo}</div></div>
      ${
        // Vendor row in Vehicle & Driver renders only when:
        //   (a) no vendor has been assigned yet (the dedicated Vendor
        //       Information section is omitted anyway, so we keep
        //       this fallback line so the document isn't silent on
        //       vendor status), AND
        //   (b) the perspective is allowed to see vendor info at all
        //       (admin/vendor — never partner).
        // For partner perspective, vendor identity is hidden whether
        // assigned or not, so this line is suppressed regardless.
        !booking.vendor && (perspective === "admin" || perspective === "vendor")
          ? `<div class="field"><div class="field-label">Vendor</div><div class="field-value">Not yet assigned</div></div>`
          : ""
      }
    </div>
  </div>

  <div class="section">
    <div class="section-title"><span>Pricing</span></div>
    <table class="pricing-table">
      <thead><tr><th>Description</th><th class="amount">Amount (SAR)</th></tr></thead>
      <tbody>
        <tr><td>${pricingDescription}</td><td class="amount">${(basePrice / peakMultiplier).toFixed(2)}</td></tr>
        ${peakMultiplier > 1 ? `<tr><td>Peak Pricing Surcharge (×${peakMultiplier})</td><td class="amount">${peakSurcharge.toFixed(2)}</td></tr>` : ""}
        <tr><td>VAT (15%)</td><td class="amount">${vatAmount.toFixed(2)}</td></tr>
        <tr class="total-row"><td>Total</td><td class="amount">SAR ${totalPrice.toFixed(2)}</td></tr>
      </tbody>
    </table>
  </div>

  ${booking.notes ? `<div class="section"><div class="section-title"><span>Notes</span></div><p style="font-size: 13px; color: #666;">${booking.notes}</p></div>` : ""}

  <div class="footer">
    <p>LuxDrive — Premium Chauffeur Services, Kingdom of Saudi Arabia</p>
    <p>This is a system-generated purchase order. For inquiries, contact your account manager.</p>
  </div>
</body>
</html>`;
}
