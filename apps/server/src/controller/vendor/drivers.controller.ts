// ============================================
// apps/server/src/controller/vendor/drivers.controller.ts
// Vendor Portal — Driver Management
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { requireOperational, requireApprovedAndDocsValid } from "./_shared";

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

// Driver status labels
const DRIVER_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Active",
  CHANGES_REQUESTED: "Changes Requested",
};

// Required driver document types
const REQUIRED_DRIVER_DOCUMENTS = [
  "PROFILE_PHOTO",
  "IQAMA_NATIONAL_ID",
  "DRIVING_LICENSE",
] as const;

const DRIVER_DOCUMENT_LABELS: Record<string, string> = {
  PROFILE_PHOTO: "Profile Photo",
  IQAMA_NATIONAL_ID: "Iqama / National ID",
  DRIVING_LICENSE: "Driving License",
};

// Documents that require expiry dates. These are the "trust-bearing"
// documents — replacing any of them on an APPROVED driver triggers an
// auto-transition to admin review (gated on ALL such docs being valid,
// see uploadDriverDocument below).
const DRIVER_DOCS_WITH_EXPIRY = ["IQAMA_NATIONAL_ID", "DRIVING_LICENSE"];

// All editable fields for change request system
const DRIVER_EDITABLE_FIELDS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  phone: "Phone Number",
  nationalId: "National ID / Iqama",
  licenseNumber: "Driving Licence Number",
  PROFILE_PHOTO: "Profile Photo",
  IQAMA_NATIONAL_ID: "Iqama / National ID",
  DRIVING_LICENSE: "Driving License",
};

// ============== LIST DRIVERS ==============

/**
 * GET /api/v1/vendor/drivers
 *
 * List all drivers with search and status filter.
 * Search: by name
 * Filter: all, PENDING_REVIEW, APPROVED, CHANGES_REQUESTED
 */
