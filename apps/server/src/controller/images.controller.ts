// ============================================
// src/controller/images.controller.ts
//
// On-demand image resize proxy. Frontend asks for a thumbnail at a
// specific width; we fetch the original from GCS, resize via sharp,
// cache in memory, and serve. Small images load fast even when the
// originals are multi-MB.
//
// Why this exists:
//   The platform stores original-resolution uploads (logos, photos,
//   vehicle pics). When the admin partner list renders dozens of 32px
//   avatars, fetching the multi-MB originals for each was wasteful
//   and slow. This route serves a sized variant per request.
//
// Why on-demand and not pre-generated:
//   We considered generating thumbnails at upload time. That requires
//   changing the direct-to-GCS signed-upload flow (currently the
//   backend never sees the bytes) and would need a migration to
//   generate thumbs for existing images. On-demand resize works for
//   all images today with zero migration; we can swap to
//   pre-generated thumbnails later by having this route check for a
//   pre-existing thumb path before falling through to runtime resize.
//
// Security:
//   • Auth: route is mounted under isAuthenticated. Anyone with a
//     valid session can request resizes — same trust level as the
//     existing signed-URL system that serves originals.
//   • Path traversal: we only accept paths under known top-level
//     prefixes (partners/, vendors/, drivers/, vehicles/, payments/,
//     receipts/). Anything else is rejected. This prevents using the
//     proxy to read arbitrary bucket objects.
//
// Cache:
//   In-process Map with size-based eviction (LRU-ish via insertion-
//   order tracking). Per-instance only — Cloud Run replicas don't
//   share. That's fine; the hit rate within a single replica is what
//   matters, and a cold thumbnail on a fresh replica is one extra
//   round trip, not a correctness problem. If we move to a multi-
//   replica setup at scale we can promote this to Redis.
// ============================================

import { Request, Response } from "express";
import sharp from "sharp";
import { bucket } from "../lib/gcs";
import { asyncWrapper } from "../utils/asyncWrapper";
import { BadRequestError, NotFoundError } from "../utils/AppError";
import { logger } from "../utils/logger";

// ============== CONSTANTS ==============

// Object paths must start with one of these prefixes. Anything else
// gets rejected before we touch GCS. Matches the directory layout in
// upload.controller.ts: `partners/{id}/...`, `vendors/{id}/...`, etc.
const ALLOWED_PATH_PREFIXES = [
  "partners/",
  "vendors/",
  "drivers/",
  "vehicles/",
  "payments/",
  "receipts/",
];

// Allowed output widths. Clamping to a fixed set prevents the cache
// from being polluted by a thousand near-duplicate variants and
// keeps memory predictable. If a caller asks for w=130 we round up
// to w=192 — same visual quality, much better cache hit rate.
const ALLOWED_WIDTHS = [64, 96, 128, 192, 256, 384, 512, 768, 1024];

// Max output bytes per variant. Above this the cache eviction kicks
// in. ~50MB is plenty for hot thumbnails without risking the
// process running out of memory.
const CACHE_MAX_BYTES = 50 * 1024 * 1024;

// Cache TTL. Variants beyond this age get re-fetched and re-encoded
// (in case the original was replaced). Originals change rarely so a
// long TTL is fine.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ============== CACHE ==============

interface CacheEntry {
  body: Buffer;
  contentType: string;
  size: number;
  createdAt: number;
}

// Keyed by `${path}@${width}`. Map preserves insertion order, so we
// can evict the oldest entries when over budget.
const cache = new Map<string, CacheEntry>();
let cacheBytes = 0;

function cacheKey(path: string, width: number): string {
  return `${path}@w=${width}`;
}

function cacheGet(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  // Expired? Drop and miss.
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    cacheBytes -= entry.size;
    return null;
  }
  // Touch for LRU: re-insert at the end of the map.
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  // Evict the oldest entries until we're under budget. Map iteration
  // order is insertion order, so `.keys().next()` gives us the LRU.
  while (cacheBytes + entry.size > CACHE_MAX_BYTES && cache.size > 0) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    const oldest = cache.get(oldestKey)!;
    cache.delete(oldestKey);
    cacheBytes -= oldest.size;
  }
  cache.set(key, entry);
  cacheBytes += entry.size;
}

// ============== HELPERS ==============

