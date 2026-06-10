"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import {
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Check,
  X,
  Crop as CropIcon,
  ArrowLeft,
} from "lucide-react";

// ============================================
// components/ui/image-cropper.tsx
// Universal image upload modal
// Used for profile pics, logos, driver photos, document scans, receipts.
//
// Two-stage flow:
//   1. PREVIEW (default when aspect is undefined) — clean view of the
//      uploaded image. Primary action: "Upload". Secondary: "Adjust".
//      For most uploads (logo, A4 scan, receipt) the user just confirms
//      and submits — zero crop friction.
//   2. ADJUST — full react-easy-crop with handles, zoom, rotation.
//      Reached either by clicking "Adjust" from preview, or
//      automatically when `aspect` is fixed (square avatar etc) since
//      fixed-aspect uploads inherently require cropping.
// ============================================

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
  // Aspect ratio lock for the crop rectangle. 1 for square, 16/9 for
  // landscape, 4/3 for photo, etc. Pass `undefined` (or omit) for
  // free-aspect — the modal opens in preview mode and the user can
  // upload as-is or opt into cropping. Free-aspect is the right choice
  // for content where the original ratio matters (logos, receipts,
  // A4 documents).
  aspect?: number;
  shape?: "rect" | "round";
  title?: string;
  saving?: boolean;
}

// Helper: create cropped image from canvas. Used only when the user
// has actively cropped — the preview-then-upload path bypasses this
// entirely and uploads the original bytes.
async function getCroppedImage(
  imageSrc: string,
  cropArea: CropArea,
): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";

  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context failed"));

      canvas.width = cropArea.width;
      canvas.height = cropArea.height;

      ctx.drawImage(
        image,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height,
      );

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to create blob"));
        },
        "image/jpeg",
        0.92,
      );
    };
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = imageSrc;
  });
}

