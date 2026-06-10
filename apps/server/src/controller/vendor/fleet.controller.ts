// ============================================
// apps/server/src/controller/vendor/fleet.controller.ts
// Vendor Portal — Fleet Management
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
// ============== GCS SETUP ==============

// ============== HELPERS ==============

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!vendor) throw new NotFoundError("Vendor profile");
  return vendor;
}

// Vehicle category labels
const VEHICLE_CLASS_LABELS: Record<string, string> = {
  ECONOMY_SEDAN: "Economy Sedan",
  BUSINESS_SEDAN: "Business Sedan",
  FIRST_CLASS: "First Class",
  BUSINESS_SUV: "Business SUV",
  ELECTRIC: "Electric",
  HIACE: "Hiace",
  COASTER: "Coaster",
  KING_LONG: "King Long",
};

// Hard-coded vehicle catalog — loaded from JSON at src/data/vehicle-catalog.json.
// Edit that file directly (no code change needed) to add/remove makes and models.
import vehicleCatalogData from "../../data/vehicle-catalog.json";
import { requireOperational, requireApprovedAndDocsValid } from "./_shared";

type CatalogModel = {
  model: string;
  classes: string[];
  minYear: number;
  maxYear: number;
  defaultSeats: number;
};
type CatalogMake = { make: string; models: CatalogModel[] };

const VEHICLE_CATALOG: CatalogMake[] = (
  vehicleCatalogData as { makes: CatalogMake[] }
).makes;

// Vehicle status labels
const VEHICLE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Active",
  UNDER_MAINTENANCE: "Under Maintenance",
  CHANGES_REQUESTED: "Changes Requested",
  UNDER_REVIEW: "Under Review",
  EXPIRED_DOCS: "Documents Expired",
};

// Required vehicle document types
const REQUIRED_VEHICLE_DOCUMENTS = [
  "NUMBER_PLATE_FRONT",
  "NUMBER_PLATE_BACK",
  "PHOTO_FRONT",
  "PHOTO_BACK",
  "PHOTO_LEFT",
  "PHOTO_RIGHT",
  "PHOTO_INTERIOR_FRONT",
  "PHOTO_INTERIOR_BACK",
  "ODOMETER",
  "INSURANCE",
  "ISTIMARA",
] as const;

const DOCUMENT_LABELS: Record<string, string> = {
  NUMBER_PLATE_FRONT: "Number Plate (Front)",
  NUMBER_PLATE_BACK: "Number Plate (Back)",
  PHOTO_FRONT: "Vehicle Photo (Front)",
  PHOTO_BACK: "Vehicle Photo (Back)",
  PHOTO_LEFT: "Vehicle Photo (Left Side)",
  PHOTO_RIGHT: "Vehicle Photo (Right Side)",
  PHOTO_INTERIOR_FRONT: "Interior (Front)",
  PHOTO_INTERIOR_BACK: "Interior (Back)",
  ODOMETER: "Odometer Reading",
  INSURANCE: "Car Insurance",
  ISTIMARA: "Car Registration / Istimara",
};

// Documents that require expiry dates
const DOCUMENTS_WITH_EXPIRY = ["INSURANCE", "ISTIMARA"];

// ============== VEHICLE CATALOG ==============

/**
 * GET /api/v1/vendor/fleet/catalog?category=BUSINESS_SEDAN
 *
 * Returns the hard-coded list of makes + models available for a given category.
 * The frontend uses this to populate the make/model dropdowns when the vendor
 * picks a vehicle category in the Add Vehicle flow. If `category` is omitted,
 * the full catalog is returned.
 */
export const getVehicleCatalog = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const category = req.query.category as string | undefined;

    let makes: CatalogMake[];
    if (category) {
      // Filter each make's models to only those that serve this category.
      // Drop makes that end up with zero models.
      makes = VEHICLE_CATALOG.map((m) => ({
        make: m.make,
        models: m.models.filter((mod) => mod.classes.includes(category)),
      })).filter((m) => m.models.length > 0);
    } else {
      makes = VEHICLE_CATALOG;
    }

    res.json({
      success: true,
      data: { makes },
    });
  },
);

// ============== LIST VEHICLES ==============

/**
 * GET /api/v1/vendor/fleet
 *
 * List all vehicles with optional category filter and search.
 * Search: brand, model, plate number
 * Filter: vehicle category (ECONOMY_SEDAN, BUSINESS_SEDAN, etc.)
 */
