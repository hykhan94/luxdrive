"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Building2, User, Car, Shield, FileText } from "lucide-react";
import { extractGcsObjectPath, buildProxyUrl } from "@/lib/image-url";

// ============================================
// components/ui/profile-image.tsx
//
// THE canonical image loader for the platform. Every <img> that
// renders user-uploaded content (logos, avatars, vehicle photos,
// driver photos, document thumbnails, etc.) goes through here. This
// is what makes loading states, error fallbacks, lazy loading,
// thumbnail sizing, and visual treatment consistent across Partner,
// Admin, Vendor, and Customer portals.
//
// Two layout modes:
//
//   1. SIZED MODE (default) — pass a `size` preset (xs..2xl) and
//      ProfileImage renders its own container at that exact size.
//      Use this for avatars, profile pics, logo tiles. The component
//      owns its container.
//
//   2. FILL MODE (`fill` prop) — the parent has already established
//      the container size (e.g. via `w-16 h-12 relative`). ProfileImage
//      doesn't render a container, just fills the parent absolutely
//      with the shimmer + image. Use this when you need a non-square
//      aspect ratio or a size that doesn't match the presets, or when
//      the design wants the container styling controlled at the
//      callsite.
//
// Loading state: luxury-gold radial gradient + diagonal sheen sweep.
// Matches the brand and is markedly more premium-feeling than a flat
// grey pulse. Same visual everywhere on the platform.
//
// Error state: branded icon by variant (Building2 for partners,
// Car for vehicles, User for drivers/customers, FileText for
// documents, Shield for admin). Consistent fallback semantic;
// the user always knows what KIND of thing failed to render.
//
// Thumbnail proxy: when `src` is a GCS-signed URL we recognize, the
// component rewrites the URL to call `/api/v1/images/resize` instead
// of fetching the original. Tens of KB instead of multi-MB for a
// list-view avatar. Falls back to the original URL if the src isn't
// transformable. See lib/image-url.ts.
// ============================================

type ImageVariant =
  | "partner"
  | "admin"
  | "vendor"
  | "customer"
  | "driver"
  | "vehicle"
  | "document";

const VARIANT_CONFIG = {
  partner: { icon: Building2, accentColor: "text-luxury-gold/50" },
  admin: { icon: Shield, accentColor: "text-blue-400/50" },
  vendor: { icon: Building2, accentColor: "text-purple-400/50" },
  customer: { icon: User, accentColor: "text-emerald-400/50" },
  driver: { icon: User, accentColor: "text-amber-400/50" },
  vehicle: { icon: Car, accentColor: "text-gray-400/50" },
  document: { icon: FileText, accentColor: "text-gray-400/50" },
} as const;

// Size presets. The `px` value is the rendered side-length in CSS
// pixels and is the basis for the proxy's `w=` query — we ask the
// backend for roughly twice that to look crisp on retina screens.
const SIZES = {
  xs: { container: "w-8 h-8", icon: "w-4 h-4", radius: "rounded-lg", px: 32 },
  sm: { container: "w-10 h-10", icon: "w-5 h-5", radius: "rounded-lg", px: 40 },
  md: { container: "w-16 h-16", icon: "w-7 h-7", radius: "rounded-xl", px: 64 },
  lg: { container: "w-20 h-20", icon: "w-8 h-8", radius: "rounded-xl", px: 80 },
  xl: {
    container: "w-24 h-24",
    icon: "w-10 h-10",
    radius: "rounded-xl",
    px: 96,
  },
  "2xl": {
    container: "w-32 h-32",
    icon: "w-12 h-12",
    radius: "rounded-2xl",
    px: 128,
  },
};

interface ProfileImageProps {
  src: string | null | undefined;
  alt: string;
  /** Size preset. Ignored when `fill` is true. */
  size?: keyof typeof SIZES;
  variant?: ImageVariant;
  /** "circle" for fully round, otherwise inherits the size preset's radius. */
  shape?: "square" | "rounded" | "circle";
  /**
   * Fill mode — the parent owns the container, ProfileImage renders
   * absolutely-positioned shimmer + image to fill it. Use when the
   * surrounding layout has already established dimensions (e.g. a
   * table cell with `w-10 h-10 relative`).
   */
  fill?: boolean;
  className?: string;
  border?: boolean;
  fallbackIcon?: React.ReactNode;
  fallbackText?: string;
  onClick?: () => void;
  /** Skip the resize proxy and load the original URL. */
  fullSize?: boolean;
  /** Skip lazy loading — use for hero / above-the-fold images. */
  priority?: boolean;
  /**
   * Override the display-pixel width passed to the resize proxy.
   * Useful when `fill` is set (no size preset to derive from) or
   * when the rendered size differs from the preset's px value.
   * The proxy multiplies this by 2 internally for retina.
   */
  displayPx?: number;
}

// ============== COMPONENT ==============

