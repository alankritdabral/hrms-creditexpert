# Plan: Two timing profiles by role, with automatic half-day for Timing 1

**Status: implemented in the working tree (uncommitted). tsc 0 errors, eslint 0 errors, 105 tests pass. Not yet exercised in a browser.**

## Rules to implement

There are two timing profiles. HR picks which one each **role** uses, and every employee follows the profile of their role.

| | Timing 1 (early) | Timing 2 (standard) |
|---|---|---|
| Office start | 09:30 | 10:00 |
| Grace ends | 09:45 | 10:15 |
| Late | Arrival after 09:45 | Arrival after 10:15 |
| Automatic half day | **Yes** (rules below) | **No**, only a Late mark |

**Timing 1 half-day rules**
1. **Weekly strikes.** In each week, the first 2 arrivals after 09:45 are **Late**. From the 3rd one onward, every arrival after 09:45 that week is **Half Day** automatically.
2. **Hard cutoff.** An arrival after **10:00** is **Half Day** automatically, every time, with no counting. This is the "candidate reaches after 10am" rule. It covers everyone on Timing 1.

## Current state (verified in code)

- Clock-in is `punchAttendance` in `src/lib/db/db-adapter.ts` (~line 908). It uses one company-wide policy, `evaluateLateArrivalIST(nowTime, policy.officeStartTime, policy.gracePeriodMinutes)`, and sets status to only `"Late"` or `"Present"`. The default is 10:00 + 15 min grace, so this equals your Timing 2.
- `AttendancePolicy` (`src/lib/types.ts:373`) is a single record (`settings/attendance_policy`) with one start time and one grace period. There is no per-role or per-employee timing, no weekly counter, and no half-day rule. `halfDayMinHours` exists but is never used, because there is no clock-out.
- Roles are `CustomRole` records (`src/lib/types.ts:31`, stored in `custom_roles`, `getCustomRoles` at `db-adapter.ts:2074`). An employee's role lives on their login (`UserAccount.role`, matched by `employeeId`), not on the `Employee` record.
- `"Half Day"` already exists as an `AttendanceStatus`, and the sheet, dashboards and dropdowns already render it.
- `updateAttendanceRecord` (~line 795) sets `lateArrival = (status === "Late")`, so an HR edit to Half Day would clear the late flag.
- **Payroll does not deduct for Half Day.** `payroll-engine.ts:204` counts only `status === "Absent"` as loss of pay (LOP).

## Decisions (confirmed)

1. **Hard cutoff scope.** The 10:00 half-day rule applies to everyone on Timing 1.
2. **Which role gets which timing.** HR picks it per role in Settings. Any role can be on either slot.
3. **Half-day pay.** A Half Day deducts 0.5 day of pay. Payroll must show, at the end, how much the pay was affected by Half Days and by Absences.
4. **Weeks.** Monday to Saturday in IST, resetting every Monday.

**Defaults I'm assuming (shout if wrong)**
- Roles without a timing set (including new custom roles) use Timing 2, which is today's behavior.
- Only real clock-ins count towards the weekly late count. Leave, WFH and holiday days do not.
- The rule starts on the deploy date and old records are not recomputed. Payroll for months that already ran is not touched.
- Per-day pay is gross / 30, the same as the existing LOP calculation.

## Phase 1: Data model

- Add to the attendance policy (`src/lib/types.ts`, `seed-data.ts`):
  ```ts
  interface TimingProfile {
    id: "timing1" | "timing2";
    label: string;                 // "Timing 1 (9:30)"
    startTime: string;             // "09:30"
    graceMinutes: number;          // 15 -> late after 09:45
    halfDayRules?: {
      weeklyLateAllowance: number; // 2 -> 3rd late in a week becomes Half Day
      hardCutoffTime?: string;     // "10:00" -> after this is always Half Day
    };                             // absent => no automatic half day
  }
  ```
  `AttendancePolicy.timingProfiles: TimingProfile[]` holds the two profiles. `INITIAL_POLICY` gets Timing 1 = 09:30 / 09:45 / allowance 2 / hard cutoff 10:00, and Timing 2 = 10:00 / 10:15 / no half-day rules. `getPolicy` already merges stored policy over defaults, so existing Firestore data needs no migration.
