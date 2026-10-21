import { NextRequest, NextResponse } from "next/server";
import { getOffices, saveOffice, deleteOffice } from "@/lib/db/db-adapter";
import {
  authenticateRequest,
  authFailureResponse,
  requirePermission,
} from "@/lib/api-auth";
import { OfficeLocation } from "@/lib/types";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const offices = await getOffices();
    return NextResponse.json({ success: true, data: offices });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load offices" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "attendance:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const {
      id,
      name,
      branch,
      latitude,
      longitude,
      allowedRadiusMeters,
      maxAccuracyMeters,
      address,
      isActive,
    } = body;

    if (!name || !branch || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "Office name, branch, latitude, and longitude are required.",
        },
        { status: 400 }
      );
    }

    const officeToSave: OfficeLocation = {
      id: id || `office-${Date.now()}`,
      name: String(name).trim(),
      branch,
      latitude: Number(latitude),
      longitude: Number(longitude),
      allowedRadiusMeters: Number(allowedRadiusMeters || 100),
      maxAccuracyMeters: Number(maxAccuracyMeters || 100),
      address: address ? String(address).trim() : "",
      isActive: isActive !== false,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveOffice(officeToSave, {
      name: auth.actor.name,
      role: auth.actor.role,
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save office" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "attendance:manage");
  if (permError) return permError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Office id is required" },
        { status: 400 }
      );
    }

    const deleted = await deleteOffice(id, {
      name: auth.actor.name,
      role: auth.actor.role,
    });

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Office not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "Office deleted successfully" });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete office" },
      { status: 500 }
    );
  }
}
