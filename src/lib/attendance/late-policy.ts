import type { AttendancePolicy, AttendanceStatus, Branch, CustomRole, TimingProfile, TimingSlotId } from "@/lib/types";
import { addMinutesToTime, evaluateLateArrivalIST } from "@/lib/attendance/ist-time";

export const TIMING_SLOTS: TimingSlotId[] = ["timing1", "timing2"];
export const DEFAULT_TIMING_SLOT: TimingSlotId = "timing2";

const BRANCH_NAMES: Branch[] = ["Delhi", "Dehradun", "Rudrapur"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Defaults for the two slots; Timing 2 follows the legacy single start/grace on the policy.
 * A legacy start time that is not a valid "HH:mm" (the old settings box was free text, so "9.30" was
 * saved) is ignored in favour of 10:00 rather than guessed at.
 */
export function defaultTimingProfiles(policy?: Pick<AttendancePolicy, "officeStartTime" | "gracePeriodMinutes">): TimingProfile[] {
  const legacyStart = policy?.officeStartTime && HHMM.test(policy.officeStartTime) ? policy.officeStartTime : "10:00";
  const legacyGrace =
    Number.isInteger(policy?.gracePeriodMinutes) && (policy!.gracePeriodMinutes as number) >= 0 ? (policy!.gracePeriodMinutes as number) : 15;
  return [
    {
      id: "timing1",
      label: "Timing 1",
      startTime: "09:30",
      graceMinutes: 15,
      halfDayRules: { weeklyLateAllowance: 2, hardCutoffTime: "10:00" },
    },
    {
      id: "timing2",
      label: "Timing 2",
      startTime: legacyStart,
      graceMinutes: legacyGrace,
    },
  ];
}

/** Both slots, in order, with defaults filled in for any that the stored policy does not have. */
export function getTimingProfiles(policy: AttendancePolicy): TimingProfile[] {
  const defaults = defaultTimingProfiles(policy);
  return defaults.map((d) => {
    const stored = policy.timingProfiles?.find((p) => p.id === d.id);
    return stored ? { ...d, ...stored } : d;
  });
}

export function slotOfRole(role?: Pick<CustomRole, "timingSlot"> | null): TimingSlotId {
  return role?.timingSlot === "timing1" ? "timing1" : DEFAULT_TIMING_SLOT;
}

/**
 * Branch-wide timing defaults. Delhi: office starts 09:50, late after 10:05, always a Half Day after 10:20,
 * and the 3rd late arrival in a Monday-Saturday week is a Half Day too. Everyone in the branch follows it,
 * whatever their role's slot is. `effectiveFrom` keeps lates judged under the earlier Delhi rule out of the
 * weekly strike count in the first week; HR can change it in Settings.
 */
export function defaultBranchTimingProfiles(): Partial<Record<Branch, TimingProfile>> {
  return {
    Delhi: {
      id: "branch-delhi",
      label: "Delhi branch",
      startTime: "09:50",
      graceMinutes: 15,
      halfDayRules: { weeklyLateAllowance: 2, hardCutoffTime: "10:20" },
      effectiveFrom: "2026-11-10",
    },
  };
}

const normBranch = (b?: string) => (b || "").toString().toLowerCase().trim();

/** The branch-wide profile for a branch ("Delhi", " delhi "), or undefined when the branch follows role timings. */
export function getBranchTimingProfile(policy: AttendancePolicy, branch?: string): TimingProfile | undefined {
  const wanted = normBranch(branch);
  if (!wanted) return undefined;
  const defaults = defaultBranchTimingProfiles();
  const key = (Object.keys(defaults) as Branch[]).find((b) => normBranch(b) === wanted);
  const storedKey = (Object.keys(policy.branchTimingProfiles || {}) as Branch[]).find((b) => normBranch(b) === wanted);
  if (!key && !storedKey) return undefined;
  const base = key ? defaults[key] : undefined;
  const stored = storedKey ? policy.branchTimingProfiles?.[storedKey] : undefined;
  return base || stored ? ({ ...base, ...stored } as TimingProfile) : undefined;
}

/** Every branch that has its own profile, with defaults filled in. */
export function getBranchTimingProfiles(policy: AttendancePolicy): TimingProfile[] {
  const branches = new Set<string>([
    ...Object.keys(defaultBranchTimingProfiles()),
    ...Object.keys(policy.branchTimingProfiles || {}),
  ]);
  return [...branches]
    .map((b) => getBranchTimingProfile(policy, b))
    .filter((p): p is TimingProfile => !!p);
}

/**
 * The timing an employee follows: their branch's own profile when it has one (Delhi),
 * otherwise the slot of their role.
 */
export function resolveTimingForEmployee(input: {
  branch?: string;
  roleId?: string;
  roles: CustomRole[];
  policy: AttendancePolicy;
}): TimingProfile {
  return getBranchTimingProfile(input.policy, input.branch) || resolveTimingProfile(input.roleId, input.roles, input.policy);
}

/** The timing profile of a role id (roles without a slot, or unknown roles, use Timing 2). */
export function resolveTimingProfile(roleId: string | undefined, roles: CustomRole[], policy: AttendancePolicy): TimingProfile {
  const wanted = (roleId || "employee").toString().toLowerCase().trim();
  const role = roles.find((r) => (r.id || "").toString().toLowerCase().trim() === wanted);
  const slot = slotOfRole(role);
  const profiles = getTimingProfiles(policy);
  return profiles.find((p) => p.id === slot) || profiles[profiles.length - 1];
}

/** "HH:mm" after which an arrival is late for this profile. */
export function lateAfterOf(profile: TimingProfile): string {
  return addMinutesToTime(profile.startTime, profile.graceMinutes);
}

export interface ArrivalDecision {
  status: Extract<AttendanceStatus, "Present" | "Late" | "Half Day">;
  /** True for Late and for a Half Day caused by lateness; this is what the weekly count is made of. */
  lateArrival: boolean;
  /** Human-readable explanation for a Late or Half Day, empty for Present. */
  reason: string;
}

export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th";
  return `${n}${suffix}`;
}