export const getDriversList = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { page = "1", limit = "20", status, search } = req.query;

    const where: any = { vendorId: vendor.id, isActive: true };

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      const s = search as string;
      where.OR = [
        { firstName: { contains: s, mode: "insensitive" } },
        { lastName: { contains: s, mode: "insensitive" } },
        { phone: { contains: s, mode: "insensitive" } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [drivers, total] = await Promise.all([
      prisma.driver.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: [{ createdAt: "desc" }],
        include: {
          assignedVehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
              category: true,
            },
          },
          documents: { select: { type: true, expiryDate: true } },
          reviewRequests: {
            where: { isResolved: false },
            select: { id: true },
          },
        },
      }),
      prisma.driver.count({ where }),
    ]);

    const now = new Date();

    const formattedDrivers = await Promise.all(
      drivers.map(async (d) => {
        // Expiry calculations only apply to APPROVED drivers — a fresh PENDING_REVIEW
        // driver isn't operational yet, so "expiring soon" warnings are noise.
        const thirtyDaysFromNow = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
        const isApproved = d.status === "APPROVED";
        const expiredDocs = isApproved
          ? d.documents.filter(
              (doc) => doc.expiryDate && new Date(doc.expiryDate) < now,
            )
          : [];
        const expiringSoonDocs = isApproved
          ? d.documents.filter(
              (doc) =>
                doc.expiryDate &&
                new Date(doc.expiryDate) >= now &&
                new Date(doc.expiryDate) <= thirtyDaysFromNow,
            )
          : [];
        const hasExpiredDocs = expiredDocs.length > 0;
        const hasUnresolvedReview = d.reviewRequests.length > 0;

        const photoUrl = d.photoUrl ? await getReadUrl(d.photoUrl) : null;

        // Pick the soonest-to-expire doc for the banner CTA (so the banner can name it)
        const nextExpiringDoc = [...expiredDocs, ...expiringSoonDocs].sort(
          (a, b) =>
            new Date(a.expiryDate!).getTime() -
            new Date(b.expiryDate!).getTime(),
        )[0];

        return {
          id: d.id,
          firstName: d.firstName,
          lastName: d.lastName,
          name: `${d.firstName} ${d.lastName}`,
          phone: d.phone,
          photoUrl,
          rating: d.rating ? Number(d.rating) : null,
          status: d.status,
          statusLabel: DRIVER_STATUS_LABELS[d.status] || d.status,
          isActive: d.isActive,
          suspendedForDocs: (d as any).suspendedForDocs ?? false,
          hasExpiredDocs,
          expiredDocCount: expiredDocs.length,
          expiringSoonDocCount: expiringSoonDocs.length,
          // Specific docs (with their labels) the banner can name
          expiringDocs: expiringSoonDocs.map((doc) => ({
            type: doc.type,
            label: DRIVER_DOCUMENT_LABELS[doc.type] || doc.type,
            expiryDate: doc.expiryDate,
          })),
          expiredDocs: expiredDocs.map((doc) => ({
            type: doc.type,
            label: DRIVER_DOCUMENT_LABELS[doc.type] || doc.type,
            expiryDate: doc.expiryDate,
          })),
          nextExpiryDate: nextExpiringDoc?.expiryDate?.toISOString() || null,
          nextExpiringDocLabel: nextExpiringDoc
            ? DRIVER_DOCUMENT_LABELS[nextExpiringDoc.type] ||
              nextExpiringDoc.type
            : null,
          hasUnresolvedReview,
          assignedVehicle: d.assignedVehicle
            ? {
                id: d.assignedVehicle.id,
                label: `${d.assignedVehicle.make} ${d.assignedVehicle.model} (${d.assignedVehicle.plateNumber})`,
                category: d.assignedVehicle.category,
              }
            : null,
          createdAt: d.createdAt,
        };
      }),
    );

    // Status counts for filter badges
    const statusCounts = await prisma.driver.groupBy({
      by: ["status"],
      where: { vendorId: vendor.id, isActive: true },
      _count: { id: true },
    });
    const statusCountsObj: Record<string, number> = { all: total };
    statusCounts.forEach((sc) => {
      statusCountsObj[sc.status] = sc._count.id;
    });

    // Include soft-deleted count
    const deletedCount = await prisma.driver.count({
      where: { vendorId: vendor.id, isActive: false },
    });

    res.json({
      success: true,
      data: {
        drivers: formattedDrivers,
        statusCounts: statusCountsObj,
        deletedCount,
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

// ============== ADD DRIVER ==============

/**
 * POST /api/v1/vendor/drivers
 *
 * Add a new driver. Status starts as PENDING_REVIEW.
 * Admin must approve before driver can be assigned to bookings.
 */
export const addDriver = asyncWrapper(async (req: Request, res: Response) => {
  const vendor = await getVendorForUser(req.user!.id);
  await requireApprovedAndDocsValid(vendor);

  const {
    firstName,
    lastName,
    phone,
    nationalId,
    licenseNumber,
    photoUrl,
    vehicleId,
  } = req.body;

  // Validation
  if (!firstName?.trim()) throw new BadRequestError("First name is required");
  if (!lastName?.trim()) throw new BadRequestError("Last name is required");
  if (!phone?.trim()) throw new BadRequestError("Phone number is required");
  if (!nationalId?.trim())
    throw new BadRequestError("National ID / Iqama number is required");
  if (!licenseNumber?.trim())
    throw new BadRequestError("Driving licence number is required");

  // Saudi National ID / Iqama is exactly 10 digits. Strip anything the
  // vendor might have typed (spaces, hyphens) before validating.
  const cleanedNationalId = String(nationalId).replace(/\D/g, "");
  if (cleanedNationalId.length !== 10) {
    throw new BadRequestError("National ID / Iqama must be exactly 10 digits.");
  }
  // Licence number in KSA also follows the 10-digit format printed on
  // the licence card. Same treatment as nationalId — strip anything
  // that isn't a digit before validating the length.
  const cleanedLicenseNumber = String(licenseNumber).replace(/\D/g, "");
  if (cleanedLicenseNumber.length !== 10) {
    throw new BadRequestError(
      "Driving licence number must be exactly 10 digits.",
    );
  }

  // Check duplicate phone within this vendor
  const existingDriver = await prisma.driver.findFirst({
    where: { vendorId: vendor.id, phone: phone.trim(), isActive: true },
  });
  if (existingDriver) {
    throw new BadRequestError("A driver with this phone number already exists");
  }

  // If vehicleId provided, validate it
  let assignedVehicleId: string | null = null;
  if (vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id, isActive: true },
    });
    if (!vehicle) throw new BadRequestError("Invalid vehicle selected");

    // Check vehicle doesn't already have a driver
    const existingAssignment = await prisma.driver.findFirst({
      where: { assignedVehicleId: vehicleId, isActive: true },
    });
    if (existingAssignment) {
      throw new BadRequestError("This vehicle already has a driver assigned");
    }
    assignedVehicleId = vehicleId;
  }

  const driver = await prisma.driver.create({
    data: {
      vendorId: vendor.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      nationalId: cleanedNationalId,
      licenseNumber: cleanedLicenseNumber,
      photoUrl: photoUrl || null,
      assignedVehicleId,
      // Vendor is still onboarding — DRAFT until they explicitly submit for review.
      // Admin is NOT notified here; notification fires from submitDriverForReview.
      status: "DRAFT" as any,
      isActive: true,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "DRIVER_ADDED",
      entity: "Driver",
      entityId: driver.id,
      changes: {
        name: `${firstName} ${lastName}`,
        phone,
        vendor: vendor.companyName,
      },
    },
  });

  res.status(201).json({
    success: true,
    message: "Driver added successfully. Pending admin review.",
    data: {
      id: driver.id,
      name: `${driver.firstName} ${driver.lastName}`,
      phone: driver.phone,
      status: driver.status,
    },
  });
});

// ============== GET DRIVER DETAIL ==============

/**
 * GET /api/v1/vendor/drivers/:driverId
 *
 * Full driver detail with documents, assigned vehicle, review requests,
 * and document expiry status.
 */
