// ============================================
// apps/server/src/controller/upload.controller.ts
// Shared File Upload via GCS Signed URLs
// ============================================

import { Request, Response } from "express";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { BadRequestError } from "../../utils/AppError";

// ============== GCS CLIENT ==============

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
});

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

// ============== CONSTANTS ==============

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

// Allowed sections — maps to top-level folders in the bucket
const ALLOWED_SECTIONS = [
  "partners", // Partner documents, MOU, logo
  "vendors", // Vendor documents, MOU, vehicles, drivers
  "customers", // Customer profile photos
  "bookings", // Booking attachments, receipts
  "invoices", // Payment confirmation uploads
  "admin", // Admin uploads
];

// ============== GET SIGNED UPLOAD URL ==============

/**
 * POST /api/v1/upload/signed-url
 *
 * Universal file upload endpoint. Any authenticated user can upload.
 * The caller specifies section + folder + entityId to determine the path.
 *
 * Body:
 *   - fileName: "cr-certificate.pdf"
 *   - fileType: "application/pdf"
 *   - section: "partners" | "vendors" | "customers" | "bookings" | "invoices" | "admin"
 *   - folder: "documents" | "mou" | "logo" | "vehicles" | "drivers" | "profile" | "attachments" | "receipts"
 *   - entityId: the partner/vendor/customer/booking ID (determines subfolder)
 *
 * Resulting path: {section}/{entityId}/{folder}/{uuid}-{fileName}
 * Example: partners/abc-123/documents/550e8400-cr-certificate.pdf
 */
export const getSignedUploadUrl = asyncWrapper(
  async (req: Request, res: Response) => {
    const { fileName, fileType, section, folder, entityId } = req.body;

    // Validate required fields
    if (!fileName || !fileType) {
      throw new BadRequestError("fileName and fileType are required");
    }
    if (!section || !entityId) {
      throw new BadRequestError("section and entityId are required");
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(fileType)) {
      throw new BadRequestError(
        "File type not allowed. Accepted: PDF, JPEG, PNG, WebP",
      );
    }

    // Validate section
    if (!ALLOWED_SECTIONS.includes(section)) {
      throw new BadRequestError(
        `Invalid section. Must be one of: ${ALLOWED_SECTIONS.join(", ")}`,
      );
    }

    // Build unique path
    const folderPath = folder || "uploads";
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueName = `${uuidv4()}-${sanitizedFileName}`;
    const filePath = `${section}/${entityId}/${folderPath}/${uniqueName}`;

    const file = bucket.file(filePath);

    // Generate signed URL for upload (valid 15 minutes)
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType: fileType,
    });

    // Generate signed URL for reading (valid 7 days)
    const [readUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        uploadUrl,
        readUrl,
        filePath,
        fileName: sanitizedFileName,
      },
    });
  },
);

// ============== GET SIGNED READ URL ==============

/**
 * POST /api/v1/upload/read-url
 *
 * Generate a fresh signed read URL for an existing file.
 * Use when a previously stored readUrl has expired.
 *
 * Body: { filePath }
 */
export const getSignedReadUrl = asyncWrapper(
  async (req: Request, res: Response) => {
    const { filePath } = req.body;

    if (!filePath) {
      throw new BadRequestError("filePath is required");
    }

    const file = bucket.file(filePath);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new BadRequestError("File not found");
    }

    const [readUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: { readUrl },
    });
  },
);
