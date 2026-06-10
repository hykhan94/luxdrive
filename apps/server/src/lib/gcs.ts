// ============================================
// src/lib/gcs.ts
// Shared GCS access — single source of truth for the bucket instance
// and the read-URL signer used by every controller that serves files
// (logos, documents, MOUs, payment receipts, driver photos, etc.).
//
// Before this module existed, each controller had its own copy of
// `getReadUrl` plus its own Storage initialisation. That caused two
// problems:
//
//   1. Drift. When a bug was fixed in one copy it stayed broken in
//      the other twelve. The "legacy http-URL short-circuit" fix
//      that lived only in partner/profile.controller.ts was exactly
//      this — partners could see their own logos but admin couldn't.
//
//   2. Cost. Each controller spun up its own Storage client at
//      module-load time. Trivially inefficient, but worse for
//      cold-start latency on Cloud Run.
//
// All controllers should import `getReadUrl` (and `bucket` if they
// need raw bucket access for uploads) from here. Do NOT re-roll a
// local copy. If you need a behaviour tweak — different expiry,
// different action — add an option here, don't fork.
// ============================================

import { Storage } from "@google-cloud/storage";

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
});

/**
 * The shared bucket instance. Use this for any GCS operation —
 * uploads, deletes, signed URL generation. Single source of truth.
 */
export const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || "");

export { storage };

/**
 * Mint a fresh signed read URL for a stored GCS object.
 *
 * The DB stores object paths (e.g. "partners/abc/logo/xyz.jpg"), not
 * URLs. On every read we re-sign so the caller always gets a URL
 * with ~7 days of validity remaining — fresh enough to survive any
 * reasonable client cache.
 *
 * Legacy-data healing: some older rows stored the full signed URL
 * in the DB rather than the object path. Those URLs expired 7 days
 * after they were minted and now return 403 forever, which manifests
 * as broken images in the UI. When we detect that case we extract
 * the object path from the URL's pathname and re-sign — so the same
 * helper that serves clean rows also self-heals dirty ones, and
 * subsequent reads return a current URL.
 *
 * Expected legacy URL shape:
 *   https://storage.googleapis.com/<bucket>/<object-path>?<query>
 *
 * Returns:
 *   - null if `filePath` is null or empty
 *   - the input as-is if GCS_BUCKET_NAME is unset (dev / tests
 *     without GCS configured)
 *   - the input as-is if it's an http URL we can't decode (external
 *     avatar URLs etc. — best-effort, let the browser try)
 *   - a fresh signed URL otherwise
 *   - null if signing fails (object missing, IAM error, etc.)
 */
export async function getReadUrl(
  filePath: string | null,
): Promise<string | null> {
  if (!filePath || !process.env.GCS_BUCKET_NAME) return filePath;

  let objectPath = filePath;
  if (filePath.startsWith("http")) {
    try {
      const u = new URL(filePath);
      const bucketPrefix = `/${process.env.GCS_BUCKET_NAME}/`;
      if (u.pathname.startsWith(bucketPrefix)) {
        objectPath = decodeURIComponent(u.pathname.slice(bucketPrefix.length));
      } else {
        // Unrecognised URL — not ours. Return as-is and let the
        // browser handle it (might be a third-party avatar, an admin-
        // pasted image, etc.). Failing here would also be defensible
        // but breaks more than it helps.
        return filePath;
      }
    } catch {
      // Malformed URL — caller probably wrote garbage. Return it
      // anyway; the broken-image fallback is the right surface.
      return filePath;
    }
  }

  try {
    const [url] = await bucket.file(objectPath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    return url;
  } catch {
    return null;
  }
}
