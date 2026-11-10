# Plan: Delhi branch timing (09:50 start, late after 10:05, half day after 10:20)

**Status: plan only, nothing implemented.** Builds on [late-arrival-half-day-plan.md](late-arrival-half-day-plan.md), which is already in the working tree.

## Rules to implement

Applies to **everyone whose branch is Delhi**, whatever their role. Dehradun and Rudrapur keep the current role-based Timing 1 / Timing 2.

| Punch time (IST) | Result for Delhi |
|---|---|
| up to 10:05 | Present (office starts 09:50, 15 min grace) |
| 10:06 to 10:20 | **Late**, counts as a strike |
| after 10:20 | **Half Day**, always, no counting |
| 3rd and later late in a week (after 10:05) | **Half Day** (2 lates per Monday to Saturday week are allowed) |

"After" is strictly greater, as today, and the comparison is on HH:mm. A punch at 10:05:59 is 10:05, so on time. A punch at 10:20:59 is 10:20, so Late.

Reminder email: sent at **10:00 IST** (five minutes before the late line) to Delhi staff who have not marked attendance, Monday to Saturday.

## Current state (verified in code)

- Timing is per **role**, not per branch. `resolveTimingProfile(roleId, roles, policy)` in [late-policy.ts](../src/lib/attendance/late-policy.ts) picks Timing 1 (09:30, late after 09:45, 2 per week, hard cutoff 10:00) or Timing 2 (10:00, late after 10:15, no half day).
- `getEmployeeTiming` in [db-adapter.ts](../src/lib/db/db-adapter.ts) (~line 1203) resolves the profile from the user's account role only, then counts `lateArrival` records earlier this week. `punchAttendance` calls it and then `decideArrivalStatus`.
- `decideArrivalStatus` already does exactly the Delhi logic (late line, hard cutoff, weekly allowance) once it is given a profile with start 09:50, grace 15, allowance 2, cutoff 10:20. No change to the decision function itself.
- The reminder cron ([attendance-reminder/route.ts](../src/app/api/cron/attendance-reminder/route.ts)) is `15 4 * * 1-6` (09:45 IST) in [vercel.json](../vercel.json) and mails only Timing 1 roles. The email wording is built in [email.ts](../src/lib/email.ts) (`ruleReminderHtml`) and pinned by [email-reminder.test.ts](../src/lib/email-reminder.test.ts).
- The employee's branch lives on `Employee.employment.branch` (used by `punchAttendance` for the office lookup) and on `UserAccount.branch` (used by the cron).
- The settings screen, admin dashboard, reports and attendance page all read `getTimingProfiles` or `timingSummary`, so they need to learn about a branch profile.

## Decisions (confirmed)

1. Delhi times: start 09:50, late after 10:05, half day after 10:20.
2. Specific to the Delhi branch only.
3. Keep the weekly rule: 2 lates per week, the 3rd becomes a Half Day.
4. Reminder email at 10:00 IST.

**Assumptions (shout if wrong)**
- The Delhi profile **overrides the role timing** for all Delhi staff, including roles currently on Timing 2.
- A Delhi person's branch is taken from their employee record, falling back to their login's branch.
- Other branches and the late-count for them are unchanged.
- Half Day pay (0.5 day) is already handled by payroll, so no payroll change.
- The rule starts on an effective date; earlier records are not recomputed.

## Phase 1: Data model

- [types.ts](../src/lib/types.ts): add `branchTimingProfiles?: Partial<Record<Branch, TimingProfile>>` to `AttendancePolicy`. Widen `TimingProfile.id` to `TimingSlotId | "branch-delhi"` (or add an optional `branch` field and keep the id type; pick whichever keeps `validateTimingProfiles` simplest).
- Add optional `effectiveFrom?: string` ("YYYY-MM-DD") to the branch profile. Records before this date are ignored when counting weekly strikes, so lates judged under the old 10:15 rule do not count against the new one in the deploy week.
- [seed-data.ts](../src/lib/db/seed-data.ts) / default policy: Delhi = `{ startTime: "09:50", graceMinutes: 15, halfDayRules: { weeklyLateAllowance: 2, hardCutoffTime: "10:20" } }`. `getPolicy` already merges stored over defaults, so no data migration.
- Validation: extend `validateTimingProfiles` (and `PUT /api/policy`) to validate each branch profile with the same checks (HH:mm, hard cutoff not before the late time, allowance 0 to 6), and reject unknown branches.

## Phase 2: Resolve by branch first, then role

- [late-policy.ts](../src/lib/attendance/late-policy.ts): new `resolveTimingForEmployee({ branch, roleId, roles, policy })`: if `policy.branchTimingProfiles[branch]` exists, return it; otherwise call `resolveTimingProfile` (role slot). Keep `resolveTimingProfile` as is for callers that only have a role.
- `getEmployeeTiming` (db-adapter): load the employee's branch (`getEmployeeById`, fall back to `account.branch`), call the new resolver, and when the profile has `effectiveFrom` count only `r.date >= effectiveFrom`.
- `punchAttendance` and `GET /api/policy` (`myTiming`) both go through `getEmployeeTiming`, so they pick up the change without further edits.

