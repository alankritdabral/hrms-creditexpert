import { NextRequest, NextResponse } from "next/server";
import { getUserAccountByEmail, createSession, recordAuditLog } from "@/lib/db/db-adapter";
import { ROLE_PERMISSIONS, getBranchScope } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, deviceId } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const userAccount = await getUserAccountByEmail(email);

    if (!userAccount || userAccount.password !== password) {
      await recordAuditLog({
        who: email,
        role: "unauthenticated",
        action: "LOGIN_FAILED",
        details: `Failed authentication attempt for email: ${email}`,
      });

      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (userAccount.status !== "Active") {
      if (userAccount.status === "Pending_Approval") {
        return NextResponse.json(
          {
            success: false,
            isPendingApproval: true,
            error:
              "Your registration has been submitted and is currently pending verification by HR & Admin. You will receive an email as soon as your account is approved.",
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { success: false, error: `Account is ${userAccount.status.toLowerCase()}. Please contact HR.` },
        { status: 403 }
      );
    }

    const userAgent = req.headers.get("user-agent") || "unknown";
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

    // Create session — enforces SINGLE ACTIVE SESSION rule:
    // Any existing active session for this user is instantly revoked!
    const session = await createSession({
      userId: userAccount.uid,
      employeeId: userAccount.employeeId,
      role: userAccount.role,
      branch: userAccount.branch,
      email: userAccount.email,
      name: userAccount.name,
      deviceId: deviceId || "browser-" + Math.random().toString(36).substring(2, 8),
      userAgent,
      ipHash: ip,
    });

    const branchScope = getBranchScope(userAccount.role, userAccount.branch);
    const permissions = ROLE_PERMISSIONS[userAccount.role];

    const userPayload = {
      id: userAccount.uid,
      employeeId: userAccount.employeeId,
      email: userAccount.email,
      name: userAccount.name,
      role: userAccount.role,
      branch: userAccount.branch,
      department: userAccount.department,
      avatar: userAccount.avatar,
    };

    const response = NextResponse.json({
      success: true,
      message: "Authenticated successfully. Active session established.",
      session,
      user: userPayload,
      permissions,
      branchScope,
    });

    // Set HTTP-only session cookie
    response.cookies.set({
      name: "hrms_session_id",
      value: session.sessionId,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return response;
  } catch (error: any) {
    console.error("Auth login error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal authentication error" },
      { status: 500 }
    );
  }
}
