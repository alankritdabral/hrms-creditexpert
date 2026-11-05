# HRMS Code Improvement Plan

Created 2026-11-05 from a full read of the codebase at commit `74adc15`.
Run one phase per fresh chat. Before each phase, read **Ground rules**, **Phase 0**, and that phase.
Per `AGENTS.md`: before writing Next.js code, read the relevant guide under `node_modules/next/dist/docs/`.

## Primary goal

HR staff and employees can trust the HRMS:
- PAN, Aadhaar, bank and salary details are visible only to the people entitled to see them.
- Every change someone saves is still there on the next page load, whichever server instance answers.
- Every pay, incentive and attendance figure on screen comes from real records, not from defaults, stale caches or the wrong calendar day.

## Ground rules (every phase)

- **Baselines (2026-11-05):**
  - `npx tsc --noEmit` reports 0 errors.
  - `npx eslint src` reports 0 errors and 310 warnings.
  - No phase may introduce errors, and the warning count must not go up.
- **Production is off-limits without explicit approval.** Never touch production Firestore, Vercel settings or Firebase rules unless the user approves that action in the same session. This covers:
  - deploying rules;
  - running data scripts;
  - changing environment variables.
- **Firestore is the source of truth.** The in-memory `MemoryStore` (`src/lib/db/db-adapter.ts:84-119`) is a local-development fallback only.
- **Keep secrets out of output.** Never print `.env.local` values, service-account keys or personal data (PAN, Aadhaar, bank numbers, phone numbers) in logs, tests or chat.
- **Stay in scope.** Only change what the phase lists. Anything else you notice goes into the Progress log for later.
- **Use a separate Firebase project for local and preview testing** (recommended; see Phase 2, P4). Until one exists, local runs that have Admin credentials read and write production data.

## Decisions recorded (confirm D2 and D4 with HR before the phases that use them ship)

- **D1. Custom roles get self-service access only.**
  - Applies to "Backend Team", `branch_manager`, `team_lead` and any role created in Settings.
  - They get the employee's API permissions and see only their own records.
  - Today they skip every `role === "employee"` filter, so they can read everyone's PAN, Aadhaar, bank details and salary.
  - Per-role manager access is deferred.
- **D2. Incentive-only staff (₹0 salary) have a ₹0 hurdle.**
  - The ₹15,000 fallback salary applies only when no employee record matches the login row.
- **D3. Firestore rules deny every browser read and write for HRMS collections.**
  - `credit_reports`, `access_codes` and `access_code_creditexpert` keep their current rules.
  - Those three are not referenced anywhere in `src`; the separate dashboard app reads them from the browser.
- **D4. Activating an employee requires an explicit CTC.**
  - The silent ₹4,80,000 default is removed.

---

## Phase 0 — Documentation discovery (done 2026-11-05)

**How this serves the primary goal:** The fixes below depend on exact framework and SDK behaviour, such as transactions, `create()`, write-after-response and rules semantics. Pinning down what really exists keeps the fixes from quietly failing and leaving data unsafe or unsaved.

### A. Next.js 16.4.2 (source: `node_modules/next/dist/docs/`, written `D/` below)

- **A1. `after(callback)`**
  - Import with `import { after } from "next/server"` (`D/01-app/03-api-reference/04-functions/after.md` L13).
  - It can be called in Route Handlers, Server Functions, Server Components and Proxy (L8).
  - The callback runs after the response is sent, even if the handler threw (L54).
  - On Vercel it is backed by `waitUntil`, which keeps the serverless invocation alive until the callback settles (L247-252).
  - It is limited by the route's `maxDuration` (L48-50).
  - In Route Handlers the callback may call `cookies()` and `headers()` (L64-66).
  - What happens when it is called outside a request (scripts, for example) is not documented, so guard it with a try/catch fallback.
  - Example to copy: L68-91.
- **A2. `proxy` (the replacement for `middleware.ts`)**
  - `middleware.ts` is deprecated in Next 16 (`D/01-app/03-api-reference/03-file-conventions/middleware.md` L11-13).
  - A proxy would live at `src/proxy.ts` (`src-folder.md` L33) and export `proxy(request: NextRequest)` (`proxy.md` L32, L58).
  - It runs on the Node.js runtime only (`proxy.md` L255).
  - The docs call it an optimistic check, "not a full session management or authorization solution" (`D/01-app/01-getting-started/16-proxy.md` L29).
  - **This plan does not add a proxy.** The per-route `authenticateRequest` calls plus Phase 1's static test remain the control.
- **A3. Route Handlers**
  - Signature: `{ params }: { params: Promise<...> }`, then `await params` (`route.md` L84-91).
  - `cookies()` and `headers()` can only be used asynchronously in Next 16 (`02-guides/upgrading/version-16.md` L261-263).
  - Setting and deleting cookies on a `NextResponse`: `next-response.md` L10-74.
  - With `cacheComponents: true`, exporting `dynamic`, `revalidate`, `fetchCache`, `dynamicParams` or `runtime` (even `"nodejs"`) is an error (`02-route-segment-config/index.md` L25, `runtime.md` L24). `maxDuration` is still allowed (`maxDuration.md` L6-14).
  - A GET handler that reads no request data and does no uncached I/O can be prerendered at build time (`D/01-app/01-getting-started/15-route-handlers.md` L89-99, L124). Reading headers or cookies, as `authenticateRequest` does, keeps the handler running per request.
  - The prerender bail-out is a thrown signal that a surrounding `try/catch` can intercept (`02-guides/migrating-to-cache-components.md` L883). After a change, confirm with `npm run build` that every API route shows as dynamic (ƒ).
- **A4. `server-only`**
  - `import "server-only"` makes importing that module from client code a build error (`D/01-app/01-getting-started/05-server-and-client-components.md` L562-580).
  - Installing the npm package is optional; Next handles the import itself (L584, L602).
  - The Jest guide maps `server-only` to an empty mock (`02-guides/testing/jest.md` L171-172). Phase 1 does the same in Vitest with an alias.
- **A5. Security headers (deferred work)**
  - `next.config` `headers()`: `05-config/01-next-config-js/headers.md` L12-43; header values at L523-580.
  - A nonce-based CSP is incompatible with the static shell that Cache Components produce (`02-guides/content-security-policy.md` L397). Only a static CSP set in `headers()` fits (L417-452).
- **A6. Do not use `unauthorized()` or `forbidden()`.** They need `experimental.authInterrupts`, which is marked experimental/canary (`authInterrupts.md` L4).

### B. Firebase Admin SDK 14.5.0 / @google-cloud/firestore 9.3.1 / Cloudinary 2.11.0

`FS` = `node_modules/@google-cloud/firestore/types/firestore.d.ts`

- **B1. `Firestore.runTransaction(fn, { maxAttempts? })` (FS L691-730)**
  - All reads must come before any write; this is enforced at runtime (`build/src/transaction.js` L38).
  - Contention causes up to 5 retries, and `fn` reruns on each attempt.
  - ALREADY_EXISTS errors are not retried (`transaction.js` L651-675).
  - Transactions abort after 270 s.
- **B2. `Transaction` methods (FS L821-971)**
  - `get(DocumentReference | Query)` locks what it reads.
  - Write methods: `create(ref, data)`, `set(ref, data[, options])`, `update(ref, data)`, `delete(ref)`.
  - `create` "will fail the transaction if a document exists".
- **B3. `DocumentReference.create(data)` (FS L1482-1490)**
  - The write "fails if the document already exists".
  - The expected rejection is `err.code === 6`, i.e. `GrpcStatus.ALREADY_EXISTS` (FS L3188, exported from `firebase-admin/firestore`). This is inferred from the precondition the SDK sends; it is not documented, so treat any `create` failure as "ID taken".
- **B4. `DocumentReference.set(data)` with no options replaces the whole document (FS L1492-1513; `SetOptions` L1385-1406)**
  - With `{ merge: true }`, fields left out of `data` remain unchanged.