export const getVehiclesList = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { page = "1", limit = "20", category, search, status } = req.query;

    const where: any = { vendorId: vendor.id };

    if (category && category !== "all") {
      where.category = category;
    }

    if (status && status !== "all") {
      where.status = status as string;
    }

    if (search) {
      const s = search as string;
      where.OR = [
        { make: { contains: s, mode: "insensitive" } },
        { model: { contains: s, mode: "insensitive" } },
        { plateNumber: { contains: s, mode: "insensitive" } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: [{ createdAt: "desc" }],
        include: {
          driver: { select: { id: true, firstName: true, lastName: true } },
          documents: {
            select: { type: true, expiryDate: true, fileUrl: true },
          },
          reviewRequests: {
            where: { isResolved: false },
            select: { id: true, documents: true, message: true },
          },
        },
      }),
      prisma.vehicle.count({ where }),
    ]);

    const now = new Date();

    const formattedVehicles = await Promise.all(
      vehicles.map(async (v) => {
        // Expiry calculations only apply to APPROVED vehicles — a DRAFT or PENDING_REVIEW
        // vehicle isn't operational yet, so "expiring soon" warnings are noise.
        const thirtyDaysFromNow = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
        const isApproved = v.status === "APPROVED";
        const expiredDocs = isApproved
          ? v.documents.filter(
              (d) => d.expiryDate && new Date(d.expiryDate) < now,
            )
          : [];
        const expiringSoonDocs = isApproved
          ? v.documents.filter(
              (d) =>
                d.expiryDate &&
                new Date(d.expiryDate) >= now &&
                new Date(d.expiryDate) <= thirtyDaysFromNow,
            )
          : [];
        const hasExpiredDocs = expiredDocs.length > 0;
        const hasUnresolvedReview = v.reviewRequests.length > 0;

        // Determine effective status
        let effectiveStatus = v.status;
        if (isApproved && hasExpiredDocs) {
          effectiveStatus = "EXPIRED_DOCS" as any;
        }

        // Pick the soonest-to-expire doc for the banner CTA (so the banner can name it)
        const nextExpiringDoc = [...expiredDocs, ...expiringSoonDocs].sort(
          (a, b) =>
            new Date(a.expiryDate!).getTime() -
            new Date(b.expiryDate!).getTime(),
        )[0];

        // Card thumbnail — use the vehicle's own front photo so each card shows the
        // actual vehicle rather than a generic car icon. We sign the URL the same way
        // we do for the detail panel.
        const frontPhotoDoc = v.documents.find((d) => d.type === "PHOTO_FRONT");
        const thumbnailUrl = frontPhotoDoc?.fileUrl
          ? await getReadUrl(frontPhotoDoc.fileUrl)
          : null;

        return {
          id: v.id,
          make: v.make,
          model: v.model,
          year: v.year,
          plateNumber: v.plateNumber,
          color: v.color,
          seats: v.seats,
          category: v.category,
          categoryLabel: VEHICLE_CLASS_LABELS[v.category] || v.category,
          mileage: v.mileage,
          thumbnailUrl,
          isActive: v.isActive,
          suspendedForDocs: (v as any).suspendedForDocs ?? false,
          status: effectiveStatus,
          statusLabel:
            VEHICLE_STATUS_LABELS[effectiveStatus] || effectiveStatus,
          hasExpiredDocs,
          expiredDocCount: expiredDocs.length,
          expiringSoonDocCount: expiringSoonDocs.length,
          // Specific docs (with their labels) the banner can name
          expiringDocs: expiringSoonDocs.map((d) => ({
            type: d.type,
            label: DOCUMENT_LABELS[d.type] || d.type,
            expiryDate: d.expiryDate,
          })),
          expiredDocs: expiredDocs.map((d) => ({
            type: d.type,
            label: DOCUMENT_LABELS[d.type] || d.type,
            expiryDate: d.expiryDate,
          })),
          nextExpiryDate: nextExpiringDoc?.expiryDate?.toISOString() || null,
          nextExpiringDocLabel: nextExpiringDoc
            ? DOCUMENT_LABELS[nextExpiringDoc.type] || nextExpiringDoc.type
            : null,
          uploadedDocsCount: v.documents.length,
          totalRequiredDocs: REQUIRED_VEHICLE_DOCUMENTS.length,
          hasUnresolvedReview,
          assignedDriver: v.driver
            ? {
                id: v.driver.id,
                name: `${v.driver.firstName} ${v.driver.lastName}`,
              }
            : null,
          createdAt: v.createdAt,
        };
      }),
    );

    // Category counts for filter badges
    const categoryCounts = await prisma.vehicle.groupBy({
      by: ["category"],
      where: { vendorId: vendor.id },
      _count: { id: true },
    });
    const categoryCountsObj: Record<string, number> = { all: total };
    categoryCounts.forEach((cc) => {
      categoryCountsObj[cc.category] = cc._count.id;
    });

    res.json({
      success: true,
      data: {
        vehicles: formattedVehicles,
        categoryCounts: categoryCountsObj,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

// ============== ADD VEHICLE ==============

/**
 * POST /api/v1/vendor/fleet
 *
 * Add a new vehicle. Status starts as PENDING_REVIEW.
 * Admin must approve before the vehicle can be assigned to bookings.
 */
export const addVehicle = asyncWrapper(async (req: Request, res: Response) => {
  const vendor = await getVendorForUser(req.user!.id);
  await requireApprovedAndDocsValid(vendor);

  const {
    make,
    model,
    year,
    plateNumber,
    color,
    seats,
    category,
    mileage,
    driverId,
  } = req.body;

  // Validation
  if (!make?.trim()) throw new BadRequestError("Vehicle brand is required");
  if (!model?.trim()) throw new BadRequestError("Vehicle model is required");
  if (!year) throw new BadRequestError("Year is required");
  if (!plateNumber?.trim())
    throw new BadRequestError("Plate number is required");
  if (!category) throw new BadRequestError("Vehicle category is required");

  const validCategories = [
    "ECONOMY_SEDAN",
    "BUSINESS_SEDAN",
    "FIRST_CLASS",
    "BUSINESS_SUV",
    "ELECTRIC",
    "HIACE",
    "COASTER",
    "KING_LONG",
  ];
  if (!validCategories.includes(category)) {
    throw new BadRequestError(
      `Invalid category. Must be one of: ${validCategories.join(", ")}`,
    );
  }

  // Check duplicate plate number within this vendor
  const existingVehicle = await prisma.vehicle.findFirst({
    where: { vendorId: vendor.id, plateNumber: plateNumber.trim() },
  });
  if (existingVehicle) {
    throw new BadRequestError(
      "A vehicle with this plate number already exists",
    );
  }

  // If driverId provided, validate it belongs to this vendor
  if (driverId) {
    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
    });
    if (!driver) throw new BadRequestError("Invalid driver selected");

    // Check driver isn't already assigned to another vehicle
    const existingAssignment = await prisma.vehicle.findFirst({
      where: { vendorId: vendor.id, driver: { id: driverId } },
    });
    if (existingAssignment) {
      throw new BadRequestError(
        "This driver is already assigned to another vehicle",
      );
    }
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      vendorId: vendor.id,
      make: make.trim(),
      model: model.trim(),
      year: parseInt(year),
      plateNumber: plateNumber.trim(),
      color: color?.trim() || null,
      seats: seats ? parseInt(seats) : 4,
      category: category as any,
      mileage: mileage ? parseInt(mileage) : null,
      // Vendor is still onboarding — DRAFT until they explicitly submit for review.
      // Admin is NOT notified here; notification fires from submitVehicleForReview.
      status: "DRAFT" as any,
      isActive: true,
    },
  });

  // Assign driver if provided
  if (driverId) {
    await prisma.driver.update({
      where: { id: driverId },
      data: { assignedVehicleId: vehicle.id },
    });
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "VEHICLE_ADDED",
      entity: "Vehicle",
      entityId: vehicle.id,
      changes: {
        make,
        model,
        year,
        plateNumber,
        category,
        vendor: vendor.companyName,
      },
    },
  });

  res.status(201).json({
    success: true,
    message: "Vehicle added successfully. It will be reviewed by admin.",
    data: {
      id: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      plateNumber: vehicle.plateNumber,
      category: vehicle.category,
      status: vehicle.status,
    },
  });
});

