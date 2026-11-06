import type { AttendancePolicy, AttendanceStatus, CustomRole, TimingProfile, TimingSlotId } from "@/lib/types";
import { addMinutesToTime, evaluateLateArrivalIST } from "@/lib/attendance/ist-time";

export const TIMING_SLOTS: TimingSlotId[] = ["timing1", "timing2"];
export const DEFAULT_TIMING_SLOT: TimingSlotId = "timing2";

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

/** Rejects malformed timing settings; returns an error message or null when valid. */
export function validateTimingProfiles(profiles: unknown): string | null {
  if (!Array.isArray(profiles)) return "timingProfiles must be an array";
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const seen = new Set<string>();
  for (const p of profiles as Partial<TimingProfile>[]) {
    if (!p || (p.id !== "timing1" && p.id !== "timing2")) return "Unknown timing slot";
    if (seen.has(p.id)) return "Duplicate timing slot";
    seen.add(p.id);
    if (!p.startTime || !hhmm.test(p.startTime)) return `${p.id}: start time must be HH:mm`;
    if (!Number.isInteger(p.graceMinutes) || (p.graceMinutes as number) < 0 || (p.graceMinutes as number) > 180) {
      return `${p.id}: grace minutes must be a whole number from 0 to 180`;
    }
    if (p.halfDayRules) {
      const r = p.halfDayRules;
      if (!Number.isInteger(r.weeklyLateAllowance) || r.weeklyLateAllowance < 0 || r.weeklyLateAllowance > 6) {
        return `${p.id}: weekly late allowance must be a whole number from 0 to 6`;
      }
      if (r.hardCutoffTime !== undefined && r.hardCutoffTime !== "") {
        if (!hhmm.test(r.hardCutoffTime)) return `${p.id}: hard cutoff must be HH:mm`;
        if (r.hardCutoffTime < addMinutesToTime(p.startTime, p.graceMinutes as number)) {
          return `${p.id}: hard cutoff cannot be before the late time`;
        }
      }
    }
  }
  return null;
}

/** "Timing 1: late after 09:45 · Timing 2: late after 10:15" for dashboards and reports. */
export function timingSummary(policy: AttendancePolicy): string {
  return getTimingProfiles(policy)
    .map((p) => `${p.label}: late after ${lateAfterOf(p)}`)
    .join(" · ");
}
