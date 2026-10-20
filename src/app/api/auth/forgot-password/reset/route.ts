import { NextRequest, NextResponse } from "next/server";
import {
  getUserAccountByEmail,
  updateUserAccount,
  recordAuditLog,
} from "@/lib/db/db-adapter";
import {
  isPasswordResetOtpVerified,
  clearPasswordResetOtp,
  sendPasswordChangedEmail,
} from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, newPassword, confirmPassword } = body;

    if (!email || !newPassword) {
      return NextResponse.json(
        { success: false, error: "Email and new password are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Verify OTP validation status
    if (!isPasswordResetOtpVerified(normalizedEmail)) {
      return NextResponse.json(
        {
          success: false,
          error: "Verification expired or invalid. Please verify your OTP code before changing your password.",
        },
        { status: 403 }
      );
    }

    // 2. Validate password
    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "New password and confirmation password do not match." },
        { status: 400 }
      );
    }

    // 3. Find user account
    const user = await getUserAccountByEmail(normalizedEmail);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User account could not be found." },
        { status: 404 }
      );
    }

    // 4. Update password
    await updateUserAccount(user.uid, {
      password: newPassword,
    });

    // 5. Consume OTP
    clearPasswordResetOtp(normalizedEmail);

    // 6. Security notice email
    sendPasswordChangedEmail(normalizedEmail, user.name).catch((err) =>
      console.warn("Failed to dispatch security email:", err)
    );

    // 7. Audit log
    await recordAuditLog({
      who: user.name,
      role: user.role,
      action: "PASSWORD_RESET",
      employeeId: user.employeeId,
      details: `Password was successfully reset via 6-digit email OTP verification.`,
    });

    return NextResponse.json({
      success: true,
      message: "Password updated successfully. You can now log in with your new credentials.",
    });
  } catch (error: any) {
    console.error("forgot-password/reset error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update password." },
      { status: 500 }
    );
  }
}
