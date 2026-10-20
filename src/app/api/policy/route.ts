import { NextRequest, NextResponse } from "next/server";
import { getPolicy, updatePolicy } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET() {
  try {
    const policy = await getPolicy();
    return NextResponse.json({ success: true, data: policy });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "settings:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { updates } = body;

    const policy = await updatePolicy(updates, {
      name: auth.actor.name,
      role: auth.actor.role,
    });

    return NextResponse.json({ success: true, data: policy });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
