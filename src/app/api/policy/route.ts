import { NextRequest, NextResponse } from "next/server";
import { getPolicy, updatePolicy, getEmployeeTiming } from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";
import { getBranchTimingProfiles, getTimingProfiles, lateAfterOf, validateBranchTimingProfiles, validateTimingProfiles } from "@/lib/attendance/late-policy";
import { getISTDateString } from "@/lib/attendance/ist-time";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const policy = await getPolicy();
    const timingProfiles = getTimingProfiles(policy);
    const branchProfiles = getBranchTimingProfiles(policy);

    // The caller's own timing and, for half-day timings, their late count for the current week.
    let myTiming: unknown = null;
    if (auth.employeeId) {
      try {
        const t = await getEmployeeTiming(auth.employeeId, getISTDateString(), policy);
        myTiming = {
          profile: t.profile,
          lateAfter: lateAfterOf(t.profile),
          lateCountThisWeek: t.lateCountThisWeek,
          weekStart: t.weekStart,
          weekEnd: t.weekEnd,
        };
      } catch (e) {
        console.warn("GET /api/policy: could not resolve own timing:", e);
      }
    }

    return NextResponse.json({ success: true, data: { ...policy, timingProfiles, branchProfiles }, myTiming });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "settings:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const updates = body?.updates;
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ success: false, error: "updates is required" }, { status: 400 });
    }

    if (updates.timingProfiles !== undefined) {
      const timingError = validateTimingProfiles(updates.timingProfiles);
      if (timingError) {
        return NextResponse.json({ success: false, error: timingError }, { status: 400 });
      }
      // Timing 2 is the company-wide standard; keep the legacy single start/grace fields in step with it.
      const standard = (updates.timingProfiles as { id: string; startTime: string; graceMinutes: number }[]).find(
        (p) => p.id === "timing2"
      );
      if (standard) {
        updates.officeStartTime = standard.startTime;
        updates.gracePeriodMinutes = standard.graceMinutes;
      }
    }

    if (updates.branchTimingProfiles !== undefined) {
      const branchError = validateBranchTimingProfiles(updates.branchTimingProfiles);
      if (branchError) {
        return NextResponse.json({ success: false, error: branchError }, { status: 400 });
      }
    }

    const policy = await updatePolicy(updates, {
      name: auth.actor.name,
      role: auth.actor.role,
    });

    return NextResponse.json({ success: true, data: { ...policy, timingProfiles: getTimingProfiles(policy), branchProfiles: getBranchTimingProfiles(policy) },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
