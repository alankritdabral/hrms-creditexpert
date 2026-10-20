import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import fs from "fs";
import path from "path";

// Initialize Cloudinary
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface UploadResult {
  success: boolean;
  url: string;
  publicId: string;
  format?: string;
  bytes: number;
  originalFilename?: string;
  error?: string;
}

/**
 * Uploads a file buffer to Cloudinary with automatic fallback
 * to local static storage (/public/uploads/kyc) if credentials are not yet set.
 */
export async function uploadKycDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  userIdentifier: string
): Promise<UploadResult> {
  const sanitizedIdentifier = userIdentifier.replace(/[^a-zA-Z0-9_-]/g, "_");
  const folder = `hrms_kyc/${sanitizedIdentifier}`;
  const baseName = path.parse(filename).name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const publicId = `${folder}/${baseName}_${Date.now()}`;

  // If Cloudinary is fully configured in .env.local
  if (isCloudinaryConfigured) {
    try {
      const isPdf = mimeType.includes("pdf") || filename.toLowerCase().endsWith(".pdf");
      const resourceType = isPdf ? "raw" : "auto";

      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            folder: folder,
            resource_type: resourceType,
            overwrite: true,
          },
          (error, res) => {
            if (error) return reject(error);
            if (!res) return reject(new Error("Cloudinary upload returned empty response"));
            resolve(res);
          }
        );
        stream.end(buffer);
      });

      return {
        success: true,
        url: result.secure_url || result.url,
        publicId: result.public_id,
        format: result.format || mimeType.split("/")[1] || "unknown",
        bytes: result.bytes || buffer.length,
        originalFilename: filename,
      };
    } catch (err: any) {
      console.error("Cloudinary upload failed, using local storage fallback:", err.message);
    }
  } else {
    console.info(
      "ℹ️ Cloudinary credentials not detected in .env.local. Saving uploaded document to local /public/uploads/kyc fallback directory."
    );
  }

  // Graceful fallback to local disk storage
  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "kyc", sanitizedIdentifier);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(filename) || (mimeType.includes("pdf") ? ".pdf" : ".jpg");
    const localFilename = `${baseName}_${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, localFilename);

    await fs.promises.writeFile(filePath, buffer);

    const publicUrl = `/uploads/kyc/${sanitizedIdentifier}/${localFilename}`;

    return {
      success: true,
      url: publicUrl,
      publicId: `local_${localFilename}`,
      format: ext.replace(".", ""),
      bytes: buffer.length,
      originalFilename: filename,
    };
  } catch (localErr: any) {
    console.error("Local storage fallback also failed:", localErr);
    return {
      success: false,
      url: "",
      publicId: "",
      bytes: buffer.length,
      error: localErr.message || "Upload failed",
    };
  }
}