export const getDriverDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { driverId } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
      include: {
        assignedVehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            plateNumber: true,
            color: true,
            category: true,
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

    if (!driver) throw new NotFoundError("Driver");

    const now = new Date();

    // Build document map with signed URLs
    const uploadedDocsMap = new Map(driver.documents.map((d) => [d.type, d]));

    const documents = await Promise.all(
      REQUIRED_DRIVER_DOCUMENTS.map(async (type) => {
        const doc = uploadedDocsMap.get(type);
        const isExpired = doc?.expiryDate
          ? new Date(doc.expiryDate) < now
          : false;
        const requiresExpiry = DRIVER_DOCS_WITH_EXPIRY.includes(type);
        return {
          type,
          label: DRIVER_DOCUMENT_LABELS[type],
          isUploaded: !!doc,
          fileUrl: doc?.fileUrl ? await getReadUrl(doc.fileUrl) : null,
          // Raw GCS path — paired with the signed fileUrl above so the
          // vendor frontend can diff against editSnapshot using a
          // stable identifier. fileUrl alone rotates on every request
          // (signed URLs have rolling tokens), which makes it useless
          // for "has this doc been replaced?" comparisons.
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

    // Profile photo signed URL
    const photoUrl = driver.photoUrl ? await getReadUrl(driver.photoUrl) : null;

    // Unresolved review requests
    const unresolvedReviews = driver.reviewRequests.map((rr) => ({
      id: rr.id,
      fields: rr.fields,
      fieldLabels: (rr.fields as string[]).map(
        (f) => DRIVER_EDITABLE_FIELDS[f] || DRIVER_DOCUMENT_LABELS[f] || f,
      ),
      message: rr.message,
      createdAt: rr.createdAt,
    }));

    // Can driver be assigned to bookings?
    const canBeAssigned =
      driver.status === "APPROVED" &&
      driver.isActive &&
      expiredDocuments.length === 0 &&
      unresolvedReviews.length === 0;

    // Completed trip count
    const completedTrips = await prisma.booking.count({
      where: { driverId: driver.id, status: "COMPLETED" },
    });

    res.json({
      success: true,
      data: {
        id: driver.id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        name: `${driver.firstName} ${driver.lastName}`,
        phone: driver.phone,
        // Scalar identity fields — separate from the ID / licence
        // document uploads. Frontend renders these in the Driver
        // Information block and lets admin comment on them individually.
        nationalId: driver.nationalId,
        licenseNumber: driver.licenseNumber,
        photoUrl,
        rating: driver.rating ? Number(driver.rating) : null,
        isActive: driver.isActive,
        status: driver.status,
        statusLabel: DRIVER_STATUS_LABELS[driver.status] || driver.status,
        canBeAssigned,
        completedTrips,

        // Documents
        documents,
        allDocumentsUploaded,
        missingDocuments,
        expiredDocuments,
        suspendedForDocs: (driver as any).suspendedForDocs ?? false,

        // Assigned vehicle
        assignedVehicle: driver.assignedVehicle
          ? {
              id: driver.assignedVehicle.id,
              label: `${driver.assignedVehicle.make} ${driver.assignedVehicle.model} (${driver.assignedVehicle.plateNumber})`,
              make: driver.assignedVehicle.make,
              model: driver.assignedVehicle.model,
              year: driver.assignedVehicle.year,
              plateNumber: driver.assignedVehicle.plateNumber,
              color: driver.assignedVehicle.color,
              category: driver.assignedVehicle.category,
            }
          : null,

        // Admin review requests
        unresolvedReviews,
        hasUnresolvedReviews: unresolvedReviews.length > 0,

        // Field-level review comments (for CHANGES_REQUESTED state)
        reviewComments: driver.reviewComments.map((c) => ({
          id: c.id,
          fieldName: c.fieldName,
          comment: c.comment,
          createdAt: c.createdAt,
        })),
        editableFields:
          driver.status === "CHANGES_REQUESTED" &&
          driver.reviewComments.length > 0
            ? driver.reviewComments.map((c) => c.fieldName)
            : null,
        editSnapshot: driver.editSnapshot,

        createdAt: driver.createdAt,
        updatedAt: driver.updatedAt,
      },
    });
  },
);

// ============== UPDATE DRIVER INFO ==============

/**
 * PATCH /api/v1/vendor/drivers/:driverId
 *
 * Update driver basic info. Only editable when status is
 * PENDING_REVIEW or CHANGES_REQUESTED.
 */
export const updateDriverInfo = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { driverId } = req.params;
    const { firstName, lastName, phone, nationalId, licenseNumber } = req.body;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
      include: {
        reviewComments: { where: { isResolved: false } },
      },
    });
    if (!driver) throw new NotFoundError("Driver");

    const editableStatuses = ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED"];
    if (!editableStatuses.includes(driver.status)) {
      throw new BadRequestError(
        "Driver can only be edited while still being onboarded or when admin has requested changes.",
      );
    }

    // When in CHANGES_REQUESTED, vendor can only edit fields with active comments
    const allowedFields: string[] | null =
      driver.status === "CHANGES_REQUESTED" && driver.reviewComments.length > 0
        ? driver.reviewComments.map((c) => c.fieldName)
        : null;

    const isFieldAllowed = (field: string) =>
      allowedFields === null || allowedFields.includes(field);

    const updateData: any = {};
    if (firstName?.trim() && isFieldAllowed("firstName"))
      updateData.firstName = firstName.trim();
    if (lastName?.trim() && isFieldAllowed("lastName"))
      updateData.lastName = lastName.trim();
    if (phone?.trim() && isFieldAllowed("phone")) {
      // Check for duplicate phone
      if (phone.trim() !== driver.phone) {
        const duplicate = await prisma.driver.findFirst({
          where: {
            vendorId: vendor.id,
            phone: phone.trim(),
            id: { not: driverId },
            isActive: true,
          },
        });
        if (duplicate)
          throw new BadRequestError(
            "A driver with this phone number already exists",
          );
      }
      updateData.phone = phone.trim();
    }

    // National ID — 10 digit Saudi format. Only applied when the field
    // is either free-form editable (allowed) or admin has flagged this
    // specific field for changes.
    if (nationalId?.trim() && isFieldAllowed("nationalId")) {
      const cleaned = String(nationalId).replace(/\D/g, "");
      if (cleaned.length !== 10) {
        throw new BadRequestError(
          "National ID / Iqama must be exactly 10 digits.",
        );
      }
      updateData.nationalId = cleaned;
    }

    // Licence number — 10-digit KSA format, same as nationalId.
    if (licenseNumber?.trim() && isFieldAllowed("licenseNumber")) {
      const cleaned = String(licenseNumber).replace(/\D/g, "");
      if (cleaned.length !== 10) {
        throw new BadRequestError(
          "Driving licence number must be exactly 10 digits.",
        );
      }
      updateData.licenseNumber = cleaned;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError(
        "No editable fields in this request. " +
          (allowedFields
            ? `You can only edit: ${allowedFields.join(", ")}`
            : ""),
      );
    }

    const updated = await prisma.driver.update({
      where: { id: driverId },
      data: updateData,
    });

    // NOTE: Do NOT auto-resolve review requests. Admin must verify changes.

    res.json({
      success: true,
      message: "Driver info updated",
      data: {
        id: updated.id,
        name: `${updated.firstName} ${updated.lastName}`,
        phone: updated.phone,
        status: updated.status,
      },
    });
  },
);

