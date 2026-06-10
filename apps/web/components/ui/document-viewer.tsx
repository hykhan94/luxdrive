"use client";

import { useState } from "react";
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";

// ============================================
// components/ui/document-viewer.tsx
// Universal Document Viewer Modal
// Handles images (with zoom/rotate) and PDFs (iframe)
// Used across all portals
// ============================================

interface DocumentViewerProps {
  url: string;
  fileName?: string;
  title?: string;
  onClose: () => void;
}

function getFileType(
  url: string,
  fileName?: string,
): "image" | "pdf" | "unknown" {
  const check = (fileName || url).toLowerCase();
  if (check.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/)) return "image";
  if (check.match(/\.(pdf)(\?|$)/)) return "pdf";
  // Check content type hints in signed URLs
  if (
    url.includes("content-type=image") ||
    url.includes("response-content-type=image")
  )
    return "image";
  if (
    url.includes("content-type=application%2Fpdf") ||
    url.includes("response-content-type=application%2Fpdf")
  )
    return "pdf";
  return "unknown";
}

export default function DocumentViewer({
  url,
  fileName,
  title,
  onClose,
}: DocumentViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fileType = getFileType(url, fileName);
  const displayTitle = title || fileName || "Document";

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.download = fileName || "document";
    a.click();
  };

  const handleOpenExternal = () => {
    window.open(url, "_blank");
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-neutral-900/95 border-b border-neutral-800">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="w-5 h-5 text-luxury-gold flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {displayTitle}
            </p>
            {fileName && title && (
              <p className="text-xs text-gray-500 truncate">{fileName}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Image controls — only for images */}
          {fileType === "image" && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-500 w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleRotate}
                className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                title="Rotate"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                title="Reset"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <div className="w-px h-6 bg-neutral-700 mx-1" />
            </>
          )}

          <button
            onClick={handleOpenExternal}
            className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-neutral-700 mx-1" />
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-auto flex items-center justify-center p-4">
        {/* Loading state */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
              <p className="text-sm text-gray-400">Loading document...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <FileText className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <p className="text-white font-medium mb-1">
                Unable to preview this document
              </p>
              <p className="text-sm text-gray-400 mb-4">
                The file format may not be supported for inline preview
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Open in New Tab
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/90 text-sm transition-colors"
              >
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          </div>
        )}

        {/* Image viewer */}
        {fileType === "image" && !error && (
          <div
            className="transition-transform duration-200 ease-out cursor-grab active:cursor-grabbing"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
          >
            <img
              src={url}
              alt={displayTitle}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
              className={`max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl select-none ${
                loading ? "opacity-0" : "opacity-100"
              } transition-opacity duration-300`}
              draggable={false}
            />
          </div>
        )}

        {/* PDF viewer */}
        {fileType === "pdf" && !error && (
          <iframe
            src={`${url}#toolbar=1&navpanes=0`}
            className={`w-full max-w-4xl h-full rounded-lg border border-neutral-700 bg-white ${
              loading ? "opacity-0" : "opacity-100"
            } transition-opacity duration-300`}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
            title={displayTitle}
          />
        )}

        {/* Unknown file type */}
        {fileType === "unknown" && !error && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-20 h-20 rounded-2xl bg-neutral-800 flex items-center justify-center">
              <FileText className="w-10 h-10 text-luxury-gold" />
            </div>
            <div>
              <p className="text-white font-medium mb-1">{displayTitle}</p>
              <p className="text-sm text-gray-400 mb-4">
                Preview not available for this file type
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Open in New Tab
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/90 text-sm transition-colors"
              >
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="relative z-10 flex items-center justify-center py-2 bg-neutral-900/95 border-t border-neutral-800">
        <p className="text-xs text-gray-600">
          Press{" "}
          <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-gray-400 text-[10px]">
            ESC
          </kbd>{" "}
          to close
          {fileType === "image" && (
            <>
              {" · "}
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-gray-400 text-[10px]">
                +
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-gray-400 text-[10px]">
                −
              </kbd>{" "}
              zoom
              {" · "}
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-gray-400 text-[10px]">
                R
              </kbd>{" "}
              rotate
            </>
          )}
        </p>
      </div>
    </div>
  );
}