- **B5. Ordering and limits**
  - `Query.orderBy(field, "asc" | "desc")` (FS L1777-1780) and `Query.limit(n)` (FS L1791).
  - Order is not documented for a query that only calls `.limit()`. Always add an explicit `orderBy` when order matters.
- **B6. Field values and imports**
  - `FieldValue.delete()`, `FieldValue.increment(n)` and `FieldValue.serverTimestamp()` are at FS L2884-2909.
  - Import them with `import { FieldValue, FieldPath, GrpcStatus, getFirestore } from "firebase-admin/firestore"` (`node_modules/firebase-admin/lib/firestore/index.d.ts` L25).
- **B7. Batch size**
  - The Admin SDK documents no per-batch limit. The client SDK documents 500 (`@firebase/firestore/dist/index.d.ts` L4415).
  - Keep the existing 400-operation chunks.
- **B8. App initialisation and runtime**
  - `initializeApp` with a credential is not idempotent (`firebase-admin/lib/app/lifecycle.d.ts` L37-54). Keep the `getApps()` guard in `src/lib/firebase-admin.ts:21-23`.
  - `cert({ projectId, clientEmail, privateKey })` is at `credential-factory.d.ts` L68-89.
  - The SDK does not turn literal `\n` into newlines. Keep `src/lib/firebase-admin.ts:25-27`.
  - firebase-admin 14 requires Node ≥ 22 (README L62). The local machine has Node 24.22.2; confirm the Vercel project also uses Node 22 or newer.
- **B9. Deploying rules**
  - `firebase-tools` is not installed.
  - Rules can be deployed with `npx firebase-tools deploy --only firestore:rules`, or with the Admin SDK: `getSecurityRules().releaseFirestoreRulesetFromSource(source)` (`firebase-admin/lib/security-rules/security-rules.d.ts` L86-191).
- **B10. Cloudinary (used only by the deferred private-KYC work)**
  - `cloudinary.url()` signatures never expire.
  - Time-limited links come from `cloudinary.utils.private_download_url(publicId, format, { resource_type, type, expires_at })` (`cloudinary/types/index.d.ts` L971-976) or from `auth_token`, which needs a token key.

### C. Codebase facts (verified 2026-11-05 by grep and a handler scan)

