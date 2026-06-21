// ============================================
// !!! DESTINATION PATH: apps/server/src/utils/helpers/booking.helpers.ts
// ============================================
// ============================================
// apps/server/src/utils/helpers/booking.helpers.ts
// ============================================

export function formatStatusForUI(status: string): string {
  const statusMap: Record<string, string> = {
    PENDING: "Pending",
    ASSIGNMENT_OFFERED: "Pending",
    ASSIGNMENT_RE_OFFERED: "Pending",
    CONFIRMED: "Confirmed",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  return statusMap[status] || status;
}

export function formatVehicleClass(vehicleClass: string): string {
  const classMap: Record<string, string> = {
    ECONOMY_SEDAN: "Economy Sedan",
    BUSINESS_SEDAN: "Sedan",
    BUSINESS_SUV: "SUV",
    FIRST_CLASS: "First Class",
    ELECTRIC: "Electric",
    HIACE: "Hiace",
    COASTER: "Coaster",
    KING_LONG: "King Long",
  };
  return classMap[vehicleClass] || vehicleClass;
}

export function formatDate(date: Date | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${day} ${month}`;
}

// Builds the "vendor assignment" section that admin sees for each
// booking. Under the new offer model the booking moves through:
//   PENDING                  → no offer yet, "Pending Assignment"
//   ASSIGNMENT_OFFERED       → offer outstanding, "Awaiting Response"
//   ASSIGNMENT_RE_OFFERED    → price-bumped re-offer outstanding
//   CONFIRMED/IN_PROGRESS/COMPLETED → vendor accepted, full block shown
// Rejection history (from BookingAssignmentOffer rows) is surfaced
// regardless of current state so admin can see what's already been
// tried and the pool of remaining-eligible vendors shrinks.
export function buildVendorAssignment(
  booking: any,
  rejectionReasons: Array<any>,
  // Optional active PENDING offer row, with vendor relation included.
  // When passed in, this becomes the authoritative source for whether
  // the booking is in an "awaiting vendor response" state — taking
  // precedence over booking.status/vendorId, which can desync from
  // the offer table in real-world flows (the vendor reject endpoint
  // does its updates outside one transaction; alerts-settings auto-
  // assign updates the booking but never wrote a matching offer row
  // for a while; etc.). By keying off the offer row instead, the
  // helper stays correct even when the booking flags drifted.
  activeOffer?: {
    id: string;
    vendorId: string;
    attemptNumber: number;
    offeredAt: Date | null;
    payoutAmount: any;
    vendor: { id: string; companyName: string } | null;
  } | null,
): any {
  // 1. Confirmed/in-progress/completed. Booking has a vendor commitment
  //    that's already been accepted — show the assigned crew.
  if (
    booking.vendor &&
    ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status)
  ) {
    return {
      status: "confirmed",
      statusDisplay: "Vendor Confirmed",
      vendor: {
        id: booking.vendor.id,
        companyName: booking.vendor.companyName,
        rating: booking.vendor.rating,
      },
      driver: booking.driver
        ? {
            id: booking.driver.id,
            name: `${booking.driver.firstName} ${booking.driver.lastName}`,
            phone: booking.driver.phone,
          }
        : null,
      vehicle: booking.vehicle
        ? {
            id: booking.vehicle.id,
            plateNumber: booking.vehicle.plateNumber,
            name: `${booking.vehicle.make} ${booking.vehicle.model}`,
          }
        : null,
      vendorPayoutAmount: booking.vendorPayoutAmount
        ? Number(booking.vendorPayoutAmount)
        : null,
      rejectionHistory: rejectionReasons,
    };
  }

  // 2. Awaiting vendor response — authoritative branch.
  //    Prefer the activeOffer row (the actual DB truth about whether
  //    an offer is outstanding); fall back to the booking flags only
  //    if no offer info was passed in (older callers). The offer's
  //    own vendor relation is preferred over booking.vendor for the
  //    same reason — if booking.vendorId desynced to null but the
  //    offer still names a vendor, the admin needs to see who's
  //    holding the offer, not "no one".
  const awaitingFromOffer = activeOffer !== undefined && activeOffer !== null;
  const awaitingFromBookingFlags =
    !awaitingFromOffer &&
    booking.vendor &&
    (booking.status === "ASSIGNMENT_OFFERED" ||
      booking.status === "ASSIGNMENT_RE_OFFERED");

  if (awaitingFromOffer || awaitingFromBookingFlags) {
    const vendor = activeOffer?.vendor || booking.vendor;
    const isReOffer =
      activeOffer != null
        ? activeOffer.attemptNumber >= 2
        : booking.status === "ASSIGNMENT_RE_OFFERED";
    const payout =
      activeOffer?.payoutAmount != null
        ? Number(activeOffer.payoutAmount)
        : booking.vendorPayoutAmount
          ? Number(booking.vendorPayoutAmount)
          : null;
    return {
      status: "awaiting",
      statusDisplay: isReOffer
        ? "Awaiting Vendor Response (Re-offer)"
        : "Awaiting Vendor Response",
      vendor: vendor
        ? { id: vendor.id, companyName: vendor.companyName }
        : null,
      vendorPayoutAmount: payout,
      isReOffer,
      // Timestamp + attempt come straight off the offer row when
      // available — frontend uses these for the "Sent N hours ago"
      // line and the "attempt 2" caption on re-offers.
      offerSentAt: activeOffer?.offeredAt ?? null,
      offerAttemptNumber: activeOffer?.attemptNumber ?? null,
      rejectionHistory: rejectionReasons,
    };
  }

  // 3. No current commitment + prior rejections. Genuine
  //    "needs reassignment" state — only reachable now if there's
  //    really no active PENDING offer for the booking.
  if (rejectionReasons.length > 0) {
    const lastRejection = rejectionReasons[rejectionReasons.length - 1];
    return {
      status: "rejected",
      statusDisplay: "Needs Reassignment",
      rejectionReason: lastRejection?.reason || "Unknown",
      rejectedVendor:
        lastRejection?.vendorCompanyName ||
        lastRejection?.vendorName ||
        "Unknown",
      needsReassignment: true,
      rejectionHistory: rejectionReasons,
    };
  }

  // 4. Default: fresh booking, no offers yet.
  return {
    status: "pending",
    statusDisplay: "Pending Assignment",
    needsAssignment: true,
    rejectionHistory: rejectionReasons,
  };
}

// Timeline of states admin sees on the booking detail page.
// "Awaiting Reassignment" branches when the most recent action was a
// rejection and the booking is back to PENDING without a current vendor.
export function buildStatusTimeline(
  booking: any,
  rejectionReasons: Array<any>,
): Array<any> {
  const timeline: Array<any> = [];

  timeline.push({
    status: "Booking Created",
    date: formatDate(booking.createdAt),
    completed: true,
  });

  if (rejectionReasons.length > 0) {
    timeline.push({
      status: `Vendor Rejected (${rejectionReasons.length})`,
      date: null,
      completed: true,
    });

    // Booking sits back at PENDING after a rejection until admin
    // re-assigns or the cascade picks the next vendor.
    if (booking.status === "PENDING" && !booking.vendorId) {
      timeline.push({
        status: "Awaiting Reassignment",
        date: null,
        completed: false,
        actionNeeded: true,
      });
      return timeline;
    }
  }

  if (booking.vendorId) {
    timeline.push({
      status: "Assigned to Vendor",
      date: null,
      completed: true,
    });
  } else if (booking.status === "PENDING") {
    timeline.push({
      status: "Assigned to Vendor",
      date: null,
      completed: false,
    });
    return timeline;
  }

  if (booking.confirmedAt) {
    timeline.push({
      status: "Vendor Accepted",
      date: null,
      completed: true,
    });
  } else if (
    booking.status === "ASSIGNMENT_OFFERED" ||
    booking.status === "ASSIGNMENT_RE_OFFERED"
  ) {
    timeline.push({
      status:
        booking.status === "ASSIGNMENT_RE_OFFERED"
          ? "Vendor Re-offered"
          : "Vendor Accepted",
      date: null,
      completed: false,
    });
    return timeline;
  }

  if (booking.status === "CONFIRMED") {
    timeline.push({
      status: "Trip Pending",
      date: null,
      completed: false,
    });
  } else if (booking.status === "IN_PROGRESS") {
    timeline.push({
      status: "In Progress",
      date: null,
      completed: true,
    });
  } else if (booking.status === "COMPLETED") {
    timeline.push({
      status: "Completed",
      date: formatDate(booking.completedAt),
      completed: true,
    });
  }

  if (booking.status === "CANCELLED") {
    timeline.push({
      status: "Cancelled",
      date: null,
      completed: true,
    });
  }

  return timeline;
}

// Single-line status display for admin's booking list. Distinguishes
// the offer states so admin can see at a glance whether the booking
// is a first-time offer or a re-offer at a revised price.
export function getVendorStatusDisplay(booking: any): string {
  if (!booking.vendor) {
    return booking.status === "CANCELLED" ? "Cancelled" : "Pending Assignment";
  }

  if (booking.status === "ASSIGNMENT_OFFERED") {
    return "Awaiting Response";
  }
  if (booking.status === "ASSIGNMENT_RE_OFFERED") {
    return "Re-offered (Price Revised)";
  }
  if (["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status)) {
    return "Vendor Confirmed";
  }
  return "Pending Assignment";
}
