"use client";

// ============================================
// apps/web/components/profile/document-upload-card.tsx
// Presentational card that drives one document slot through the
// useDocumentUpload state machine, plus the settled "view / replace" display
// once a document exists. Shared by the partner and vendor profiles — the
// record call, GCS section, and entity id are injected.
// ============================================

import * as React from "react";
import {
  AlertCircle,
  Check,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import ImageCropper from "@/components/ui/image-cropper";

// The task-3 enriched document shape (matches getCompanyProfile's
// documents.items entries).
export interface DocumentItem {
  type: string;
  label: string;
  isUploaded: boolean;
  fileUrl: string | null; // signed read URL
  filePath: string | null; // raw storage path
  fileName: string | null;
  expiryDate: string | null;
  uploadedAt: string | null;
  requiresExpiry: boolean;
}

export interface DocumentUploadCardProps {
  doc: DocumentItem;
  section: string; // GCS section, e.g. "partners"
  entityId: string;
  folder?: string;
  /** Record the uploaded file via the domain endpoint; resolve with the item. */
  record: (args: {
    filePath: string;
    fileName: string;
    expiryDate?: string;
  }) => Promise<DocumentItem>;
  /** Splice the recorded item into parent state (no refetch). */
  onUploaded: (doc: DocumentItem) => void;
  /** Open the document viewer; falls back to opening the signed URL. */
  onView?: (doc: DocumentItem) => void;
  disabled?: boolean;
  accept?: string;
  className?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// Cropped output arrives as a Blob; wrap it back into a File, keeping the
// original base name and matching the extension to the blob's MIME type.
function blobToFile(blob: Blob, originalName: string): File {
  const type = blob.type || "image/jpeg";
  const ext = type.split("/")[1] || "jpg";
  const base = originalName.replace(/\.[^./\\]+$/, "") || "document";
  return new File([blob], `${base}.${ext}`, { type });
}

export function DocumentUploadCard({
  doc,
  section,
  entityId,
  folder,
  record,
  onUploaded,
  onView,
  disabled = false,
  accept = ".pdf,image/*",
  className,
}: DocumentUploadCardProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [expiryInput, setExpiryInput] = React.useState(() =>
    toDateInputValue(doc.expiryDate),
  );
  const expiryId = `doc-expiry-${doc.type}`;
  const [cropperImage, setCropperImage] = React.useState<string | null>(null);
  const pickedNameRef = React.useRef<string>("document");

  const upload = useDocumentUpload<DocumentItem>({
    section,
    folder,
    entityId,
    requiresExpiry: doc.requiresExpiry,
    record,
    onUploaded,
  });

  const { phase, progress, error, fileName } = upload;
  const activeName = fileName ?? doc.fileName ?? "document";

  const openPicker = () => fileInputRef.current?.click();

  const beginUpload = (file: File) => {
    setExpiryInput(toDateInputValue(doc.expiryDate)); // pre-fill on replace
    upload.start(file);
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    // Route images through the cropper (free-aspect preview + optional crop);
    // PDFs upload straight away.
    if (file.type.startsWith("image/")) {
      pickedNameRef.current = file.name;
      const reader = new FileReader();
      reader.onload = () => setCropperImage(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      beginUpload(file);
    }
  };

  const handleCropComplete = (blob: Blob) => {
    setCropperImage(null);
    beginUpload(blobToFile(blob, pickedNameRef.current));
  };

  const handleView = () => {
    if (onView) return onView(doc);
    if (doc.fileUrl) window.open(doc.fileUrl, "_blank", "noopener");
  };

  const tone =
    phase === "confirmed"
      ? "border-emerald-500/50 bg-emerald-500/10"
      : phase === "error"
        ? "border-red-500/50 bg-red-500/10"
        : "border-neutral-800 bg-neutral-900";

  return (
    <div
      className={cn("rounded-lg border p-4 transition-colors", tone, className)}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onFilePicked}
      />

      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{doc.label}</span>
          {doc.requiresExpiry && (
            <span className="text-[11px] text-gray-500">(expiry required)</span>
          )}
        </div>
        {doc.isUploaded && phase === "idle" && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
            <Check className="h-3.5 w-3.5" /> Uploaded
          </span>
        )}
      </div>

      {phase === "uploading" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin text-luxury-gold" />
            <span className="truncate">{activeName}</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Uploading… {progress}%</span>
            <button
              type="button"
              onClick={upload.reset}
              className="inline-flex items-center gap-1 hover:text-white"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      {phase === "awaitingExpiry" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-500">
            <Check className="h-4 w-4" />
            <span className="truncate">{activeName} uploaded</span>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={expiryId} className="text-xs text-gray-400">
              Set the expiry date to finish
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={expiryId}
                type="date"
                value={expiryInput}
                onChange={(e) => setExpiryInput(e.target.value)}
                className="h-9 max-w-[200px]"
              />
              <Button
                size="sm"
                disabled={!expiryInput}
                onClick={() => upload.submitExpiry(expiryInput)}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={upload.reset}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin text-luxury-gold" />
          Saving…
        </div>
      )}

      {phase === "confirmed" && (
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-500">
          <Check className="h-4 w-4" />
          Uploaded — saved to your profile
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error ?? "Something went wrong"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={upload.retry}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={openPicker}>
              Choose a different file
            </Button>
          </div>
        </div>
      )}

      {phase === "idle" &&
        (doc.isUploaded ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-luxury-gold" />
              <div className="min-w-0">
                <p className="truncate text-sm text-white">
                  {doc.fileName ?? "Uploaded file"}
                </p>
                {doc.expiryDate && (
                  <p className="text-xs text-gray-400">
                    Expires {formatDate(doc.expiryDate)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {doc.fileUrl && (
                <Button size="sm" variant="ghost" onClick={handleView}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                </Button>
              )}
              {!disabled && (
                <Button size="sm" variant="outline" onClick={openPicker}>
                  Replace
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-neutral-700 bg-neutral-900/40 py-6 text-center">
            <Upload className="h-5 w-5 text-luxury-gold" />
            <p className="text-xs text-gray-400">PDF or image, up to 10MB</p>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={openPicker}
            >
              Choose file
            </Button>
          </div>
        ))}

      {cropperImage && (
        <ImageCropper
          imageSrc={cropperImage}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperImage(null)}
          title="Upload Document Image"
        />
      )}
    </div>
  );
}