- **C1. 17 route handlers never call `authenticateRequest(`.**
  - Public by design (9): `auth/login` POST, `auth/logout` POST, `auth/forgot-password/{send-otp,verify-otp,reset}` POST, `auth/register/{send-otp,verify-otp,submit}` POST, and `cron/attendance-reminder` GET (protected by `CRON_SECRET`).
  - Gaps (8):
    - `announcements` GET (`src/app/api/announcements/route.ts:5`)
    - `holidays` GET (`holidays/route.ts:6`)
    - `policy` GET (`policy/route.ts:5`)
    - `upload` POST (`upload/route.ts:10`)
    - `auth/register/draft` GET, POST and DELETE (`draft/route.ts:8,30,52`)
    - `src/app/uploads/[...path]/route.ts:16` GET
  - The scan used (copy it into Phase 1's test). For the test, extend the regex to also catch `export function` and `export const GET =` forms:

    ```js
    const fs = require("fs"), path = require("path");
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "route.ts" ? [path.join(d, e.name)] : []);
    for (const f of [...walk("src/app/api"), ...walk("src/app/uploads")]) {
      const src = fs.readFileSync(f, "utf8");
      const re = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g; let m; const hs = [];
      while ((m = re.exec(src))) hs.push({ name: m[1], idx: m.index });
      hs.forEach((h, i) => {
        const body = src.slice(h.idx, i + 1 < hs.length ? hs[i + 1].idx : src.length);
        if (!/authenticateRequest\(/.test(body)) console.log(`${f} ${h.name}`);
      });
    }
    ```
- **C2. 22 role-string checks bypass the permission system.**
  - Search: `grep -rn 'role === "employee"\|role !== "employee"' src/app/api src/lib/api-auth.ts`
  - Sites:
    - `api-auth.ts:272`
    - `onboarding/[id]/route.ts:32`
    - `payroll/route.ts:20,29`
    - `attendance/route.ts:34,47,98,111`
    - `attendance/sheet/route.ts:28`
    - `incentives/route.ts:22`
    - `employees/route.ts:26`
    - `leaves/route.ts:23,60,61`
    - `assets/route.ts:13`
    - `requests/route.ts:18,42,43`
    - `onboarding/route.ts:20`
    - `logins/route.ts:17`
    - `documents/route.ts:28,76`
    - `cron/attendance-reminder/route.ts:53` (this one selects email recipients and can stay)
- **C3. Writes are mostly fire-and-forget.**
  - `src/lib/db/db-adapter.ts` has 39 unawaited `...ToFirestore(...).catch(() => {})` writes.
  - The 63 call sites of `saveDocumentToFirestore` were reviewed. Every one passes a complete document, so nothing relies on `merge: true`.
  - `saveDocumentToFirestore` returns `false` on failure, and every caller ignores that result.
- **C4. 21 date-only values are derived in UTC** (`toISOString().split("T")[0]` or `.slice(0, 7)`). They are wrong between 00:00 and 05:30 IST.
  - `api/incentives/route.ts:46,81`
  - `components/dashboard/TeamProgress.tsx:46`
  - `app/onboarding/page.tsx:67,260`
  - `api/auth/register/submit/route.ts:192`
  - `api/notifications/route.ts:42`
  - `api/employees/route.ts:154`
  - `api/logins/route.ts:13`
  - `app/documents/page.tsx:80`
  - `app/holidays/page.tsx:69`
  - `app/logins/page.tsx:71,72,95,208`
  - `api/announcements/route.ts:33`
  - `db-adapter.ts:720,1574,1575,1649`
  - `api/assets/route.ts:43`
  - `app/reports/page.tsx:90` (a file name; can stay)
- **C5. Hard-coded dates.**
  - `app/incentives/page.tsx:38`, `app/payroll/page.tsx:34`, `app/logins/page.tsx:45` and `app/payslips/page.tsx:16` all hard-code `"2026-10"`.
  - `app/documents/page.tsx:106` uses `new Date("2026-10-17")`.
  - `components/employees/AddEmployeeModal.tsx:37` hard-codes `"2026-10-17"`.
- **C6. The session ID is kept in `localStorage`.**
  - `src/lib/auth-context.tsx:61,95,104,132,147,159,173,270,292`.
  - No component reads `useAuth().session`.
- **C7. Session IDs and OTPs use `Math.random`.**
  - Session IDs: `db-adapter.ts:2500`.
  - OTPs: `src/lib/email.ts:55`.
- **C8. Dead code.**
  - `updateEmployee` (`db-adapter.ts:366-396`) and `getUsers` (`1967-1969`) have no callers.
- **C9. Environment.**
  - `.env.local` has no `FIREBASE_ADMIN_*` variables (names checked; values not read).
  - `.firebaserc` sets the default project to `irregularhours-5f56e`.
  - Node is v24.22.2.
  - No test runner and no `firebase-tools` are installed.
- **C10. Lint baseline: 310 warnings.**
  - 152 `no-explicit-any`
  - 112 `no-unused-vars`
  - 20 `set-state-in-effect`
  - 10 `exhaustive-deps`
  - 9 `no-img-element`
  - 6 `no-location-assign-relative-destination`
  - 1 `no-unused-expressions`

### Global anti-patterns (apply to every phase)

- Do not invent Next.js, Firestore or Cloudinary APIs or options. If it is not in Phase 0 or in the installed package types, look it up before using it.
- Do not hide failed writes with `.catch(() => {})`.
- Do not use role-name checks (`role === "employee"`) for authorisation; use permissions.
- Do not derive a calendar date or month from `toISOString()`; use the IST helpers in `src/lib/attendance/ist-time.ts`.
- Do not write Firestore rules that use `request.auth`. This app does not use Firebase Auth, so `request.auth` means nothing here.
- Do not import `db-adapter`, `firestore-service` or other server-only modules in unit tests. Test pure modules only.
- Do not export `dynamic`, `revalidate`, `fetchCache`, `dynamicParams` or `runtime` from any route or page; with Cache Components they are build errors (A3). `maxDuration` is fine.
- Always `await` `cookies()`, `headers()` and route `params` (A3).

---

## Phase 1 — Safety net: tests and checks before changing behaviour

**How this serves the primary goal:**
- Later phases rewrite how pay, incentives and attendance are stored and who can see them.
- Tests on the pure calculators prove the money and date figures do not change by accident.
- A static check catches any API route that forgets to authenticate.

**Read first:**
- `src/lib/payroll-engine.ts`
- `src/lib/incentive-calculator.ts`
- `src/lib/attendance/ist-time.ts`
- `src/lib/attendance/sheet.ts`
- `src/lib/permissions.ts`

**What to implement**

1. **Set up Vitest.**
   - Run `npm i -D vitest`.
   - After installing, read the installed config types for `defineConfig` (`node_modules/vitest/config.d.ts` or the README) before writing `vitest.config.ts`.
   - Configure:
     - `test.environment = "node"`;
     - `include: ["src/**/*.test.ts", "tests/**/*.test.ts"]`;
     - alias `@` → `./src`;
     - alias `server-only` → an empty stub file at `tests/stubs/empty.ts`, the same approach as the Jest guide (A4).
   - Add the `"test": "vitest run"` script to `package.json`.
2. **Unit tests for pure modules** (no Firestore):
   - `payroll-engine.test.ts`:
     - `calculateSalaryBreakdown`: 12% default, fixed PF, PF excluded.
     - `calculateSalaryFromMonthly`: each `salaryBasis`, including `incentive_only`.
     - `calculateEmployeePayrollSnapshot`: LOP is counted only from `status: "Absent"`; incentives are added.
     - `numberToIndianCurrencyWords`: 0, 1,00,000 and 12,34,567.
   - `incentive-calculator.test.ts`:
     - Axis disbursal only.
     - Below the hurdle.
     - Each slab edge: 15L, 26L, 26L+1, 36L, 56L+1.
     - `monthlySalary: 0` gives a 0 hurdle.
   - `ist-time.test.ts`:
     - `getISTDateString(new Date("2026-11-04T19:00:00Z"))` returns `"2026-11-05"`.
     - `evaluateLateArrivalIST`: 10:15 is not late; 10:16 is late.
   - `sheet.test.ts`:
     - `buildCell` precedence: record, then future, then before joining, then holiday, then Sunday, then leave, then absent.
     - `totalsOf` percentage.
   - `permissions.test.ts`: assert the current behaviour (admin and HR have everything; employee list; a custom role has `[]`). Phase 3 changes the custom-role expectation.
3. **Static route-auth test `tests/route-auth.test.ts`.**
   - Walk `src/app/api/**/route.ts` and `src/app/uploads/**/route.ts`, splitting each file per exported handler (as in C1).
   - Each handler must contain `authenticateRequest(` unless it is in one of two lists:
     - `PUBLIC_BY_DESIGN`: the 9 handlers in C1.
     - `KNOWN_GAPS`: the 8 gap handlers in C1.
   - Also assert that every `KNOWN_GAPS` entry still lacks auth, so the list can only shrink. Phase 3 empties it.
4. **Record the results** in the Progress log at the end of this file.

**Verification checklist**
- [ ] `npm test` passes.
- [ ] `npx tsc --noEmit` reports 0 errors.
- [ ] `npx eslint src` reports 0 errors and no more than 310 warnings.

**Anti-pattern guards**
- If a test exposes a bug, mark it `it.todo` with a pointer to the phase that fixes it. Do not fix bugs in this phase.
- Do not mock Firestore here.

---

## Phase 2 — Lock the database to the server

**How this serves the primary goal:**
- `firestore.rules` currently allows anyone to read and write everything.
- The Firebase web config is public by design, so anyone can read every employee's PAN, Aadhaar, bank account and salary straight from Firestore.
- After this phase the Next.js server, using the Admin SDK, is the only way in, and the API's access checks become the real protection.

**Depends on:** Phase 1. Its rules step must wait until steps 1-3 run correctly on a preview deployment.

**Prerequisites (done by the user, not the agent)**
- **P1.** In the Firebase console (project `irregularhours-5f56e` → Project settings → Service accounts), generate a private key.
- **P2.** Set `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL` and `FIREBASE_ADMIN_PRIVATE_KEY` in Vercel (Production and Preview) and in `.env.local`. Never commit the key.
- **P3.** Check whether production already has these variables. Locally they are missing (C9), which means the server currently reaches Firestore through the browser SDK and the open rules.
- **P4 (recommended).**
  - Create a separate Firebase project for local and preview testing.
  - Point `.env.local` and Vercel Preview at it.
  - Without it, every smoke test in Phases 3-10 runs against production data.

**Read first:**
- `src/lib/firestore-service.ts` (whole file)
- `src/lib/firebase.ts`
- `src/lib/firebase-admin.ts`
- `firestore.rules`
- Phase 0 B8, B9 and A (`server-only`)

**What to implement**

1. **Make the Admin SDK the only server path to Firestore** in `src/lib/firestore-service.ts`. Remove each client-SDK fallback block:
   - `fetchCollection` 253-273
   - `runQuery` 327-337
   - `getDocumentFromFirestore` 400-418
   - `saveDocumentToFirestore` 455-478
   - `getUserSessionsFromFirestore` 503-531
   - `deleteDocumentFromFirestore` 561-578
   - `clearCollectionInFirestore` 611-632
   - `seedAllToFirestore` 743-750

   When `getFirebaseAdminFirestore()` returns `null`:
   - In production, throw `Error("Firebase Admin credentials missing: set FIREBASE_ADMIN_*")`.
   - In local development, keep returning empty results so the `MemoryStore` fallback works.

   Export `isFirestoreConfigured()`; Phase 5 needs it.
2. **Retire the browser SDK.**
   - Delete `src/lib/firebase.ts` once `grep -rn 'lib/firebase"' src` shows no importers. This also removes the hard-coded web config at lines 6-13.
   - Add the three `FIREBASE_ADMIN_*` names, with placeholder values, to `.env.example`.
3. **Mark server-only modules** (A4; no npm install needed).
   - Add `import "server-only";` as the first line of: `firestore-service.ts`, `firebase-admin.ts`, `db/db-adapter.ts`, `email.ts`, `cloudinary.ts` and `api-auth.ts`.
   - Do not mark `permissions.ts`, `types.ts`, `upload-validation.ts`, `ist-time.ts` or `sheet.ts`; client code uses them.
4. **Rewrite `firestore.rules`:**

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // HRMS data is reached only through the Next.js server (Admin SDK bypasses rules).
       match /{document=**} {
         allow read, write: if false;
       }
       // Used by the separate Credit Expert dashboard app from the browser. Unchanged here (D3).
       match /credit_reports/{reportId} { allow read, write: if true; }
       match /access_codes/{codeId} { allow read, write: if true; }
       match /access_code_creditexpert/{codeId} { allow read, write: if true; }
     }
   }
   ```

   Firestore rules use OR: if any matching `allow` succeeds, access is granted. The three dashboard collections therefore stay open even though the wildcard denies everything else.
5. **Deploy the rules.** This happens only after:
   - the user confirms P2 is live;
   - a preview deployment works end to end (log in, view employees, clock in, approve a leave).

   Command (user-approved, needs `firebase login`): `npx firebase-tools deploy --only firestore:rules --project irregularhours-5f56e`.
6. **Note for the user (not code).** The database was publicly readable until this deploy. Deciding whether that must be reported to anyone is a management or legal call.

**Verification checklist**
- [ ] `grep -rn 'from "firebase/' src` finds nothing.
- [ ] Local dev without Admin credentials still starts and serves the seed admin from memory.
- [ ] With credentials: login, the employee list, clock-in and leave approval all work.
- [ ] After the deploy, an unauthenticated REST read is denied (expect HTTP 403 `PERMISSION_DENIED`):
  `curl -s -o /dev/null -w '%{http_code}' "https://firestore.googleapis.com/v1/projects/irregularhours-5f56e/databases/(default)/documents/employees?pageSize=1&key=$NEXT_PUBLIC_FIREBASE_API_KEY"`
- [ ] The user confirms the dashboard app can still read `credit_reports`.
- [ ] Baselines from the Ground rules still hold.

**Anti-pattern guards**
- Never deploy the rules before production has Admin credentials. If you do, production loses all data access.
- Do not use `if request.auth != null`. There are no Firebase Auth users here, and anonymous sign-in, if enabled, would pass that check.
- Never put the private key in a `NEXT_PUBLIC_*` variable.
- Do not keep the client SDK "just in case". It is the reason the rules had to be open.

---

## Phase 3 — Close the API's open doors

**How this serves the primary goal:**
- After Phase 2 the API is the only way in.
- This phase makes every route check who is asking and return only what that person may see.
- It also closes the routes that leak drafts (with plaintext passwords and KYC data), files and settings to anonymous callers.

**Depends on:** Phase 1. It can run before Phase 2 if the credentials are delayed.

**Read first:**
- `src/lib/api-auth.ts`
- `src/lib/permissions.ts`
- C1 and C2
- `src/app/api/employees/route.ts:26-48` (the existing redaction to copy)
- `src/lib/email.ts:217-232` (`isEmailOtpVerified`)

### 3A. Routes that skip authentication (C1 gaps)

1. **`POST /api/upload`** (`upload/route.ts:10`).
   - Accept the upload when `authenticateRequest` succeeds.
   - Otherwise accept it only when `identifier` is an email for which `await isEmailOtpVerified(identifier)` is true, i.e. a registering candidate.
   - Keep the existing rate limit.
2. **`/api/auth/register/draft`** (`draft/route.ts:8,30,52`).
   - GET, POST and DELETE all require `await isEmailOtpVerified(email)`. Return 403 when it is false.
   - Before `saveRegistrationDraft`, strip `password` and `confirmPassword` on the server.
   - In `src/app/register/page.tsx`:
     - Stop putting passwords in drafts (`saveDraftState` 195-199 and the restore code at 246-247).
     - Call `saveServerDraft` (229) and `fetchServerDraft` (328) only after `otpVerified`.
   - Remove `password` and `confirmPassword` from `RegistrationDraft` (`src/lib/types.ts:707-708`).
   - When a draft is resumed, don't trust the `otpVerified` flag saved in it. A verification lasts about 70 minutes (`email.ts:231`). If the upload or draft endpoints return 403, send the candidate back to the OTP step. Registration submit already enforces this (`submit/route.ts:70`).
3. **The public GETs:** `announcements` (5), `holidays` (6) and `policy` (5).
   - Add `authenticateRequest` and `authFailureResponse`, copying the POST and PUT handlers in the same files.
4. **`GET /uploads/[...path]`** (`src/app/uploads/[...path]/route.ts:16`).
   - Require authentication.
   - Allow the request when the caller has `documents:view_all`, or when the folder segment after `kyc/` equals the caller's sanitised employee ID or email. Use the same sanitiser as `src/lib/cloudinary.ts:41`.
   - Replace the `..` stripping at line 27 with a containment check: resolve the full path and reject it unless it starts with the `public/uploads` root.
5. **`POST /api/auth/register/submit`.**
   - Accept a `kycDocuments[].fileUrl` only if it starts with `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/` or `/uploads/kyc/`. Put this check in a pure helper in `src/lib/upload-validation.ts` and unit-test it.
6. **Empty `KNOWN_GAPS`** in `tests/route-auth.test.ts`.

### 3B. One permission model for every role (D1)

1. **`src/lib/permissions.ts`.**
   - Add `getRolePermissions(role)`. Admin and HR keep their lists (45-112). Every other role, including `employee` and all custom roles, gets the employee list.
   - Change the employee list (113-118) to `["holidays:view", "logins:manage"]`. Drop `logins:view_all` and `incentives:view_all`: today role-name checks mask them, and once checks use permissions they would expose everyone's logins and incentives.
   - Make `hasPermission` use `getRolePermissions`.
   - Return `getRolePermissions(role)` instead of `ROLE_PERMISSIONS[role]` from `api/auth/login/route.ts:91` and `api/auth/session/route.ts:67`.
   - No UI code calls `hasPermission` with the logins or incentives permissions, so the narrower employee list is safe for the UI.
   - Leave `canRoleAccessSection` (sidebar visibility) unchanged.
2. **New pure module `src/lib/access.ts`.** It must have no imports from `db-adapter`, so it stays unit-testable. It provides:
   - `ownOrScoped(caller, viewAllPermission, items, getEmployeeId, getBranch?)`:
     - callers without the permission get only items where `getEmployeeId(item) === caller.employeeId`;
     - callers with it get items whose branch is in `caller.branchScope`.
   - `redactEmployee(emp, caller)`:
     - masks `statutory` (copy the masking at `employees/route.ts:38-46`) unless the caller has `sensitive_data:unmask`;
     - removes `currentSalary` and `salaryHistory` unless the caller has `salary:view_all`;
     - never redacts the caller's own record.
   - `canActForOthers(caller, managePermission)`.
3. **Replace every C2 site** (except the cron recipient filter) with a permission check:

   | Route | New rule |
   |---|---|
   | `employees` GET | Every result goes through `redactEmployee`. Callers without `employees:view_all` get their own record plus same-branch peers (the directory, redacted). |
   | `employees/[id]` | `requireEmployeeScope` (`api-auth.ts:270-283`) uses `employees:view_all`, not the role name. Editing someone else's profile needs `employees:manage`. |
   | `leaves`, `requests`, `assets`, `incentives`, `documents`, `onboarding`, `onboarding/[id]` GET | `ownOrScoped` with that area's `:view_all` permission. |
   | `payroll` GET | Callers without `payroll:view` get only their own payslip lines. Today custom roles get 403 and cannot see their own payslips. |
   | `attendance` POST | GPS is required unless the caller has `attendance:manage`. Clocking in someone else needs `attendance:manage`; otherwise the caller's own ID is used. |
   | `attendance` GET and `attendance/sheet` | Use `attendance:view_all` only (drop the role-name half of the check). |
   | `leaves` and `requests` POST | Acting for another employee needs `leaves:manage` or `requests:manage`. |
   | `logins` GET | Callers without `logins:view_all` see their own rows. |
   | `logins` POST and DELETE | Without `logins:view_all`, force `employeeId = caller.employeeId`, and load the record before deleting to refuse other people's rows. |
   | `documents` POST | Status is "Verified" only for callers with `documents:manage`. |
4. **`DELETE /api/attendance`** (`attendance/route.ts:214-237`) wipes the whole collection.
   - Refuse it unless `isLocalEnvironment()`.
   - Show the "Reset Attendance Data" button (`src/app/attendance/page.tsx:268-277`) only when `useIsLocalhost()`.
5. **`GET /api/roles`** (`roles/route.ts:12`) lists every user's email and role. Require `settings:manage`.
   - In `EmployeeProfile.tsx:192-217`, fetch roles only when the viewer is admin or HR. Other viewers see `currentUser.role` on their own profile.
6. **Dev-only auth bypass switch.** In `authenticateRequest`, the local-dev admin bypass (`api-auth.ts:110-111,124-125`) applies only when `process.env.HRMS_DEV_AUTH_BYPASS !== "0"`. That lets smoke tests exercise 401s locally.
7. **Tests:**
   - Update `permissions.test.ts`.
   - Add `access.test.ts`: own vs view-all scoping, branch scoping, redaction for self vs others.

**Verification checklist**
- [ ] The route-auth test passes with `KNOWN_GAPS = []`.
- [ ] `grep -rn 'role === "employee"\|role !== "employee"' src/app/api src/lib/api-auth.ts` finds only `cron/attendance-reminder`.
- [ ] Smoke tests (dev project, or local with `HRMS_DEV_AUTH_BYPASS=0`) using three test accounts (admin, employee, custom role) give the role table in Phase 10.
- [ ] `npm run build` lists every `/api/*` route, including the newly authenticated GETs, as dynamic (ƒ), not static (○) (A3).
- [ ] `npm test`, tsc and eslint baselines hold.

**Anti-pattern guards**
- Do not filter on the client only. The server response itself must exclude the data.
- Do not add new role-name checks.
- Do not let callers widen their scope with query parameters (`employeeId`, `branch`, `scope`).

---

## Phase 4 — Sessions and one-time codes

**How this serves the primary goal:**
- A login should belong to one person and should pick up changes the moment HR changes that person's role, branch or status.
- Codes that unlock accounts must be unguessable and must work whichever server instance answers.
- Today a branch change, role change or suspension does not reach an already logged-in user.
- The password-reset code lives in one instance's memory, so the reset fails whenever the next request lands on a different instance.

**Depends on:** Phase 3. Both phases edit `api-auth.ts`.

**Read first:**
- `src/lib/db/db-adapter.ts:2442-2583` (sessions)
- `src/lib/email.ts` (whole file)
- `src/lib/api-auth.ts:106-193`
- `src/lib/auth-context.tsx`
- `src/lib/password.ts:1-43` (crypto import style and `safeEqual`)

**What to implement**

1. **Session IDs.** At `db-adapter.ts:2500`, use `randomBytes(32).toString("base64url")` from `node:crypto`.
2. **OTPs** (`email.ts:54-56`).
   - Generate with `randomInt(100000, 1000000)` from `node:crypto`.
   - Store only `sha256(code)` in Firestore `otps` documents and in memory.
   - Compare with `timingSafeEqual`, copying `safeEqual` from `password.ts:23-25`.
   - Put `hashOtp` and `otpMatches` in a pure module `src/lib/otp.ts` and unit-test them.
3. **Persist the password-reset OTP.**
   - Replace the memory-only `passwordResetOtpStore` (`email.ts:306-464`) with the Firestore-backed pattern registration already uses:
     - write: `email.ts:79-80`;
     - read-through: `160-171`;
     - attempt counting: `198-211`.
   - Use the document ID prefix `pwdreset_`.
   - `isPasswordResetOtpVerified` becomes async; await it in `forgot-password/reset/route.ts:32`.
   - `clearPasswordResetOtp` deletes the document.
4. **No account enumeration.** `forgot-password/send-otp/route.ts:24-42` returns the same success message whether or not the account exists or is active, and simply sends nothing when it shouldn't.
5. **`getSession`** (`db-adapter.ts:2537-2549`).
   - Read Firestore first.
   - Use memory only when `!isFirestoreConfigured()`.
   - Revocation can take up to 60 s to show, because of the single-document cache at `firestore-service.ts:371-375`. Document that.
6. **`authenticateRequest`** (`api-auth.ts:106-193`). After validating the session:
   - Load `getUserAccountById(session.userId)`. This is a cached single-document read.
   - Reject with 401 `SESSION_REVOKED` (reason `account_inactive`) when the account is missing or `status !== "Active"`.
   - Build `actor`, `role`, `branch` and `branchScope` from the account, not the session.
   - Delete the memory-only session patch loop in `assignUserRole` (`db-adapter.ts:2409-2415`).
7. **Keep the session ID out of reach of page scripts.**
   - In `auth-context.tsx`, stop reading and writing `hrms_session_id` in `localStorage` (C6) and drop the `x-session-id` header injection (59-79). The httpOnly cookie set at `api/auth/login/route.ts:114-122` is enough.
   - Remove `sessionId` from the JSON bodies of `login/route.ts:104-111` and `session/route.ts:58-68`.
   - The server may keep accepting the header in `extractSessionId`, for non-browser clients.

**Verification checklist**
- [ ] `grep -n 'Math.random' src/lib/email.ts` finds nothing.
- [ ] `grep -n 'Math.random' src/lib/db/db-adapter.ts` shows no session ID line.
- [ ] `grep -rn 'hrms_session_id' src/lib/auth-context.tsx` finds no `localStorage` use.
- [ ] Restart the dev server between "send code" and "verify code" in Forgot Password, and the reset still works.
- [ ] Change a logged-in user's branch as admin: that user's next `/api/auth/session` shows the new branch without logging in again.
- [ ] Suspend them: their next request gets 401.
- [ ] Unit tests for `otp.ts` pass. Baselines hold.

**Anti-pattern guards**
- Do not store plaintext OTPs.
- Do not trust role or branch values stored on the session.
- Do not drop the cookie's `httpOnly`, `sameSite: "lax"` or `secure`-in-production flags.

---

## Phase 5 — Every save sticks

**How this serves the primary goal:**
- Today HR edits can vanish:
  - writes run after the response is sent, and their failures are swallowed;
  - several records cannot be edited at all on a fresh server instance;
  - incentives, incentive schemes and the attendance policy are never read back from the database.
- A cache bug also lists recently edited employees twice for up to a minute. A payroll run in that window pays them twice.
- This phase makes Firestore the single source of truth.

**Depends on:** Phase 2 (Admin-only writes, `isFirestoreConfigured`).

**Read first:**
- `src/lib/firestore-service.ts:84-110,194-338,424-479`
- `src/lib/db/db-adapter.ts`, the functions named below
- Phase 0 A (`after`), B4 and C3

**What to implement**

1. **Memory only as a fallback.** Every getter in `db-adapter.ts` returns the Firestore result, even an empty one, when `isFirestoreConfigured()`. It uses `memory.*` only when Firestore is not configured.
   - Today an empty Firestore result falls back to memory. Examples: `getAttendanceRecords` 800-805 and `getHolidays` 1976-1983.
2. **Writes report failure.** Add `saveOrThrow` and `deleteOrThrow` wrappers in `firestore-service.ts`; they throw when the Admin write fails. Then, in every `db-adapter` mutation:
   - change each of the 39 unawaited `.catch(() => {})` writes (C3) to `await saveOrThrow(...)`;
   - change the awaited-but-ignored writes the same way;
   - update memory and caches only after the write succeeds.

   The route's existing `try/catch` then returns 500 instead of a false success.
3. **Audit logs after the response.** In `recordAuditLog` (`db-adapter.ts:122-152`), schedule the Firestore write with `after()` from `next/server` (A1; copy `after.md` L68-91).
   - On Vercel this is backed by `waitUntil`, so the write finishes instead of being frozen with the function.
   - What `after` does outside a request is undocumented, so wrap it: `try { after(() => saveOrThrow(...)) } catch { await saveOrThrow(...) }`.
4. **Firestore-first loads for every mutation.**
   - Add `loadForUpdate<T>(collection, docId, memoryList, match)`. It reads `getDocumentFromFirestore` first and falls back to memory only when Firestore is not configured.
   - Use it in:
     - `updateEmployeeBranch`, `updateEmployeeStatutory`, `updateEmployeeAvatar`, `reviseSalary`
     - `updateAttendanceRecord`, `updateLeaveRequest`, `updateRequest`
     - `updateEmployeeIncentive` (1364), `deleteEmployeeIncentive` (1393), `updateIncentiveScheme` (1416)
     - `deleteEmployeeLogin` (1449), `updateAsset` (1716)
     - `updateHoliday` (2019), `deleteHoliday` (2044), `deleteOffice` (946)
   - Today the last nine return "not found" for anything created on another instance. In production, holiday edit and delete always fail, because memory starts empty and `getHolidays` never fills it.
5. **Read paths that ignore Firestore:**
   - `getEmployeeIncentives` (1325-1330): query `incentives` by `month`. Today payroll (`api/payroll/route.ts:77`) only sees incentives created on its own instance.
   - `getIncentiveSchemes` (1321-1323): read the new `incentive_schemes` collection, seeding `INITIAL_INCENTIVE_SCHEMES` when it is empty. In production the list is currently empty.
   - `updateIncentiveScheme`: persist to `incentive_schemes` and record an audit log. Today it is memory-only and never saved.
   - `getPolicy` (1943-1945): read `settings/attendance_policy`, which `updatePolicy` (1953) already writes, falling back to `INITIAL_POLICY`.
   - `punchAttendance` (1043-1054): use `await getPolicy()` instead of `memory.policy`.
6. **Cache identity bug.**
   - Reads build each item as `{ id: d.id, ...d.data() }` (`firestore-service.ts:241,263,320,332`), so a stored `id` field wins over the document ID.
   - `patchList` (`firestore-service.ts:89-99`) matches on `d.id === docId`. For employees (`emp-…` vs `EMP-0049`), payroll runs (`pay-run-…` vs `PAY-2026-10`) and assets (`ast-…` vs the tag), the edited record is therefore appended as a duplicate until the 60 s TTL expires.
   - Fix: move `patchList` into a pure, exported `patchCachedList(list, docId, data, filters?)` in `src/lib/cache-patch.ts`. Match on `(data?.id ?? docId)` and keep `merged.id = data?.id ?? docId`.
   - Unit-test it: no duplicates, delete, and filter membership.
7. **Full-document writes.**
   - `set(cleanData, { merge: true })` (`firestore-service.ts:443`) keeps fields the caller removed. For example, an asset returned to inventory keeps `assignedToEmployeeId`, because `JSON.stringify` drops `undefined`.
   - Every caller passes the full document (C3), so switch to `set(cleanData)` (B4).
8. **Asset edits currently always fail.**
   - The page sends `editingAsset.id` (`src/app/assets/page.tsx:114`).
   - `updateAsset` matches on `assetTag` (`db-adapter.ts:1716`), and the document ID is the tag (1699).
   - Fix: send `assetTag` from the page, and load by document ID = tag.
9. **One `normalizeEmployee`.** Replace the identical copies at `db-adapter.ts:173-236` and `260-322` with a single module-level function.
10. **Delete dead code** (C8).

**Verification checklist**
- [ ] `npm test` passes, including `cache-patch.test.ts`.
- [ ] `grep -n 'ToFirestore([^)]*)[^;]*\.catch(() => {})' src/lib/db/db-adapter.ts` finds nothing.
- [ ] `grep -n 'merge: true' src/lib/firestore-service.ts` finds nothing outside dev seeding.
- [ ] On the dev project, restart the dev server between each action and its check:
  - Create an incentive: it is still listed after the restart and appears in that month's payroll.
  - Save a 20-minute grace period: `GET /api/policy` still returns it after the restart.
  - Edit and delete a holiday created before the restart: both return 200.
  - Return an asset to inventory: the Firestore document no longer has `assignedToEmployeeId`.
- [ ] Edit an employee, then immediately `GET /api/employees`: there are no duplicate `employeeId`s.

**Anti-pattern guards**
- Do not call `after()` without the outside-a-request fallback.
- Do not read `memory.*` before Firestore in production paths.
- Do not add queries that need a composite index (range filters on two fields, or `where` plus `orderBy` on different fields) unless you also document creating that index.

---

## Phase 6 — One person, one employee ID

**How this serves the primary goal:**
- Two activations close together can get the same EMP number, and the second overwrites the first person's employee record. This already happened with EMP-0049: Priya Bharti's login and KYC were filed under Hritik Bisht's ID.
- Unique IDs and repeatable activation keep each person's pay and personal data attached to the right person.

**Depends on:** Phase 5.

**Read first:**
- Phase 0 B1-B3
- `src/app/api/employees/route.ts:128-133`
- `src/lib/db/db-adapter.ts:330-364` and `2884-3063`
- `src/app/api/auth/register/submit/route.ts:50-67`

**What to implement**

1. **`allocateEmployeeId(tx)` in `db-adapter.ts`.** Use it inside an Admin `runTransaction`:
   - Read `counters/employees`.
   - If the counter is missing, read the `employees` collection in the same transaction and start from the largest `EMP-(\d+)` number.
   - Write `next` and return `EMP-${String(next).padStart(4, "0")}`.
   - Remove both "highest + 1" calculations (`api/employees/route.ts:128-133` and `db-adapter.ts:2892-2904`).
2. **Create employee documents with `create`.** Use `tx.create(employeesRef.doc(id), employee)` inside the same transaction, never `set` or merge (B2, B3). A collision then fails the transaction instead of overwriting someone.
3. **Idempotent activation** (`activateOnboardedEmployee`, `db-adapter.ts:2884-3063`). In one transaction:
   - read `onboarding/<id>`;
   - if it already has `employeeId`, return the existing employee and do nothing else;
   - otherwise allocate the ID, `create` the employee, and update the onboarding record.

   After the transaction, the follow-up steps must also be safe to repeat:
   - KYC documents use the ID `doc-<onboardingId>-<type>`;
   - account linking runs as an upsert;
   - the approval email is sent only when this call created the employee.

   Return 409 if the email's user account is already linked to a different person's employee ID.
4. **One account per email.**
   - `createUserAccount` (2103-2118) and registration submit (`submit/route.ts:50-67`) check Firestore with `queryCollectionFromFirestore("users", [{ field: "email", op: "==", value }])`, not just memory.
   - Refuse duplicates.
5. **Read-only identity audit: `scripts/audit-identities.mjs`.**
   - It uses the Admin SDK and the `.env` credentials, and prints only IDs and counts (no names, no personal data).
   - It reports:
     - user accounts whose `employeeId` belongs to an employee with a different email;
     - several users sharing one email;
     - several onboarding records sharing one `employeeId`;
     - employees sharing a PAN (compared as hashes; never printed).
   - Run it only with the user's go-ahead.
   - Fixing what it finds is a separate step the user must approve explicitly. A repair for EMP-0049 / Priya was drafted on 2026-11-04; ask the user whether it ran.

**Verification checklist**
- [ ] On the dev project, two parallel `activate_employee` calls for different candidates get different IDs.
- [ ] Two calls for the same candidate return the same `employeeId`, and the employee count rises by exactly one.
- [ ] `POST /api/employees` with the counter at N creates `EMP-(N+1)`.
- [ ] Registering an email that already has an account is refused.
- [ ] `grep -rn 'highestEmpNum\|highest + 1' src` finds nothing.
- [ ] Baselines hold.

**Anti-pattern guards**
- Do not read inside the transaction after writing (B1).
- Do not compute the next ID from a cached `getEmployees()` list.
- Do not run the audit or any repair against production without approval.

---

## Phase 7 — Pay and incentive figures

**How this serves the primary goal:**
- These numbers decide what people are paid.
- Today:
  - finalized payslips can be silently recomputed;
  - incentive-only staff are held to a ₹15 lakh hurdle;
  - the incentive policy screen changes nothing;
  - several screens show rules the engine doesn't apply.

**Depends on:** Phases 5 (schemes persisted) and 6 (activation).

**Read first:**
- `src/app/api/payroll/route.ts`
- `src/app/payroll/page.tsx:124-152`
- `src/lib/db/db-adapter.ts:1269-1317` and `1605-1672`
- `src/lib/incentive-calculator.ts:34-50`
- `src/app/incentives/page.tsx:232-258`

**What to implement**

1. **Protect finalized runs.** `POST /api/payroll` (53-121) loads `PAY-${month}` first and returns 409 if its status is `FINALIZED`, `PAYSLIP_GENERATED` or `PAID`. Today `savePayrollRun` overwrites the locked snapshot. Also de-duplicate employees by `employeeId` before computing.
2. **Forward-only status changes.**
   - `PUT /api/payroll` (124-178) accepts only the next status in the sequence.
   - Put a pure `nextPayrollStatus(current)` in `payroll-engine.ts` (copy the sequence from `src/app/payroll/page.tsx:140-149`). Use it on the server and the page, and unit-test it.
3. **Newest run first.** `getPayrollRuns` (1269-1280) sorts by `month`, newest first.
   - Firestore returns runs in document-ID order, so `runs[0]` is currently the oldest run.
   - `runs[0]` is used by `notifications/route.ts:81`, `AdminDashboard.tsx:77`, `reports/page.tsx:94,133`, `payroll/page.tsx:53` and `payslips/page.tsx:28,42`.
4. **Salary used for the incentive hurdle (D2).** In `db-adapter.ts:1620-1624`:
   - when the employee is found, use their gross salary even if it is 0;
   - use 15000 only when no employee matches.

   Put this in a pure `resolveIncentiveSalary(emp)` and unit-test it. A ₹0-salary employee with ₹20 lakh of other-bank disbursal should get ₹4,000.
5. **Make the incentive policy real.**
   - Persist `hurdleMultiplier` and `axisRatePerLakh` on `scheme-disbursal-slab` (Phase 5).
   - `calculateAndSyncIncentivesFromLogins` (1625-1630) passes them to `calculateDisbursalIncentive`, which already accepts them.
   - The incentives page sends the values (232-258), loads them back into the modal, and replaces the hard-coded "Active Policy (100x Hurdle)" at line 370.
6. **Employee dashboard incentive card.**
   - `EmployeeDashboard.tsx:55,73-78` reads `data.records`, but the API returns `{ schemes, incentives }` (`api/incentives/route.ts:26`), so the card always shows ₹0.
   - Read `data.incentives` and request `?month=<current IST month>`.
7. **Salary at activation (D4).**
   - Remove the ₹4,80,000 defaults at `api/auth/register/submit/route.ts:193` and `db-adapter.ts:2735,2906,2965`.
   - Activation returns 400 "Enter the offered CTC before activating" when `annualCtc` is missing.
   - Add a CTC input to the onboarding checklist modal (`src/app/onboarding/page.tsx:788-798`), saved through a new `set_ctc` PATCH action in `api/onboarding/[id]/route.ts`.
8. **Screens that state rules the engine doesn't apply.** Show the real value, or remove the text:

   | Location | Current text | Fix |
   |---|---|---|
   | `payroll/page.tsx:351`, `:584` | "PF (12%)" | Real PF |
   | `payroll/page.tsx:448` | "PT (₹200)" | Engine PT is 0 |
   | `settings/page.tsx:1537-1557` | EPF ceiling, PT and "HRA 50%" cards | Engine values |
   | `settings/page.tsx:1452,1456` | Hard-coded project ID and region | `process.env` or remove |
   | `AdminDashboard.tsx:251`, `attendance/page.tsx:411`, `reports/page.tsx:363` | "Late after 10:15 AM" | Use `/api/policy` |
   | `AdminDashboard.tsx:148` | "+1 this month" (made up) | Remove |
   | `EmployeeDashboard.tsx:314` | "₹36,500" | "—" |

**Verification checklist**
- [ ] Unit tests for `nextPayrollStatus` and `resolveIncentiveSalary` pass.
- [ ] On the dev project, after finalizing a month, `POST` for the same month returns 409, and a backwards `PUT` returns 400.
- [ ] The dashboard and payslips open on the newest run.
- [ ] Changing the hurdle multiplier changes the recalculated incentives.
- [ ] `grep -n 'PT (₹200)\|+1 this month\|36,500\|irregularhours-5f56e' -r src/app src/components` finds nothing.

**Anti-pattern guards**
- Do not use `||` chains for numbers where 0 is a valid value.
- Do not change the slab tables (`incentive-calculator.ts:10-15`) without HR sign-off.

---

## Phase 8 — Dates, defaults and lists

**How this serves the primary goal:**
- Attendance, leave and payroll are keyed by Indian calendar dates.
- Anything computed in UTC is a day off between midnight and 05:30 IST.
- Hard-coded months open screens on October 2026.
- Invented defaults put fake IFSC, UAN, PF and date-of-birth values into real employee records.
- Several lists show the oldest entries instead of the newest, including the audit log.

**Depends on:** Phase 5 (query helper).

**Read first:**
- `src/lib/attendance/ist-time.ts`
- C4 and C5
- `src/components/employees/AddEmployeeModal.tsx`
- `src/lib/db/db-adapter.ts:1170-1232,1929-1939,2884-2975`
- `src/app/api/cron/attendance-reminder/route.ts`

**What to implement**

1. **IST everywhere.**
   - Add `getISTMonthString(date = new Date())` (copy `getISTDateString`, lines 11-18, then take `.slice(0, 7)`) and `addDaysIST(dateStr, n)`.
   - Replace every C4 site except the report file name.
   - Unit-test month rollover: `2026-10-31T19:00:00Z` gives `"2026-11"`.
2. **Hard-coded dates (C5).** Use the current IST month or date instead.
   - This includes the expiry check in `documents/page.tsx:106` and the joining date in `AddEmployeeModal.tsx:37`.
   - Derive the payroll label from the month.
3. **Stop inventing personal and statutory data.**
   - `AddEmployeeModal.tsx`:
     - no default `dob` (25), `ifscCode` or `bankName` (46-47);
     - stop fabricating `uan` and `pfAccountNumber` (95-96); send what HR typed, empty allowed.
   - `register/page.tsx:86`: no default date of birth; make the field required and empty.
   - `activateOnboardedEmployee` (`db-adapter.ts:2924-2937`): drop the `"1995-01-01"`, `"Male"` and `"Main Branch Commercial Rd…"` fallbacks; leave fields the candidate didn't give empty.
4. **Newest first.**
   - Add an optional `{ orderBy: { field, direction }, limit }` to `queryCollectionFromFirestore` and the collection read (Admin `.orderBy().limit()`, B5).
   - `getAuditLogs` (1929-1939) currently reads `.limit(100)` with no order, so it always shows the oldest 100 events. Order it by `timestamp` descending.
   - Sort announcements (`publishDate`), requests (`createdAt`), leaves (`appliedOn`) and onboarding records (`createdAt`) newest first in their getters. `notifications/route.ts:165,263` uses `[0]` as "latest".
5. **Multi-day leave.**
   - Approval creates one attendance record, for `startDate` only (`db-adapter.ts:1201-1220`).
   - Create one "Leave" record per day from `startDate` to `endDate`. Skip Sundays and the employee's branch holidays, reusing the logic at `src/lib/attendance/sheet.ts:74,84`.
   - Use the deterministic ID `att-lev-<leaveId>-<date>` so repeats don't duplicate.
6. **Attendance reminder cron.**
   - Email only persisted Firestore users. Add `getPersistedUserAccounts()`. Today `getAllUserAccounts` (2302-2342) adds unsaved accounts with invented email addresses.
   - Skip anyone on approved leave today.

**Verification checklist**
- [ ] `grep -rn 'toISOString().split("T")\[0\]\|toISOString().slice(0, 7)' src` finds only the report file name.
- [ ] `grep -rn '"2026-[0-9]' src/app src/components` finds nothing.
- [ ] `grep -n 'KN/BNG\|HDFC0000123\|1995-01-01\|1996-05-15' -r src` finds nothing.
- [ ] Unit tests for the new IST helpers pass.
- [ ] On the dev project:
  - The audit page shows a just-created event first.
  - Approving a Monday-to-Wednesday leave creates three "Leave" records.
- [ ] Baselines hold.

**Anti-pattern guards**
- Do not use `new Date("YYYY-MM-DD")` for local-day arithmetic. It parses as UTC; use the IST helpers.
- Do not fill required personal or statutory fields with sample values.

---

## Phase 9 — Documents that really upload

**How this serves the primary goal:**
- The Documents page tells HR a file was uploaded when nothing was saved: it creates an in-browser object with `fileUrl: "#"`.
- "Download" only shows an alert.
- After this phase, documents HR saves are really stored and can be opened.

**Depends on:** Phase 3 (upload authentication and the `fileUrl` validator).

**Read first:**
- `src/app/documents/page.tsx:67-92,228-236`
- `src/app/api/documents/route.ts:45-86`
- `src/components/employees/EmployeeProfile.tsx:319-333` (upload flow to copy) and `1353-1361` (view link)

**What to implement**

1. **Documents page upload.** Replace the client-only object at `documents/page.tsx:67-92` with:
   - a file input;
   - `POST /api/upload` (copy `EmployeeProfile.tsx:319-333`);
   - `POST /api/documents` with the returned `fileUrl`;
   - a reload of the list.
2. **"Download Secure Copy"** (233) opens `d.fileUrl` in a new tab, like `EmployeeProfile.tsx:1353-1361`.
3. **"Upload Document" on the profile.** The button at `EmployeeProfile.tsx:1248` has no handler. Reuse the flow above with the employee fixed, or remove the button.
4. **`POST /api/documents`** validates `fileUrl` with the Phase 3A.5 helper.

**Verification checklist**
- [ ] As HR, upload a PDF. It is listed after a reload and after a server restart, and opening it shows the file.
- [ ] An employee posting a document for someone else gets 403.
- [ ] `grep -n 'fileUrl: "#"\|Downloading document' src/app/documents/page.tsx` finds nothing.

**Anti-pattern guards**
- Do not accept `fileUrl` values the server did not issue.
- Do not set "Verified" status for uploads by non-managers.

---

## Phase 10 — Verify end to end

**How this serves the primary goal:** This phase proves every part of the goal at once: access is restricted, saves persist, and the figures are right. It also confirms nothing regressed.

1. **Static gates:**
   - `npx tsc --noEmit`: 0 errors.
   - `npx eslint src`: 0 errors and no more than 310 warnings.
   - `npm test`: all tests pass.
   - `npm run build`: succeeds.
2. **Anti-pattern greps.** Each of these must return nothing, apart from the stated exception:
   - `grep -rn 'from "firebase/' src`
   - `grep -rn 'role === "employee"\|role !== "employee"' src/app/api src/lib/api-auth.ts` (the cron recipient filter may remain)
   - `grep -n 'ToFirestore([^)]*)[^;]*\.catch(() => {})' src/lib/db/db-adapter.ts`
   - `grep -n 'merge: true' src/lib/firestore-service.ts`
   - `grep -rn 'Math.random' src/lib/email.ts`
   - `grep -rn 'localStorage' src/lib/auth-context.tsx`
   - `grep -rn 'toISOString().split("T")\[0\]' src` (the report file name may remain)
   - `grep -rn '"2026-[0-9]' src/app src/components`
   - `grep -rn 'highestEmpNum\|highest + 1' src`
3. **`tests/route-auth.test.ts`** passes with `KNOWN_GAPS = []`.
4. **Role smoke test.** Run it on the dev project or a preview deployment, using test accounts.

   | Request | Admin | Employee | Custom role | No session |
   |---|---|---|---|---|
   | `GET /api/employees`: another person's PAN and salary | full | masked / absent | masked / absent | 401 |
   | `GET /api/leaves`, `/api/requests`, `/api/documents` | all | own | own | 401 |
   | `GET /api/holidays`, `/api/announcements`, `/api/policy` | 200 | 200 | 200 | 401 |
   | `POST /api/attendance` without latitude/longitude | 200 | 400 `LOCATION_REQUIRED` | 400 | 401 |
   | `DELETE /api/logins?id=<someone else's>` | 200 | 403 | 403 | 401 |
   | `GET /api/roles` | 200 | 403 | 403 | 401 |
   | `DELETE /api/attendance` (production build) | 403 | 403 | 403 | 401 |
   | `GET /api/auth/register/draft?email=<any>` without a verified OTP | — | — | — | 403 |
5. **Persistence checks.** Repeat the checks from Phases 4, 5, 7 and 8 with a server restart between each action and its check:
   - forgot-password;
   - incentives;
   - policy;
   - holiday edit;
   - asset return;
   - payroll lock;
   - audit log order.
6. **Firestore REST check** (Phase 2): HRMS collections return 403.
7. **Read-only identity audit** (Phase 6): zero findings, or a list the user decides on.
8. **Update the Progress log.**

---

## Deferred (not in this plan)

- **Manager visibility.** Per-role API permissions for managers (e.g. branch-scoped team views for `branch_manager`). This needs a product decision on what each role may see.
- **Rate limiting.** Move it to a shared store (Redis or Firestore). The current limiter (`src/lib/rate-limit.ts`) works per instance.
- **Private KYC delivery.** Cloudinary `type: "authenticated"` plus `private_download_url` (B10), and moving existing public uploads.
- **GPS anti-spoofing.** Coordinates come from the browser and can be faked.
- **Security headers and CSP** through `next.config` `headers()`. Only a static CSP works with Cache Components (A5).
- **Cleanup.**
  - The `globals.css` `!important` remapping of dark utility classes.
  - The remaining 310 lint warnings.
  - Unsplash stock-photo avatar fallbacks.
- **Loss of pay for days with no attendance record.** Payroll counts only explicit "Absent"; HR needs to define the rule.
- **Split `db-adapter.ts`** (3,126 lines) into per-domain modules.
- **Breach reporting.** Whether the period when Firestore was publicly readable must be reported to anyone (management or legal decision).

## Progress log

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0 | done | 2026-11-05 | Docs and API facts gathered; baseline tsc 0 errors, eslint 0 errors / 310 warnings |
| 1 | done | 2026-11-05 | Vitest (needed `@types/node` 22); tests for pay, incentive, IST, sheet, permissions; static route-auth test |
| 2 | partly reversed by decision | 2026-11-05 | The user chose to keep the existing `NEXT_PUBLIC_FIREBASE_*` credentials (free Spark plan, no service-account key). `src/lib/firestore-web-compat.ts` serves the Admin-style calls from the web SDK when `FIREBASE_ADMIN_*` is absent; Admin is used when present. **Firestore rules stay open, so anyone with the public web config can read and write all data (PAN, Aadhaar, bank, salary). The deny-all `firestore.rules` is written but must NOT be deployed without Admin credentials.** |
| 3 | done | 2026-11-05 | All routes authenticate (OTP-gated drafts/upload for candidates); permission-based scoping; custom roles are self-service only; local uploads moved to `.uploads/` (files in `public/` bypass auth) |
| 4 | done | 2026-11-05 | Crypto session IDs and OTPs, hashed codes, persisted reset OTP, no enumeration, account-driven role/branch/status, session ID out of localStorage and responses |
| 5 | done | 2026-11-05 | Awaited `persist`, Firestore-first loaders, cache identity fix, full-document writes, asset edit fix, `after()` for audit logs |
| 6 | done (audit not run) | 2026-11-05 | Transactional employee-ID counter, `create()`, idempotent activation. `scripts/audit-identities.mjs` is written but **not run** (needs credentials and your go-ahead). |
| 7 | done | 2026-11-05 | Finalized-run lock, forward-only status, newest run first, ₹0 hurdle for incentive-only (D2), real policy values, CTC required at activation (D4) |
| 8 | done | 2026-11-05 | IST dates, no hard-coded months, no invented personal data, newest-first lists, multi-day leave, reminder cron uses saved accounts and skips leave |
| 9 | done | 2026-11-05 | Documents page uploads and opens real files; profile dead button replaced by a link |
| 10 | done | 2026-11-05 | tsc 0 errors; 77 unit tests; eslint 0 errors / 291 warnings; `next build` OK; greps clean; 59/59 HTTP smoke checks (isolated dev server, memory mode) |

### Still to do by a person
- Production now needs either `NEXT_PUBLIC_FIREBASE_API_KEY` + `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (already set) or `FIREBASE_ADMIN_*`. Check both are in Vercel (Production and Preview).
- To actually protect the data, add `FIREBASE_ADMIN_*` to Vercel and `.env.local`, then deploy `firestore.rules`. Until then the open rules leave employee data readable and writable by anyone with the public config.
- (Original step) Deploy `firestore.rules` only after that is verified (`npx firebase-tools deploy --only firestore:rules --project irregularhours-5f56e`), then run the REST check in Phase 2.
- Run `node scripts/audit-identities.mjs` against production data and decide what to repair (EMP-0049 / Priya Bharti was drafted earlier).
- Confirm D2 and D4 with HR.
- Old drafts in `registration_drafts` may still hold plaintext passwords; the next autosave overwrites them, but stale ones can be deleted.
- Verified against real Firestore through the web SDK (read-only): employees (39), attendance, leaves, holidays, announcements all load. Not exercised against real Firestore: transactions (`allocateEmployeeId`, activation), batch writes, `orderBy` on audit logs, the incentive-scheme seed. Test on a dev Firebase project (P4) first.
