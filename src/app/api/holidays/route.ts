import { NextRequest, NextResponse } from "next/server";
import { getHolidays, createHoliday, updateHoliday, deleteHoliday } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";
import { Branch } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const branch = (searchParams.get("branch") as Branch) || undefined;
    const holidays = await getHolidays(branch);
    return NextResponse.json({ success: true, data: holidays });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "holidays:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { name, date, branch, type, description } = body;

    if (!name || !date) {
      return NextResponse.json(
        { success: false, error: "Holiday name and date are required" },
        { status: 400 }
      );
    }

    const newHoliday = await createHoliday(
      {
        name,
        date,
        branch: branch || "All",
        type: type || "Company",
        description: description || "",
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: newHoliday }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "holidays:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { id, updates } = body;

    if (!id || !updates) {
      return NextResponse.json(
        { success: false, error: "Holiday id and updates are required" },
        { status: 400 }
      );
    }

    const updated = await updateHoliday(id, updates, {
      name: auth.actor.name,
      role: auth.actor.role,
    });

    if (!updated) {
      return NextResponse.json({ success: false, error: "Holiday not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "holidays:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Holiday id is required" }, { status: 400 });
    }

    const success = await deleteHoliday(id, {
      name: auth.actor.name,
      role: auth.actor.role,
    });

    if (!success) {
      return NextResponse.json({ success: false, error: "Holiday not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Holiday deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