- Add `timingProfileId?: string` to `CustomRole`, including the built-in roles. A missing value falls back to Timing 2.
- Keep the old `officeStartTime` and `gracePeriodMinutes` as the Timing 2 values so existing screens that read them (admin dashboard, attendance page, reports) keep working until updated in Phase 5.
- Validate `PUT /api/policy` and the role save route: "HH:mm" format, `lateAfter >= startTime`, `hardCutoffTime >= lateAfter`, allowance of 0 or more, and `timingProfileId` must exist.

## Phase 2: Pure decision function (testable core)

- New `src/lib/attendance/late-policy.ts`:
  `decideArrivalStatus({ punchTimeIST, profile, priorLateCountThisWeek }) → { status, lateArrival, reason }`
  - Punch at or before `lateAfter`: `Present`.
  - Punch after `lateAfter`, profile has no `halfDayRules`: `Late`.
  - Punch after `hardCutoffTime`: `Half Day` ("Arrived after 10:00").
  - Otherwise, if `priorLateCountThisWeek < weeklyLateAllowance`: `Late`, else `Half Day` ("3rd late arrival this week").
  - "After" means strictly greater, so a punch at exactly 09:45 is on time. This matches `evaluateLateArrivalIST`.
- Add `weekBoundsIST(date)` to `ist-time.ts`, returning Monday and Saturday as "YYYY-MM-DD" via the existing `addDaysIST`.
- Add `resolveTimingProfile(roleId, roles, policy)`, which falls back to Timing 2.

## Phase 3: Wire into clock-in

- In `punchAttendance`:
  - Look up the **target employee's** role from their `UserAccount` by `employeeId`. Do not use `actor.role`, because HR can clock in on someone else's behalf. Then find the role in `getCustomRoles()` and resolve the profile.
  - If the profile has half-day rules, fetch this week's records with `getAttendanceRecords({ employeeId, from: weekStart, to: today })` (already range-scoped, no full-collection read) and count prior records with `lateArrival === true`.
  - Call `decideArrivalStatus`. Write `status`, `lateArrival` and `remarks` (append the reason), and include the reason in the audit log.
- Both `Late` and auto-`Half Day` records keep `lateArrival = true`, so the weekly counter is fact-based.
- `updateAttendanceRecord` and `upsertAttendanceRecord`: stop forcing `lateArrival = (status === "Late")`. HR changing a status to Present clears `lateArrival`, which excuses that strike. HR changing to Late or Half Day sets it to true.
- The existing single-punch-per-day check runs first, so the weekly count can't be double-incremented by a repeat punch.

## Phase 4: Payroll, deduct half days and show the impact

- In `calculateEmployeePayrollSnapshot` (`src/lib/payroll-engine.ts:204`), keep per-day pay as `round(gross / 30)` and compute:
  - `absentDays` = records with status `Absent`; `absentAmount = absentDays × perDay`.
  - `halfDayCount` = records with status `Half Day`; `halfDayAmount = round(halfDayCount × 0.5 × perDay)`.
  - `lopDays = absentDays + 0.5 × halfDayCount` and `lopAmount = absentAmount + halfDayAmount`. These keep their old meaning ("total attendance-related loss"), so `totalDeductions`, `netSalary` and existing screens still add up.
- Add `absentDays`, `absentAmount`, `halfDayCount`, `halfDayAmount` to `PayrollItemSnapshot` (`src/lib/types.ts`, near line 519). They are optional in the type so old, already-saved payroll runs still load, and the UI falls back to `lopDays` and `lopAmount` when they are missing.
- Show the breakdown wherever LOP is shown today:
  - **Payslip** (`src/app/payslips/page.tsx`, ~line 228 and 298): two lines, "Absent (n days) −₹x" and "Half day (n × 0.5 day) −₹y", then a closing line "Total pay affected by attendance −₹(x+y)".
  - **Payroll run detail** (`src/app/payroll/page.tsx`, ~line 342 and 367): split the LOP column into Absent and Half Day, and add a run-level total at the end.
  - **Reports CSV** (`src/app/reports/page.tsx`, ~line 111): add `AbsentAmount`, `HalfDayAmount` columns.
