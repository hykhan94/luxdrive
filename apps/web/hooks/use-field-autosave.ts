"use client";

// ============================================
// apps/web/hooks/use-field-autosave.ts
// Field-level autosave engine for the profile redesign.
//
// Responsibilities:
//   - own a working copy of the field values + a per-field save status
//   - debounce saves per field type (free text 800ms, email/phone 1000ms,
//     number 1200ms; selects/dates save immediately; IBAN saves once it is a
//     complete valid value)
//   - validate before hitting the API (empty is allowed; non-empty must pass)
//   - route each save through the caller-supplied `save(group, body)` so the
//     hook stays portal-agnostic (partner passes company/bank endpoints)
//   - supersede in-flight saves per field so a stale response can never
//     overwrite a newer value (per-field sequence numbers)
//   - reconcile the server's normalized value for the saved field (e.g. the
//     uppercased IBAN) without a refetch
//
// Mount this hook only once the profile has loaded, so `initialValues` holds
// real data. Use `setValues` to re-sync after an external change (e.g. after
// a successful Submit for Review).
// ============================================

import * as React from "react";
import type {
  ProfileFieldConfig,
  ProfileFieldType,
} from "@/lib/profile-fields";

export type FieldSaveState = "idle" | "saving" | "saved" | "error";

export interface FieldStatus {
  state: FieldSaveState;
  error?: string;
}

const SA_IBAN_RE = /^SA\d{22}$/;

// Default debounce (ms) per field type. Selects/dates fire immediately;
// IBAN uses a small coalescing delay once it is already complete + valid.
const DEFAULT_DEBOUNCE: Record<ProfileFieldType, number> = {
  text: 800,
  email: 1000,
  phone: 1000,
  number: 1200,
  iban: 250,
  select: 0,
  date: 0,
};

// Normalize a value for the API payload + dirty comparison. NOT applied to
// the displayed value (so the user can type freely); trailing whitespace is
// only stripped for what we send/compare. IBAN is uppercased.
function normalizeForSave(type: ProfileFieldType, raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  return type === "iban" ? trimmed.toUpperCase() : trimmed;
}

