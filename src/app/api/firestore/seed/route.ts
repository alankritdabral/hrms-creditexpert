import { NextRequest, NextResponse } from "next/server";
import { seedAllToFirestore, getFirestoreFreePlanMetrics } from "@/lib/firestore-service";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";
import { isLocalEnvironment } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const metrics = getFirestoreFreePlanMetrics();
  return NextResponse.json({ success: true, metrics });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "settings:manage");
  if (permError) return permError;

  // Strict guard: Demo batch seeding is only permitted on local development hosts
  if (!isLocalEnvironment(req)) {
    return NextResponse.json(
      {
        success: false,
        error: "Forbidden: Batch demo seeding is restricted to localhost environments.",
      },
      { status: 403 }
    );
  }

  try {
    const result = await seedAllToFirestore();
    const metrics = getFirestoreFreePlanMetrics();
    return NextResponse.json({ ...result, metrics });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
