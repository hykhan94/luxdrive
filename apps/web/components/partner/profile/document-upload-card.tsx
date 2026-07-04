"use client";

// ============================================
// apps/web/components/profile/document-upload-card.tsx
// Compact document mini-card. Matches the "Business Documents" reference:
//   ┌──────────────────────────────────┐
//   │ ✓  Document Name    [2d left]    │  ← check + title + urgency badge
//   │ filename.pdf · Expires: 4 Jul    │  ← meta line
//   │ ┌──────────────────────────────┐ │
//   │ │        👁  View               │ │  ← full-width action bar
//   │ └──────────────────────────────┘ │
//   └──────────────────────────────────┘
//
// Same footprint for every phase (idle-empty, uploading, awaiting-expiry,
// processing, confirmed, error, settled-uploaded). Portal-agnostic; parent
// wires record + splice.
// ============================================

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import ImageCropper from "@/components/ui/image-cropper";
import { cn } from "@/lib/utils";
import { useDocumentUpload } from "@/hooks/use-document-upload";

// task-3 enriched document shape
export interface DocumentItem {
  type: string;
  label: string;
  isUploaded: boolean;
  fileUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  expiryDate: string | null;
  uploadedAt: string | null;
  requiresExpiry: boolean;
}

export interface DocumentUploadCardProps {
  doc: DocumentItem;
  section: string;
  entityId: string;
  folder?: string;
  record: (args: {
    filePath: string;
    fileName: string;
    expiryDate?: string;
  }) => Promise<DocumentItem>;
  onUploaded: (doc: DocumentItem) => void;
  onView?: (doc: DocumentItem) => void;
  disabled?: boolean;
  accept?: string;
  className?: string;
}

// ---------- helpers ----------
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
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (isNaN(d)) return null;
  return Math.floor((d - Date.now()) / 86400000);
}
function blobToFile(blob: Blob, originalName: string): File {
  const type = blob.type || "image/jpeg";
  const ext = type.split("/")[1] || "jpg";
  const base = originalName.replace(/\.[^./\\]+$/, "") || "document";
  return new File([blob], `${base}.${ext}`, { type });
}

// ---------- expiry urgency badge ----------
function ExpiryBadge({ expiryDate }: { expiryDate: string | null }) {
  const days = daysUntil(expiryDate);
  if (days === null) return null;
  if (days > 14) return null; // only badge when soon

  const tone =
    days < 0
      ? "border-red-500/50 bg-red-500/15 text-red-400"
      : days <= 7
        ? "border-red-500/40 bg-red-500/10 text-red-400"
        : "border-amber-500/40 bg-amber-500/10 text-amber-400";
  const label =
    days < 0 ? "expired" : days === 0 ? "expires today" : `${days}d left`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        tone,
      )}
    >
      <AlertCircle className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

// ---------- title row (check icon + label + badges) ----------
function TitleRow({
  doc,
  uploaded,
  flaggedTone,
}: {
  doc: DocumentItem;
  uploaded: boolean;
  flaggedTone?: "amber" | "emerald";
}) {
  const Icon = uploaded ? CheckCircle2 : Circle;
  const iconClass = uploaded
    ? "text-emerald-500"
    : flaggedTone === "amber"
      ? "text-amber-500"
      : "text-gray-500";
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={cn("h-5 w-5 shrink-0", iconClass)} />
      <span className="truncate text-sm font-semibold text-white">
        {doc.label}
      </span>
      {uploaded && <ExpiryBadge expiryDate={doc.expiryDate} />}
      {doc.requiresExpiry && !uploaded && (
        <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-gray-400">
          expiry required
        </span>
      )}
    </div>
  );
}

