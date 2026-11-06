import { NextRequest, NextResponse } from "next/server";
import { getDocuments, createDocument } from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requireOwnOrPermission,
  callerOf,
} from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { ownOrScoped } from "@/lib/access";
import { paginateList } from "@/lib/pagination";
import { EmployeeDocument } from "@/lib/types";
import { isTrustedUploadUrl } from "@/lib/upload-validation";

const matchDoc = (d: EmployeeDocument, q: string) =>
  [d.title, d.employeeName, d.documentType].some((v) => v?.toLowerCase().includes(q));

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId") || undefined;

    // Only documents:view_all (admin/HR) may read other people's documents
    if (employeeId) {
      const scopeErr = requireOwnOrPermission(auth, employeeId, "documents:view_all");
      if (scopeErr) return scopeErr;
    }

    const docs = ownOrScoped(callerOf(auth), "documents:view_all", await getDocuments(employeeId), (d) => d.employeeId);
    const paged = paginateList(docs, searchParams, matchDoc);
    if (paged) return NextResponse.json({ success: true, ...paged });
    return NextResponse.json({ success: true, data: docs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const body = await req.json();
    const { employeeId, employeeName, documentType, title, fileUrl, expiryDate, notes } = body;

    if (!employeeId || !title || !fileUrl) {
      return NextResponse.json(
        { success: false, error: "employeeId, title, and fileUrl are required" },
        { status: 400 }
      );
    }

    // Only files that our own upload endpoint stored can be attached
    if (!isTrustedUploadUrl(fileUrl, process.env.CLOUDINARY_CLOUD_NAME)) {
      return NextResponse.json(
        { success: false, error: "fileUrl must be a file uploaded through the HRMS upload endpoint" },
        { status: 400 }
      );
    }

    // Anyone may add to their own record; documents:manage (admin/HR) may add to any
    const scopeErr = requireOwnOrPermission(auth, employeeId, "documents:manage");
    if (scopeErr) return scopeErr;

    const newDoc = await createDocument(
      {
        employeeId,
        employeeName: employeeName || auth.actor.name,
        documentType: documentType || "General Document",
        title,
        fileUrl,
        uploadedBy: auth.actor.name,
        uploadDate: new Date().toISOString(),
        expiryDate,
        status: hasPermission(auth, "documents:manage") ? "Verified" : "Pending",
        notes,
      },
      auth.actor
    );

    return NextResponse.json({ success: true, data: newDoc });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
