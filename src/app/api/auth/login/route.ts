import { NextRequest, NextResponse } from "next/server";
import { getUserAccountByEmail, createSession, recordAuditLog } from "@/lib/db/db-adapter";
import { getRolePermissions, getBranchScope } from "@/lib/permissions";
import { isLocalEnvironment } from "@/lib/env";
import { verifyPassword, hashPassword, isHashedPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toPublicSession } from "@/lib/api-auth";
import { updateUserAccount } from "@/lib/db/db-adapter";
import { resolveAllowedSections } from "@/lib/allowed-sections";

export async function POST(req: NextRequest) {
  try {
    const limited = enforceRateLimit(req, "login-ip", 20, 15 * 60 * 1000);
    if (limited) return limited as NextResponse;
    const body = await req.json();
    const { email, password, deviceId } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const limitedAcct = enforceRateLimit(req, "login-acct", 8, 15 * 60 * 1000, String(email).toLowerCase().trim());
    if (limitedAcct) return limitedAcct as NextResponse;

    const userAccount = await getUserAccountByEmail(email);

    if (!userAccount || !verifyPassword(String(password), userAccount.password)) {
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

    // Transparently upgrade legacy plaintext passwords to scrypt hashes on successful login
    if (!isHashedPassword(userAccount.password)) {
      const upgraded = hashPassword(String(password));
      await updateUserAccount(userAccount.uid, { password: upgraded }).catch(() => {});
      userAccount.password = upgraded;
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

    const isDev = isLocalEnvironment(req);
    const environment: "development" | "production" = isDev ? "development" : "production";

    // Create session — enforces SINGLE ACTIVE SESSION rule:
    // Any existing active session for this user in the same environment is instantly revoked!
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
      environment,
    });

    const branchScope = getBranchScope(userAccount.role, userAccount.branch);
    const permissions = getRolePermissions(userAccount.role);

    const allowedSections = await resolveAllowedSections(userAccount.role);

    const userPayload = {
      id: userAccount.uid,
      employeeId: userAccount.employeeId,
      email: userAccount.email,
      name: userAccount.name,
      role: userAccount.role,
      branch: userAccount.branch,
      department: userAccount.department,
      avatar: userAccount.avatar,
      allowedSections,
    };

    const response = NextResponse.json({
      success: true,
      message: "Authenticated successfully. Active session established.",
      session: toPublicSession(session),
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
  } catch (error: unknown) {
    console.error("Auth login error:", error);
    const msg = error instanceof Error ? error.message : "Internal authentication error";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
