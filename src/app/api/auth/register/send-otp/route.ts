import { NextRequest, NextResponse } from "next/server";
import { getUserAccountByEmail } from "@/lib/db/db-adapter";
import { sendEmailOtp } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, candidateName } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await getUserAccountByEmail(normalizedEmail);
    if (existing && existing.status === "Active") {
      return NextResponse.json(
        {
          success: false,
          error: "An active account with this email already exists. Please log in directly.",
        },
        { status: 409 }
      );
    }

    const result = await sendEmailOtp(normalizedEmail, candidateName || "Candidate");

    return NextResponse.json({
      success: true,
      message: result.message,
      devOtp: result.devOtp,
    });
  } catch (error: any) {
    console.error("send-otp error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to dispatch verification code." },
      { status: 500 }
    );
  }
}
