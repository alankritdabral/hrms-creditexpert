import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { getUserAccountByEmail } from "@/lib/db/db-adapter";
import { sendPasswordResetOtp } from "@/lib/email";
import { isLocalEnvironment } from "@/lib/env";

export async function POST(req: NextRequest) {
  try {
    const limited = enforceRateLimit(req, "pwd-otp", 5, 10 * 60 * 1000);
    if (limited) return limited as NextResponse;
    const body = await req.json();
    const { email } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid registered email address." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await getUserAccountByEmail(normalizedEmail);

    // The response is identical whether or not an account exists (or is active), so this form
    // cannot be used to discover which email addresses are registered.
    const genericMessage = "If an active account exists for this email, a 6-digit verification code has been sent.";

    if (!user || user.status === "Suspended" || user.status === "Deactivated") {
      return NextResponse.json({ success: true, message: genericMessage });
    }

    const result = await sendPasswordResetOtp(normalizedEmail, user.name);

    return NextResponse.json({
      success: true,
      message: genericMessage,
      devOtp: isLocalEnvironment(req) ? result.devOtp : undefined,
    });
  } catch (error: any) {
    console.error("forgot-password/send-otp error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to dispatch password reset code." },
      { status: 500 }
    );
  }
}
