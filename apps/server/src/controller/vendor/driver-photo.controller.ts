// ============================================
// apps/server/src/controller/vendor/driver-photo.controller.ts
// Vendor Portal — Driver Profile Photo Verification
//
// Verifies a driver profile photo meets the dress code:
//   - A face is visible
//   - A formal shirt is worn
//   - A tie is worn
//
// Uses Google Cloud Vision (same GCS credentials you already use).
// ============================================

import { Request, Response } from "express";
import vision from "@google-cloud/vision";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { prisma } from "../../lib/prisma";

// ============== GOOGLE CLOUD VISION SETUP ==============

// Reuses the same service-account credentials as your GCS storage.
const visionClient = new vision.ImageAnnotatorClient({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
});

// Minimum confidence (0–1) to treat a detection as positive.
const MIN_CONFIDENCE = 0.6;

// Max accepted image size: 8 MB
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// ============== TYPES ==============

interface DressCodeResult {
  passed: boolean;
  message: string;
  detections: {
    faceDetected: boolean;
    shirtDetected: boolean;
    tieDetected: boolean;
  };
}

// ============== HELPER ==============

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!vendor) throw new NotFoundError("Vendor profile");
  return vendor;
}

// ============== DRESS-CODE CHECK (Google Cloud Vision) ==============

/**
 * Runs the captured photo through Google Cloud Vision and decides
 * whether it meets the driver dress code.
 *
 * Vision is asked for three things in a single call:
 *   - OBJECT_LOCALIZATION  → reliably detects "Tie", and clothing objects
 *   - LABEL_DETECTION      → catches "Dress shirt", "Collar", "Formal wear"
 *   - FACE_DETECTION       → confirms a person is actually in frame
 */
async function verifyDressCode(imageBuffer: Buffer): Promise<DressCodeResult> {
  const [result] = await visionClient.annotateImage({
    image: { content: imageBuffer },
    features: [
      { type: "OBJECT_LOCALIZATION" },
      { type: "LABEL_DETECTION", maxResults: 30 },
      { type: "FACE_DETECTION" },
    ],
  });

  const objects = result.localizedObjectAnnotations || [];
  const labels = result.labelAnnotations || [];
  const faces = result.faceAnnotations || [];

  // True if any detected object OR label name contains `term`
  // with confidence at/above the threshold.
  const has = (...terms: string[]): boolean => {
    const matchesTerm = (text: string) =>
      terms.some((t) => text.toLowerCase().includes(t));

    const objectHit = objects.some(
      (o) =>
        !!o.name && matchesTerm(o.name) && (o.score ?? 0) >= MIN_CONFIDENCE,
    );
    const labelHit = labels.some(
      (l) =>
        !!l.description &&
        matchesTerm(l.description) &&
        (l.score ?? 0) >= MIN_CONFIDENCE,
    );
    return objectHit || labelHit;
  };

  const faceDetected = faces.length > 0;
  const tieDetected = has("tie");
  // "shirt" can register as "Dress shirt", "Collar", "Formal wear",
  // or sometimes only the generic "Clothing".
  const shirtDetected = has(
    "shirt",
    "dress shirt",
    "collar",
    "formal wear",
    "suit",
    "blazer",
  );

  const detections = { faceDetected, shirtDetected, tieDetected };

  if (!faceDetected) {
    return {
      passed: false,
      message:
        "No face detected. Make sure the driver is clearly visible and facing the camera.",
      detections,
    };
  }
  if (!shirtDetected) {
    return {
      passed: false,
      message:
        "A formal shirt could not be detected. The driver must wear a formal shirt.",
      detections,
    };
  }
  if (!tieDetected) {
    return {
      passed: false,
      message:
        "No tie detected. The driver must wear a tie as part of the uniform.",
      detections,
    };
  }

  return {
    passed: true,
    message: "Dress code verified — formal shirt and tie detected.",
    detections,
  };
}

// ============== VERIFY DRIVER PHOTO ==============

/**
 * POST /api/v1/vendor/drivers/verify-photo
 *
 * Accepts a single image file under the field name "photo"
 * (multipart/form-data) and runs the dress-code check.
 *
 * Returns: { success, data: { passed, message } }
 *
 * This endpoint does NOT store the image — it only verifies it.
 * The frontend uploads the photo to GCS and saves it via
 * uploadDriverDocument only after this returns passed = true.
 *
 * Requires `multer` middleware (memory storage) on the route so
 * the file arrives as req.file with a Buffer.
 */
export const verifyDriverPhoto = asyncWrapper(
  async (req: Request, res: Response) => {
    // Vendor must exist (auth + role middleware already ran).
    await getVendorForUser(req.user!.id);

    const file = (req as any).file as
      | { buffer: Buffer; mimetype: string; size: number }
      | undefined;

    if (!file || !file.buffer) {
      throw new BadRequestError(
        "No photo received. Capture a photo and try again.",
      );
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestError("Uploaded file is not an image.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestError(
        "Image is too large. Please capture a smaller photo.",
      );
    }

    let result: DressCodeResult;
    try {
      result = await verifyDressCode(file.buffer);
    } catch (err) {
      // Vision API failure shouldn't 500 the whole request —
      // surface a clean, retryable message.
      console.error("[verifyDriverPhoto] Vision API error:", err);
      throw new BadRequestError(
        "Photo verification service is unavailable right now. Please try again in a moment.",
      );
    }

    res.json({
      success: true,
      data: {
        passed: result.passed,
        message: result.message,
      },
    });
  },
);
