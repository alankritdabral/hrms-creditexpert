/**
 * HRMS Document & KYC Upload Validation Rules
 * Strict 2 MB limit per file with supported MIME types
 */

export const MAX_KYC_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_KYC_FILE_SIZE_LABEL = "2 MB";

export const ALLOWED_KYC_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export const ALLOWED_KYC_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  formattedSize?: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validates a file for KYC document upload.
 * Enforces strict 2 MB maximum file size limit and allowed MIME types.
 */
export function validateKycFile(file: { name: string; size: number; type: string }): FileValidationResult {
  const formattedSize = formatFileSize(file.size);

  // Check file size (strict 2 MB limit)
  if (file.size > MAX_KYC_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 2 MB limit. (Selected file: ${formattedSize}). Please choose a file smaller than 2 MB.`,
      formattedSize,
    };
  }

  // Check file size is not empty
  if (file.size === 0) {
    return {
      valid: false,
      error: "The selected file is empty (0 bytes). Please upload a valid document.",
      formattedSize,
    };
  }

  // Check MIME type or extension
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  const hasValidExt = ALLOWED_KYC_EXTENSIONS.includes(ext);
  const hasValidMime = file.type ? ALLOWED_KYC_MIME_TYPES.includes(file.type.toLowerCase()) : false;

  if (!hasValidExt && !hasValidMime) {
    return {
      valid: false,
      error: `Unsupported file format. Please upload a PDF, PNG, JPG, or WEBP file.`,
      formattedSize,
    };
  }

  return {
    valid: true,
    formattedSize,
  };
}
