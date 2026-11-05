import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { authenticateRequest, authFailureResponse } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";

const MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
};

// Same sanitiser that names the per-user upload folder in src/lib/cloudinary.ts
const folderName = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

/**
 * Serves files saved by the local-disk upload fallback (used when Cloudinary is not configured).
 * Requires a session; KYC files are visible to document managers and to the person they belong to.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { path: segments } = await params;
    if (!segments || segments.length === 0) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Local uploads live outside public/ (which Next serves statically with no auth check).
    // Resolve and require the result to stay inside the private upload folder.
    const root = path.resolve(process.cwd(), ".uploads");
    const filePath = path.resolve(root, ...segments);
    if (!filePath.startsWith(root + path.sep)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // kyc/<owner folder>/<file>: only document managers or the owner may read it
    if (segments[0] === "kyc") {
      const owner = segments[1] || "";
      const mine = [auth.employeeId, auth.actor.email].filter(Boolean).map(folderName);
      if (!hasPermission(auth.role, "documents:view_all") && !mine.includes(owner)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext];
    if (!contentType) {
      return new NextResponse("Not Found", { status: 404 });
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return new NextResponse("File Not Found", { status: 404 });
    }
    if (!stat.isFile()) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error("Error serving upload:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