// ============== UPLOAD DRIVER DOCUMENT ==============

/**
 * POST /api/v1/vendor/drivers/:driverId/documents
 *
 * Upload or replace a driver document (photo, Iqama, license).
 * For PROFILE_PHOTO: frontend handles camera-only + white shirt/black tie validation.
 * Backend stores whatever passes frontend validation.
 *
 * Strict trust model for expiry-bearing docs (IQAMA_NATIONAL_ID,
 * DRIVING_LICENSE): any upload or replacement on an APPROVED driver
 * triggers an auto-transition to PENDING_REVIEW — but ONLY once ALL
 * expiry-bearing docs are valid. This avoids notifying admin mid-
 * renewal when the vendor still has more docs to upload.
 */
export const uploadDriverDocument = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { driverId } = req.params;
    const { type, fileUrl, fileName, expiryDate } = req.body;

    if (!type || !fileUrl) {
      throw new BadRequestError("type and fileUrl are required");
    }

    if (!REQUIRED_DRIVER_DOCUMENTS.includes(type as any)) {
      throw new BadRequestError(
        `Invalid document type. Must be one of: ${REQUIRED_DRIVER_DOCUMENTS.join(", ")}`,
      );
    }

    // Validate expiry date for docs that require it
    if (DRIVER_DOCS_WITH_EXPIRY.includes(type) && !expiryDate) {
      throw new BadRequestError(
        `Expiry date is required for ${DRIVER_DOCUMENT_LABELS[type]}`,
      );
    }

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
    });
    if (!driver) throw new NotFoundError("Driver");

    // Check driver is in editable state
    const editableStatuses = [
      "DRAFT",
      "PENDING_REVIEW",
      "CHANGES_REQUESTED",
      "APPROVED",
    ];
    if (!editableStatuses.includes(driver.status)) {
      throw new BadRequestError(
        "Driver documents cannot be updated in its current status",
      );
    }

    // Look up the existing doc BEFORE the upsert. We need its current
    // fileUrl to feed editSnapshot below (so admin sees the REPLACED
    // badge against the OLD URL). Once the upsert runs, that value is
    // gone from the DB.
    const existingDoc = await prisma.driverDocument.findFirst({
      where: { driverId, type },
    });

    // ============== EDIT SNAPSHOT FOR ADMIN CHANGE-MARKERS ==============
    // The admin review UI renders "REPLACED" / "CHANGED" / "ADDRESSED"
    // badges by diffing driver.editSnapshot against the current driver
    // state and document filePaths. For that diff to work during a
    // vendor-initiated renewal (vendor replaces an expired
    // IQAMA_NATIONAL_ID / DRIVING_LICENSE on an APPROVED driver without
    // admin first requesting changes), we need to seed the snapshot
    // ourselves with the OLD doc URL — before the upsert overwrites it.
    //
    // Lifecycle:
    //   - APPROVED driver, snapshot empty, expiry-doc upload    → take
    //     a full baseline snapshot now (all fields + all doc URLs),
    //     overriding THIS doc type with its pre-upsert URL.
    //   - APPROVED driver, snapshot already populated mid-cycle → keep
    //     the original baseline untouched; the new upsert will diff
    //     against it. (Only add THIS doc type if it wasn't tracked
    //     before — defensive against schema drift.)
    //   - Other statuses (DRAFT/PENDING_REVIEW/CHANGES_REQUESTED) → do
    //     nothing. DRAFT/PENDING_REVIEW have no "previous" state;
    //     CHANGES_REQUESTED already had its snapshot taken by the
    //     admin's "Request Changes" flow.
    //
    // Profile photos aren't trust-bearing so we don't seed for them —
    // but if a snapshot is already populated (mid-cycle), we still
    // don't touch it on those uploads either.
    let snapshotToWrite: Record<string, any> | null = null;
    if (
      DRIVER_DOCS_WITH_EXPIRY.includes(type) &&
      driver.status === "APPROVED"
    ) {
      const currentSnap =
        (driver.editSnapshot as Record<string, any> | null) || null;
      const isEmpty =
        !currentSnap ||
        typeof currentSnap !== "object" ||
        Object.keys(currentSnap).length === 0;

      if (isEmpty) {
        // First doc in the renewal cycle — capture a full baseline.
        // Pull current docs and override THIS type with the OLD URL
        // (existingDoc.fileUrl, captured above).
        const allDocs = await prisma.driverDocument.findMany({
          where: { driverId },
          select: { type: true, fileUrl: true },
        });
        const docSnap: Record<string, string | null> = {};
        for (const d of allDocs) docSnap[d.type] = d.fileUrl ?? null;
        docSnap[type] = existingDoc?.fileUrl ?? null;

        snapshotToWrite = {
          firstName: driver.firstName,
          lastName: driver.lastName,
          phone: driver.phone,
          // photoUrl is also tracked by the admin's snapshot diff
          // (frontend special-cases it against driver.photoPath); we
          // include it so non-photo doc replacements don't make the
          // photo read as "changed".
          photoUrl: driver.photoUrl ?? null,
          ...docSnap,
        };
      } else if (!(type in currentSnap)) {
        snapshotToWrite = {
          ...currentSnap,
          [type]: existingDoc?.fileUrl ?? null,
        };
      }
      // else: preserve the existing baseline.
    }

    // Upsert document
    if (existingDoc) {
      await prisma.driverDocument.update({
        where: { id: existingDoc.id },
        data: {
          fileUrl,
          fileName: fileName || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        },
      });
    } else {
      await prisma.driverDocument.create({
        data: {
          driverId,
          type,
          fileUrl,
          fileName: fileName || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        },
      });
    }

    // If it's a profile photo, also update the driver's photoUrl field
    if (type === "PROFILE_PHOTO") {
      await prisma.driver.update({
        where: { id: driverId },
        data: { photoUrl: fileUrl },
      });
    }

    // Persist the snapshot now if we computed one. Doing this as a
    // separate update (rather than folding it into the auto-submit
    // update below) is intentional: even during mid-renewal — when
    // status doesn't transition — the snapshot still needs to be saved
    // so the second upload's logic sees a populated snapshot and
    // preserves the original OLD URL for the first doc.
    if (snapshotToWrite !== null) {
      await prisma.driver.update({
        where: { id: driverId },
        data: { editSnapshot: snapshotToWrite as any },
      });
    }

    // NOTE: Do NOT auto-resolve review requests. Admin must verify.

    // ============== AUTO-SUBMIT ON EXPIRY-DOC REPLACEMENT ==============
    // Strict trust model: replacing IQAMA_NATIONAL_ID / DRIVING_LICENSE
    // on an APPROVED driver pushes the driver into PENDING_REVIEW so
    // admin can re-verify before they go back into circulation.
    //
    // Gating: we only trigger the auto-submit once ALL required-with-
    // expiry docs are valid. If the vendor is mid-renewal — replaced
    // the iqama but the driving license is still expired — we don't
    // push to admin yet. Otherwise admin gets a noisy notification for
    // every individual replacement during a multi-doc renewal session.
    //
    // Profile photos don't trigger re-review — those aren't trust-
    // bearing documents in the same way.
    const isExpiryDocReplacement =
      DRIVER_DOCS_WITH_EXPIRY.includes(type) && driver.status === "APPROVED";

    if (isExpiryDocReplacement) {
      // Re-read docs to capture the just-upserted state.
      const freshDocs = await prisma.driverDocument.findMany({
        where: { driverId },
        select: { type: true, expiryDate: true },
      });
      const now = new Date();
      const stillMissingOrExpired = DRIVER_DOCS_WITH_EXPIRY.filter((t) => {
        const d = freshDocs.find((x) => x.type === t);
        return !d || !d.expiryDate || new Date(d.expiryDate) <= now;
      });

      if (stillMissingOrExpired.length > 0) {
        // Mid-renewal: don't auto-submit yet.
        const remainingLabels = stillMissingOrExpired
          .map((t) => DRIVER_DOCUMENT_LABELS[t] || t)
          .join(", ");
        return res.json({
          success: true,
          message: `${DRIVER_DOCUMENT_LABELS[type] || type} uploaded successfully. Please also replace: ${remainingLabels}.`,
        });
      }

      // All required-with-expiry docs are now valid — auto-transition
      // to admin review.
      //
      // editSnapshot is intentionally NOT overwritten here. It was
      // already populated above with the OLD doc URLs for
      // IQAMA_NATIONAL_ID/DRIVING_LICENSE and current values for
      // everything else. Overwriting it now would erase the OLD URLs
      // and break the admin's REPLACED badge.
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          status: "PENDING_REVIEW",
          // Deliberately do NOT touch isActive or suspendedForDocs.
          // - If driver was operational, they go into review with
          //   isActive=true but status=PENDING_REVIEW (no new bookings
          //   allowed because eligibility requires status=APPROVED).
          // - If driver was already suspended by cron, those flags
          //   stay set and admin approval is what clears them.
        },
      });

      // Notify admins so the renewal lands in their review queue.
      const adminUsers = await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      if (adminUsers.length > 0) {
        await prisma.notification.createMany({
          data: adminUsers.map((admin) => ({
            userId: admin.id,
            title: "Driver Submitted for Review (document renewal)",
            message: `${vendor.companyName} renewed documents on driver ${driver.firstName} ${driver.lastName}. Please verify the new documents and expiry dates.`,
            type: "DRIVER_PENDING_REVIEW",
            data: {
              driverId,
              vendorId: vendor.id,
              renewal: true,
            },
          })),
        });
      }
    }

    res.json({
      success: true,
      message: `${DRIVER_DOCUMENT_LABELS[type] || type} uploaded successfully`,
    });
  },
);