// ---------- outer shell ----------
function CardShell({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "error";
  className?: string;
}) {
  const border =
    tone === "success"
      ? "border-emerald-500/40"
      : tone === "error"
        ? "border-red-500/40"
        : "border-neutral-800";
  return (
    <div
      className={cn(
        "flex h-full flex-col justify-between rounded-xl border bg-neutral-950/60 p-3.5 transition-colors",
        border,
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------- full-width action bar (View / Choose / Replace) ----------
function ActionBar({
  children,
  disabled = false,
  onClick,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  tone?: "neutral" | "gold";
  className?: string;
}) {
  const toneClass =
    tone === "gold"
      ? "bg-luxury-gold/15 text-luxury-gold hover:bg-luxury-gold/25 border-luxury-gold/30"
      : "bg-neutral-900 text-gray-200 hover:bg-neutral-800 border-neutral-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        toneClass,
        className,
      )}
    >
      {children}
    </button>
  );
}

// ============================================================
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
  const [cropperImage, setCropperImage] = React.useState<string | null>(null);
  const pickedNameRef = React.useRef<string>("document");
  const expiryId = `doc-expiry-${doc.type}`;

  const upload = useDocumentUpload<DocumentItem>({
    section,
    folder,
    entityId,
    requiresExpiry: doc.requiresExpiry,
    record,
    onUploaded,
  });
  const { phase, progress, error, fileName } = upload;

  const startUpload = (file: File) => {
    setExpiryInput(toDateInputValue(doc.expiryDate));
    upload.start(file);
  };
  const openPicker = () => fileInputRef.current?.click();
  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type.startsWith("image/")) {
      pickedNameRef.current = file.name;
      const reader = new FileReader();
      reader.onload = () => setCropperImage(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      startUpload(file);
    }
  };
  const handleCropComplete = (blob: Blob) => {
    setCropperImage(null);
    startUpload(blobToFile(blob, pickedNameRef.current));
  };
  const handleView = () => {
    if (onView) return onView(doc);
    if (doc.fileUrl) window.open(doc.fileUrl, "_blank", "noopener");
  };

  const activeName = fileName ?? doc.fileName ?? "document";

  // ===== render matrix — same footprint for every phase =====
  let body: React.ReactNode;
  let tone: "neutral" | "success" | "error" = "neutral";

  if (phase === "uploading") {
    body = (
      <>
        <div className="space-y-2">
          <TitleRow doc={doc} uploaded={false} />
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-luxury-gold" />
            <span className="truncate">{activeName}</span>
            <span className="ml-auto tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-luxury-gold transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <ActionBar onClick={upload.reset}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </ActionBar>
      </>
    );
  } else if (phase === "awaitingExpiry") {
    body = (
      <>
        <div className="space-y-2">
          <TitleRow doc={doc} uploaded={false} />
          <p className="text-xs text-gray-400">
            <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-500" />
            {activeName} uploaded — set expiry to finish
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={expiryId}
              type="date"
              value={expiryInput}
              onChange={(e) => setExpiryInput(e.target.value)}
              className="h-8 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-white [color-scheme:dark] focus:border-luxury-gold focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => upload.submitExpiry(expiryInput)}
            disabled={!expiryInput}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-luxury-gold/30 bg-luxury-gold/15 px-3 py-2 text-xs font-medium text-luxury-gold transition-colors hover:bg-luxury-gold/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save expiry
          </button>
          <button
            type="button"
            onClick={upload.reset}
            className="inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-gray-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      </>
    );
  } else if (phase === "processing") {
    body = (
      <>
        <div className="space-y-2">
          <TitleRow doc={doc} uploaded={false} />
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-luxury-gold" />
            Saving…
          </div>
        </div>
        <div className="mt-3 h-9" />
      </>
    );
  } else if (phase === "confirmed") {
    tone = "success";
    body = (
      <>
        <div className="space-y-2">
          <TitleRow doc={doc} uploaded={true} />
          <p className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Uploaded — saved to your profile
          </p>
        </div>
        <div className="mt-3 h-9" />
      </>
    );
  } else if (phase === "error") {
    tone = "error";
    body = (
      <>
        <div className="space-y-2">
          <TitleRow doc={doc} uploaded={false} />
          <p className="flex items-start gap-1.5 text-xs text-red-400">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">{error ?? "Something went wrong"}</span>
          </p>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={upload.retry}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-neutral-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-gray-300 hover:bg-neutral-800"
          >
            Choose different
          </button>
        </div>
      </>
    );
  } else if (doc.isUploaded) {
    // ===== the reference design's default "uploaded" state =====
    body = (
      <>
        <div className="space-y-1.5">
          <TitleRow doc={doc} uploaded={true} />
          <p className="truncate text-xs text-gray-400">
            {doc.fileName ?? "Uploaded file"}
            {doc.expiryDate && (
              <>
                <span className="mx-1.5 text-gray-600">·</span>
                Expires: {formatDate(doc.expiryDate)}
              </>
            )}
          </p>
        </div>
        <ActionBar onClick={handleView} disabled={!doc.fileUrl}>
          <Eye className="h-3.5 w-3.5" />
          View
        </ActionBar>
      </>
    );
  } else {
    // empty state
    body = (
      <>
        <div className="space-y-1.5">
          <TitleRow doc={doc} uploaded={false} />
          <p className="text-xs text-gray-500">
            <FileText className="mr-1 inline h-3 w-3" />
            PDF or image · up to 10MB
          </p>
        </div>
        <ActionBar onClick={openPicker} disabled={disabled} tone="gold">
          <Upload className="h-3.5 w-3.5" />
          Choose file
        </ActionBar>
      </>
    );
  }

  return (
    <CardShell tone={tone} className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onFilePicked}
      />
      {body}
      {/* Only settled/uploaded state gets a "Replace" affordance beyond View */}
      {phase === "idle" && doc.isUploaded && !disabled && (
        <button
          type="button"
          onClick={openPicker}
          className="mt-1.5 text-[11px] text-gray-500 transition-colors hover:text-luxury-gold"
        >
          Replace document
        </button>
      )}
      {cropperImage && (
        <ImageCropper
          imageSrc={cropperImage}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperImage(null)}
          title="Upload Document Image"
        />
      )}
    </CardShell>
  );
}
