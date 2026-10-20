import { NextRequest, NextResponse } from "next/server";
import { verifyEmailOtp } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp } = body;

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, error: "Email and 6-digit OTP code are required." },
        { status: 400 }
      );
    }

    const verification = await verifyEmailOtp(email, otp);

    if (!verification.success) {
      return NextResponse.json(
        { success: false, error: verification.error || "Verification failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email verified successfully.",
    });
  } catch (error: any) {
    console.error("verify-otp error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify code." },
      { status: 500 }
    );
  }
}
