// ============================================
// lib/image-url.ts
//
// Helpers for working with image URLs from the backend. The platform
// stores GCS object paths server-side; the backend mints signed URLs
// at read time. For small thumbnails we route those URLs through the
// resize proxy so the wire payload matches the display size.
//
// Two consumers:
//   • <ProfileImage> uses these internally to produce a proxy URL.
//   • Free-form <img> tags (e.g. vehicle gallery cards that can't use
//     ProfileImage because of their aspect-video, overlay-heavy
//     layout) can call `proxiedImageUrl()` to get a smaller variant
//     without rewriting their markup.
// ============================================

/**
 * Extract the GCS object path from a signed URL.
 * Returns null when the input isn't a recognised GCS URL.
 *
 * The backend serves URLs in two shapes:
 *   https://storage.googleapis.com/<bucket>/<object-path>?...
 *   https://<bucket>.storage.googleapis.com/<object-path>?...
 */
export function extractGcsObjectPath(signedUrl: string): string | null {
  if (!signedUrl || !signedUrl.startsWith("http")) return null;
  try {
    const u = new URL(signedUrl);
    if (u.hostname === "storage.googleapis.com") {
      const segments = u.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return null;
      return segments.slice(1).join("/");
    }
    if (u.hostname.endsWith(".storage.googleapis.com")) {
      return u.pathname.replace(/^\//, "");
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a resize-proxy URL for a (path, width) pair.
 * The backend clamps `width` to a small set of buckets, so passing
 * any reasonable number is safe — cache fragmentation is bounded.
 *
 * URL composition note: `NEXT_PUBLIC_API_URL` is the API host
 * without the `/api/v1` prefix (matches what `lib/api.ts` expects).
 * The prefix is appended here. Previously this function used the
 * env var verbatim and produced `<host>/images/resize` — missing
 * `/api/v1` — which 404'd the proxy entirely and made every
 * ProfileImage fall through to its broken-image fallback.
 */
export function buildProxyUrl(objectPath: string, width: number): string {
  const apiHost = process.env.NEXT_PUBLIC_API_URL;
  const encoded = encodeURIComponent(objectPath);
  return `${apiHost}/api/v1/images/resize?path=${encoded}&w=${width}`;
}

/**
 * Convenience: take a signed URL (or null) and a target display width,
 * return a proxy URL when transformable, the original URL when not.
 * The width is multiplied by 2 internally for retina sharpness — pass
 * the CSS display width, not the device-pixel width.
 *
 *
 *   <img src={proxiedImageUrl(doc.fileUrl, 320)} ... />
 */
export function proxiedImageUrl(
  signedUrl: string | null | undefined,
  cssDisplayWidth: number,
): string | null {
  if (!signedUrl) return null;
  const objectPath = extractGcsObjectPath(signedUrl);
  if (!objectPath) return signedUrl;
  return buildProxyUrl(objectPath, cssDisplayWidth * 2);
}
