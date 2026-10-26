import { NextRequest, NextResponse } from "next/server";
import { getSession, touchSession } from "./db/db-adapter";
import { UserRole, Branch, UserSession } from "./types";
import { Permission, hasPermission, getBranchScope } from "./permissions";

export interface AuthenticatedActor {
  name: string;
  role: UserRole;
  employeeId: string;
  branch: Branch;
  email: string;
  userId: string;
  sessionId: string;
}

export type AuthSuccess = {
  authenticated: true;
  session: UserSession;
  actor: AuthenticatedActor;
  role: UserRole;
  branch: Branch;
  branchScope: Branch[];
  employeeId: string;
};

export type AuthFailure = {
  authenticated: false;
  status: number;
  error: string;
  code: "UNAUTHENTICATED" | "SESSION_REVOKED" | "SESSION_EXPIRED";
  reason?: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Extracts session ID from Cookie, Authorization header, or x-session-id header.
 */
export function extractSessionId(req: Request | NextRequest): string | null {
  // 1. From x-session-id header
  const customHeader = req.headers.get("x-session-id");
  if (customHeader) return customHeader.trim();

  // 2. From Authorization header: Bearer <sessionId>
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  // 3. From cookies
  if (req instanceof NextRequest) {
    const cookie = req.cookies.get("hrms_session_id");
    if (cookie?.value) return cookie.value.trim();
  }

  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/hrms_session_id=([^;]+)/);
    if (match) return decodeURIComponent(match[1].trim());
  }

  return null;
}

/**
 * Server-side request authenticator with SINGLE ACTIVE SESSION enforcement.
 */
export async function authenticateRequest(req: Request | NextRequest): Promise<AuthResult> {
  const sessionId = extractSessionId(req);

  if (!sessionId) {
    return {
      authenticated: false,
      status: 401,
      error: "Authentication required. Please sign in to continue.",
      code: "UNAUTHENTICATED",
    };
  }

  const session = await getSession(sessionId);

  if (!session) {
    return {
      authenticated: false,
      status: 401,
      error: "Session not found or has expired.",
      code: "UNAUTHENTICATED",
    };
  }

  // Enforce single active session check: Was this session revoked because of another login?
  if (!session.isActive || session.revokedAt) {
    return {
      authenticated: false,
      status: 401,
      error:
        session.revocationReason === "signed_in_from_another_device"
          ? "Your session has ended because your account was signed in from another device."
          : "Your session has been terminated.",
      code: "SESSION_REVOKED",
      reason: session.revocationReason || "revoked",
    };
  }

  // Check expiration (24h)
  if (new Date(session.expiresAt) < new Date()) {
    return {
      authenticated: false,
      status: 401,
      error: "Session expired. Please log in again.",
      code: "SESSION_EXPIRED",
    };
  }

  // Update activity timestamp
  touchSession(sessionId).catch(() => {});

  const actor: AuthenticatedActor = {
    name: session.name,
    role: session.role,
    employeeId: session.employeeId,
    branch: session.branch,
    email: session.email,
    userId: session.userId,
    sessionId: session.sessionId,
  };

  const branchScope = getBranchScope(session.role, session.branch);

  return {
    authenticated: true,
    session,
    actor,
    role: session.role,
    branch: session.branch,
    branchScope,
    employeeId: session.employeeId,
  };
}

/**
 * Helper to build an immediate error Response when authentication fails.
 */
export function authFailureResponse(failure: AuthFailure): NextResponse {
  const response = NextResponse.json(
    {
      success: false,
      error: failure.error,
      code: failure.code,
      reason: failure.reason,
    },
    { status: failure.status }
  );

  // Clear dead or revoked session cookie only if a stale or revoked session was presented
  if (
    failure.code === "SESSION_REVOKED" ||
    failure.code === "SESSION_EXPIRED"
  ) {
    response.cookies.set({
      name: "hrms_session_id",
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

/**
 * Validates whether the authenticated user holds a specific Permission.
 */
export function requirePermission(auth: AuthSuccess, permission: Permission): NextResponse | null {
  if (!hasPermission(auth.role, permission)) {
    return NextResponse.json(
      {
        success: false,
        error: `Forbidden: Action requires permission "${permission}".`,
        code: "FORBIDDEN",
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Validates branch isolation:
 * - Admin and HR have access to all branches.
 * - Employees are isolated strictly to their assigned branch.
 */
export function requireBranchScope(auth: AuthSuccess, targetBranch?: Branch): NextResponse | null {
  if (!targetBranch) return null;
  if (!auth.branchScope.includes(targetBranch)) {
    return NextResponse.json(
      {
        success: false,
        error: `Forbidden: Access restricted to branch "${targetBranch}". Your permitted branch scope: [${auth.branchScope.join(", ")}].`,
        code: "BRANCH_RESTRICTED",
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Validates employee isolation:
 * - Admin and HR can access all employee data.
 * - Employees can only access their own employeeId.
 */
export function requireEmployeeScope(auth: AuthSuccess, targetEmployeeId?: string): NextResponse | null {
  if (!targetEmployeeId) return null;
  if (auth.role === "employee" && auth.employeeId !== targetEmployeeId) {
    return NextResponse.json(
      {
        success: false,
        error: "Forbidden: You are only authorized to access your own employee self-service records.",
        code: "EMPLOYEE_RESTRICTED",
      },
      { status: 403 }
    );
  }
  return null;
}
