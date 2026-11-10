import type { AttendancePolicy, CustomRole, Holiday, LeaveRequest, TimingProfile, UserAccount } from "@/lib/types";
import { getBranchTimingProfile, lateAfterOf, resolveTimingForEmployee } from "@/lib/attendance/late-policy";

/**
 * Which reminder run a mail belongs to.
 * - "delhi": staff on a branch-wide profile (Delhi), mailed at 10:00 IST, before their 10:05 late line.
 * - "other": the existing Timing 1 role group outside those branches, mailed at 09:45 IST.
 */
export type ReminderScope = "delhi" | "other";

export function parseReminderScope(value: string | null): ReminderScope {
  return value === "delhi" ? "delhi" : "other";
}

export interface ReminderTarget {
  account: UserAccount;
  profile: TimingProfile;
  /** "HH:mm" after which the person is late. */
  lateAfter: string;
}

/**
 * Active accounts that should get the "attendance not marked" mail for this scope.
 * `branchByEmployeeId` holds the employee-record branch (lowercase employee id key); it wins over the login's
 * branch, the same order the clock-in uses. Approved leave, holidays (All or the person's branch) and
 * people who already marked attendance are skipped.
 */
export function selectReminderTargets(input: {
  scope: ReminderScope;
  today: string;
  accounts: UserAccount[];
  roles: CustomRole[];
  policy: AttendancePolicy;
  holidays: Pick<Holiday, "date" | "branch">[];
  leaves: Pick<LeaveRequest, "status" | "startDate" | "endDate" | "employeeId">[];
  markedEmployeeIds: Set<string>;
  branchByEmployeeId?: Map<string, string>;
}): ReminderTarget[] {
  const { scope, today, accounts, roles, policy, holidays, leaves, markedEmployeeIds, branchByEmployeeId } = input;

  const onLeave = new Set(
    leaves
      .filter((l) => l.status === "Approved" && l.startDate <= today && l.endDate >= today)
      .map((l) => l.employeeId.toLowerCase())
  );
  const holidayBranches = new Set(holidays.filter((h) => h.date === today).map((h) => h.branch));
  if (holidayBranches.has("All")) return [];

  const out: ReminderTarget[] = [];
  for (const account of accounts) {
    if (account.status !== "Active" || !account.email) continue;
    const key = account.employeeId.toLowerCase();
    if (markedEmployeeIds.has(key) || onLeave.has(key)) continue;

    const branch = branchByEmployeeId?.get(key) || account.branch;
    if (holidayBranches.has(account.branch) || (branch && holidayBranches.has(branch as never))) continue;

    const onBranchProfile = !!getBranchTimingProfile(policy, branch);
    const profile = resolveTimingForEmployee({ branch, roleId: account.role, roles, policy });
    const wanted = scope === "delhi" ? onBranchProfile : !onBranchProfile && profile.id === "timing1";
    if (!wanted) continue;

    out.push({ account, profile, lateAfter: lateAfterOf(profile) });
  }
  return out;
}
