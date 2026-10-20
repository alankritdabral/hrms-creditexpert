import { NextRequest, NextResponse } from "next/server";
import { verifyPasswordResetOtp } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp } = body;

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, error: "Email and 6-digit verification code are required." },
        { status: 400 }
      );
    }

    const verification = await verifyPasswordResetOtp(email, otp);

    if (!verification.success) {
      return NextResponse.json(
        { success: false, error: verification.error || "Invalid verification code." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password reset code verified successfully. You may now enter your new password.",
    });
  } catch (error: any) {
    console.error("forgot-password/verify-otp error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify reset code." },
      { status: 500 }
    );
  }
}