## Phase 3: Reminder cron and email

- [vercel.json](../vercel.json): two entries on the same path, one per audience, so each group is mailed at the right moment:
  - `/api/cron/attendance-reminder?scope=delhi` at `30 4 * * 1-6` (10:00 IST).
  - `/api/cron/attendance-reminder?scope=other` at `15 4 * * 1-6` (09:45 IST), the current behavior for non-Delhi Timing 1 roles.
- Route: read `scope`. `delhi` targets active accounts whose resolved profile is the Delhi branch profile; `other` targets the current Timing 1 group but **excludes Delhi** (otherwise Delhi would be mailed at 09:45 as well). No `scope` falls back to `other`, so an old cron config keeps working. Keep the existing skips (Sunday, approved leave, holiday for the branch or All, already marked).
- Pass the Delhi rule into `sendAttendanceReminderEmail`: `lateAfter 10:05`, allowance 2, hard cutoff `10:20`. Add `startTime` to `AttendanceRuleReminder` so the first line can read "Office starts 9:50 AM; clock in by 10:05 AM, arrivals after 10:05 are Late."
- Update [email-reminder.test.ts](../src/lib/email-reminder.test.ts) for the new wording and add a Delhi case (4 lines: start/late, 2 per week then Half Day, after 10:20 always Half Day, Half Day deducts half a day).
- The daily login report cron (`30 14 * * 1-6`) is unrelated and stays.

## Phase 4: UI

- [settings/page.tsx](../src/app/settings/page.tsx), Attendance policy: add a "Delhi branch timing" card next to Timing 1 / Timing 2 with start, grace (shows late-after), weekly allowance and hard cutoff. Note on the Roles tab that Delhi staff follow the branch timing regardless of role.
- `timingSummary` (used by [AdminDashboard.tsx](../src/components/dashboard/AdminDashboard.tsx) and [reports/page.tsx](../src/app/reports/page.tsx)): append "Delhi: late after 10:05, half day after 10:20".
- [attendance/page.tsx](../src/app/attendance/page.tsx): the employee's own timing and "late arrivals this week: n of 2" come from `myTiming`, so they show the Delhi rule automatically; check the label text.

## Phase 5: Tests

- `late-policy.test.ts`: with the Delhi profile, 10:05 is Present, 10:06 and 10:20 are Late (1st and 2nd), 10:21 is Half Day regardless of count, 3rd late at 10:10 is Half Day. A Delhi employee whose role is Timing 2 still gets the Delhi rule. A Dehradun employee still gets the role timing.
- `punch-late-policy.test.ts` (db level): Delhi employee, three late punches on consecutive days give Late, Late, Half Day; `effectiveFrom` ignores older late records; an HR clock-in on someone's behalf uses the target's branch.
- Cron route test (or extracted target-selection function): `scope=delhi` returns only Delhi, `scope=other` returns Timing 1 non-Delhi, no one is mailed twice.
- Gate: `tsc` 0 errors, eslint 0 errors, full vitest green.

## Phase 6: Rollout

1. Deploy on a **Monday morning** with `effectiveFrom` set to that Monday, so no old-rule lates count as strikes.
2. Tell Delhi staff the new times and the reminder time.
3. After the first week, check `ATTENDANCE_CLOCK_IN` audit entries for Delhi Half Days.
4. HR's attendance edit remains the escape hatch.

## Risks

- **Vercel plan precision.** Minute-level cron needs the Pro plan; on Hobby a cron can fire anywhere within the hour. The existing 09:45 job already assumes minute precision.
- **Branch data quality.** Anyone whose employee record has the wrong or missing branch gets the wrong timing. Before rollout, list Delhi accounts and check each has `branch = "Delhi"`.
- **Role timing no longer matters in Delhi.** A Delhi role set to Timing 1 loses its 09:30 / 10:00 rules. Confirm that is intended.
- **Timezone.** Keep every comparison on the IST helpers; Vercel runs in UTC (10:00 IST is `30 4` UTC).
- Production writes still need the `FIREBASE_ADMIN_*` credentials noted in the other plan.

## Files touched

`src/lib/types.ts`, `src/lib/db/seed-data.ts`, `src/lib/attendance/late-policy.ts` (+ test), `src/lib/db/db-adapter.ts` (+ `punch-late-policy.test.ts`), `src/app/api/policy/route.ts`, `src/app/api/cron/attendance-reminder/route.ts`, `src/lib/email.ts` (+ test), `vercel.json`, `src/app/settings/page.tsx`, `src/components/dashboard/AdminDashboard.tsx`, `src/app/reports/page.tsx`, `src/app/attendance/page.tsx`.