// ============== GET VEHICLE DETAIL ==============

/**
 * GET /api/v1/vendor/fleet/:vehicleId
 *
 * Full vehicle detail with all documents, photos, assigned driver,
 * review comments, and document expiry status.
 */
export const getVehicleDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { vehicleId } = req.params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
            rating: true,
          },
        },
        documents: { orderBy: { type: "asc" } },
        reviewRequests: {
          where: { isResolved: false },
          orderBy: { createdAt: "desc" },
        },
        reviewComments: {
          where: { isResolved: false },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!vehicle) throw new NotFoundError("Vehicle");

    const now = new Date();

    // Build document map with signed URLs
    const uploadedDocsMap = new Map(vehicle.documents.map((d) => [d.type, d]));

    const documents = await Promise.all(
      REQUIRED_VEHICLE_DOCUMENTS.map(async (type) => {
        const doc = uploadedDocsMap.get(type);
        const isExpired = doc?.expiryDate
          ? new Date(doc.expiryDate) < now
          : false;
        const requiresExpiry = DOCUMENTS_WITH_EXPIRY.includes(type);
        return {
          type,
          label: DOCUMENT_LABELS[type],
          isUploaded: !!doc,
          fileUrl: doc?.fileUrl ? await getReadUrl(doc.fileUrl) : null,
          // Raw GCS path — paired with the signed fileUrl above so the
          // vendor frontend can diff against editSnapshot using a stable
          // identifier. See drivers.controller for the same rationale:
          // signed URL tokens rotate per request and can't be used for
          // "has this been replaced?" detection client-side.
          filePath: doc?.fileUrl || null,
          fileName: (doc as any)?.fileName || null,
          expiryDate: doc?.expiryDate || null,
          isExpired,
          requiresExpiry,
          uploadedAt: doc?.createdAt || null,
        };
      }),
    );

    const missingDocuments = documents
      .filter((d) => !d.isUploaded)
      .map((d) => d.label);
    const expiredDocuments = documents
      .filter((d) => d.isExpired)
      .map((d) => d.label);
    const allDocumentsUploaded = missingDocuments.length === 0;

    // Effective status
    let effectiveStatus = vehicle.status;
    if (vehicle.status === "APPROVED" && expiredDocuments.length > 0) {
      effectiveStatus = "EXPIRED_DOCS" as any;
    }

    // Unresolved review requests
    const unresolvedReviews = vehicle.reviewRequests.map((rr) => ({
      id: rr.id,
      documents: rr.documents,
      message: rr.message,
      createdAt: rr.createdAt,
    }));

    // Check if vehicle can be assigned to bookings
    const canBeAssigned =
      vehicle.status === "APPROVED" &&
      vehicle.isActive &&
      expiredDocuments.length === 0 &&
      unresolvedReviews.length === 0;

    res.json({
      success: true,
      data: {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        plateNumber: vehicle.plateNumber,
        color: vehicle.color,
        seats: vehicle.seats,
        category: vehicle.category,
        categoryLabel:
          VEHICLE_CLASS_LABELS[vehicle.category] || vehicle.category,
        mileage: vehicle.mileage,
        isActive: vehicle.isActive,
        status: effectiveStatus,
        statusLabel: VEHICLE_STATUS_LABELS[effectiveStatus] || effectiveStatus,
        canBeAssigned,

        // Documents
        documents,
        allDocumentsUploaded,
        missingDocuments,
        expiredDocuments,
        suspendedForDocs: (vehicle as any).suspendedForDocs ?? false,

        // Assigned driver
        assignedDriver: vehicle.driver
          ? {
              id: vehicle.driver.id,
              name: `${vehicle.driver.firstName} ${vehicle.driver.lastName}`,
              phone: vehicle.driver.phone,
              photoUrl: vehicle.driver.photoUrl,
              rating: vehicle.driver.rating
                ? Number(vehicle.driver.rating)
                : null,
            }
          : null,

        // Review requests from admin
        unresolvedReviews,
        hasUnresolvedReviews: unresolvedReviews.length > 0,

        // Field-level review comments (for CHANGES_REQUESTED state)
        reviewComments: vehicle.reviewComments.map((c) => ({
          id: c.id,
          fieldName: c.fieldName,
          comment: c.comment,
          createdAt: c.createdAt,
        })),
        editableFields:
          vehicle.status === "CHANGES_REQUESTED" &&
          vehicle.reviewComments.length > 0
            ? vehicle.reviewComments.map((c) => c.fieldName)
            : null, // null means all fields editable (e.g. during PENDING_REVIEW)
        editSnapshot: vehicle.editSnapshot,

        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt,
      },
    });
  },
);