// ============== REQUEST DRIVER CHANGES ==============

/**
 * POST /api/v1/vendor/drivers/:driverId/change-request
 *
 * Vendor requests permission to edit specific fields/documents of an approved driver.
 * Mirrors the partner's profile change request system.
 */
export const requestDriverChanges = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { driverId } = req.params;
    const { fields, reason } = req.body;

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestError("Select at least one field to update");
    }
    if (!reason?.trim()) {
      throw new BadRequestError(
        "Please provide a reason for the change request",
      );
    }

    // Validate fields
    const validFields = Object.keys(DRIVER_EDITABLE_FIELDS);
    const invalidFields = fields.filter(
      (f: string) => !validFields.includes(f),
    );
    if (invalidFields.length > 0) {
      throw new BadRequestError(
        `Invalid fields: ${invalidFields.join(", ")}. Must be one of: ${validFields.join(", ")}`,
      );
    }

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
    });
    if (!driver) throw new NotFoundError("Driver");

    if (driver.status !== "APPROVED") {
      throw new BadRequestError(
        "Change requests can only be submitted for approved drivers",
      );
    }

    // Check for existing pending vendor-initiated request
    const existingRequest = await prisma.driverReviewRequest.findFirst({
      where: {
        driverId,
        requestType: "VENDOR_INITIATED",
        status: "PENDING",
      },
    });
    if (existingRequest) {
      throw new BadRequestError(
        "A change request is already pending for this driver",
      );
    }

    // Create the change request (vendor-initiated, awaiting admin approval)
    const reviewRequest = await prisma.driverReviewRequest.create({
      data: {
        driverId,
        fields,
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
      .map((f: string) => DRIVER_EDITABLE_FIELDS[f] || f)
      .join(", ");

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Driver Change Request",
          message: `${vendor.companyName} requests to update driver ${driver.firstName} ${driver.lastName}. Fields: ${fieldLabels}. Reason: ${reason.trim()}`,
          type: "DRIVER_CHANGE_REQUEST",
          data: {
            driverId,
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
        driverId,
        fields,
        fieldLabels: fields.map((f: string) => DRIVER_EDITABLE_FIELDS[f] || f),
        reason: reason.trim(),
      },
    });
  },
);