- Only runs created after the deploy use the new calculation. A draft run recalculated after the deploy will include half days, which is intended.
- Tests (`payroll-engine.test.ts`): 2 Absent + 3 Half Day gives lopDays 3.5 and the correct split. Zero half days gives the same result as today. Net pay never goes below 0. Rounding of an odd gross (the half-day amount is rounded once, not per record).

## Phase 5: UI

- **Settings → Roles** (`src/app/settings/page.tsx`): add a "Timing" dropdown (Timing 1 / Timing 2) on each role, so HR picks the timing per role.
- **Settings → Attendance policy** (around line 1160): replace the single start/grace inputs with the two profile cards (start, grace-ends, and for Timing 1 the weekly allowance and hard cutoff). Update the helper text.
- **Attendance page** (`src/app/attendance/page.tsx`): show the employee's own profile, a "Late arrivals this week: n of 2" counter for Timing 1, and the reason on Half Day records. Replace the "Half Day Threshold" line.
- `lateCutoffLabel` in `ist-time.ts`, the admin dashboard "late today" tile and the reports page read the old single policy. Move them to the per-employee profile.
- The sheet and legend need no change, because `HD` already exists and `buildCell` already shows `remarks` in the tooltip.

## Phase 6: Tests

- `late-policy.test.ts`:
  - Timing 1: 09:45 is Present, and 09:46 is Late for the 1st and 2nd time and Half Day for the 3rd.
  - Timing 1: 10:00 is Late and 10:01 is Half Day regardless of count.
  - Timing 2: 10:15 is Present and 10:16 is Late, never Half Day.
  - Allowance 0, and a profile with no half-day rules.
  - Fallback to Timing 2 for roles without a profile.
- `ist-time.test.ts`: `weekBoundsIST` across month and year boundaries and on a Sunday.
- Integration test on `punchAttendance` using the in-memory store: three late punches on consecutive days give Late, Late, Half Day. An HR clock-in on behalf uses the employee's role, not HR's.
- Gate: `tsc` 0 errors, eslint 0 errors, and the existing 77 tests still pass.

## Phase 7: Rollout

- No data migration is needed, because defaults come from `INITIAL_POLICY` and a missing `timingProfileId` means Timing 2.
- Before the deploy, set each role's timing in Settings. Until then everyone behaves as today (Timing 2).
- Announce the effective date to Timing 1 staff.
- After the deploy, check the first week's `ATTENDANCE_CLOCK_IN` audit entries (they now include the reason) for unexpected Half Days.
- HR's attendance edit remains the escape hatch for disputes.

## Risks

- **Payroll impact** (Phase 4) changes real take-home pay. Ship it together with Phases 1 to 3 so a Half Day is never a label with no pay effect (or the reverse). Check a sample payslip by hand before the first live run.
- **Role to timing is per role, not per person.** If one person in a role needs a different timing, that needs a per-employee override. It is out of scope here and noted for later.
- **Timezone.** Every comparison must use the IST helpers, because Vercel runs in UTC.
- Production writes still need the `FIREBASE_ADMIN_*` credentials noted in the other plan.

## Files touched

`src/lib/types.ts`, `src/lib/db/seed-data.ts`, `src/lib/db/db-adapter.ts`, `src/lib/attendance/ist-time.ts`, new `src/lib/attendance/late-policy.ts` (+ tests), `src/app/api/policy/route.ts`, the role save route, `src/app/settings/page.tsx`, `src/app/attendance/page.tsx`, `src/components/dashboard/AdminDashboard.tsx`, `src/app/reports/page.tsx`, `src/lib/payroll-engine.ts` (+ test).