export default function ImageCropper({
  imageSrc,
  onCropComplete,
  onCancel,
  aspect,
  shape = "rect",
  title,
  saving = false,
}: ImageCropperProps) {
  // Mode flag: 'preview' or 'adjust'. Initial state depends on whether
  // the caller forced a specific aspect ratio. Fixed-aspect requests
  // (square avatar, 4:3 vehicle photo) skip preview because the
  // original probably doesn't match the required aspect, so cropping
  // is mandatory. Free-aspect requests (logo, document scan) start in
  // preview so the common case is a single confirm-click.
  const allowFreeUpload = aspect === undefined;
  const [mode, setMode] = useState<"preview" | "adjust">(
    allowFreeUpload ? "preview" : "adjust",
  );

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(
    null,
  );
  const [processing, setProcessing] = useState(false);

  const onCropChange = useCallback((_: any, croppedAreaPixels: CropArea) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Preview-mode "Upload" — emits the original bytes untouched. Fetch
  // the data URL as a blob and pass it straight to the parent. No
  // canvas re-encoding, no quality loss, no risk of state races with
  // react-easy-crop callbacks.
  const handleUploadOriginal = useCallback(async () => {
    setProcessing(true);
    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      onCropComplete(blob);
    } catch (err) {
      console.error("Upload original failed:", err);
    } finally {
      setProcessing(false);
    }
  }, [imageSrc, onCropComplete]);

  // Adjust-mode "Apply & Upload" — runs the canvas crop pipeline.
  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const croppedBlob = await getCroppedImage(imageSrc, croppedAreaPixels);
      onCropComplete(croppedBlob);
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setProcessing(false);
    }
  };

  const isBusy = processing || saving;

  // Title falls back to a mode-aware default if the caller didn't
  // specify one. The caller-provided title (e.g. "Crop Company Logo")
  // wins so existing labels don't break.
  const headerTitle =
    title ?? (mode === "preview" ? "Upload Image" : "Adjust Image");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={isBusy ? undefined : onCancel}
      />
      {/* The modal is a flex column. The KEY insight: the image area
          uses `flex-1 min-h-0` so it can shrink below its content's
          intrinsic height. Without min-h-0, the flex-1 child refuses
          to shrink and the other rows (header, controls, actions)
          get pushed off the bottom even though they have
          flex-shrink-0. With min-h-0, the image area absorbs all the
          space-pressure and the other rows always render fully.
          max-h-[95vh] with mobile-friendly outer padding gives a
          little screen-edge breathing room without wasting space. */}
      <div className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 flex-shrink-0">
          <h3 className="text-white font-semibold">{headerTitle}</h3>
          <button
            onClick={onCancel}
            disabled={isBusy}
            className="p-1 hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Image area — preview shows a clean <img>, adjust shows the
            interactive Cropper.
            min-h-[180px] is critical: by default a flex child has
            min-height: auto, which means "don't shrink below content
            size" — that's why the action buttons were getting pushed
            off the bottom of the modal. Setting an explicit min-height
            overrides that default. The image area can now shrink down
            to 180px when space is tight (small laptops, mobile in
            landscape) so the actions and controls always stay
            visible. flex-1 above the min lets it grow to fill
            available space on larger viewports. */}
        <div className="relative w-full bg-black flex-1 min-h-[180px]">
          {mode === "preview" ? (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              {/* object-contain ensures the full image is visible at
                  any aspect ratio. The user sees exactly what will be
                  uploaded — no crop overlay, no handles, just the
                  image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt="Preview"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape={shape}
              showGrid={true}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropChange}
            />
          )}
        </div>

        {/* Controls — only shown in adjust mode. Preview mode keeps
            the UI minimal so the image is the focus. Spacing is
            intentionally tight (space-y-3, p-3) so the controls
            footprint stays compact on short viewports like a 14"
            laptop, where every saved pixel of vertical chrome means
            more room for the image preview. */}
        {mode === "adjust" && (
          <div className="p-3 space-y-3 flex-shrink-0 overflow-y-auto border-t border-neutral-800">
            {/* Zoom */}
            <div className="flex items-center gap-3">
              <ZoomOut className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-luxury-gold"
              />
              <ZoomIn className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="text-xs text-gray-500 w-10 text-right">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {/* Rotation */}
            <div className="flex items-center gap-3">
              <RotateCw className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="flex-1 h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer accent-luxury-gold"
              />
              <span className="text-xs text-gray-500 w-10 text-right">
                {rotation}°
              </span>
            </div>

            {/* Quick rotation buttons + Reset */}
            <div className="flex items-center gap-2 flex-wrap">
              {[0, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  onClick={() => setRotation(deg)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    rotation === deg
                      ? "bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/30"
                      : "bg-neutral-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {deg}°
                </button>
              ))}
              <button
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                  setCrop({ x: 0, y: 0 });
                }}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-neutral-800 text-gray-400 hover:text-white transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {/* Actions — Cancel, mode-toggle (only when free-aspect is
            allowed), primary upload. p-3 + py-2 on mobile keeps the
            row compact so it always fits even on small phones. The
            "Back to preview" label shortens to just the arrow icon on
            mobile via responsive hiding. */}
        <div className="flex gap-2 sm:gap-3 p-3 sm:p-4 border-t border-neutral-800 flex-shrink-0">
          <button
            onClick={onCancel}
            disabled={isBusy}
            className="px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50 text-sm sm:text-base"
          >
            Cancel
          </button>

          {/* Mode toggle. Label hides on mobile (icon stays) so the
              three-button row fits on narrow phones. */}
          {allowFreeUpload && (
            <button
              onClick={() => setMode(mode === "preview" ? "adjust" : "preview")}
              disabled={isBusy}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-800 text-gray-300 rounded-lg hover:bg-neutral-700 hover:text-white transition-colors disabled:opacity-50 text-sm sm:text-base"
              aria-label={mode === "preview" ? "Adjust" : "Back to preview"}
            >
              {mode === "preview" ? (
                <>
                  <CropIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Adjust</span>
                </>
              ) : (
                <>
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Back to preview</span>
                </>
              )}
            </button>
          )}

          {/* Primary action. flex-1 so it fills the remaining row
              width and reads as the obvious next step. */}
          <button
            onClick={
              mode === "preview" ? handleUploadOriginal : handleApplyCrop
            }
            disabled={isBusy || (mode === "adjust" && !croppedAreaPixels)}
            className="flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors disabled:opacity-50 text-sm sm:text-base"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {mode === "preview" ? "Upload" : "Apply & Upload"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