// ============== SUBMIT DRIVER FOR REVIEW ==============

/**
 * POST /api/v1/vendor/drivers/:driverId/submit
 *
 * Submit driver for admin review after making changes.
 * Status: CHANGES_REQUESTED → PENDING_REVIEW
 */
export const submitDriverForReview = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { driverId } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
      include: { documents: { select: { type: true, expiryDate: true } } },
    });
    if (!driver) throw new NotFoundError("Driver");

    const isResuspendedFlow = (driver as any).suspendedForDocs === true;
    const isDraftFlow = driver.status === "DRAFT";
    const submittableStatuses = ["PENDING_REVIEW", "CHANGES_REQUESTED"];

    if (
      !isResuspendedFlow &&
      !isDraftFlow &&
      !submittableStatuses.includes(driver.status)
    ) {
      throw new BadRequestError("Driver is not in a submittable status");
    }

    if (isResuspendedFlow) {
      const now = new Date();
      const requiredWithExpiry = ["DRIVING_LICENSE", "IQAMA_NATIONAL_ID"];
      const missingOrExpired = requiredWithExpiry.filter((t) => {
        const d = driver.documents.find((x) => x.type === t);
        return !d || !d.expiryDate || new Date(d.expiryDate) <= now;
      });
      if (missingOrExpired.length > 0) {
        throw new BadRequestError(
          `Cannot submit. The following document(s) are still missing or expired: ${missingOrExpired.join(", ")}. Please replace them first.`,
        );
      }

      // Preserve any editSnapshot already accumulated during the
      // renewal session (the upload endpoint seeds it with OLD doc
      // URLs so admin sees REPLACED badges). If nothing was
      // accumulated — e.g. the vendor manually clicked Submit on a
      // suspended driver without going through the upload endpoint
      // first — fall back to a minimal basic-fields snapshot so admin
      // at least gets the field-level CHANGED diff.
      const currentSnap =
        (driver.editSnapshot as Record<string, any> | null) || null;
      const snapshotIsPopulated =
        currentSnap !== null &&
        typeof currentSnap === "object" &&
        Object.keys(currentSnap).length > 0;

      const snapshotForUpdate = snapshotIsPopulated
        ? currentSnap
        : ({
            firstName: driver.firstName,
            lastName: driver.lastName,
            phone: driver.phone,
          } as Record<string, any>);

      await prisma.driver.update({
        where: { id: driverId },
        data: {
          status: "PENDING_REVIEW",
          editSnapshot: snapshotForUpdate as any,
          // Stays suspended until admin approves.
        },
      });
    } else if (isDraftFlow) {
      // First-time submission from the Add Driver wizard.
      const uploadedTypes = new Set(driver.documents.map((d) => d.type));
      const missing = REQUIRED_DRIVER_DOCUMENTS.filter(
        (t) => !uploadedTypes.has(t),
      );
      if (missing.length > 0) {
        throw new BadRequestError(
          `Cannot submit. The following document(s) are still missing: ${missing.join(", ")}.`,
        );
      }
      const now = new Date();
      const requiredWithExpiry = DRIVER_DOCS_WITH_EXPIRY;
      const expiredOrMissing = requiredWithExpiry.filter((t) => {
        const d = driver.documents.find((x) => x.type === t);
        return !d || !d.expiryDate || new Date(d.expiryDate) <= now;
      });
      if (expiredOrMissing.length > 0) {
        throw new BadRequestError(
          `The following document(s) are missing valid expiry dates: ${expiredOrMissing.join(", ")}.`,
        );
      }
      await prisma.driver.update({
        where: { id: driverId },
        data: { status: "PENDING_REVIEW" },
      });
    } else {
      await prisma.driver.update({
        where: { id: driverId },
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
          title: `Driver Submitted for Review${titleSuffix}`,
          message: `${vendor.companyName} has submitted driver ${driver.firstName} ${driver.lastName} for review.${messageSuffix}`,
          type: "DRIVER_PENDING_REVIEW",
          data: {
            driverId,
            vendorId: vendor.id,
            postExpiry: isResuspendedFlow,
          },
        })),
      });
    }

    res.json({
      success: true,
      message: "Driver submitted for admin review",
    });
  },
);