function pickAllowedWidth(requested: number): number {
  // Round UP to the next allowed width so we never serve a smaller
  // variant than requested. If the request is bigger than our biggest
  // bucket, cap at the largest.
  for (const w of ALLOWED_WIDTHS) {
    if (w >= requested) return w;
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

function isAllowedPath(path: string): boolean {
  if (!path || path.includes("..") || path.includes("\\")) return false;
  return ALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function contentTypeFor(format: string): string {
  switch (format) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

// ============== HANDLER ==============

/**
 * GET /api/v1/images/resize
 *
 * Query params:
 *   path  (required) — GCS object path, e.g. "partners/abc/logo/x.jpg"
 *   w     (optional, default 256) — target width in pixels.
 *                                   Clamped to ALLOWED_WIDTHS.
 *
 * Responds with the resized image bytes, content-type matching the
 * source, and aggressive cache headers so the browser also caches
 * each variant.
 *
 * Errors:
 *   400 — missing/invalid path or width
 *   404 — object not found in bucket
 *   500 — resize/encode failure (network or sharp error)
 */
export const resizeImage = asyncWrapper(async (req: Request, res: Response) => {
  const rawPath = (req.query.path as string | undefined) || "";
  const rawWidth = parseInt((req.query.w as string) || "256", 10);

  if (!isAllowedPath(rawPath)) {
    throw new BadRequestError("Invalid or disallowed image path");
  }
  if (!Number.isFinite(rawWidth) || rawWidth <= 0 || rawWidth > 2048) {
    throw new BadRequestError("Invalid width parameter");
  }

  const width = pickAllowedWidth(rawWidth);
  const key = cacheKey(rawPath, width);

  // Fast path: hot cache.
  const hit = cacheGet(key);
  if (hit) {
    res.setHeader("Content-Type", hit.contentType);
    res.setHeader("X-Image-Cache", "hit");
    // Keep the browser cache long. Same path+width is content-
    // addressable for our purposes — if the underlying file changes,
    // a new upload writes to a new path (uuid-prefixed filenames).
    res.setHeader("Cache-Control", "private, max-age=604800, immutable");
    res.send(hit.body);
    return;
  }

  // Cold: fetch original from GCS, resize, encode, cache, serve.
  const file = bucket.file(rawPath);
  let originalBytes: Buffer;
  try {
    const [exists] = await file.exists();
    if (!exists) throw new NotFoundError("Image not found");
    const [data] = await file.download();
    originalBytes = data;
  } catch (err: any) {
    if (err instanceof NotFoundError) throw err;
    logger.warn("[images] gcs fetch failed", {
      path: rawPath,
      err: err?.message,
    });
    throw new NotFoundError("Image not found");
  }

  let resized: Buffer;
  let format: string;
  try {
    const pipeline = sharp(originalBytes).rotate(); // auto-orient from EXIF
    const meta = await pipeline.metadata();
    format = meta.format || "jpeg";

    // Only resize if the source is wider than the target — never
    // upscale (wastes bytes for no quality gain). Preserve format
    // so PNG logos stay PNG (transparency), JPEGs stay JPEG.
    const shouldResize = (meta.width || 0) > width;
    let out = shouldResize
      ? pipeline.resize({ width, withoutEnlargement: true })
      : pipeline;

    // Re-encode with quality tuned per format. PNG: lossless but
    // crush palette. JPEG/WebP: quality 80 is the sweet spot.
    switch (format) {
      case "png":
        out = out.png({ compressionLevel: 9, adaptiveFiltering: true });
        break;
      case "webp":
        out = out.webp({ quality: 80 });
        break;
      case "jpeg":
      case "jpg":
      default:
        out = out.jpeg({ quality: 80, mozjpeg: true });
        format = "jpeg";
        break;
    }

    resized = await out.toBuffer();
  } catch (err: any) {
    logger.warn("[images] sharp pipeline failed", {
      path: rawPath,
      err: err?.message,
    });
    // If sharp can't handle the input (corrupt, unsupported format),
    // serve the original. Better than failing entirely.
    resized = originalBytes;
    format = "jpeg";
  }

  const contentType = contentTypeFor(format);
  cacheSet(key, {
    body: resized,
    contentType,
    size: resized.length,
    createdAt: Date.now(),
  });

  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Image-Cache", "miss");
  res.setHeader("Cache-Control", "private, max-age=604800, immutable");
  res.send(resized);
});
