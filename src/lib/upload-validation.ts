/**
 * HRMS Document & KYC Upload Validation Rules
 * Strict 2 MB limit per file with supported MIME types & format signatures
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

export const ALLOWED_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export const ALLOWED_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  formattedSize?: string;
  detectedFormat?: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validates a file for KYC document upload.
 * Enforces strict 2 MB maximum file size limit, document-specific allowed formats,
 * and valid extensions / MIME types.
 */
export function validateKycFile(file: {
  name: string;
  size: number;
  type: string;
  documentType?: string;
}): FileValidationResult {
  const formattedSize = formatFileSize(file.size);

  // 1. Check file size is not empty
  if (!file.size || file.size === 0) {
    return {
      valid: false,
      error: "The selected file is empty (0 bytes). Please upload a valid document.",
      formattedSize,
    };
  }

  // 2. Check file size (strict 2 MB limit)
  if (file.size > MAX_KYC_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 2 MB limit (Selected file: ${formattedSize}). Please choose a file smaller than 2 MB.`,
      formattedSize,
    };
  }

  // 3. Extract and validate file extension
  const fileNameParts = file.name.split(".");
  if (fileNameParts.length < 2) {
    return {
      valid: false,
      error: "File has no valid extension. Please upload a file with .pdf, .jpg, .jpeg, .png, or .webp format.",
      formattedSize,
    };
  }

  const ext = "." + (fileNameParts.pop() || "").toLowerCase();
  const isPhoto = file.documentType === "photograph";

  // Specific rules for photograph: only image formats allowed (no PDFs)
  if (isPhoto) {
    if (ext === ".pdf" || (file.type && file.type.toLowerCase().includes("pdf"))) {
      return {
        valid: false,
        error: "Passport photograph must be an image (JPG, PNG, or WEBP). PDF documents are not accepted for photographs.",
        formattedSize,
      };
    }

    if (!ALLOWED_PHOTO_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported photo format (${ext}). Supported formats are JPG, JPEG, PNG, and WEBP.`,
        formattedSize,
      };
    }

    if (file.type && !ALLOWED_PHOTO_MIME_TYPES.includes(file.type.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported photo file type (${file.type}). Supported image types are JPG, PNG, and WEBP.`,
        formattedSize,
      };
    }
  } else {
    // General KYC documents: PDF, JPG, JPEG, PNG, WEBP allowed
    if (!ALLOWED_KYC_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported document format (${ext}). Supported formats are PDF, JPG, JPEG, PNG, and WEBP.`,
        formattedSize,
      };
    }

    if (file.type && !ALLOWED_KYC_MIME_TYPES.includes(file.type.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported document file type (${file.type}). Supported formats are PDF, JPG, PNG, and WEBP.`,
        formattedSize,
      };
    }
  }

  return {
    valid: true,
    formattedSize,
  };
}

/**
 * Validates the raw binary buffer (magic bytes) to verify the actual file format
 * and prevent spoofed or renamed files.
 */
export function validateFileBufferSignature(
  buffer: Uint8Array | Buffer,
  filename: string,
  documentType?: string
): FileValidationResult {
  const formattedSize = formatFileSize(buffer.length);

  if (buffer.length < 12) {
    return {
      valid: false,
      error: "File content is incomplete or corrupted (less than 12 bytes).",
      formattedSize,
    };
  }

  // Check magic byte signatures
  const isPdf =
    buffer.subarray(0, 5).toString() === "%PDF-" ||
    (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d);
  const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP";

  let detectedFormat: "pdf" | "jpg" | "png" | "webp" | null = null;
  if (isPdf) detectedFormat = "pdf";
  else if (isJpg) detectedFormat = "jpg";
  else if (isPng) detectedFormat = "png";
  else if (isWebp) detectedFormat = "webp";

  if (!detectedFormat) {
    return {
      valid: false,
      error: "Corrupt or invalid document content. File content does not match a valid PDF, JPG, PNG, or WEBP file.",
      formattedSize,
    };
  }

  const isPhoto = documentType === "photograph";
  if (isPhoto && detectedFormat === "pdf") {
    return {
      valid: false,
      error: "Passport photograph must be an image (JPG, PNG, or WEBP). PDF files cannot be used as a photo.",
      formattedSize,
    };
  }

  return {
    valid: true,
    detectedFormat,
    formattedSize,
  };
}
