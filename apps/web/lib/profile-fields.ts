// ============================================
// apps/web/lib/profile-fields.ts
// Shared, portal-agnostic building blocks for field-level autosave.
//
// Types + validators + generic helpers used by BOTH the partner and vendor
// profile configs. The per-portal field arrays live in their own files
// (partner-profile-fields.ts, vendor-profile-fields.ts), and the shared
// useFieldAutosave hook imports its types from here.
// ============================================

export type ProfileFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "iban"
  | "select"
  | "date";

// A field's group maps 1:1 to the grouped PATCH endpoint it saves through
// (e.g. "company" -> .../profile/company-info, "bank" -> .../profile/bank-details).
export type ProfileFieldGroup = "company" | "bank";

export interface ProfileFieldConfig {
  key: string;
  group: ProfileFieldGroup;
  type: ProfileFieldType;
  label: string;
  /** Required for submit validation (mirrors the backend submit check). */
  required?: boolean;
  /** Override the type's default debounce (ms). */
  debounceMs?: number;
  /**
   * Validate a NON-EMPTY value. Return an error string, or null if valid.
   * Empty values are always allowed (a cleared field saves as null;
   * completeness is enforced at submit). IBAN is special-cased in the hook.
   */
  validate?: (value: string) => string | null;
}

// ---------- reusable validators ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIGITS_RE = /^\d+$/;

export const validateEmail = (v: string) =>
  EMAIL_RE.test(v) ? null : "Enter a valid email address";

export const validatePhone = (v: string) => {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15
    ? null
    : "Enter a valid phone number";
};

// Digits-only, with an optional exact-length check.
export const digitsExactly = (label: string, len?: number) => (v: string) => {
  if (!DIGITS_RE.test(v)) return `${label} must be digits only`;
  if (len && v.length !== len) return `${label} must be ${len} digits`;
  return null;
};

// ---------- generic helpers (parameterized by a fields array) ----------
export function buildFieldMap(
  fields: ProfileFieldConfig[],
): Record<string, ProfileFieldConfig> {
  return fields.reduce(
    (acc, f) => {
      acc[f.key] = f;
      return acc;
    },
    {} as Record<string, ProfileFieldConfig>,
  );
}

export const fieldsInGroup = (
  fields: ProfileFieldConfig[],
  group: ProfileFieldGroup,
) => fields.filter((f) => f.group === group);

export const groupOf = (
  fields: ProfileFieldConfig[],
  key: string,
): ProfileFieldGroup | undefined => fields.find((f) => f.key === key)?.group;

/**
 * Count filled fields in a group, for the Mode-1 progress chips.
 * `denominator` selects whether the total is every field in the group or only
 * the required ones. The exact chip semantics (Company X/10 vs X/8) are still
 * to be confirmed, so both are supported; default is "all".
 */
export function groupProgress(
  fields: ProfileFieldConfig[],
  group: ProfileFieldGroup,
  values: Record<string, unknown>,
  denominator: "all" | "required" = "all",
) {
  const inGroup = fieldsInGroup(fields, group).filter((f) =>
    denominator === "required" ? f.required : true,
  );
  const filled = inGroup.filter((f) => {
    const v = values[f.key];
    return typeof v === "string" ? v.trim() !== "" : v != null;
  }).length;
  return { filled, total: inGroup.length };
}
