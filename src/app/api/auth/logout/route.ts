import { NextRequest, NextResponse } from "next/server";
import { extractSessionId } from "@/lib/api-auth";
import { revokeSession } from "@/lib/db/db-adapter";

export async function POST(req: NextRequest) {
  const sessionId = extractSessionId(req);

  if (sessionId) {
    await revokeSession(sessionId, "user_logged_out");
  }

  const response = NextResponse.json({
    success: true,
    message: "Session terminated successfully.",
  });

  // Clear session cookie
  response.cookies.set({
    name: "hrms_session_id",
    value: "",
    path: "/",
    maxAge: 0,
  });

  return response;
}
