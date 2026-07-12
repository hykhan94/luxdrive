// ============================================
// apps/web/lib/vendor-profile-fields.ts
// Vendor profile's editable fields (the per-portal data for autosave).
// Shared types / validators / helpers come from ./profile-fields.
//
// Documents, MOU, and logo are NOT here — those are upload flows handled by
// useDocumentUpload, not text autosave.
//
// NOTE: This mirrors PARTNER_PROFILE_FIELDS exactly. Kept as a separate
// export for now (rather than sharing one config) because partner and
// vendor could diverge (e.g. vendor-only fields, different required-set
// per portal). When the divergence never happens we can consolidate.
// ============================================

import type { ProfileFieldConfig } from "@/lib/profile-fields";
import {
  buildFieldMap,
  digitsExactly,
  validateEmail,
  validatePhone,
} from "@/lib/profile-fields";

// Order here is the render / progress order.
export const VENDOR_PROFILE_FIELDS: ProfileFieldConfig[] = [
  // --- Company (10) ---
  {
    key: "companyName",
    group: "company",
    type: "text",
    label: "Company Name",
    required: true,
  },
  {
    key: "crNumber",
    group: "company",
    type: "number",
    label: "CR Number",
    required: true,
    validate: digitsExactly("CR Number", 10),
  },
  {
    key: "vatNumber",
    group: "company",
    type: "number",
    label: "VAT Number",
    required: true,
    validate: digitsExactly("VAT Number", 15),
  },
  {
    key: "chamberOfCommerceNumber",
    group: "company",
    type: "number",
    label: "Chamber of Commerce Number",
    required: true,
    validate: digitsExactly("Chamber of Commerce Number"),
  },
  {
    key: "baladyNumber",
    group: "company",
    type: "number",
    label: "Balady Number",
    required: true,
    validate: digitsExactly("Balady Number"),
  },
  {
    key: "nationalAddress",
    group: "company",
    type: "text",
    label: "National Address",
    required: true,
  },
  {
    key: "contactPerson",
    group: "company",
    type: "text",
    label: "Contact Person",
    required: true,
  },
  {
    key: "contactPhone",
    group: "company",
    type: "phone",
    label: "Contact Phone",
    required: true,
    validate: validatePhone,
  },
  {
    key: "contactEmail",
    group: "company",
    type: "email",
    label: "Contact Email",
    validate: validateEmail,
  },
  { key: "address", group: "company", type: "text", label: "Address" },

  // --- Bank (3) ---
  {
    key: "bankName",
    group: "bank",
    type: "text",
    label: "Bank Name",
    required: true,
  },
  {
    key: "bankAccountNumber",
    group: "bank",
    type: "text",
    label: "Account Number",
  },
  {
    key: "bankIban",
    group: "bank",
    type: "iban",
    label: "IBAN",
    required: true,
  },
];

/** O(1) lookup by key (convenience for the panel). */
export const VENDOR_FIELD_BY_KEY = buildFieldMap(VENDOR_PROFILE_FIELDS);