// ============== UPLOAD VEHICLE DOCUMENT ==============

/**
 * POST /api/v1/vendor/fleet/:vehicleId/documents
 *
 * Upload or replace a vehicle document/photo.
 * Does NOT auto-resolve admin review requests — admin must verify.
 */
export const uploadVehicleDocument = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { vehicleId } = req.params;
    const { type, fileUrl, fileName, expiryDate } = req.body;

    if (!type || !fileUrl) {
      throw new BadRequestError("type and fileUrl are required");
    }

    if (!REQUIRED_VEHICLE_DOCUMENTS.includes(type as any)) {
      throw new BadRequestError(
        `Invalid document type. Must be one of: ${REQUIRED_VEHICLE_DOCUMENTS.join(", ")}`,
      );
    }

    // Validate expiry date for docs that require it
    if (DOCUMENTS_WITH_EXPIRY.includes(type) && !expiryDate) {
      throw new BadRequestError(
        `Expiry date is required for ${DOCUMENT_LABELS[type]}`,
      );
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
      include: {
        reviewComments: { where: { isResolved: false } },
      },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    // Check if vehicle is editable (not under a booking-blocking status unless review requested)
    const editableStatuses = [
      "DRAFT",
      "PENDING_REVIEW",
      "CHANGES_REQUESTED",
      "APPROVED",
      "UNDER_MAINTENANCE",
    ];
    if (!editableStatuses.includes(vehicle.status)) {
      throw new BadRequestError(
        "Vehicle documents cannot be updated in its current status",
      );
    }

    // During CHANGES_REQUESTED, only allow uploading documents the admin flagged.
    // Map enum doc types to their logical bucket so a comment on "vehiclePhotos"
    // also unlocks every individual PHOTO_* slot, etc.
    if (
      vehicle.status === "CHANGES_REQUESTED" &&
      vehicle.reviewComments.length > 0
    ) {
      const TYPE_TO_BUCKET: Record<string, string> = {
        PHOTO_FRONT: "vehiclePhotos",
        PHOTO_BACK: "vehiclePhotos",
        PHOTO_LEFT: "vehiclePhotos",
        PHOTO_RIGHT: "vehiclePhotos",
        PHOTO_INTERIOR_FRONT: "vehiclePhotos",
        PHOTO_INTERIOR_BACK: "vehiclePhotos",
        NUMBER_PLATE_FRONT: "numberPlates",
        NUMBER_PLATE_BACK: "numberPlates",
        ODOMETER: "odometer",
        INSURANCE: "insurance",
        ISTIMARA: "istimara",
      };
      const flagged = new Set(vehicle.reviewComments.map((c) => c.fieldName));
      const myBucket = TYPE_TO_BUCKET[type];
      const isFlagged =
        flagged.has(type) || (myBucket && flagged.has(myBucket));
      if (!isFlagged) {
        throw new BadRequestError(
          "Only documents flagged by the admin can be re-uploaded right now",
        );
      }
    }

    // Upsert document
    const existingDoc = await prisma.vehicleDocument.findFirst({
      where: { vehicleId, type },
    });

    if (existingDoc) {
      await prisma.vehicleDocument.update({
        where: { id: existingDoc.id },
        data: {
          fileUrl,
          fileName: fileName || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        },
      });
    } else {
      await prisma.vehicleDocument.create({
        data: {
          vehicleId,
          type,
          fileUrl,
          fileName: fileName || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        },
      });
    }

    // NOTE: Do NOT auto-resolve review requests. Admin must verify the new document.
    // NOTE: Do NOT auto-reactivate a vehicle suspended for expired docs. Vendor must
    //       explicitly click "Submit for Admin Review" once all renewals are uploaded.
    //       Admin approval is what clears suspendedForDocs and brings the vehicle back online.

    res.json({
      success: true,
      message: `${DOCUMENT_LABELS[type] || type} uploaded successfully`,
    });
  },
);