/**
 * Shared loading skeleton — luxury-gold radial gradient + diagonal
 * sheen sweep. Used in both sized and fill modes so every loading
 * state on the platform looks identical.
 *
 * The keyframes are defined inline so consumers don't need to wire
 * up global CSS. The sheen has a slightly different period from the
 * pulse so the two animations don't lockstep — keeps the motion
 * feeling organic. Hardware-accelerated via `background-position`
 * changes (no layout reflow).
 */
function LoadingSkeleton() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 40%, rgba(212, 175, 55, 0.08), transparent 60%), radial-gradient(circle at 70% 70%, rgba(255, 255, 255, 0.04), transparent 50%)",
          animation: "lux-img-pulse 2.8s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, transparent 30%, rgba(212, 175, 55, 0.15) 50%, transparent 70%)",
          backgroundSize: "250% 100%",
          animation: "lux-img-sheen 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        }}
      />
      <style>{`
        @keyframes lux-img-sheen {
          0% { background-position: 250% 0; }
          100% { background-position: -150% 0; }
        }
        @keyframes lux-img-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  );
}

export default function ProfileImage({
  src,
  alt,
  size = "md",
  variant = "partner",
  shape = "rounded",
  fill = false,
  className = "",
  border = true,
  fallbackIcon,
  fallbackText,
  onClick,
  fullSize = false,
  priority = false,
  displayPx,
}: ProfileImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const prevSrc = useRef(src);

  useEffect(() => {
    if (src !== prevSrc.current) {
      setLoaded(false);
      setError(false);
      prevSrc.current = src;
    }
  }, [src]);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  const sizeConfig = SIZES[size];
  const variantConfig = VARIANT_CONFIG[variant];
  const FallbackIcon = variantConfig.icon as React.ComponentType<{
    className?: string;
  }>;
  const shapeClass = shape === "circle" ? "!rounded-full" : sizeConfig.radius;
  const borderClass = border && !fill ? "border border-neutral-700" : "";

  // Compute the effective image URL: original signed URL, OR a proxy
  // URL for a smaller variant. We multiply by 2 for retina sharpness;
  // the proxy clamps to its allowed-width buckets so this doesn't
  // create cache fragmentation. Caller can override via `displayPx`,
  // which is mandatory in fill mode (no size preset to derive from).
  const effectiveSrc = useMemo(() => {
    if (!src) return null;
    if (fullSize) return src;
    const objectPath = extractGcsObjectPath(src);
    if (!objectPath) {
      return src;
    }
    const baseWidth = displayPx ?? (fill ? 128 : sizeConfig.px);
    return buildProxyUrl(objectPath, baseWidth * 2);
  }, [src, fullSize, displayPx, fill, sizeConfig.px]);

  const initials = fallbackText
    ? fallbackText
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : null;

  // ===== Error / empty state =====
  if (!effectiveSrc || error) {
    // In fill mode the parent owns the box; we render an
    // absolutely-positioned overlay that occupies it. Otherwise we
    // render a self-contained box at the size preset.
    if (fill) {
      return (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-neutral-800 ${className}`}
          onClick={onClick}
        >
          {fallbackIcon ? (
            fallbackIcon
          ) : initials ? (
            <span
              className={`font-semibold ${variantConfig.accentColor} text-sm`}
            >
              {initials}
            </span>
          ) : (
            <FallbackIcon
              className={`w-1/2 h-1/2 max-w-[24px] max-h-[24px] ${variantConfig.accentColor}`}
            />
          )}
        </div>
      );
    }
    return (
      <div
        className={`${sizeConfig.container} ${shapeClass} ${borderClass} bg-neutral-800 flex items-center justify-center overflow-hidden flex-shrink-0 ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""} ${className}`}
        onClick={onClick}
      >
        {fallbackIcon ? (
          fallbackIcon
        ) : initials ? (
          <span
            className={`font-semibold ${variantConfig.accentColor} ${
              size === "xs" || size === "sm"
                ? "text-xs"
                : size === "md"
                  ? "text-sm"
                  : "text-lg"
            }`}
          >
            {initials}
          </span>
        ) : (
          <FallbackIcon
            className={`${sizeConfig.icon} ${variantConfig.accentColor}`}
          />
        )}
      </div>
    );
  }

  // ===== Loading / loaded state =====
  // Fill mode: render an absolutely-positioned skeleton + img into
  // the parent. No container of our own.
  if (fill) {
    return (
      <>
        {!loaded && <LoadingSkeleton />}
        <img
          ref={imgRef}
          src={effectiveSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          } ${className}`}
          onClick={onClick}
        />
      </>
    );
  }

  // Sized mode: own the container.
  return (
    <div
      className={`${sizeConfig.container} ${shapeClass} overflow-hidden relative flex-shrink-0 ${borderClass} ${onClick ? "cursor-pointer hover:opacity-90 transition-opacity" : ""} ${className}`}
      onClick={onClick}
    >
      <div
        className={`absolute inset-0 bg-neutral-900 transition-opacity duration-300 ${
          loaded ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <LoadingSkeleton />
      </div>

      <img
        ref={imgRef}
        src={effectiveSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-cover bg-neutral-800 relative z-10 transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
