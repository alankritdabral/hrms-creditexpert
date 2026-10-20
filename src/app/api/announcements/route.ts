import { NextRequest, NextResponse } from "next/server";
import { getAnnouncements, createAnnouncement } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET() {
  try {
    const list = await getAnnouncements();
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "announcements:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { title, description, targetAudience, priority, expiryDate } = body;

    const newAnn = await createAnnouncement(
      {
        title,
        description,
        targetAudience: targetAudience || "All",
        priority: priority || "Normal",
        publishDate: new Date().toISOString().split("T")[0],
        expiryDate,
        publishedBy: auth.actor.name,
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: newAnn }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
