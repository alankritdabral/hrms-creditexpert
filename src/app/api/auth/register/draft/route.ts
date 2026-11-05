import { NextRequest, NextResponse } from "next/server";
import {
  saveRegistrationDraft,
  getRegistrationDraft,
  deleteRegistrationDraft,
} from "@/lib/db/db-adapter";
import { isEmailOtpVerified } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { RegistrationDraft } from "@/lib/types";

const notVerified = () =>
  NextResponse.json(
    { success: false, error: "Verify your email address with the one-time code to use saved drafts." },
    { status: 403 }
  );

/** Drafts never hold passwords, including drafts saved before this rule existed. */
function withoutPasswords<T extends object>(draft: T): T {
  const clean = { ...(draft as Record<string, unknown>) };
  delete clean.password;
  delete clean.confirmPassword;
  return clean as T;
}

export async function GET(req: NextRequest) {
  try {
    const limited = enforceRateLimit(req, "draft", 60, 10 * 60 * 1000);
    if (limited) return limited as NextResponse;
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email query parameter is required." },
        { status: 400 }
      );
    }
    if (!(await isEmailOtpVerified(email))) return notVerified();

    const draft = await getRegistrationDraft(email);
    return NextResponse.json({ success: true, draft: draft ? withoutPasswords(draft) : null });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load registration draft." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const limited = enforceRateLimit(req, "draft", 60, 10 * 60 * 1000);
    if (limited) return limited as NextResponse;
    const body = await req.json();
    const { email, draft } = body;

    if (!email || !draft) {
      return NextResponse.json(
        { success: false, error: "Email and draft payload are required." },
        { status: 400 }
      );
    }
    if (!(await isEmailOtpVerified(email))) return notVerified();

    await saveRegistrationDraft(email, withoutPasswords(draft as RegistrationDraft));
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
    if (!(await isEmailOtpVerified(email))) return notVerified();

    await deleteRegistrationDraft(email);
    return NextResponse.json({ success: true, message: "Draft removed." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to remove draft." },
      { status: 500 }
    );
  }
}
