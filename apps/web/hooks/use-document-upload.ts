"use client";

// ============================================
// apps/web/hooks/use-document-upload.ts
// Document upload state machine for the profile redesign.
//
//   idle
//     └─ start(file) ─────────────► uploading   (XHR PUT to GCS, live progress)
//                                       │
//              requiresExpiry ? ────────┤
//              yes │                     │ no
//                  ▼                     ▼
//            awaitingExpiry         processing   (record via domain endpoint)
//                  │                     │
//        submitExpiry(date) ────────────►│
//                                        ▼
//                                    confirmed    (~1.5s "saved to profile" flash)
//                                        ▼
//                                      idle        (settled — parent now holds the doc)
//
//   any failure ──► error  (last file/args preserved; retry() re-runs that step)
//
// No page refetch: on success the hook calls onUploaded(recorded) with the
// task-3 enriched document object, and the parent splices it into local state.
// Portal-agnostic — the record call + GCS section/entityId are injected, so
// both the partner and vendor profiles reuse it.
// ============================================

import * as React from "react";
import { uploadApi } from "@/lib/api";

export type UploadPhase =
  | "idle"
  | "uploading"
  | "awaitingExpiry"
  | "processing"
  | "confirmed"
  | "error";

interface DocumentUploadState {
  phase: UploadPhase;
  progress: number; // 0-100 during "uploading"
  error?: string;
  fileName?: string; // the file being processed
}

export interface UseDocumentUploadOptions<T> {
  /** GCS section, e.g. "partners" | "vendors". */
  section: string;
  /** GCS folder; defaults to "documents". */
  folder?: string;
  /** Owning entity id (partner/vendor id). */
  entityId: string;
  /** Gate the record step behind an expiry-date input (CR / Chamber / Balady). */
  requiresExpiry?: boolean;
  /**
   * Record the uploaded file via the domain endpoint and resolve with the
   * object to splice into parent state (the task-3 enriched document shape).
   */
  record: (args: {
    filePath: string;
    fileName: string;
    expiryDate?: string;
  }) => Promise<T>;
  /** Called on success so the parent can optimistically splice, no refetch. */
  onUploaded: (recorded: T) => void;
  /** Max file size in MB (default 10). */
  maxSizeMB?: number;
  /** "Saved" flash duration before settling back to idle (default 1500). */
  confirmMs?: number;
}

export interface UseDocumentUploadResult {
  phase: UploadPhase;
  progress: number;
  error?: string;
  fileName?: string;
  /** true while the file is transferring or being recorded. */
  isBusy: boolean;
  /** Validate + upload the picked file to storage. */
  start: (file: File) => void;
  /** Expiry docs only: record the already-uploaded file with its expiry date. */
  submitExpiry: (expiryDate: string) => void;
  /** Retry the step that failed (re-uses the last file / record args). */
  retry: () => void;
  /** Abort anything in flight and return to idle. */
  reset: () => void;
}

// PUT a file to a GCS signed URL via XHR (fetch can't report upload progress).
function putToGcs(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
  bindXhr: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    bindXhr(xhr);
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () =>
      reject(new DOMException("Upload aborted", "AbortError"));
    xhr.send(file);
  });
}

