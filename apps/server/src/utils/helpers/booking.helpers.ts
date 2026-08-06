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

// Same as formatDate but with the clock time appended, e.g.
// "31 Jul, 2:45 PM". Every journey milestone that has actually
// happened carries one of these so the timeline reads with real
// timestamps, not just a bare day.
export function formatDateTime(date: Date | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  const time = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} ${month}, ${time}`;
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
            photoUrl: booking.driver.photoUrl ?? null,
            rating: booking.driver.rating ?? null,
          }
        : booking.temporaryDriver
          ? {
              id: booking.temporaryDriver.id,
              name: `${booking.temporaryDriver.name} (temporary)`,
              phone: booking.temporaryDriver.mobile,
              photoUrl: booking.temporaryDriver.photoUrl ?? null,
              rating: null,
            }
          : null,
      vehicle: booking.vehicle
        ? {
            id: booking.vehicle.id,
            plateNumber: booking.vehicle.plateNumber,
            name: `${booking.vehicle.make} ${booking.vehicle.model}`,
            year: booking.vehicle.year ?? null,
            color: booking.vehicle.color ?? null,
            seats: booking.vehicle.seats ?? null,
            category: booking.vehicle.category ?? null,
          }
        : booking.temporaryVehicle
          ? {
              id: booking.temporaryVehicle.id,
              plateNumber: null,
              name: `${booking.temporaryVehicle.model} (temporary)`,
              year: null,
              color: null,
              seats: null,
              category: booking.temporaryVehicle.vehicleClass,
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
  awaitingReassignment = false,
  assignedAt: Date | null = null,
): Array<any> {
  // The JOURNEY only — the intended happy path:
  //   Booking Created -> Assigned to Vendor -> Vendor Accepted ->
  //   Trip Started -> Trip Completed
  // Ad-hoc edits (partner/admin/vendor field changes, driver/vehicle
  // swaps) are deliberately NOT shown here; they live in the separate
  // change-history card so the two aren't tangled together. Each step
  // that has actually happened carries a real date + time.
  const timeline: Array<any> = [];
  const status = booking.status;

  timeline.push({
    status: "Booking Created",
    date: formatDateTime(booking.createdAt),
    completed: true,
  });

  // Terminal path: a cancelled booking stops here.
  if (status === "CANCELLED") {
    timeline.push({
      status: "Cancelled",
      date: formatDateTime(booking.cancelledAt),
      completed: true,
      actionNeeded: true,
    });
    return timeline;
  }

  // A change released the booking (or a rejection sent it back), so it's
  // sitting with admin to re-assign — a meaningful branch off the path.
  const needsReassignment =
    awaitingReassignment ||
    (rejectionReasons.length > 0 && status === "PENDING" && !booking.vendorId);
  if (needsReassignment) {
    timeline.push({
      status: "Assigned to Vendor",
      date: formatDateTime(assignedAt),
      completed: true,
    });
    timeline.push({
      status: "Awaiting Reassignment",
      date: null,
      completed: false,
      actionNeeded: true,
      detail:
        "Booking details changed — assign a vendor that serves the new selection.",
    });
    return timeline;
  }

  const everAssigned =
    Boolean(booking.vendorId) ||
    Boolean(booking.confirmedAt) ||
    [
      "ASSIGNMENT_OFFERED",
      "ASSIGNMENT_RE_OFFERED",
      "CONFIRMED",
      "IN_PROGRESS",
      "COMPLETED",
    ].includes(status);
  const accepted =
    Boolean(booking.confirmedAt) ||
    ["IN_PROGRESS", "COMPLETED"].includes(status);
  const started = ["IN_PROGRESS", "COMPLETED"].includes(status);
  const completed = status === "COMPLETED";

  timeline.push({
    status: "Assigned to Vendor",
    date: everAssigned ? formatDateTime(assignedAt) : null,
    completed: everAssigned,
    current: !everAssigned && status === "PENDING",
  });

  timeline.push({
    status: "Vendor Accepted",
    date: accepted ? formatDateTime(booking.confirmedAt) : null,
    completed: accepted,
    current: !accepted && everAssigned,
  });

  timeline.push({
    status: "Trip Started",
    date: null,
    completed: started,
    current: !started && accepted,
  });

  timeline.push({
    status: "Trip Completed",
    date: completed ? formatDateTime(booking.completedAt) : null,
    completed,
    current: false,
  });

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