export interface UseFieldAutosaveOptions {
  fields: ProfileFieldConfig[];
  /** Initial values — mount the hook only once the profile has loaded. */
  initialValues: Record<string, unknown>;
  /**
   * Persist a single-field partial body to the field's group endpoint.
   * Resolve with the server's echoed values (if any) so the hook can
   * reconcile normalized values; may resolve void.
   */
  save: (
    group: string,
    body: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | void>;
  /** When false (Mode 3 read-only / Mode 5 suspended) no saves fire. */
  enabled?: boolean;
  /** How long the "Saved" state shows before fading back to idle (ms). */
  savedTtlMs?: number;
}

export interface FieldInputProps {
  id: string;
  name: string;
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onBlur: () => void;
  "aria-invalid": boolean | undefined;
}

export interface UseFieldAutosaveResult {
  values: Record<string, unknown>;
  statuses: Record<string, FieldStatus>;
  getStatus: (key: string) => FieldStatus;
  /** Spread onto text-like inputs (input / textarea). */
  getFieldProps: (key: string) => FieldInputProps;
  /** For selects, date pickers, or any non-input control. */
  setValue: (key: string, value: unknown) => void;
  /** Re-sync values from a fresh server snapshot (e.g. after submit). */
  setValues: (next: Record<string, unknown>) => void;
  /** True while any field is mid-save. */
  isSaving: boolean;
}

export function useFieldAutosave({
  fields,
  initialValues,
  save,
  enabled = true,
  savedTtlMs = 2000,
}: UseFieldAutosaveOptions): UseFieldAutosaveResult {
  const configByKey = React.useMemo(() => {
    const m: Record<string, ProfileFieldConfig> = {};
    for (const f of fields) m[f.key] = f;
    return m;
  }, [fields]);

  const [values, setValuesState] = React.useState<Record<string, unknown>>(
    () => ({ ...initialValues }),
  );
  const [statuses, setStatuses] = React.useState<Record<string, FieldStatus>>(
    {},
  );

  // --- refs (do not trigger re-render) ---
  // Authoritative, synchronously-updated mirror of `values` for async reads.
  const valuesRef = React.useRef<Record<string, unknown>>({ ...initialValues });
  // Normalized last-saved value per field (baseline for the dirty check).
  const savedRef = React.useRef<Record<string, unknown> | null>(null);
  if (savedRef.current === null) {
    const base: Record<string, unknown> = {};
    for (const f of fields) {
      base[f.key] = normalizeForSave(f.type, initialValues[f.key] ?? "");
    }
    savedRef.current = base;
  }
  const debounceTimers = React.useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const savedFadeTimers = React.useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const seqRef = React.useRef<Record<string, number>>({});
  const saveRef = React.useRef(save);
  const enabledRef = React.useRef(enabled);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    saveRef.current = save;
  }, [save]);
  React.useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  React.useEffect(() => {
    return () => {
      mountedRef.current = true;
      Object.values(debounceTimers.current).forEach(clearTimeout);
      Object.values(savedFadeTimers.current).forEach(clearTimeout);
    };
  }, []);

  // Update state + the synchronous ref together.
  const applyValues = React.useCallback((patch: Record<string, unknown>) => {
    valuesRef.current = { ...valuesRef.current, ...patch };
    setValuesState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setStatus = React.useCallback((key: string, status: FieldStatus) => {
    setStatuses((prev) => ({ ...prev, [key]: status }));
  }, []);

  const clearErrorToIdle = React.useCallback((key: string) => {
    setStatuses((prev) =>
      prev[key]?.state === "error"
        ? { ...prev, [key]: { state: "idle" } }
        : prev,
    );
  }, []);

  const scheduleSavedFade = React.useCallback(
    (key: string) => {
      if (savedFadeTimers.current[key]) {
        clearTimeout(savedFadeTimers.current[key]);
      }
      savedFadeTimers.current[key] = setTimeout(() => {
        if (!mountedRef.current) return;
        setStatuses((prev) =>
          prev[key]?.state === "saved"
            ? { ...prev, [key]: { state: "idle" } }
            : prev,
        );
      }, savedTtlMs);
    },
    [savedTtlMs],
  );

  const commit = React.useCallback(
    async (key: string) => {
      const cfg = configByKey[key];
      if (!cfg || !enabledRef.current) return;

      const normalized = normalizeForSave(
        cfg.type,
        valuesRef.current[key] ?? "",
      );

      // no-op if nothing changed since the last successful save
      if (normalized === savedRef.current![key]) return;

      // eligibility: empty is always allowed; non-empty must validate
      if (typeof normalized === "string" && normalized !== "") {
        if (cfg.type === "iban") {
          if (!SA_IBAN_RE.test(normalized)) {
            setStatus(key, {
              state: "error",
              error: "IBAN must be 'SA' followed by 22 digits",
            });
            return;
          }
        } else if (cfg.validate) {
          const err = cfg.validate(normalized);
          if (err) {
            setStatus(key, { state: "error", error: err });
            return;
          }
        }
      }

      const mySeq = (seqRef.current[key] ?? 0) + 1;
      seqRef.current[key] = mySeq;
      console.log("[autosave]", key, "-> saving  (seq=" + mySeq + ")");
      setStatus(key, { state: "saving" });

      try {
        const result = await saveRef.current(cfg.group, { [key]: normalized });
        console.log(
          "[autosave]",
          key,
          "save resolved; mountedRef=" +
            mountedRef.current +
            ", seq now=" +
            seqRef.current[key] +
            ", mySeq=" +
            mySeq +
            ", result=",
          result,
        );
        if (!mountedRef.current || seqRef.current[key] !== mySeq) {
          console.log("[autosave]", key, "BAILED after resolve");
          return;
        }

        savedRef.current![key] = normalized;

        // Reconcile the server's normalized value for THIS field (e.g. the
        // uppercased IBAN) — only if the user has not changed it since.
        if (result && typeof result === "object" && key in result) {
          const serverVal = (result as Record<string, unknown>)[key];
          const currentNorm = normalizeForSave(
            cfg.type,
            valuesRef.current[key] ?? "",
          );
          if (currentNorm === normalized) {
            if (serverVal != null && serverVal !== valuesRef.current[key]) {
              applyValues({ [key]: serverVal });
            }
            savedRef.current![key] = normalizeForSave(
              cfg.type,
              serverVal ?? normalized,
            );
          }
        }

        console.log("[autosave]", key, "-> saved");
        setStatus(key, { state: "saved" });
        scheduleSavedFade(key);
      } catch (e) {
        console.log("[autosave]", key, "CAUGHT error:", e);
        if (!mountedRef.current || seqRef.current[key] !== mySeq) return;
        setStatus(key, {
          state: "error",
          error: e instanceof Error ? e.message : "Failed to save",
        });
      }
    },
    [applyValues, configByKey, scheduleSavedFade, setStatus],
  );

  const scheduleCommit = React.useCallback(
    (key: string, delay: number) => {
      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }
      if (delay <= 0) {
        void commit(key);
        return;
      }
      debounceTimers.current[key] = setTimeout(() => void commit(key), delay);
    },
    [commit],
  );

  const handleChange = React.useCallback(
    (key: string, rawValue: unknown) => {
      const cfg = configByKey[key];
      if (!cfg) return;

      let next = rawValue;
      if (cfg.type === "iban" && typeof next === "string") {
        next = next.toUpperCase();
      }

      applyValues({ [key]: next });

      if (!enabledRef.current) return;

      if (cfg.type === "select" || cfg.type === "date") {
        clearErrorToIdle(key);
        scheduleCommit(key, 0);
        return;
      }

      if (cfg.type === "iban") {
        const norm = typeof next === "string" ? next.trim().toUpperCase() : "";
        if (norm === "" || SA_IBAN_RE.test(norm)) {
          clearErrorToIdle(key);
          scheduleCommit(key, DEFAULT_DEBOUNCE.iban);
        } else {
          // incomplete or malformed: don't fire yet
          if (debounceTimers.current[key]) {
            clearTimeout(debounceTimers.current[key]);
          }
          setStatus(
            key,
            norm.length >= 24
              ? {
                  state: "error",
                  error: "IBAN must be 'SA' followed by 22 digits",
                }
              : { state: "idle" },
          );
        }
        return;
      }

      // text / email / phone / number
      clearErrorToIdle(key);
      scheduleCommit(key, cfg.debounceMs ?? DEFAULT_DEBOUNCE[cfg.type]);
    },
    [applyValues, clearErrorToIdle, configByKey, scheduleCommit, setStatus],
  );

  const handleBlur = React.useCallback(
    (key: string) => {
      const cfg = configByKey[key];
      if (!cfg || !enabledRef.current) return;

      // For IBAN, only flush on blur when complete/valid or cleared.
      if (cfg.type === "iban") {
        const norm = normalizeForSave("iban", valuesRef.current[key] ?? "");
        if (typeof norm === "string" && norm !== "" && !SA_IBAN_RE.test(norm)) {
          return;
        }
      }

      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }
      void commit(key);
    },
    [commit, configByKey],
  );

  const getStatus = React.useCallback(
    (key: string): FieldStatus => statuses[key] ?? { state: "idle" },
    [statuses],
  );

  const getFieldProps = React.useCallback(
    (key: string): FieldInputProps => ({
      id: key,
      name: key,
      value: (values[key] as string) ?? "",
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => handleChange(key, e.target.value),
      onBlur: () => handleBlur(key),
      "aria-invalid": statuses[key]?.state === "error" ? true : undefined,
    }),
    [handleBlur, handleChange, statuses, values],
  );

  const setValue = React.useCallback(
    (key: string, value: unknown) => handleChange(key, value),
    [handleChange],
  );

  const setValues = React.useCallback(
    (next: Record<string, unknown>) => {
      applyValues(next);
      for (const f of fields) {
        if (f.key in next) {
          savedRef.current![f.key] = normalizeForSave(
            f.type,
            next[f.key] ?? "",
          );
        }
      }
    },
    [applyValues, fields],
  );

  const isSaving = React.useMemo(
    () => Object.values(statuses).some((s) => s.state === "saving"),
    [statuses],
  );

  return {
    values,
    statuses,
    getStatus,
    getFieldProps,
    setValue,
    setValues,
    isSaving,
  };
}
