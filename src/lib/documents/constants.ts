import type { DocumentType } from "@prisma/client";

/** Max upload size — 100 MB default, overridable via MAX_UPLOAD_SIZE_MB env. */
export const DEFAULT_MAX_UPLOAD_SIZE_MB = 100;

export const ALLOWED_MIME_TYPES = {
  "application/pdf": { extensions: [".pdf"], label: "PDF" },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], label: "JPEG" },
  "image/png": { extensions: [".png"], label: "PNG" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: [".docx"],
    label: "DOCX",
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    extensions: [".xlsx"],
    label: "XLSX",
  },
} as const;

export type AllowedMimeType = keyof typeof ALLOWED_MIME_TYPES;

export const ALLOWED_MIME_TYPE_LIST = Object.keys(
  ALLOWED_MIME_TYPES,
) as AllowedMimeType[];

export const UPLOAD_DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "CARRIER_ESTIMATE", label: "Carrier estimate" },
  { value: "CONTRACTOR_ESTIMATE", label: "Contractor estimate" },
  { value: "EAGLEVIEW", label: "EagleView report" },
  { value: "HOVER", label: "HOVER report" },
  { value: "GAF", label: "GAF report" },
  { value: "ITEL", label: "ITEL report" },
  { value: "PHOTO", label: "Photo" },
  { value: "INVOICE", label: "Invoice" },
  { value: "POLICY_JACKET", label: "Policy jacket" },
  { value: "CARRIER_EMAIL", label: "Carrier email" },
  { value: "CODE", label: "Code document" },
  { value: "MANUFACTURER", label: "Manufacturer instructions" },
  { value: "FIELD_NOTE", label: "Field note" },
  { value: "OTHER", label: "Other" },
];

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return mimeType in ALLOWED_MIME_TYPES;
}

export function extensionForMime(mimeType: AllowedMimeType): string {
  return ALLOWED_MIME_TYPES[mimeType].extensions[0];
}