// ============== ASSIGN/UNASSIGN VEHICLE ==============

/**
 * PATCH /api/v1/vendor/drivers/:driverId/vehicle
 *
 * Assign or unassign a vehicle to/from a driver.
 */
export const assignVehicle = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { driverId } = req.params;
    const { vehicleId } = req.body; // null to unassign

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
    });
    if (!driver) throw new NotFoundError("Driver");

    if (vehicleId) {
      // Assign vehicle
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, vendorId: vendor.id, isActive: true },
      });
      if (!vehicle) throw new BadRequestError("Invalid or inactive vehicle");

      // Check vehicle doesn't have another driver
      const existingDriver = await prisma.driver.findFirst({
        where: {
          assignedVehicleId: vehicleId,
          id: { not: driverId },
          isActive: true,
        },
      });
      if (existingDriver) {
        throw new BadRequestError(
          `This vehicle is already assigned to ${existingDriver.firstName} ${existingDriver.lastName}`,
        );
      }

      await prisma.driver.update({
        where: { id: driverId },
        data: { assignedVehicleId: vehicleId },
      });

      res.json({
        success: true,
        message: `Vehicle ${vehicle.make} ${vehicle.model} assigned to driver`,
      });
    } else {
      // Unassign
      await prisma.driver.update({
        where: { id: driverId },
        data: { assignedVehicleId: null },
      });

      res.json({
        success: true,
        message: "Vehicle unassigned from driver",
      });
    }
  },
);

