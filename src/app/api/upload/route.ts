import { NextRequest, NextResponse } from "next/server";
import { validateKycFile, MAX_KYC_FILE_SIZE_LABEL } from "@/lib/upload-validation";
import { uploadKycDocument } from "@/lib/cloudinary";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const documentType = (formData.get("documentType") as string) || "KYC_Document";
    const userIdentifier = (formData.get("identifier") as string) || "candidate";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file was uploaded." },
        { status: 400 }
      );
    }

    // 1. Enforce strict 2 MB file size limit and MIME validation
    const validation = validateKycFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error,
          limit: MAX_KYC_FILE_SIZE_LABEL,
          fileSize: validation.formattedSize,
        },
        { status: 400 }
      );
    }

    // 2. Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Upload to Cloudinary (with local fallback if keys not configured)
    const result = await uploadKycDocument(buffer, file.name, file.type, userIdentifier);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to process file upload." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `File uploaded successfully (${validation.formattedSize}).`,
      data: {
        fileUrl: result.url,
        publicId: result.publicId,
        fileName: file.name,
        fileSize: file.size,
        formattedSize: validation.formattedSize,
        mimeType: file.type,
        documentType,
      },
    });
  } catch (error: any) {
    console.error("API /api/upload error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error during upload." },
      { status: 500 }
    );
  }
}
