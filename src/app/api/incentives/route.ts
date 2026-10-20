import { NextRequest, NextResponse } from "next/server";
import { getIncentiveSchemes, getEmployeeIncentives, addIncentiveRecord } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || undefined;
    const schemes = await getIncentiveSchemes();
    let incentives = await getEmployeeIncentives(month);

    if (auth.role === "employee") {
      incentives = incentives.filter((i) => i.employeeId === auth.employeeId);
    }

    return NextResponse.json({ success: true, data: { schemes, incentives } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "incentives:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const { employeeId, employeeName, month, schemeId, schemeName, target, achievement, eligibleAmount, incentiveAmount } = body;

    const record = await addIncentiveRecord(
      {
        employeeId,
        employeeName: employeeName || employeeId,
        month,
        schemeId,
        schemeName,
        target: Number(target) || 0,
        achievement: Number(achievement) || 0,
        eligibleAmount: Number(eligibleAmount) || 0,
        incentiveAmount: Number(incentiveAmount) || 0,
        status: "Approved",
        approvedBy: auth.actor.name,
        approvedDate: new Date().toISOString().split("T")[0],
      },
      {
        name: auth.actor.name,
        role: auth.actor.role,
      }
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