// ============== TOGGLE DRIVER ACTIVE STATUS ==============

/**
 * PATCH /api/v1/vendor/drivers/:driverId/toggle-active
 *
 * Vendor can disable/enable a driver even if admin has approved them.
 * Disabled drivers cannot be assigned to bookings.
 */
export const toggleDriverActive = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { driverId } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
    });
    if (!driver) throw new NotFoundError("Driver");

    // If deactivating, check for active bookings
    if (driver.isActive) {
      const activeBookings = await prisma.booking.count({
        where: {
          driverId,
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
          `Cannot deactivate driver — they have ${activeBookings} active booking(s). Complete or reassign them first.`,
        );
      }
    }

    const updated = await prisma.driver.update({
      where: { id: driverId },
      data: { isActive: !driver.isActive },
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
          title: updated.isActive
            ? "Driver Reactivated"
            : "Driver Deactivated by Vendor",
          message: `${vendor.companyName} ${updated.isActive ? "reactivated" : "deactivated"} driver ${driver.firstName} ${driver.lastName}`,
          type: "DRIVER_STATUS_CHANGED",
          data: { driverId, vendorId: vendor.id, isActive: updated.isActive },
        })),
      });
    }

    res.json({
      success: true,
      message: updated.isActive
        ? `${driver.firstName} ${driver.lastName} has been activated`
        : `${driver.firstName} ${driver.lastName} has been deactivated`,
      data: {
        id: updated.id,
        isActive: updated.isActive,
      },
    });
  },
);

// ============== SOFT DELETE DRIVER ==============

/**
 * DELETE /api/v1/vendor/drivers/:driverId
 *
 * Soft delete — sets isActive = false and unassigns from vehicle.
 * Cannot delete if driver has active bookings.
 */
export const deleteDriver = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { driverId } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
    });
    if (!driver) throw new NotFoundError("Driver");

    // Check for active bookings
    const activeBookings = await prisma.booking.count({
      where: {
        driverId,
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
        `Cannot delete driver — they have ${activeBookings} active booking(s). Complete or reassign them first.`,
      );
    }

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Driver Removed by Vendor",
          message: `${vendor.companyName} removed driver ${driver.firstName} ${driver.lastName} (${driver.phone})`,
          type: "DRIVER_DELETED",
          data: { driverId, vendorId: vendor.id },
        })),
      });
    }

    // Soft delete: deactivate + unassign vehicle
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        isActive: false,
        assignedVehicleId: null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "DRIVER_DELETED",
        entity: "Driver",
        entityId: driverId,
        changes: {
          name: `${driver.firstName} ${driver.lastName}`,
          phone: driver.phone,
          vendor: vendor.companyName,
        },
      },
    });

    res.json({
      success: true,
      message: `${driver.firstName} ${driver.lastName} has been removed`,
    });
  },
);

// ============== GET DRIVER CHANGE REQUESTS ==============

/**
 * GET /api/v1/vendor/drivers/:driverId/change-requests
 *
 * Get all change requests for a driver.
 */
export const getDriverChangeRequests = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { driverId } = req.params;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, vendorId: vendor.id },
      select: { id: true },
    });
    if (!driver) throw new NotFoundError("Driver");

    const requests = await prisma.driverReviewRequest.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
    });

    const formattedRequests = requests.map((r) => ({
      id: r.id,
      fields: r.fields,
      fieldLabels: (r.fields as string[]).map(
        (f) => DRIVER_EDITABLE_FIELDS[f] || DRIVER_DOCUMENT_LABELS[f] || f,
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

// ============== GET AVAILABLE VEHICLES FOR ASSIGNMENT ==============

/**
 * GET /api/v1/vendor/drivers/available-vehicles
 *
 * Get vehicles that can be assigned to a driver.
 */
export const getAvailableVehicles = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const vehicles = await prisma.vehicle.findMany({
      where: {
        vendorId: vendor.id,
        isActive: true,
        status: "APPROVED",
      },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        plateNumber: true,
        color: true,
        category: true,
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { make: "asc" },
    });

    const formattedVehicles = vehicles.map((v) => ({
      id: v.id,
      label: `${v.make} ${v.model} ${v.year} — ${v.plateNumber}`,
      make: v.make,
      model: v.model,
      year: v.year,
      plateNumber: v.plateNumber,
      color: v.color,
      category: v.category,
      isAssigned: !!v.driver,
      assignedDriver: v.driver
        ? `${v.driver.firstName} ${v.driver.lastName}`
        : null,
    }));

    res.json({
      success: true,
      data: {
        vehicles: formattedVehicles,
        availableCount: formattedVehicles.filter((v) => !v.isAssigned).length,
        totalCount: formattedVehicles.length,
      },
    });
  },
);