// ============== REQUEST VEHICLE CHANGES ==============

/**
 * POST /api/v1/vendor/fleet/:vehicleId/change-request
 *
 * Vendor requests permission to edit specific fields/documents of an approved vehicle.
 * Similar to partner's profile change request system.
 * Vehicle status changes to UNDER_REVIEW — cannot be assigned to bookings.
 */
export const requestVehicleChanges = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { vehicleId } = req.params;
    const { fields, reason } = req.body;

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestError("Select at least one field to update");
    }
    if (!reason?.trim()) {
      throw new BadRequestError(
        "Please provide a reason for the change request",
      );
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    if (vehicle.status !== "APPROVED") {
      throw new BadRequestError(
        "Change requests can only be submitted for approved vehicles",
      );
    }

    // Check for existing pending vendor-initiated request
    const existingRequest = await prisma.vehicleReviewRequest.findFirst({
      where: {
        vehicleId,
        requestType: "VENDOR_INITIATED",
        status: "PENDING",
      },
    });
    if (existingRequest) {
      throw new BadRequestError(
        "A change request is already pending for this vehicle",
      );
    }

    // Create the change request (vendor-initiated, awaiting admin approval)
    const reviewRequest = await prisma.vehicleReviewRequest.create({
      data: {
        vehicleId,
        documents: fields,
        message: reason.trim(),
        requestType: "VENDOR_INITIATED",
        status: "PENDING",
        createdBy: req.user!.id,
      },
    });

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    const fieldLabels = fields
      .map((f: string) => DOCUMENT_LABELS[f] || f)
      .join(", ");

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Vehicle Change Request",
          message: `${vendor.companyName} requests to update ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}). Fields: ${fieldLabels}. Reason: ${reason.trim()}`,
          type: "VEHICLE_CHANGE_REQUEST",
          data: {
            vehicleId,
            vendorId: vendor.id,
            reviewRequestId: reviewRequest.id,
            fields,
          },
        })),
      });
    }

    res.json({
      success: true,
      message: "Change request submitted. Admin will review it shortly.",
      data: {
        reviewRequestId: reviewRequest.id,
        vehicleId,
        fields,
        reason: reason.trim(),
      },
    });
  },
);

// ============== UPDATE VEHICLE INFO ==============

/**
 * PATCH /api/v1/vendor/fleet/:vehicleId
 *
 * Update vehicle basic info. Only editable when status is
 * PENDING_REVIEW (initial submission) or CHANGES_REQUESTED (admin sent back).
 */
