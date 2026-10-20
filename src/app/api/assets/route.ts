import { NextRequest, NextResponse } from "next/server";
import { getAssets, createAsset, updateAsset } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    let assets = await getAssets();
    if (auth.role === "employee") {
      assets = assets.filter((a) => a.assignedToEmployeeId === auth.employeeId);
    }
    return NextResponse.json({ success: true, data: assets });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "assets:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { assetTag, type, model, serialNumber, assignedToEmployeeId, assignedToName, status, notes } = body;

    const newAsset = await createAsset(
      {
        assetTag,
        type,
        model,
        serialNumber,
        assignedToEmployeeId,
        assignedToName,
        issuedDate: assignedToEmployeeId ? new Date().toISOString().split("T")[0] : undefined,
        status: status || "Assigned",
        notes,
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: newAsset }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "assets:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { id, updates } = body;

    const updated = await updateAsset(
      id,
      updates,
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    if (!updated) {
      return NextResponse.json({ success: false, error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
