import { NextRequest, NextResponse } from "next/server";
import {
  saveRegistrationDraft,
  getRegistrationDraft,
  deleteRegistrationDraft,
} from "@/lib/db/db-adapter";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email query parameter is required." },
        { status: 400 }
      );
    }

    const draft = await getRegistrationDraft(email);
    return NextResponse.json({ success: true, draft });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load registration draft." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, draft } = body;

    if (!email || !draft) {
      return NextResponse.json(
        { success: false, error: "Email and draft payload are required." },
        { status: 400 }
      );
    }

    await saveRegistrationDraft(email, draft);
    return NextResponse.json({ success: true, message: "Draft saved successfully." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save registration draft." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email query parameter is required." },
        { status: 400 }
      );
    }

    await deleteRegistrationDraft(email);
    return NextResponse.json({ success: true, message: "Draft removed." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to remove draft." },
      { status: 500 }
    );
  }
}