export const updateVehicleInfo = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { vehicleId } = req.params;
    const { make, model, year, plateNumber, color, seats, category, mileage } =
      req.body;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
      include: {
        reviewComments: { where: { isResolved: false } },
      },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    const editableStatuses = ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED"];
    if (!editableStatuses.includes(vehicle.status)) {
      throw new BadRequestError(
        "Vehicle can only be edited while still being onboarded or when admin has requested changes.",
      );
    }

    // When in CHANGES_REQUESTED, vendor can only edit fields with active comments
    const allowedFields: string[] | null =
      vehicle.status === "CHANGES_REQUESTED" &&
      vehicle.reviewComments.length > 0
        ? vehicle.reviewComments.map((c) => c.fieldName)
        : null;

    const isFieldAllowed = (field: string) =>
      allowedFields === null || allowedFields.includes(field);

    const updateData: any = {};
    if (make?.trim() && isFieldAllowed("make")) updateData.make = make.trim();
    if (model?.trim() && isFieldAllowed("model"))
      updateData.model = model.trim();
    if (year && isFieldAllowed("year")) updateData.year = parseInt(year);
    if (plateNumber?.trim() && isFieldAllowed("plateNumber")) {
      // Check for duplicate plate number
      if (plateNumber.trim() !== vehicle.plateNumber) {
        const duplicate = await prisma.vehicle.findFirst({
          where: {
            vendorId: vendor.id,
            plateNumber: plateNumber.trim(),
            id: { not: vehicleId },
          },
        });
        if (duplicate)
          throw new BadRequestError(
            "A vehicle with this plate number already exists",
          );
      }
      updateData.plateNumber = plateNumber.trim();
    }
    if (color !== undefined && isFieldAllowed("color"))
      updateData.color = color?.trim() || null;
    if (seats && isFieldAllowed("seats")) updateData.seats = parseInt(seats);
    if (category && isFieldAllowed("category")) updateData.category = category;
    if (mileage !== undefined && isFieldAllowed("mileage"))
      updateData.mileage = mileage ? parseInt(mileage) : null;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError(
        "No editable fields in this request. " +
          (allowedFields
            ? `You can only edit: ${allowedFields.join(", ")}`
            : ""),
      );
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: updateData,
    });

    res.json({
      success: true,
      message: "Vehicle info updated",
      data: {
        id: updated.id,
        make: updated.make,
        model: updated.model,
        year: updated.year,
        plateNumber: updated.plateNumber,
        category: updated.category,
        status: updated.status,
      },
    });
  },
);

// ============== SUBMIT VEHICLE FOR REVIEW ==============

/**
 * POST /api/v1/vendor/fleet/:vehicleId/submit
 *
 * Submit vehicle for admin review after making changes.
 * Status: CHANGES_REQUESTED → PENDING_REVIEW
 * Also works for initial submission: PENDING_REVIEW stays PENDING_REVIEW
 * (notifies admin that vendor has completed updates).
 */
export const submitVehicleForReview = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { vehicleId } = req.params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
      include: { documents: { select: { type: true, expiryDate: true } } },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    // Allow submit when:
    //   (a) vehicle is in normal review queue states (PENDING_REVIEW / CHANGES_REQUESTED) — original flow, OR
    //   (b) vehicle is suspended for expired docs and vendor has now uploaded valid renewals, OR
    //   (c) vehicle is in DRAFT and the vendor has finished the Add wizard.
    const isResuspendedFlow = (vehicle as any).suspendedForDocs === true;
    const isDraftFlow = vehicle.status === "DRAFT";
    const submittableStatuses = ["PENDING_REVIEW", "CHANGES_REQUESTED"];

    if (
      !isResuspendedFlow &&
      !isDraftFlow &&
      !submittableStatuses.includes(vehicle.status)
    ) {
      throw new BadRequestError("Vehicle is not in a submittable status");
    }

    if (isResuspendedFlow) {
      // For re-submission after expiry: require ALL required-with-expiry docs to be uploaded + valid
      const now = new Date();
      const requiredWithExpiry = ["INSURANCE", "ISTIMARA"];
      const missingOrExpired = requiredWithExpiry.filter((t) => {
        const d = vehicle.documents.find((x) => x.type === t);
        return !d || !d.expiryDate || new Date(d.expiryDate) <= now;
      });
      if (missingOrExpired.length > 0) {
        throw new BadRequestError(
          `Cannot submit. The following document(s) are still missing or expired: ${missingOrExpired.join(", ")}. Please replace them first.`,
        );
      }

      // Snapshot current state so admin sees what changed if they later request more changes
      const snapshot = {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        plateNumber: vehicle.plateNumber,
        color: vehicle.color,
        mileage: vehicle.mileage,
        category: vehicle.category,
      };

      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          status: "PENDING_REVIEW",
          editSnapshot: snapshot as any,
          // Stay suspended (isActive=false, suspendedForDocs=true) until admin approves.
          // Admin approval is what clears these flags and brings the vehicle back online.
        },
      });
    } else if (isDraftFlow) {
      // First-time submission from the Add wizard. Require all required docs to be uploaded.
      const uploadedTypes = new Set(vehicle.documents.map((d) => d.type));
      const missing = REQUIRED_VEHICLE_DOCUMENTS.filter(
        (t) => !uploadedTypes.has(t),
      );
      if (missing.length > 0) {
        throw new BadRequestError(
          `Cannot submit. The following document(s) are still missing: ${missing.join(", ")}.`,
        );
      }
      // Require non-expired expiry dates on the docs that need them
      const now = new Date();
      const requiredWithExpiry = ["INSURANCE", "ISTIMARA"];
      const expiredOrMissing = requiredWithExpiry.filter((t) => {
        const d = vehicle.documents.find((x) => x.type === t);
        return !d || !d.expiryDate || new Date(d.expiryDate) <= now;
      });
      if (expiredOrMissing.length > 0) {
        throw new BadRequestError(
          `The following document(s) are missing valid expiry dates: ${expiredOrMissing.join(", ")}.`,
        );
      }
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { status: "PENDING_REVIEW" },
      });
    } else {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { status: "PENDING_REVIEW" },
      });
    }

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      const titleSuffix = isResuspendedFlow ? " (post-expiry renewal)" : "";
      const messageSuffix = isResuspendedFlow
        ? " Documents were renewed after expiry — please verify the new uploads and expiry dates."
        : "";
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: `Vehicle Submitted for Review${titleSuffix}`,
          message: `${vendor.companyName} has submitted ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}) for review.${messageSuffix}`,
          type: "VEHICLE_PENDING_REVIEW",
          data: {
            vehicleId,
            vendorId: vendor.id,
            postExpiry: isResuspendedFlow,
          },
        })),
      });
    }

    res.json({
      success: true,
      message: "Vehicle submitted for admin review",
    });
  },
);