/**
 * Decides the status for a clock-in.
 * `punchTimeIST` is "HH:mm"; `priorLateCountThisWeek` counts this employee's earlier late arrivals
 * in the same Monday-Saturday week. "After" is strictly greater, so a punch exactly at the cutoff is on time.
 */
export function decideArrivalStatus(input: {
  punchTimeIST: string;
  profile: TimingProfile;
  priorLateCountThisWeek: number;
}): ArrivalDecision {
  const { punchTimeIST, profile, priorLateCountThisWeek } = input;
  const lateAfter = lateAfterOf(profile);
  if (!evaluateLateArrivalIST(punchTimeIST, profile.startTime, profile.graceMinutes)) {
    return { status: "Present", lateArrival: false, reason: "" };
  }

  const rules = profile.halfDayRules;
  if (!rules) {
    return { status: "Late", lateArrival: true, reason: `Arrived after ${lateAfter}` };
  }

  if (rules.hardCutoffTime && punchTimeIST > rules.hardCutoffTime) {
    return { status: "Half Day", lateArrival: true, reason: `Auto half day: arrived after ${rules.hardCutoffTime}` };
  }

  const nth = priorLateCountThisWeek + 1;
  if (priorLateCountThisWeek < rules.weeklyLateAllowance) {
    return { status: "Late", lateArrival: true, reason: `Late after ${lateAfter} (${ordinal(nth)} this week, ${rules.weeklyLateAllowance} allowed)` };
  }
  return {
    status: "Half Day",
    lateArrival: true,
    reason: `Auto half day: ${ordinal(nth)} late arrival after ${lateAfter} this week (${rules.weeklyLateAllowance} allowed)`,
  };
}


function validateProfileFields(p: Partial<TimingProfile>, name: string): string | null {
  if (!p.startTime || !HHMM.test(p.startTime)) return `${name}: start time must be HH:mm`;
  if (!Number.isInteger(p.graceMinutes) || (p.graceMinutes as number) < 0 || (p.graceMinutes as number) > 180) {
    return `${name}: grace minutes must be a whole number from 0 to 180`;
  }
  if (p.effectiveFrom !== undefined && p.effectiveFrom !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveFrom)) {
    return `${name}: effective from must be YYYY-MM-DD`;
  }
  if (p.halfDayRules) {
    const r = p.halfDayRules;
    if (!Number.isInteger(r.weeklyLateAllowance) || r.weeklyLateAllowance < 0 || r.weeklyLateAllowance > 6) {
      return `${name}: weekly late allowance must be a whole number from 0 to 6`;
    }
    if (r.hardCutoffTime !== undefined && r.hardCutoffTime !== "") {
      if (!HHMM.test(r.hardCutoffTime)) return `${name}: hard cutoff must be HH:mm`;
      if (r.hardCutoffTime < addMinutesToTime(p.startTime, p.graceMinutes as number)) {
        return `${name}: hard cutoff cannot be before the late time`;
      }
    }
  }
  return null;
}

/** Rejects malformed timing settings; returns an error message or null when valid. */
export function validateTimingProfiles(profiles: unknown): string | null {
  if (!Array.isArray(profiles)) return "timingProfiles must be an array";
  const seen = new Set<string>();
  for (const p of profiles as Partial<TimingProfile>[]) {
    if (!p || (p.id !== "timing1" && p.id !== "timing2")) return "Unknown timing slot";
    if (seen.has(p.id)) return "Duplicate timing slot";
    seen.add(p.id);
    const err = validateProfileFields(p, p.id);
    if (err) return err;
  }
  return null;
}

/** Rejects malformed branch timing settings ({ Delhi: {...} }); returns an error message or null when valid. */
export function validateBranchTimingProfiles(profiles: unknown): string | null {
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) return "branchTimingProfiles must be an object";
  for (const [branch, p] of Object.entries(profiles as Record<string, Partial<TimingProfile>>)) {
    if (!(BRANCH_NAMES as string[]).includes(branch)) return `Unknown branch: ${branch}`;
    if (!p || typeof p !== "object") return `${branch}: profile is required`;
    const err = validateProfileFields(p, `${branch} branch`);
    if (err) return err;
  }
  return null;
}

/** "Timing 1: late after 09:45 · Timing 2: late after 10:15 · Delhi branch: late after 10:05, half day after 10:20". */
export function timingSummary(policy: AttendancePolicy): string {
  return [...getTimingProfiles(policy), ...getBranchTimingProfiles(policy)]
    .map((p) => {
      const cutoff = p.halfDayRules?.hardCutoffTime;
      return `${p.label}: late after ${lateAfterOf(p)}${cutoff ? `, half day after ${cutoff}` : ""}`;
    })
    .join(" · ");
}
