// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/public/trip.controller.ts
// ============================================
// ============================================
// apps/server/src/controller/public/trip.controller.ts
//
// Public, no-auth endpoint that backs the customer-facing trip card
// page at luxdriveksa.com/trip/{shareToken}. The link is delivered
// over WhatsApp from the partner portal; the customer taps it and
// sees a polished mobile confirmation: driver photo as hero, vehicle
// details, trip schedule, route, calendar add-button.
//
// Access model
// ------------
// Authorization is the *opacity of the token itself* — shareToken is
// a 128-bit UUID generated at booking creation, infeasible to
// enumerate. We deliberately do NOT take cookies/session here so the
// link works for guests who have never visited the platform before
// (the common case — the customer is whoever the partner booked the
// ride for).
//
// What the customer sees vs. doesn't see
// --------------------------------------
// The customer's experience is LuxDrive-branded only. Even when a
// partner booked the trip, the customer never sees the partner's
// name on this surface (and never sees the vendor's either —
// "LuxDrive" is the service brand they're paying for; the vendor
// fulfillment relationship is invisible to them). Pricing, internal
// notes, vendor/partner identity, audit metadata — all stripped.
//
// Time gate
// ---------
// shareToken lives on the row permanently so old WhatsApp links
// stay readable for a while, but we refuse to render once trip_date
// is more than 30 days in the past. After that the page returns
// 410 Gone and the frontend shows a "this trip is no longer
// available" state. This keeps stale links from indefinitely
// exposing driver photos and bookings information.
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError } from "../../utils/AppError";
import { getReadUrl } from "../../lib/gcs";

const TRIP_CARD_EXPIRY_DAYS = 30;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending Confirmation",
  ASSIGNMENT_OFFERED: "Pending Confirmation",
  ASSIGNMENT_RE_OFFERED: "Pending Confirmation",
  CONFIRMED: "Confirmed",
  EN_ROUTE_TO_PICKUP: "Driver En Route",
  ARRIVED_AT_PICKUP: "Driver Arrived",
  IN_TRANSIT: "In Transit",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const getPublicTrip = asyncWrapper(
  async (req: Request, res: Response) => {
    const { token } = req.params;

    // No 404 lookups by ID — only by shareToken. Anyone hitting this
    // endpoint without a valid token gets a generic NotFound, no
    // database probing surface.
    if (!token || token.length < 16) {
      throw new NotFoundError("Trip");
    }

    const booking = await prisma.booking.findFirst({
      where: {
        // Cast: the generated Prisma client picks up `shareToken`
        // automatically once `prisma generate` runs after the
        // schema migration. The cast keeps this file compiling in
        // environments where the regenerated types haven't landed
        // yet; safe at runtime because Prisma trusts whatever
        // where-keys it's given.
        shareToken: token,
      } as any,
      include: {
        driver: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
            rating: true,
          },
        },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            plateNumber: true,
            color: true,
            category: true,
          },
        },
        // Deliberately NOT including partner or vendor relations —
        // the customer view doesn't reveal either identity. LuxDrive
        // is the only brand on this surface.
      },
    });

    if (!booking) {
      throw new NotFoundError("Trip");
    }

    // Time gate — 30 days after trip date and we no longer serve
    // the trip card. The status code (410 Gone) tells the frontend
    // to show the "this trip is no longer available" state, which
    // is meaningfully different from a 404 (the link itself was
    // valid, the booking just aged out). We still return a minimal
    // payload — bookingRef + tripDate — so the frontend can show
    // a friendly "your trip on {date} has concluded" rather than a
    // hard error page.
    const tripDate = new Date(booking.tripDate);
    const expiresAt = new Date(tripDate);
    expiresAt.setDate(expiresAt.getDate() + TRIP_CARD_EXPIRY_DAYS);
    if (Date.now() > expiresAt.getTime()) {
      return res.status(410).json({
        success: false,
        expired: true,
        data: {
          bookingRef: booking.bookingRef,
          tripDate: booking.tripDate,
        },
      });
    }

    // Sign the driver's photo for client-side rendering. Same
    // pattern as the partner detail handler — DB stores raw GCS
    // object paths; the browser can't load them directly, so we
    // mint a short-lived signed URL that the frontend can pipe
    // through the resize proxy.
    const driverPhotoReadUrl = booking.driver?.photoUrl
      ? await getReadUrl(booking.driver.photoUrl)
      : null;

    res.json({
      success: true,
      data: {
        bookingRef: booking.bookingRef,
        status: booking.status,
        statusLabel: STATUS_LABELS[booking.status] || booking.status,

        // Customer info — first name only for the greeting unless
        // the full name is short. Phone is NOT returned: it's the
        // customer's OWN number; they don't need it shown back to
        // them, and not echoing it limits what a leaked token can
        // expose.
        customer: {
          name: booking.guestName || "",
        },

        // Trip details — everything the customer needs to know
        // where, when, and how. Coordinates are returned so the
        // frontend can render a static map preview and a
        // tap-through to Google Maps using the shared booking-share
        // lib.
        trip: {
          tripType: booking.tripType,
          city: booking.city,
          hours: booking.hours,
          pickupAddress: booking.pickupAddress,
          pickupLat: booking.pickupLat ? Number(booking.pickupLat) : null,
          pickupLng: booking.pickupLng ? Number(booking.pickupLng) : null,
          dropoffAddress: booking.dropoffAddress,
          dropoffLat: booking.dropoffLat ? Number(booking.dropoffLat) : null,
          dropoffLng: booking.dropoffLng ? Number(booking.dropoffLng) : null,
          tripDate: booking.tripDate,
          tripTime: booking.tripTime,
          flightNumber: booking.flightNumber || null,
          terminalNo: (booking as any).terminalNo || null,
        },

        // Driver — name + signed photo URL + phone (so the customer
        // can call the driver directly if needed) + rating. This is
        // the centerpiece of the trip card. When the driver isn't
        // assigned yet, frontend shows a tasteful "details will
        // appear shortly" placeholder instead of a broken avatar.
        driver: booking.driver
          ? {
              name: `${booking.driver.firstName} ${booking.driver.lastName}`,
              phone: booking.driver.phone,
              photoUrl: driverPhotoReadUrl,
              rating: booking.driver.rating
                ? Number(booking.driver.rating)
                : null,
            }
          : null,

        // Vehicle — what to look for at pickup. Customer recognizes
        // the make/model/color/plate combination when their ride
        // arrives. Vehicle category included so frontend can render
        // the appropriate brand wordmark / styling tier.
        vehicle: booking.vehicle
          ? {
              make: booking.vehicle.make,
              model: booking.vehicle.model,
              year: booking.vehicle.year,
              plateNumber: booking.vehicle.plateNumber,
              color: booking.vehicle.color,
              category: booking.vehicle.category,
            }
          : null,

        // NOT returned by design:
        //   - partner identity (booking.partnerId, partner.companyName)
        //   - vendor identity (booking.vendor.companyName)
        //   - pricing (basePrice, totalPrice, etc.)
        //   - notes (internal)
        //   - createdAt / confirmedAt timestamps (audit, not customer)
      },
    });
  },
);