// ============== ASSIGN/UNASSIGN DRIVER ==============

/**
 * PATCH /api/v1/vendor/fleet/:vehicleId/driver
 *
 * Assign or unassign a driver to/from a vehicle.
 */
export const assignDriver = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { vehicleId } = req.params;
    const { driverId } = req.body; // null to unassign

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    if (driverId) {
      // Assign
      const driver = await prisma.driver.findFirst({
        where: { id: driverId, vendorId: vendor.id, isActive: true },
      });
      if (!driver) throw new BadRequestError("Invalid or inactive driver");

      // Check driver isn't assigned elsewhere
      if (driver.assignedVehicleId && driver.assignedVehicleId !== vehicleId) {
        throw new BadRequestError(
          "This driver is already assigned to another vehicle",
        );
      }

      // Unassign current driver if any
      await prisma.driver.updateMany({
        where: { assignedVehicleId: vehicleId },
        data: { assignedVehicleId: null },
      });

      // Assign new driver
      await prisma.driver.update({
        where: { id: driverId },
        data: { assignedVehicleId: vehicleId },
      });

      res.json({
        success: true,
        message: `Driver ${driver.firstName} ${driver.lastName} assigned to vehicle`,
      });
    } else {
      // Unassign
      await prisma.driver.updateMany({
        where: { assignedVehicleId: vehicleId },
        data: { assignedVehicleId: null },
      });

      res.json({
        success: true,
        message: "Driver unassigned from vehicle",
      });
    }
  },
);

// ============== DELETE VEHICLE ==============

/**
 * DELETE /api/v1/vendor/fleet/:vehicleId
 *
 * Delete a vehicle. Cannot delete if there are active bookings.
 */
export const deleteVehicle = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { vehicleId } = req.params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    // Check for active bookings
    const activeBookings = await prisma.booking.count({
      where: {
        vehicleId,
        // "Active booking" = vendor accepted (CONFIRMED), is in trip
        // (IN_PROGRESS), or has an outstanding offer they'd lose if the
        // driver/vehicle here became unavailable. ASSIGNMENT_OFFERED +
        // ASSIGNMENT_RE_OFFERED cover the outstanding-offer case under
        // the new model.
        status: {
          in: [
            "ASSIGNMENT_OFFERED",
            "ASSIGNMENT_RE_OFFERED",
            "CONFIRMED",
            "IN_PROGRESS",
          ],
        },
      },
    });

    if (activeBookings > 0) {
      throw new BadRequestError(
        `Cannot delete vehicle — it has ${activeBookings} active booking(s). Complete or cancel them first.`,
      );
    }

    // Unassign driver if any
    await prisma.driver.updateMany({
      where: { assignedVehicleId: vehicleId },
      data: { assignedVehicleId: null },
    });

    // Delete documents first (cascade should handle this, but explicit for safety)
    await prisma.vehicleDocument.deleteMany({ where: { vehicleId } });
    await prisma.vehicleReviewRequest.deleteMany({ where: { vehicleId } });

    // Delete vehicle
    await prisma.vehicle.delete({ where: { id: vehicleId } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VEHICLE_DELETED",
        entity: "Vehicle",
        entityId: vehicleId,
        changes: {
          make: vehicle.make,
          model: vehicle.model,
          plateNumber: vehicle.plateNumber,
          vendor: vendor.companyName,
        },
      },
    });

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Vehicle Removed by Vendor",
          message: `${vendor.companyName} removed vehicle ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`,
          type: "VEHICLE_DELETED",
          data: { vehicleId, vendorId: vendor.id },
        })),
      });
    }

    res.json({
      success: true,
      message: `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber}) deleted`,
    });
  },
);

// ============== TOGGLE VEHICLE STATUS ==============

/**
 * PATCH /api/v1/vendor/fleet/:vehicleId/status
 *
 * Toggle vehicle between active/inactive or set maintenance mode.
 * Only applicable for approved vehicles.
 */
