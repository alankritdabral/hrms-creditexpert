import { NextRequest, NextResponse } from "next/server";
import { getDocuments, createDocument } from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requireEmployeeScope,
} from "@/lib/api-auth";
import { EmployeeDocument } from "@/lib/types";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId") || undefined;

    // Scope check: Employees can only view their own documents
    if (employeeId) {
      const scopeErr = requireEmployeeScope(auth, employeeId);
      if (scopeErr) return scopeErr;
    } else if (auth.role === "employee") {
      // Employee without employeeId query parameter defaults to their own employeeId
      const docs = await getDocuments(auth.employeeId);
      return NextResponse.json({ success: true, data: docs });
    }

    const docs = await getDocuments(employeeId);
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

    // Scope check: employee can upload to their own record, admin/hr can upload to any
    const scopeErr = requireEmployeeScope(auth, employeeId);
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
        status: auth.role === "employee" ? "Pending" : "Verified",
        notes,
      },
      auth.actor
    );

    return NextResponse.json({ success: true, data: newDoc });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
