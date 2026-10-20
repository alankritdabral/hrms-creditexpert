import { NextRequest, NextResponse } from "next/server";
import { getUserAccountByEmail } from "@/lib/db/db-adapter";
import { sendPasswordResetOtp } from "@/lib/email";
import { isLocalEnvironment } from "@/lib/env";

export async function POST(req: NextRequest) {
  try {
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

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "No employee account found with this email address. Please check your spelling or register online.",
        },
        { status: 404 }
      );
    }

    if (user.status === "Suspended" || user.status === "Deactivated") {
      return NextResponse.json(
        {
          success: false,
          error: `Your account is ${user.status.toLowerCase()}. Please contact HR administrator to regain access.`,
        },
        { status: 403 }
      );
    }

    const result = await sendPasswordResetOtp(normalizedEmail, user.name);

    return NextResponse.json({
      success: true,
      message: result.message,
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
