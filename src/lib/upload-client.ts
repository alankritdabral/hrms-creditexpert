import { validateKycFile } from "./upload-validation";

export interface UploadedFile {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  formattedSize?: string;
  mimeType?: string;
}

/**
 * Validates a file in the browser, uploads it through /api/upload and returns where it was stored.
 * Throws an Error with a user-readable message on any failure.
 */
export async function uploadDocumentFile(file: File, documentType: string, identifier: string): Promise<UploadedFile> {
  const check = validateKycFile({ name: file.name, size: file.size, type: file.type, documentType });
  if (!check.valid) throw new Error(check.error || "This file cannot be uploaded.");

  const form = new FormData();
  form.append("file", file);
  form.append("documentType", documentType);
  form.append("identifier", identifier);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || "Upload failed. Please try again.");
  return json.data as UploadedFile;
}