export function useDocumentUpload<T>(
  options: UseDocumentUploadOptions<T>,
): UseDocumentUploadResult {
  const [state, setState] = React.useState<DocumentUploadState>({
    phase: "idle",
    progress: 0,
  });

  // Latest options for async reads (kept fresh without re-creating callbacks).
  const optsRef = React.useRef(options);
  optsRef.current = options;

  const mountedRef = React.useRef(true);
  // Bumped on every start/retry/submit/reset — stale async flows check it and bail.
  const runTokenRef = React.useRef(0);
  const xhrRef = React.useRef<XMLHttpRequest | null>(null);
  const lastFileRef = React.useRef<File | null>(null);
  const pendingRef = React.useRef<{
    filePath: string;
    fileName: string;
  } | null>(null);
  const lastRecordArgsRef = React.useRef<{
    filePath: string;
    fileName: string;
    expiryDate?: string;
  } | null>(null);
  const errorStepRef = React.useRef<"upload" | "record" | null>(null);
  const confirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      xhrRef.current?.abort();
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const safeSet = React.useCallback(
    (patch: Partial<DocumentUploadState>, token: number) => {
      if (!mountedRef.current || token !== runTokenRef.current) return;
      setState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  // record via the domain endpoint -> onUploaded -> confirmed flash -> idle
  const runRecord = React.useCallback(
    async (
      args: { filePath: string; fileName: string; expiryDate?: string },
      token: number,
    ) => {
      const opts = optsRef.current;
      lastRecordArgsRef.current = args;
      safeSet({ phase: "processing", error: undefined }, token);
      try {
        const recorded = await opts.record(args);
        if (!mountedRef.current || token !== runTokenRef.current) return;

        opts.onUploaded(recorded);
        pendingRef.current = null;
        errorStepRef.current = null;

        safeSet({ phase: "confirmed", progress: 100 }, token);
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = setTimeout(() => {
          if (!mountedRef.current || token !== runTokenRef.current) return;
          setState({ phase: "idle", progress: 0 });
        }, opts.confirmMs ?? 1500);
      } catch (e) {
        errorStepRef.current = "record";
        safeSet(
          {
            phase: "error",
            error: e instanceof Error ? e.message : "Failed to save document",
          },
          token,
        );
      }
    },
    [safeSet],
  );

  const beginUpload = React.useCallback(
    async (file: File, token: number) => {
      const opts = optsRef.current;
      const maxMB = opts.maxSizeMB ?? 10;

      if (file.size > maxMB * 1024 * 1024) {
        errorStepRef.current = "upload";
        safeSet(
          {
            phase: "error",
            error: `File must be under ${maxMB}MB`,
            fileName: file.name,
          },
          token,
        );
        return;
      }

      safeSet(
        {
          phase: "uploading",
          progress: 0,
          error: undefined,
          fileName: file.name,
        },
        token,
      );

      try {
        const signed = await uploadApi.getSignedUploadUrl({
          fileName: file.name,
          fileType: file.type,
          section: opts.section,
          folder: opts.folder ?? "documents",
          entityId: opts.entityId,
        });
        if (!mountedRef.current || token !== runTokenRef.current) return;

        const uploadUrl = signed.data?.uploadUrl;
        const filePath = signed.data?.filePath;
        if (!uploadUrl || !filePath) {
          throw new Error("Could not get an upload URL");
        }

        await putToGcs(
          uploadUrl,
          file,
          (pct) => safeSet({ progress: pct }, token),
          (xhr) => {
            xhrRef.current = xhr;
          },
        );
        xhrRef.current = null;
        if (!mountedRef.current || token !== runTokenRef.current) return;

        pendingRef.current = { filePath, fileName: file.name };

        if (opts.requiresExpiry) {
          safeSet({ phase: "awaitingExpiry", progress: 100 }, token);
        } else {
          await runRecord({ filePath, fileName: file.name }, token);
        }
      } catch (e) {
        xhrRef.current = null;
        if (e instanceof DOMException && e.name === "AbortError") return;
        errorStepRef.current = "upload";
        safeSet(
          {
            phase: "error",
            error: e instanceof Error ? e.message : "Upload failed",
          },
          token,
        );
      }
    },
    [runRecord, safeSet],
  );

  const start = React.useCallback(
    (file: File) => {
      xhrRef.current?.abort();
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      const token = ++runTokenRef.current;
      lastFileRef.current = file;
      pendingRef.current = null;
      lastRecordArgsRef.current = null;
      errorStepRef.current = null;
      void beginUpload(file, token);
    },
    [beginUpload],
  );

  const submitExpiry = React.useCallback(
    (expiryDate: string) => {
      const pending = pendingRef.current;
      if (!pending) return;
      const token = ++runTokenRef.current;
      void runRecord(
        { filePath: pending.filePath, fileName: pending.fileName, expiryDate },
        token,
      );
    },
    [runRecord],
  );

  const retry = React.useCallback(() => {
    const token = ++runTokenRef.current;
    if (errorStepRef.current === "record" && lastRecordArgsRef.current) {
      void runRecord(lastRecordArgsRef.current, token);
    } else if (lastFileRef.current) {
      void beginUpload(lastFileRef.current, token);
    }
  }, [beginUpload, runRecord]);

  const reset = React.useCallback(() => {
    xhrRef.current?.abort();
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    ++runTokenRef.current;
    pendingRef.current = null;
    lastRecordArgsRef.current = null;
    errorStepRef.current = null;
    setState({ phase: "idle", progress: 0 });
  }, []);

  return {
    phase: state.phase,
    progress: state.progress,
    error: state.error,
    fileName: state.fileName,
    isBusy: state.phase === "uploading" || state.phase === "processing",
    start,
    submitExpiry,
    retry,
    reset,
  };
}
