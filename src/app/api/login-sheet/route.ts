import { NextRequest, NextResponse } from "next/server";
import {
  getEmployees,
  getLoginSheetEntries,
  getLoginSheetEntryById,
  createLoginSheetEntries,
  updateLoginSheetEntry,
  deleteLoginSheetEntry,
} from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission, type AuthSuccess } from "@/lib/api-auth";
import { hasPermission } from "@/lib/permissions";
import { getISTDateString, getISTMonthString } from "@/lib/attendance/ist-time";
import { MAX_ENTRIES_PER_REQUEST, normalizeEntryInput, type LoginSheetInput } from "@/lib/login-sheet";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

function actorOf(auth: AuthSuccess) {
  return {
    name: auth.actor?.name || auth.session?.name || "User",
    role: auth.actor?.role || auth.session?.role || auth.role || "employee",
  };
}

/** Resolves who a row belongs to. Only callers who can view everyone may enter rows for someone else. */
type Owner = { employeeId: string; empName: string };

async function resolveOwner(
  auth: AuthSuccess,
  requestedEmployeeId: unknown
): Promise<{ owner: Owner; error: null } | { owner: null; error: NextResponse }> {
  const own = { employeeId: auth.employeeId, empName: auth.actor?.name || auth.session?.name || auth.employeeId };
  if (typeof requestedEmployeeId !== "string" || !requestedEmployeeId || requestedEmployeeId === auth.employeeId) {
    return { owner: own, error: null };
  }
  if (!hasPermission(auth.role, "logins:view_all")) {
    return { owner: null, error: fail("Forbidden: you can only add or change your own login sheet rows.", 403) };
  }
  const emp = (await getEmployees()).find((e) => e.employeeId === requestedEmployeeId);
  if (!emp) return { owner: null, error: fail("Selected employee was not found.", 404) };
  return { owner: { employeeId: emp.employeeId, empName: emp.personal.fullName }, error: null };
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);

  try {
    const { searchParams } = new URL(req.url);
    const month = getISTMonthString();
    const from = searchParams.get("from") || `${month}-01`;
    const to = searchParams.get("to") || getISTDateString();
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return fail("from and to must be dates (YYYY-MM-DD).");
    if (from > to) return fail("The start date must not be after the end date.");
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    if (days > MAX_RANGE_DAYS) return fail(`Choose a date range of at most ${MAX_RANGE_DAYS} days.`);

    let rows = await getLoginSheetEntries(from, to);

    // Callers without logins:view_all only ever see their own rows (enforced here, not by a client hint).
    if (!hasPermission(auth.role, "logins:view_all")) {
      rows = rows.filter((r) => r.employeeId === auth.employeeId);
    } else {
      rows = rows.filter((r) => !r.branch || auth.branchScope.includes(r.branch));
    }
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  const permError = requirePermission(auth, "logins:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const rawEntries: unknown[] = Array.isArray(body?.entries) ? body.entries : [];
    if (rawEntries.length === 0) return fail("Add at least one row.");
    if (rawEntries.length > MAX_ENTRIES_PER_REQUEST) return fail(`You can add at most ${MAX_ENTRIES_PER_REQUEST} rows at a time.`);

    const inputs: LoginSheetInput[] = [];
    for (let i = 0; i < rawEntries.length; i++) {
      const r = normalizeEntryInput(rawEntries[i]);
      if (!r.ok) return fail(rawEntries.length > 1 ? `Row ${i + 1}: ${r.error}` : r.error);
      inputs.push(r.value);
    }

    const resolved = await resolveOwner(auth, body?.employeeId);
    if (resolved.error) return resolved.error;

    const created = await createLoginSheetEntries(resolved.owner, inputs, actorOf(auth));
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  const permError = requirePermission(auth, "logins:manage");
  if (permError) return permError;

  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return fail("Row id is required.");

    const existing = await getLoginSheetEntryById(id);
    if (!existing) return fail("Row not found.", 404);
    const canManageOthers = hasPermission(auth.role, "logins:view_all");
    if (!canManageOthers && existing.employeeId !== auth.employeeId) {
      return fail("Forbidden: you can only change your own login sheet rows.", 403);
    }

    const r = normalizeEntryInput(body);
    if (!r.ok) return fail(r.error);

    // Reassigning a row to another employee is limited to callers who can view everyone.
    let owner: { employeeId: string; empName: string } | null = null;
    if (typeof body.employeeId === "string" && body.employeeId && body.employeeId !== existing.employeeId) {
      const resolved = await resolveOwner(auth, body.employeeId);
      if (resolved.error) return resolved.error;
      owner = resolved.owner;
    }

    const updated = await updateLoginSheetEntry(id, r.value, owner, actorOf(auth));
    if (!updated) return fail("Row not found.", 404);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) return authFailureResponse(auth);
  const permError = requirePermission(auth, "logins:manage");
  if (permError) return permError;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("Row id is required.");

    const existing = await getLoginSheetEntryById(id);
    if (!existing) return fail("Row not found.", 404);
    if (!hasPermission(auth.role, "logins:view_all") && existing.employeeId !== auth.employeeId) {
      return fail("Forbidden: you can only delete your own login sheet rows.", 403);
    }

    const success = await deleteLoginSheetEntry(id, actorOf(auth));
    return NextResponse.json({ success });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