export const toggleVehicleStatus = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { vehicleId } = req.params;
    const { action } = req.body; // "activate", "deactivate", "maintenance"

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    if (!["activate", "deactivate", "maintenance"].includes(action)) {
      throw new BadRequestError(
        "Action must be 'activate', 'deactivate', or 'maintenance'",
      );
    }

    // Check for active bookings before deactivating
    if (action === "deactivate" || action === "maintenance") {
      const activeBookings = await prisma.booking.count({
        where: {
          vehicleId,
          // "Active booking" = vendor accepted (CONFIRMED), is in trip
          // (IN_PROGRESS), or has an outstanding offer they'd lose if the
          // driver/vehicle here became unavailable. ASSIGNMENT_OFFERED +
          // ASSIGNMENT_RE_OFFERED cover the outstanding-offer case under
          // the new model.
          status: {
            in: [
              "ASSIGNMENT_OFFERED",
              "ASSIGNMENT_RE_OFFERED",
              "CONFIRMED",
              "IN_PROGRESS",
            ],
          },
        },
      });
      if (activeBookings > 0) {
        throw new BadRequestError(
          `Cannot ${action} vehicle — it has ${activeBookings} active booking(s).`,
        );
      }
    }

    const updateData: any = {};
    switch (action) {
      case "activate":
        if (
          vehicle.status !== "APPROVED" &&
          vehicle.status !== "UNDER_MAINTENANCE"
        ) {
          throw new BadRequestError(
            "Only approved or maintenance vehicles can be activated",
          );
        }
        updateData.isActive = true;
        updateData.status = "APPROVED";
        break;
      case "deactivate":
        updateData.isActive = false;
        break;
      case "maintenance":
        updateData.isActive = false;
        updateData.status = "UNDER_MAINTENANCE";
        break;
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: updateData,
    });

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      const actionLabel =
        action === "activate"
          ? "activated"
          : action === "deactivate"
            ? "deactivated"
            : "set to maintenance";
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: `Vehicle ${action === "activate" ? "Activated" : action === "deactivate" ? "Deactivated" : "Under Maintenance"}`,
          message: `${vendor.companyName} ${actionLabel} vehicle ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`,
          type: "VEHICLE_STATUS_CHANGED",
          data: { vehicleId, vendorId: vendor.id, action },
        })),
      });
    }

    res.json({
      success: true,
      message: `Vehicle ${action === "activate" ? "activated" : action === "deactivate" ? "deactivated" : "set to maintenance"}`,
      data: {
        id: updated.id,
        isActive: updated.isActive,
        status: updated.status,
        statusLabel: VEHICLE_STATUS_LABELS[updated.status] || updated.status,
      },
    });
  },
);

// ============== GET AVAILABLE DRIVERS FOR ASSIGNMENT ==============

/**
 * GET /api/v1/vendor/fleet/available-drivers
 *
 * Get drivers that can be assigned to a vehicle (not already assigned elsewhere).
 */
export const getAvailableDrivers = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const drivers = await prisma.driver.findMany({
      where: {
        vendorId: vendor.id,
        isActive: true,
        status: "APPROVED",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        photoUrl: true,
        rating: true,
        assignedVehicleId: true,
      },
      orderBy: { firstName: "asc" },
    });

    const formattedDrivers = drivers.map((d) => ({
      id: d.id,
      name: `${d.firstName} ${d.lastName}`,
      phone: d.phone,
      photoUrl: d.photoUrl,
      rating: d.rating ? Number(d.rating) : null,
      isAssigned: !!d.assignedVehicleId,
      assignedVehicleId: d.assignedVehicleId,
    }));

    res.json({
      success: true,
      data: {
        drivers: formattedDrivers,
        availableCount: formattedDrivers.filter((d) => !d.isAssigned).length,
        totalCount: formattedDrivers.length,
      },
    });
  },
);

// ============== GET CHANGE REQUESTS FOR A VEHICLE ==============

/**
 * GET /api/v1/vendor/fleet/:vehicleId/change-requests
 *
 * Get all change requests (resolved and unresolved) for a vehicle.
 */
export const getVehicleChangeRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { vehicleId } = req.params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    const requests = await prisma.vehicleReviewRequest.findMany({
      where: { vehicleId },
      orderBy: { createdAt: "desc" },
    });

    const formattedRequests = requests.map((r) => ({
      id: r.id,
      fields: r.documents,
      fieldLabels: (r.documents as string[]).map(
        (f: string) => DOCUMENT_LABELS[f] || f,
      ),
      message: r.message,
      requestType: r.requestType,
      status: r.status,
      adminNote: r.adminNote,
      isResolved: r.isResolved,
      resolvedAt: r.resolvedAt,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    }));

    // hasPending = vendor has a PENDING vendor-initiated request awaiting admin
    const hasPending = requests.some(
      (r) => r.requestType === "VENDOR_INITIATED" && r.status === "PENDING",
    );

    res.json({
      success: true,
      data: {
        requests: formattedRequests,
        hasPending,
      },
    });
  },
);
