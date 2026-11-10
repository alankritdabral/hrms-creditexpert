import "server-only";
import {
  INITIAL_EMPLOYEES,
  INITIAL_ATTENDANCE,
  INITIAL_LEAVES,
  INITIAL_INCENTIVE_SCHEMES,
  INITIAL_EMPLOYEE_INCENTIVES,
  INITIAL_ASSETS,
  INITIAL_REQUESTS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_DOCUMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_PAYROLL_RUNS,
  INITIAL_POLICY,
  INITIAL_HOLIDAYS,
  INITIAL_ONBOARDING_RECORDS,
  INITIAL_OFFICES,
  INITIAL_EMPLOYEE_LOGINS,
  SEED_USERS,
  SEED_USER_ACCOUNTS,
} from "./seed-data";
import { effectiveRoleGrants, sanitizeGrantedPermissions, type Permission } from "../permissions";
import { PRESET_LENDER_BANKS, MAX_SAVED_BANKS, bankKey, cleanBankName, mergeBankLists } from "../lender-banks";
import {
  Employee,
  StatutoryInfo,
  PersonalInfo,
  AttendanceRecord,
  LeaveRequest,
  IncentiveScheme,
  EmployeeIncentiveRecord,
  PayrollRun,
  AssetRecord,
  EmployeeRequestItem,
  AnnouncementItem,
  AuditLogItem,
  AttendancePolicy,
  TimingProfile,
  User,
  UserAccount,
  UserSession,
  UserRole,
  Branch,
  EmployeeDocument,
  SalaryRevisionRecord,
  SalaryComponent,
  Holiday,
  OnboardingRecord,
  OnboardingChecklistItem,
  KycDocumentItem,
  STANDARD_ONBOARDING_CHECKLIST,
  EmploymentStatus,
  RegistrationDraft,
  OfficeLocation,
  LocationVerificationStatus,
  EmployeeLoginRecord,
  LoginSheetEntry,
  BankDisbursalBreakdown,
  CustomerDisbursalEntry,
  IncentiveCalculationBreakdown,
  CustomRole,
  DEFAULT_ROLES,
  AppSection,
  APP_SECTIONS,
} from "../types";
import type { LoginSheetInput } from "../login-sheet";
import { applySheetRows, groupByEmployee, stripSheetEntries, totalsFromBanks } from "../login-sheet-sync";
import { calculateDisbursalIncentive, resolveIncentiveSalary } from "../incentive-calculator";
import { calculateSalaryBreakdown, calculateSalaryFromMonthly } from "../payroll-engine";
import { sendAccountApprovedEmail } from "../email";
import {
  getCollectionFromFirestore,
  queryCollectionFromFirestore,
  type QueryFilter,
  getDocumentFromFirestore,
  getUserSessionsFromFirestore,
  saveDocumentToFirestore,
  deleteDocumentFromFirestore,
  clearCollectionInFirestore,
  isFirestoreConfigured,
  saveOrThrow,
  deleteOrThrow,
  withTransaction,
  toFirestoreData,
  queryFreshFromFirestore,
  invalidateFirestoreCache,
} from "../firestore-service";
import { calculateHaversineDistance, resolveAttendanceOffice } from "../attendance/geolocation";
import {
  getISTDateString,
  getIST24HourTime,
  leaveWorkingDates,
  weekBoundsIST,
} from "../attendance/ist-time";
import { decideArrivalStatus, resolveTimingForEmployee } from "../attendance/late-policy";
import { isLocalEnvironment } from "../env";
import { hashPassword, generateTempPassword } from "../password";
import { randomBytes } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { formatEmployeeId, maxEmployeeNumber, nextEmployeeId } from "../employee-id";
import { after } from "next/server";

// Memory storage for fallback/dev cache
class MemoryStore {
  // Only load seed/mock demo data on local development workstation
  users: User[] = isLocalEnvironment() ? [...SEED_USERS] : [];
  userAccounts: UserAccount[] = isLocalEnvironment() ? [...SEED_USER_ACCOUNTS] : [];
  sessions: UserSession[] = [];
  employees: Employee[] = isLocalEnvironment() ? [...INITIAL_EMPLOYEES] : [];
  attendance: AttendanceRecord[] = isLocalEnvironment() ? [...INITIAL_ATTENDANCE] : [];
  offices: OfficeLocation[] = isLocalEnvironment() ? [...INITIAL_OFFICES] : [];
  leaves: LeaveRequest[] = isLocalEnvironment() ? [...INITIAL_LEAVES] : [];
  incentiveSchemes: IncentiveScheme[] = isLocalEnvironment() ? [...INITIAL_INCENTIVE_SCHEMES] : [];
  employeeIncentives: EmployeeIncentiveRecord[] = isLocalEnvironment() ? [...INITIAL_EMPLOYEE_INCENTIVES] : [];
  assets: AssetRecord[] = isLocalEnvironment() ? [...INITIAL_ASSETS] : [];
  requests: EmployeeRequestItem[] = isLocalEnvironment() ? [...INITIAL_REQUESTS] : [];
  announcements: AnnouncementItem[] = isLocalEnvironment() ? [...INITIAL_ANNOUNCEMENTS] : [];
  documents: EmployeeDocument[] = isLocalEnvironment() ? [...INITIAL_DOCUMENTS] : [];
  auditLogs: AuditLogItem[] = isLocalEnvironment() ? [...INITIAL_AUDIT_LOGS] : [];
  payrollRuns: PayrollRun[] = isLocalEnvironment() ? [...INITIAL_PAYROLL_RUNS] : [];
  policy: AttendancePolicy = { ...INITIAL_POLICY };
  holidays: Holiday[] = isLocalEnvironment() ? [...INITIAL_HOLIDAYS] : [];
  onboardingRecords: OnboardingRecord[] = isLocalEnvironment() ? [...INITIAL_ONBOARDING_RECORDS] : [];
  registrationDrafts: Map<string, RegistrationDraft> = new Map();
  employeeLogins: EmployeeLoginRecord[] = isLocalEnvironment() ? [...INITIAL_EMPLOYEE_LOGINS] : [];
  loginSheet: LoginSheetEntry[] = [];
  lenderBanks: { id: string; name: string; createdAt: string; addedBy: string }[] = [];
  customRoles: CustomRole[] = [...DEFAULT_ROLES];
}

const globalForMemory = globalThis as unknown as { __hrms_memory_store?: MemoryStore };
const memory = (globalForMemory.__hrms_memory_store ??= new MemoryStore());
memory.offices ??= isLocalEnvironment() ? [...INITIAL_OFFICES] : [];
if ((!memory.employees || memory.employees.length === 0) && isLocalEnvironment()) {
  memory.employees = [...INITIAL_EMPLOYEES];
}
if ((!memory.employeeLogins || memory.employeeLogins.length === 0) && isLocalEnvironment()) {
  memory.employeeLogins = [...INITIAL_EMPLOYEE_LOGINS];
}
memory.customRoles ??= [...DEFAULT_ROLES];
memory.loginSheet ??= [];
memory.lenderBanks ??= [];
memory.userAccounts ??= isLocalEnvironment() ? [...SEED_USER_ACCOUNTS] : [];

/** A copy of the list sorted newest first by a string key (ISO dates sort correctly as text). */
function newestFirst<T>(list: T[], keyOf: (item: T) => string | undefined): T[] {
  return [...list].sort((a, b) => (keyOf(b) || "").localeCompare(keyOf(a) || ""));
}

// ----------------- PERSISTENCE HELPERS -----------------
// Firestore is the source of truth. The in-memory store is a development fallback that is only
// used when no Admin credentials are configured (isFirestoreConfigured() === false).

/** Saves a full document. Throws when the write fails, so callers never report a false success. */
async function persist(collectionName: string, docId: string, data: unknown): Promise<void> {
  if (!isFirestoreConfigured()) return; // local development without credentials: memory only
  await saveOrThrow(collectionName, docId, data);
}

async function persistDelete(collectionName: string, docId: string): Promise<void> {
  if (!isFirestoreConfigured()) return;
  await deleteOrThrow(collectionName, docId);
}

/** Result of a collection read: Firestore when configured (even if empty), otherwise the memory fallback. */
function fromStore<T>(firestoreDocs: T[] | null | undefined, memoryList: T[]): T[] {
  return isFirestoreConfigured() ? firestoreDocs ?? [] : memoryList;
}

/**
 * Loads the current copy of a document before changing it. With Firestore configured, only
 * Firestore is consulted (memory may be empty or stale on another serverless instance).
 */
async function loadForUpdate<T extends object>(
  collectionName: string,
  docId: string,
  memoryList: T[],
  match: (item: T) => boolean
): Promise<T | null> {
  if (isFirestoreConfigured()) {
    return (await getDocumentFromFirestore<T>(collectionName, docId).catch(() => null)) || null;
  }
  return memoryList.find(match) || null;
}

/** Keeps the development memory store in step with a saved document. */
function upsertMemory<T>(list: T[], match: (item: T) => boolean, item: T, prepend = true): void {
  const i = list.findIndex(match);
  if (i >= 0) list[i] = item;
  else if (prepend) list.unshift(item);
  else list.push(item);
}

// Helper to log audit events
export async function recordAuditLog({
  who,
  role,
  action,
  employeeId,
  employeeName,
  details,
}: {
  who: string;
  role: string;
  action: string;
  employeeId?: string;
  employeeName?: string;
  details: string;
}) {
  const logItem: AuditLogItem = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    who,
    role,
    action,
    employeeId,
    employeeName,
    details,
    timestamp: new Date().toISOString(),
  };

  memory.auditLogs.unshift(logItem);

  // The audit write must not delay or fail the user's request, but on serverless the function can
  // be frozen once the response is sent. after() keeps it alive until the write settles.
  const write = async () => {
    try {
      await persist("audit_logs", logItem.id, logItem);
    } catch (e) {
      console.error("Audit log write failed:", e);
    }
  };
  try {
    after(write);
  } catch {
    // Not inside a request (script, cron outside a handler): write inline.
    await write();
  }
}

// ----------------- EMPLOYEES -----------------

/**
 * Normalises legacy employee records: Probation becomes Active, basic pay equals gross (only PF is
 * deducted), and the avatar follows the employee's chosen preference.
 */
function normalizeEmployee(emp: Employee): Employee {
  let norm = { ...emp };
  if ((norm.employment.employmentStatus as string) === "Probation") {
    norm = {
      ...norm,
      employment: {
        ...norm.employment,
        employmentStatus: "Active",
        employmentType: "Full-time",
        probationMonths: 0,
      },
    };
  }
  if (norm.currentSalary) {
    const basic = norm.currentSalary.grossSalary || norm.currentSalary.basic;
    const employeePf = norm.currentSalary.employeePf || 0;
    norm = {
      ...norm,
      currentSalary: {
        ...norm.currentSalary,
        basic,
        grossSalary: basic,
        hra: 0,
        specialAllowance: 0,
        otherAllowance: 0,
        employerEsic: 0,
        professionalTax: 0,
        employeePf,
        netSalary: Math.max(0, basic - employeePf),
      },
    };
  }

  const docPassport = memory.documents.find(
    (d) =>
      d.employeeId === norm.employeeId &&
      (d.documentType === "photograph" || d.title?.toLowerCase().includes("passport"))
  )?.fileUrl;

  const passportPhoto =
    norm.personal.passportPhotoUrl ||
    docPassport ||
    (norm.personal.avatarPreference !== "custom" ? norm.personal.avatarUrl : undefined);
  const pref = norm.personal.avatarPreference || "passport";

  let activeAvatar = norm.personal.avatarUrl;
  if (pref === "passport" && passportPhoto) {
    activeAvatar = passportPhoto;
  } else if (pref === "custom" && norm.personal.customAvatarUrl) {
    activeAvatar = norm.personal.customAvatarUrl;
  } else if (passportPhoto) {
    activeAvatar = passportPhoto;
  }

  return {
    ...norm,
    personal: {
      ...norm.personal,
      passportPhotoUrl: passportPhoto || norm.personal.passportPhotoUrl,
      avatarPreference: pref,
      avatarUrl:
        activeAvatar ||
        norm.personal.avatarUrl ||
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    },
  };
}

export async function getEmployees(): Promise<Employee[]> {
  let list = memory.employees;
  try {
    list = fromStore(await getCollectionFromFirestore<Employee>("employees"), memory.employees);
  } catch (e) {
    console.warn("Firestore getEmployees fallback:", e);
  }

  if (!isFirestoreConfigured() && (!list || list.length === 0) && isLocalEnvironment()) {
    list = INITIAL_EMPLOYEES;
    memory.employees = [...INITIAL_EMPLOYEES];
  }

  return list.map(normalizeEmployee);
}

export async function getEmployeeById(idOrEmpId: string): Promise<Employee | null> {
  const raw = await loadEmployeeForUpdate(idOrEmpId);
  return raw ? normalizeEmployee(raw) : null;
}

/**
 * The stored (un-normalised) employee document, by employee ID or document ID.
 * With Firestore configured only Firestore is consulted.
 */
async function loadEmployeeForUpdate(idOrEmpId: string): Promise<Employee | null> {
  const wanted = idOrEmpId.toLowerCase();
  if (isFirestoreConfigured()) {
    // Documents are keyed by employeeId ("EMP-0049").
    for (const key of Array.from(new Set([idOrEmpId, idOrEmpId.toUpperCase()]))) {
      const direct = await getDocumentFromFirestore<Employee>("employees", key).catch(() => null);
      if (direct) return direct;
    }
    const all = await getCollectionFromFirestore<Employee>("employees").catch(() => [] as Employee[]);
    return all.find((e) => e.id === idOrEmpId || e.employeeId.toLowerCase() === wanted) || null;
  }
  return memory.employees.find((e) => e.employeeId.toLowerCase() === wanted || e.id === idOrEmpId) || null;
}

/** Raised when a request conflicts with existing data (the API maps it to HTTP 409). */
export class ConflictError extends Error {}

/** Raised when a request is missing something required (the API maps it to HTTP 400). */
export class ValidationError extends Error {}

/**
 * Issues the next employee ID inside a transaction, from a counter document. If the counter is
 * missing it starts after the highest existing ID, and it skips any ID that already has a document.
 * Must be called before any write in the same transaction.
 */
async function allocateEmployeeId(tx: Transaction, db: Firestore): Promise<string> {
  const counterRef = db.collection("counters").doc("employees");
  const counter = await tx.get(counterRef);
  const stored = counter.exists ? counter.data()?.last : undefined;
  let last: number;
  if (typeof stored === "number") {
    last = stored;
  } else {
    const all = await tx.get(db.collection("employees"));
    last = maxEmployeeNumber(all.docs.map((d) => d.id));
  }

  let next = last + 1;
  for (let i = 0; i < 50; i++, next++) {
    const taken = await tx.get(db.collection("employees").doc(formatEmployeeId(next)));
    if (!taken.exists) break;
  }
  tx.set(counterRef, { last: next });
  return formatEmployeeId(next);
}

/** Creates an employee under a freshly allocated ID. A collision fails instead of overwriting anyone. */
async function insertEmployeeWithNewId(build: (employeeId: string) => Employee): Promise<Employee> {
  if (!isFirestoreConfigured()) {
    const employeeId = nextEmployeeId(memory.employees.map((e) => e.employeeId));
    const emp = build(employeeId);
    memory.employees.unshift(emp);
    return emp;
  }
  return withTransaction(
    async (tx, db) => {
      const employeeId = await allocateEmployeeId(tx, db);
      const emp = build(employeeId);
      tx.create(db.collection("employees").doc(employeeId), toFirestoreData(emp));
      return emp;
    },
    ["employees", "counters"]
  );
}

export async function createEmployee(
  data: Omit<Employee, "id" | "employeeId" | "createdAt" | "updatedAt">,
  actor: { name: string; role: string }
): Promise<Employee> {
  const now = new Date().toISOString();
  const newEmp = await insertEmployeeWithNewId((employeeId) => ({
    ...data,
    id: employeeId,
    employeeId,
    personal: { ...data.personal, employeeId },
    createdAt: now,
    updatedAt: now,
  }));

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "EMPLOYEE_CREATED",
    employeeId: newEmp.employeeId,
    employeeName: newEmp.personal.fullName,
    details: `Added new employee ${newEmp.personal.fullName} (${newEmp.employeeId}) to branch ${newEmp.employment.branch}`,
  });

  return newEmp;
}

/** The placeholder employee used for people who have no real employee record yet. Out of payroll via "Candidate". */
function buildTemporaryEmployee(employeeId: string, name: string, email: string, branch: Branch, department?: string): Employee {
  const now = new Date().toISOString();
  return {
    id: employeeId,
    employeeId,
    personal: {
      employeeId,
      firstName: name.split(" ")[0] || name,
      lastName: name.split(" ").slice(1).join(" "),
      fullName: name,
      dob: "",
      gender: "Other",
      mobileNumber: "",
      personalEmail: email,
      workEmail: email,
      address: "",
      emergencyContact: { name: "", relationship: "", phone: "" },
    },
    employment: {
      dateOfJoining: getISTDateString(),
      department: department || "Unassigned",
      designation: "Temporary (no employee record yet)",
      branch,
      workLocation: `${branch} Branch`,
      employmentType: "Full-time",
      employmentStatus: "Candidate",
      probationMonths: 0,
      employeeCategory: "Temporary",
    },
    statutory: { pan: "", aadhaar: "", uan: "", pfAccountNumber: "", bankAccountNumber: "", ifscCode: "", bankName: "" },
    currentSalary: calculateSalaryFromMonthly({ monthlyAmount: 0, salaryBasis: "incentive_only", includePf: false }),
    salaryHistory: [],
    isTemporary: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Adds a temporary employee for a person typed in by name (for example a Login Sheet row for someone who has no
 * employee record). A temporary employee already saved under the same name is reused, so typing the same
 * name twice never creates two people. A real (non-temporary) employee with that name is not reused: the picker is for those.
 */
export async function createTemporaryEmployeeByName(
  name: string,
  branch: Branch | undefined,
  actor: { name: string; role: string }
): Promise<Employee> {
  const clean = name.trim().replace(/\s+/g, " ");
  const existing = (await getEmployees()).find(
    (e) => e.isTemporary && (e.personal?.fullName || "").trim().toLowerCase() === clean.toLowerCase()
  );
  if (existing) return existing;

  const emp = await insertEmployeeWithNewId((employeeId) =>
    buildTemporaryEmployee(employeeId, clean, "", branch || "Delhi")
  );
  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "EMPLOYEE_CREATED",
    employeeId: emp.employeeId,
    employeeName: clean,
    details: `Created temporary employee ${clean} (${emp.employeeId}) from a typed name. Attach it to the real employee later.`,
  });
  return emp;
}

export interface AttachTemporaryResult {
  target: Employee;
  loginSheetRows: number;
  loginRecords: number;
  incentives: number;
  /** True when the temporary record's login account was moved onto the registered employee. */
  accountMoved: boolean;
}

/**
 * Merges a temporary employee into a registered one: their Login Sheet rows, monthly login records and
 * manual incentives move to the registered employee, and the temporary record is then removed.
 * A login account on the temporary record is moved to the registered employee. Refuses
 * (ConflictError / ValidationError) when the source is not temporary, both records have a login
 * account, or the source has an incentive already paid in a payroll run.
 */
export async function attachTemporaryEmployee(
  temporaryId: string,
  targetId: string,
  actor: { name: string; role: string }
): Promise<AttachTemporaryResult> {
  const temp = await loadEmployeeForUpdate(temporaryId);
  if (!temp) throw new ValidationError("The temporary employee was not found.");
  if (!temp.isTemporary) throw new ValidationError("Only a temporary employee can be attached to another employee.");
  const target = await loadEmployeeForUpdate(targetId);
  if (!target) throw new ValidationError("The employee to attach to was not found.");
  if (target.isTemporary) throw new ValidationError("Choose a registered employee, not another temporary one.");
  if (target.employeeId === temp.employeeId) throw new ValidationError("Choose a different employee.");
  // A login account on the temporary record moves to the registered employee, so the person keeps their
  // login. Two accounts for one person is a decision for a human, so that case stays blocked.
  // Only accounts that are really stored count: getAllUserAccounts() invents in-memory placeholder accounts for
  // employees with none, and one of those must not block a merge.
  const tempAccount = await getStoredUserAccountByEmployeeId(temp.employeeId);
  if (tempAccount && (await getStoredUserAccountByEmployeeId(target.employeeId))) {
    throw new ConflictError(
      `Both ${temp.employeeId} and ${target.employeeId} have their own login account, so they cannot be merged automatically. Remove one account first.`
    );
  }

  const tempId = temp.employeeId;
  const targetName = target.personal.fullName;
  const byEmployee = <T extends { employeeId: string }>(rows: T[]) => rows.filter((r) => r.employeeId === tempId);
  const query = async <T extends { employeeId: string }>(collection: string, memoryRows: T[]): Promise<T[]> =>
    isFirestoreConfigured()
      ? await queryCollectionFromFirestore<T>(collection, [{ field: "employeeId", op: "==", value: tempId }])
      : byEmployee(memoryRows);

  const incentives = await query<EmployeeIncentiveRecord>("incentives", memory.employeeIncentives);
  if (incentives.some((i) => i.payrollRunId)) {
    throw new ConflictError("This temporary employee has an incentive that was already paid in a payroll run, so it cannot be merged.");
  }
  const sheetRows = await query<LoginSheetEntry>(LOGIN_SHEET_COLLECTION, memory.loginSheet);
  const loginRecords = await query<EmployeeLoginRecord>("employee_logins", memory.employeeLogins);

  // 0. The login account follows the person (checks above all passed, so nothing is left half-done).
  if (tempAccount) await updateUserAccount(tempAccount.uid, { employeeId: target.employeeId });

  // 1. Login Sheet rows keep everything but their owner.
  const now = new Date().toISOString();
  for (const row of sheetRows) {
    const moved: LoginSheetEntry = { ...row, employeeId: target.employeeId, empName: targetName, updatedAt: now, updatedBy: actor.name };
    upsertMemory(memory.loginSheet, (e) => e.id === moved.id, moved);
    await persist(LOGIN_SHEET_COLLECTION, moved.id, moved);
  }
  invalidateFirestoreCache(LOGIN_SHEET_COLLECTION);

  // 2. Monthly login records: re-keyed to the target, or merged into the target's record for that month.
  for (const rec of loginRecords) {
    const newId = `login-${target.employeeId}-${rec.month}`;
    const existing = await getEmployeeLoginById(newId);
    let merged: EmployeeLoginRecord;
    if (!existing) {
      merged = {
        ...rec,
        id: newId,
        employeeId: target.employeeId,
        employeeName: targetName,
        department: target.employment.department,
        branch: target.employment.branch,
        lastUpdatedAt: now,
        updatedBy: actor.name,
      };
    } else {
      const banks = [...(existing.banks || []), ...(rec.banks || [])];
      const sum = (k: "totalDisbursal" | "axisBankDisbursal" | "otherBanksDisbursal") => Number(existing[k] || 0) + Number(rec[k] || 0);
      const totals =
        banks.length > 0
          ? totalsFromBanks(banks)
          : { banks, totalDisbursal: sum("totalDisbursal"), axisBankDisbursal: sum("axisBankDisbursal"), otherBanksDisbursal: sum("otherBanksDisbursal") };
      merged = {
        ...existing,
        ...totals,
        loginsCount: Number(existing.loginsCount || 0) + Number(rec.loginsCount || 0),
        remarks: [existing.remarks, rec.remarks].filter(Boolean).join(" | "),
        lastUpdatedAt: now,
        updatedBy: actor.name,
      };
    }
    upsertMemory(memory.employeeLogins, (l) => l.id === merged.id, merged);
    await persist("employee_logins", merged.id, merged);
    memory.employeeLogins = memory.employeeLogins.filter((l) => l.id !== rec.id || l.id === merged.id);
    if (rec.id !== merged.id) await persistDelete("employee_logins", rec.id);
  }

  // 3. Incentives calculated from logins are dropped (recalculating gives the target's own figure);
  //    hand-made ones move to the target.
  for (const inc of incentives) {
    if (inc.sourceLoginRecordId) {
      memory.employeeIncentives = memory.employeeIncentives.filter((i) => i.id !== inc.id);
      await persistDelete("incentives", inc.id);
    } else {
      const moved: EmployeeIncentiveRecord = { ...inc, employeeId: target.employeeId, employeeName: targetName };
      upsertMemory(memory.employeeIncentives, (i) => i.id === moved.id, moved);
      await persist("incentives", moved.id, moved);
    }
  }

  // 4. The temporary record is no longer needed (nor any placeholder account that was made up for it).
  memory.userAccounts = (memory.userAccounts || []).filter((u) => u.employeeId !== tempId);
  memory.employees = memory.employees.filter((e) => e.employeeId !== tempId);
  await persistDelete("employees", temp.employeeId);
  invalidateFirestoreCache("employees");

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "EMPLOYEE_UPDATED",
    employeeId: target.employeeId,
    employeeName: targetName,
    details: `Attached temporary employee ${temp.personal.fullName} (${tempId}) to ${targetName} (${target.employeeId}): moved ${sheetRows.length} login sheet rows, ${loginRecords.length} monthly login records and ${incentives.filter((i) => !i.sourceLoginRecordId).length} incentives${tempAccount ? `, and moved the login account (${tempAccount.email}) onto ${target.employeeId}` : ""}.`,
  });

  return {
    target,
    loginSheetRows: sheetRows.length,
    loginRecords: loginRecords.length,
    incentives: incentives.length,
    accountMoved: Boolean(tempAccount),
  };
}

/**
 * Creates a temporary employee record under the account's own employee ID when that ID has no
 * employee record yet, so entries made as that person hang on a real employee. It is marked
 * `isTemporary` and given the "Candidate" status, which keeps it out of payroll and active headcount.
 * Nothing is overwritten: an existing record, however it appeared, is left untouched.
 * Returns the record that was created, or null when one already existed.
 */
export async function ensureTemporaryEmployee(
  account: { employeeId: string; name: string; email?: string; branch: Branch; department?: string },
  actor: { name: string; role: string }
): Promise<Employee | null> {
  const employeeId = (account.employeeId || "").trim();
  if (!employeeId || employeeId.toUpperCase() === "PENDING") return null;
  if (await loadEmployeeForUpdate(employeeId)) return null;

  const name = (account.name || employeeId).trim();
  const emp = buildTemporaryEmployee(employeeId, name, account.email || "", account.branch || "Delhi", account.department);

  if (isFirestoreConfigured()) {
    const created = await withTransaction(
      async (tx, db) => {
        const ref = db.collection("employees").doc(employeeId);
        if ((await tx.get(ref)).exists) return false;
        tx.create(ref, toFirestoreData(emp));
        return true;
      },
      ["employees"]
    );
    if (!created) return null;
  } else {
    if (memory.employees.some((e) => e.employeeId.toLowerCase() === employeeId.toLowerCase())) return null;
    memory.employees.unshift(emp);
  }

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "EMPLOYEE_CREATED",
    employeeId,
    employeeName: name,
    details: `Created temporary employee record for ${name} (${employeeId}): the login account had no employee record. Attach it to the real employee later.`,
  });
  return emp;
}

export interface UpdateEmployeeAvatarInput {
  avatarUrl?: string;
  passportPhotoUrl?: string;
  customAvatarUrl?: string;
  avatarPreference?: "passport" | "custom";
}

export async function updateEmployeeBranch(
  employeeId: string,
  branch: Branch,
  actor: { name: string; role: string }
): Promise<Employee | null> {
  const current = await loadEmployeeForUpdate(employeeId);
  if (!current) return null;

  const oldBranch = current.employment.branch || "Delhi";
  const emp: Employee = {
    ...current,
    employment: { ...current.employment, branch, workLocation: `${branch} Branch` },
    updatedAt: new Date().toISOString(),
  };
  upsertMemory(memory.employees, (e) => e.employeeId === emp.employeeId, emp);
  await persist("employees", emp.employeeId, emp);

  // Keep the login account in sync: branch scope is read from the account on every request
  const users = await getAllUserAccounts();
  const acc = users.find((u) => u.employeeId?.toLowerCase() === emp.employeeId.toLowerCase());
  if (acc) await updateUserAccount(acc.uid, { branch });

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "EMPLOYEE_UPDATED",
    employeeId: emp.employeeId,
    employeeName: emp.personal.fullName,
    details: `Branch changed from ${oldBranch} to ${branch}`,
  });

  return emp;
}

export async function updateEmployeeStatutory(
  employeeId: string,
  input: Partial<Pick<StatutoryInfo, "pan" | "aadhaar" | "uan" | "pfAccountNumber" | "bankAccountNumber" | "ifscCode" | "bankName">>,
  actor: { name: string; role: string }
): Promise<Employee | null> {
  const current = await loadEmployeeForUpdate(employeeId);
  if (!current) return null;

  const statutory = { ...current.statutory };
  const changed: string[] = [];
  for (const key of ["pan", "aadhaar", "uan", "pfAccountNumber", "bankAccountNumber", "ifscCode", "bankName"] as const) {
    const v = input[key];
    if (typeof v === "string" && v.trim() !== (statutory[key] || "")) {
      statutory[key] = key === "pan" || key === "ifscCode" ? v.trim().toUpperCase() : v.trim();
      changed.push(key);
    }
  }

  const updated: Employee = { ...current, statutory, updatedAt: new Date().toISOString() };
  upsertMemory(memory.employees, (e) => e.employeeId === updated.employeeId, updated);
  await persist("employees", updated.employeeId, updated);

  if (changed.length > 0) {
    await recordAuditLog({
      who: actor.name,
      role: actor.role,
      action: "STATUTORY_UPDATED",
      employeeId: updated.employeeId,
      employeeName: updated.personal.fullName,
      details: `Updated statutory/banking fields: ${changed.join(", ")}`,
    });
  }
  return updated;
}

export async function updateEmployeeAvatar(
  employeeId: string,
  input: UpdateEmployeeAvatarInput,
  actor: { name: string; role: string }
): Promise<Employee | null> {
  const currentEmp = await loadEmployeeForUpdate(employeeId);
  if (!currentEmp) return null;

  const employeeDocs = await getDocuments(currentEmp.employeeId);
  const isPassportDoc = (d: EmployeeDocument) =>
    d.documentType === "photograph" || Boolean(d.title?.toLowerCase().includes("passport"));
  const existingPassportDoc = employeeDocs.find(isPassportDoc);

  const newPassportUrl =
    input.passportPhotoUrl !== undefined
      ? input.passportPhotoUrl
      : currentEmp.personal.passportPhotoUrl || existingPassportDoc?.fileUrl;
  const newCustomUrl = input.customAvatarUrl !== undefined ? input.customAvatarUrl : currentEmp.personal.customAvatarUrl;
  const newPreference =
    input.avatarPreference !== undefined ? input.avatarPreference : currentEmp.personal.avatarPreference || "passport";

  let effectiveAvatarUrl = input.avatarUrl;
  if (!effectiveAvatarUrl) {
    if (newPreference === "custom" && newCustomUrl) {
      effectiveAvatarUrl = newCustomUrl;
    } else {
      const nonCustomAvatar =
        currentEmp.personal.avatarUrl && currentEmp.personal.avatarUrl !== currentEmp.personal.customAvatarUrl
          ? currentEmp.personal.avatarUrl
          : undefined;
      effectiveAvatarUrl =
        newPassportUrl || nonCustomAvatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150";
    }
  }

  const updatedPersonal: PersonalInfo = {
    ...currentEmp.personal,
    avatarUrl: effectiveAvatarUrl,
    passportPhotoUrl: newPassportUrl,
    customAvatarUrl: newCustomUrl,
    avatarPreference: newPreference,
  };

  const updatedEmp: Employee = {
    ...currentEmp,
    personal: updatedPersonal,
    updatedAt: new Date().toISOString(),
  };

  upsertMemory(memory.employees, (e) => e.employeeId === updatedEmp.employeeId, updatedEmp);
  await persist("employees", updatedEmp.employeeId, updatedEmp);

  // Sync the avatar onto the matching login account
  const accounts = await getAllUserAccounts();
  const userAcc = accounts.find(
    (u) =>
      u.employeeId.toLowerCase() === updatedEmp.employeeId.toLowerCase() ||
      u.email.toLowerCase() === updatedEmp.personal.workEmail.toLowerCase() ||
      u.email.toLowerCase() === updatedEmp.personal.personalEmail.toLowerCase()
  );
  if (userAcc) await updateUserAccount(userAcc.uid, { avatar: effectiveAvatarUrl });

  // If a passport photo was newly provided or changed, ensure a verified EmployeeDocument exists
  if (input.passportPhotoUrl) {
    if (existingPassportDoc) {
      const updatedDoc = { ...existingPassportDoc, fileUrl: input.passportPhotoUrl };
      upsertMemory(memory.documents, (d) => d.id === updatedDoc.id, updatedDoc);
      await persist("documents", updatedDoc.id, updatedDoc);
    } else {
      const newDoc: EmployeeDocument = {
        id: `doc-${Date.now()}-${randomBytes(3).toString("hex")}`,
        employeeId: updatedEmp.employeeId,
        employeeName: updatedEmp.personal.fullName,
        documentType: "photograph",
        title: "Passport Size Photograph",
        fileUrl: input.passportPhotoUrl,
        uploadedBy: actor.name,
        uploadDate: new Date().toISOString(),
        status: "Verified",
        notes: "Official KYC passport photo registered",
      };
      memory.documents.unshift(newDoc);
      await persist("documents", newDoc.id, newDoc);
    }
  }

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "PROFILE_PHOTO_UPDATED",
    employeeId: updatedEmp.employeeId,
    employeeName: updatedEmp.personal.fullName,
    details: `Updated profile picture preference to "${newPreference}". (Active avatar: ${effectiveAvatarUrl})`,
  });

  return updatedEmp;
}

export type SalaryRevisionInput = {
  newAnnualCtc?: number;
  monthlySalary?: number;
  salaryBasis?: "monthly_net" | "monthly_gross" | "monthly_ctc" | "incentive_only";
  includePf?: boolean;
  pfType?: "percentage" | "fixed";
  pfValue?: number;
  revisionReason?: string;
  isIncentiveOnly?: boolean;
};

export async function reviseSalary(
  employeeId: string,
  salaryParam: number | SalaryRevisionInput,
  revisionReasonArg?: string,
  actorArg?: { name: string; role: string },
  optionsArg?: {
    monthlySalary?: number;
    includePf?: boolean;
    salaryBasis?: "monthly_net" | "monthly_gross" | "monthly_ctc" | "incentive_only";
    pfType?: "percentage" | "fixed";
    pfValue?: number;
    isIncentiveOnly?: boolean;
  }
): Promise<Employee | null> {
  const currentEmp = await loadEmployeeForUpdate(employeeId);
  if (!currentEmp) return null;

  let newAnnualCtc = 0;
  let monthlySalary: number | undefined;
  let salaryBasis: "monthly_net" | "monthly_gross" | "monthly_ctc" | "incentive_only" = "monthly_net";
  let includePf = true;
  let pfType: "percentage" | "fixed" = "percentage";
  let pfValue = 12;
  let revisionReason = "Salary Revision";
  const actor = actorArg || { name: "System", role: "admin" };
  let isIncentiveOnly = false;

  if (typeof salaryParam === "number") {
    newAnnualCtc = salaryParam;
    revisionReason = revisionReasonArg || "Salary Revision";
    if (optionsArg) {
      monthlySalary = optionsArg.monthlySalary;
      if (optionsArg.includePf !== undefined) includePf = optionsArg.includePf;
      if (optionsArg.salaryBasis) salaryBasis = optionsArg.salaryBasis;
      if (optionsArg.pfType) pfType = optionsArg.pfType;
      if (optionsArg.pfValue !== undefined) pfValue = optionsArg.pfValue;
      if (optionsArg.isIncentiveOnly) isIncentiveOnly = optionsArg.isIncentiveOnly;
    }
  } else {
    newAnnualCtc = salaryParam.newAnnualCtc || 0;
    monthlySalary = salaryParam.monthlySalary;
    if (salaryParam.includePf !== undefined) includePf = salaryParam.includePf;
    if (salaryParam.salaryBasis) salaryBasis = salaryParam.salaryBasis;
    if (salaryParam.pfType) pfType = salaryParam.pfType;
    if (salaryParam.pfValue !== undefined) pfValue = salaryParam.pfValue;
    if (salaryParam.isIncentiveOnly) isIncentiveOnly = salaryParam.isIncentiveOnly;
    revisionReason = salaryParam.revisionReason || revisionReasonArg || "Salary Revision";
  }

  let newComponents: SalaryComponent;
  if (salaryBasis === "incentive_only" || isIncentiveOnly) {
    newComponents = calculateSalaryFromMonthly({
      monthlyAmount: 0,
      salaryBasis: "incentive_only",
      includePf: false,
    });
  } else if (monthlySalary && monthlySalary > 0) {
    newComponents = calculateSalaryFromMonthly({
      monthlyAmount: monthlySalary,
      salaryBasis,
      includePf,
      pfType,
      pfValue,
    });
  } else {
    newComponents = calculateSalaryBreakdown(newAnnualCtc, includePf, pfType, pfValue);
  }

  const revisionRecord: SalaryRevisionRecord = {
    id: `rev-${Date.now()}`,
    effectiveFrom: getISTDateString(),
    annualCtc: newComponents.annualCtc,
    monthlySalary: newComponents.grossSalary,
    netSalary: newComponents.netSalary,
    includePf: Boolean(newComponents.includePf),
    pfType: newComponents.pfType,
    pfValue: newComponents.pfValue,
    salaryBasis,
    isIncentiveOnly: Boolean(newComponents.isIncentiveOnly || salaryBasis === "incentive_only" || isIncentiveOnly),
    components: newComponents,
    revisionReason,
    updatedBy: actor.name,
    createdAt: new Date().toISOString(),
  };

  const updatedEmp: Employee = {
    ...currentEmp,
    currentSalary: newComponents,
    salaryHistory: [revisionRecord, ...(currentEmp.salaryHistory || [])],
    updatedAt: new Date().toISOString(),
  };

  upsertMemory(memory.employees, (e) => e.employeeId === updatedEmp.employeeId, updatedEmp);
  await persist("employees", updatedEmp.employeeId, updatedEmp);

  const pfDescription = includePf
    ? (pfType === "fixed" ? `₹${newComponents.employeePf} Fixed` : `${pfValue}% of Basic (₹${newComponents.employeePf})`)
    : "Excluded";

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "SALARY_REVISED",
    employeeId: updatedEmp.employeeId,
    employeeName: updatedEmp.personal.fullName,
    details: `Revised salary: Net In-Hand ₹${(newComponents.netSalary || 0).toLocaleString("en-IN")}/mo, PF: ${pfDescription}, Gross ₹${newComponents.grossSalary.toLocaleString("en-IN")}/mo - ${revisionReason}`,
  });

  return updatedEmp;
}

// ----------------- ATTENDANCE -----------------

export interface AttendanceQuery {
  date?: string;
  from?: string; // inclusive YYYY-MM-DD
  to?: string; // inclusive YYYY-MM-DD
  employeeId?: string;
}

/**
 * Reads attendance with the filtering done by the database. Always prefer passing a
 * date / range / employee — an unfiltered call loads the whole (ever-growing) collection.
 */
export async function getAttendanceRecords(dateOrQuery?: string | AttendanceQuery): Promise<AttendanceRecord[]> {
  const q: AttendanceQuery = typeof dateOrQuery === "string" ? { date: dateOrQuery } : dateOrQuery || {};
  const inMemory = (a: AttendanceRecord) =>
    (!q.date || a.date === q.date) &&
    (!q.from || a.date >= q.from) &&
    (!q.to || a.date <= q.to) &&
    (!q.employeeId || a.employeeId === q.employeeId);

  try {
    let docs: AttendanceRecord[];
    if (q.date) {
      docs = await queryCollectionFromFirestore<AttendanceRecord>("attendance", [{ field: "date", op: "==", value: q.date }]);
    } else if (q.from || q.to) {
      const filters: QueryFilter[] = [];
      if (q.from) filters.push({ field: "date", op: ">=", value: q.from });
      if (q.to) filters.push({ field: "date", op: "<=", value: q.to });
      docs = await queryCollectionFromFirestore<AttendanceRecord>("attendance", filters);
    } else if (q.employeeId) {
      docs = await queryCollectionFromFirestore<AttendanceRecord>("attendance", [
        { field: "employeeId", op: "==", value: q.employeeId },
      ]);
    } else {
      docs = await getCollectionFromFirestore<AttendanceRecord>("attendance");
    }
    // Remaining conditions (single-field queries only → no composite indexes required)
    docs = docs.filter(inMemory);
    if (isFirestoreConfigured() || docs.length > 0) return docs;
  } catch (e) {
    console.warn("Firestore getAttendanceRecords fallback:", e);
  }

  return memory.attendance.filter(inMemory);
}

export async function createAttendanceRecord(
  data: Omit<AttendanceRecord, "id">,
  actor: { name: string; role: string }
): Promise<AttendanceRecord> {
  const record: AttendanceRecord = {
    ...data,
    id: `att-${Date.now()}`,
  };

  memory.attendance.unshift(record);

  // Sync to Firestore
  await persist("attendance", record.id, record);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ATTENDANCE_PUNCH",
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    details: `Clock-in registered at ${record.checkIn} IST on ${record.date}`,
  });

  return record;
}

export async function updateAttendanceRecord(
  recordId: string,
  updates: Partial<AttendanceRecord>,
  actor: { name: string; role: string }
): Promise<AttendanceRecord | null> {
  const current = await loadForUpdate<AttendanceRecord>("attendance", recordId, memory.attendance, (a) => a.id === recordId);
  if (!current) return null;

  const updated: AttendanceRecord = { ...current, ...updates };
  if (updates.status !== undefined) {
    // lateArrival feeds the weekly late count. Late sets it; a Half Day keeps whatever it already was
    // (an automatic late half day stays counted, a manual one does not start counting); anything else
    // (Present, Leave, ...) clears it, which is how HR excuses a late arrival.
    updated.lateArrival = updates.status === "Late" || (updates.status === "Half Day" && current.lateArrival);
  }
  upsertMemory(memory.attendance, (a) => a.id === recordId, updated);

  // Sync to Firestore
  await persist("attendance", recordId, updated);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ATTENDANCE_ADJUSTED",
    employeeId: updated.employeeId,
    employeeName: updated.employeeName,
    details: `Attendance adjusted for date ${updated.date} (Status: ${updated.status})`,
  });

  return updated;
}

export async function clearAttendanceRecords(actor?: { name: string; role: string }): Promise<number> {
  memory.attendance = [];
  const deletedCount = await clearCollectionInFirestore("attendance");

  await recordAuditLog({
    who: actor?.name || "System Admin",
    role: actor?.role || "admin",
    action: "ATTENDANCE_CLEARED",
    details: `Purged all attendance records for a fresh start (${deletedCount} documents deleted from Firestore)`,
  });

  return deletedCount;
}

export async function getOffices(): Promise<OfficeLocation[]> {
  try {
    const firestoreDocs = await getCollectionFromFirestore<OfficeLocation>("offices");
    if (firestoreDocs && firestoreDocs.length > 0) {
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getOffices fallback:", e);
  }
  if (!memory.offices) {
    memory.offices = isLocalEnvironment() ? [...INITIAL_OFFICES] : [];
  }
  return memory.offices;
}

export async function getOfficeById(id: string): Promise<OfficeLocation | null> {
  const offices = await getOffices();
  return offices.find((o) => o.id === id) || null;
}

export async function saveOffice(
  office: OfficeLocation,
  actor: { name: string; role: string }
): Promise<OfficeLocation> {
  if (!memory.offices) {
    memory.offices = isLocalEnvironment() ? [...INITIAL_OFFICES] : [];
  }
  const index = memory.offices.findIndex((o) => o.id === office.id);
  const now = new Date().toISOString();
  const updatedOffice: OfficeLocation = {
    ...office,
    updatedAt: now,
    createdAt: office.createdAt || now,
  };

  if (index >= 0) {
    memory.offices[index] = updatedOffice;
  } else {
    memory.offices.push(updatedOffice);
  }

  await persist("offices", updatedOffice.id, updatedOffice);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "OFFICE_SAVED",
    details: `Configured office geofence for ${updatedOffice.name} (Radius: ${updatedOffice.allowedRadiusMeters}m)`,
  });

  return updatedOffice;
}

export async function deleteOffice(
  id: string,
  actor: { name: string; role: string }
): Promise<boolean> {
  if (!memory.offices) {
    memory.offices = isLocalEnvironment() ? [...INITIAL_OFFICES] : [];
  }
  const office =
    (await loadForUpdate<OfficeLocation>("offices", id, memory.offices, (o) => o.id === id)) ||
    memory.offices.find((o) => o.id === id);
  if (!office) return false;

  memory.offices = memory.offices.filter((o) => o.id !== id);
  await persistDelete("offices", id);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "OFFICE_DELETED",
    details: `Deleted office geofence for ${office.name}`,
  });

  return true;
}

/** The login account of an employee (the role, and so the timing slot, lives on the account). */
export async function getUserAccountByEmployeeId(employeeId: string): Promise<UserAccount | null> {
  if (isFirestoreConfigured()) {
    try {
      const fresh = await queryFreshFromFirestore<UserAccount>("users", "employeeId", employeeId);
      if (fresh.length > 0) return fresh[0];
    } catch (e) {
      console.warn("Firestore account lookup by employee id failed:", e);
    }
  }
  const wanted = employeeId.toLowerCase();
  return (memory.userAccounts || []).find((u) => (u.employeeId || "").toLowerCase() === wanted) || null;
}

/** Like getUserAccountByEmployeeId, but only a stored account counts, never an in-memory placeholder. */
async function getStoredUserAccountByEmployeeId(employeeId: string): Promise<UserAccount | null> {
  if (isFirestoreConfigured()) {
    return (await queryFreshFromFirestore<UserAccount>("users", "employeeId", employeeId))[0] ?? null;
  }
  const wanted = employeeId.toLowerCase();
  return (memory.userAccounts || []).find((u) => (u.employeeId || "").toLowerCase() === wanted) || null;
}

/**
 * The timing profile an employee follows (from their role's slot) and, for profiles with
 * automatic half-day rules, how many late arrivals they already have in the Monday-Saturday week of `date`.
 */
export async function getEmployeeTiming(
  employeeId: string,
  date: string = getISTDateString(),
  policyOverride?: AttendancePolicy
): Promise<{ profile: TimingProfile; lateCountThisWeek: number; weekStart: string; weekEnd: string }> {
  const policy = policyOverride || (await getPolicy());
  const account = await getUserAccountByEmployeeId(employeeId);
  // Branch first (Delhi has its own timing for everyone), then the role's slot.
  const employee = await getEmployeeById(employeeId);
  const profile = resolveTimingForEmployee({
    branch: employee?.employment?.branch || account?.branch,
    roleId: account?.role,
    roles: await getCustomRoles(),
    policy,
  });
  const { start, end } = weekBoundsIST(date);

  let lateCountThisWeek = 0;
  if (profile.halfDayRules) {
    const countFrom = profile.effectiveFrom && profile.effectiveFrom > start ? profile.effectiveFrom : start;
    const week = await getAttendanceRecords({ from: start, to: end, employeeId });
    lateCountThisWeek = week.filter((r) => r.date >= countFrom && r.date < date && r.lateArrival).length;
  }
  return { profile, lateCountThisWeek, weekStart: start, weekEnd: end };
}

export async function punchAttendance(
  employeeId: string,
  type: "checkIn" | "checkOut",
  actor: { name: string; role: string },
  locationData?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  }
): Promise<AttendanceRecord> {
  // Reject clock-out since Credit Expert India operations only use clock-in
  if (type === "checkOut") {
    throw new Error("Clock-out is disabled. Attendance is automatically completed upon Clock-In.");
  }

  // Calculate today's date and current punch time strictly in Indian Standard Time (IST)
  const today = getISTDateString();
  const nowTime = getIST24HourTime();

  const emp = (await getEmployeeById(employeeId)) || undefined;
  const employeeName = emp?.personal?.fullName || actor.name;
  const policy = await getPolicy();

  // Single-punch-per-day enforcement with cloud store verification
  const todayRecords = await getAttendanceRecords(today);
  const existingRecord = todayRecords.find(
    (a) => a.employeeId.toLowerCase() === employeeId.toLowerCase()
  );

  if (existingRecord && existingRecord.checkIn && existingRecord.checkIn !== "--") {
    throw new Error("You have already clocked in for today.");
  }

  let distanceMeters: number | undefined;
  let verificationStatus: LocationVerificationStatus = "MANUAL_OVERRIDE";
  let matchedOffice: OfficeLocation | undefined;

  // Perform Server-Side GPS & Geofence Validation if location is supplied
  if (locationData) {
    const offices = await getOffices();
    const resolved = resolveAttendanceOffice(offices, emp?.employment?.branch);
    if (!resolved.office) {
      throw new Error(resolved.error || "No active office location is assigned to your branch. Please contact HR.");
    }
    matchedOffice = resolved.office;

    // Check accuracy limit
    const maxAccuracy = matchedOffice.maxAccuracyMeters || 100;
    if (locationData.accuracy > maxAccuracy) {
      throw new Error(
        `GPS accuracy is too low (${Math.round(locationData.accuracy)}m). Maximum allowed is ${maxAccuracy}m. Please step outdoors or enable high-accuracy GPS and try again.`
      );
    }

    // Calculate server distance
    distanceMeters = calculateHaversineDistance(
      locationData.latitude,
      locationData.longitude,
      matchedOffice.latitude,
      matchedOffice.longitude
    );

    // Geofence check
    if (distanceMeters > matchedOffice.allowedRadiusMeters) {
      throw new Error(
        `You are outside the allowed office attendance area. Current distance: ${distanceMeters}m. Allowed radius: ${matchedOffice.allowedRadiusMeters}m from ${matchedOffice.name}.`
      );
    }

    verificationStatus = "VERIFIED";
  }

  // Late / Present / auto Half Day per the employee's role timing slot, in IST
  const resolvedEmployeeId = emp?.employeeId || employeeId;
  const timing = await getEmployeeTiming(resolvedEmployeeId, today, policy);
  const decision = decideArrivalStatus({
    punchTimeIST: nowTime,
    profile: timing.profile,
    priorLateCountThisWeek: timing.lateCountThisWeek,
  });

  const newRec: AttendanceRecord = {
    id: `att-${Date.now()}`,
    employeeId: resolvedEmployeeId,
    employeeName,
    date: today,
    checkIn: nowTime,
    totalWorkingHours: policy.fullDayMinHours || 8,
    breakDurationMinutes: (policy.standardBreakHours || 1) * 60,
    status: decision.status,
    lateArrival: decision.lateArrival,
    earlyDeparture: false,
    overtimeHours: 0,
    remarks:
      (locationData
        ? `GPS Clock-In (${distanceMeters}m from ${matchedOffice?.name || "Office"})`
        : "Manual / Admin Check-In") + (decision.reason ? ` · ${decision.reason}` : ""),
    checkInLatitude: locationData?.latitude,
    checkInLongitude: locationData?.longitude,
    checkInAccuracy: locationData ? Math.round(locationData.accuracy) : undefined,
    checkInDistanceMeters: distanceMeters,
    checkInLocationStatus: verificationStatus,
    checkInOfficeId: matchedOffice?.id,
    checkInOfficeName: matchedOffice?.name,
  };

  memory.attendance.unshift(newRec);
  await persist("attendance", newRec.id, newRec);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ATTENDANCE_CLOCK_IN",
    employeeId: newRec.employeeId,
    employeeName: newRec.employeeName,
    details: `Clocked in at ${nowTime} IST on ${today} (Distance: ${distanceMeters ?? "N/A"}m, Status: ${newRec.status})`,
  });

  return newRec;
}

export const adjustAttendance = updateAttendanceRecord;

/**
 * HR/Admin sheet edit: update the record for (employee, date) or create it if the cell was blank.
 */
export async function upsertAttendanceRecord(
  employee: { employeeId: string; employeeName: string },
  date: string,
  updates: Partial<Pick<AttendanceRecord, "status" | "checkIn" | "remarks">>,
  actor: { name: string; role: string }
): Promise<AttendanceRecord> {
  const existing = (await getAttendanceRecords(date)).find((r) => r.employeeId === employee.employeeId);
  if (existing) {
    const updated = await updateAttendanceRecord(existing.id, updates, actor);
    if (updated) return updated;
  }
  const status = updates.status || "Present";
  return createAttendanceRecord(
    {
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      date,
      checkIn: updates.checkIn || undefined,
      totalWorkingHours: 0,
      breakDurationMinutes: 0,
      status,
      lateArrival: status === "Late",
      earlyDeparture: false,
      overtimeHours: 0,
      remarks: updates.remarks || "Added manually by HR",
    },
    actor
  );
}

// ----------------- LEAVES -----------------

export async function getLeaveRequests(employeeId?: string): Promise<LeaveRequest[]> {
  let list: LeaveRequest[] = memory.leaves;
  try {
    list = fromStore(await getCollectionFromFirestore<LeaveRequest>("leaves"), memory.leaves);
  } catch (e) {
    console.warn("Firestore getLeaveRequests fallback:", e);
  }
  return newestFirst(employeeId ? list.filter((l) => l.employeeId === employeeId) : list, (l) => l.appliedOn);
}

export async function createLeaveRequest(
  data: Omit<LeaveRequest, "id" | "appliedOn" | "status">,
  actor: { name: string; role: string }
): Promise<LeaveRequest> {
  const newLeave: LeaveRequest = {
    ...data,
    id: `lev-${Date.now()}`,
    status: "Pending",
    appliedOn: new Date().toISOString(),
  };

  memory.leaves.unshift(newLeave);

  // Sync to Firestore
  await persist("leaves", newLeave.id, newLeave);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LEAVE_APPLIED",
    employeeId: newLeave.employeeId,
    employeeName: newLeave.employeeName,
    details: `Applied for ${newLeave.days} day(s) of ${newLeave.leaveType} leave (${newLeave.startDate} to ${newLeave.endDate})`,
  });

  return newLeave;
}

export async function updateLeaveRequest(
  leaveId: string,
  status: "Approved" | "Rejected",
  reviewNotes: string,
  actor: { name: string; role: string }
): Promise<LeaveRequest | null> {
  const current = await loadForUpdate<LeaveRequest>("leaves", leaveId, memory.leaves, (l) => l.id === leaveId);
  if (!current) return null;
  if (current.status !== "Pending") {
    throw new ConflictError(`This leave request was already ${current.status.toLowerCase()}.`);
  }

  const leave: LeaveRequest = {
    ...current,
    status,
    reviewedBy: actor.name,
    reviewedAt: new Date().toISOString(),
    reviewNotes,
  };
  upsertMemory(memory.leaves, (l) => l.id === leaveId, leave);

  // Sync to Firestore
  await persist("leaves", leaveId, leave);

  // If approved, mark every working day of the leave in attendance (not just the first day).
  // Sundays, the employee's branch holidays and days that already have a record are skipped.
  if (status === "Approved") {
    const emp = await getEmployeeById(leave.employeeId).catch(() => null);
    const holidayDates = new Set(
      (await getHolidays(emp?.employment.branch)).map((h) => h.date).filter((d) => d >= leave.startDate && d <= leave.endDate)
    );
    const existing = await getAttendanceRecords({
      from: leave.startDate,
      to: leave.endDate,
      employeeId: leave.employeeId,
    });
    const taken = new Set(existing.map((r) => r.date));

    for (const date of leaveWorkingDates(leave.startDate, leave.endDate, holidayDates)) {
      if (taken.has(date)) continue;
      const attRecord: AttendanceRecord = {
        id: `att-lev-${leaveId}-${date}`,
        employeeId: leave.employeeId,
        employeeName: leave.employeeName,
        date,
        checkIn: "--",
        checkOut: "--",
        totalWorkingHours: 0,
        breakDurationMinutes: 0,
        status: "Leave",
        lateArrival: false,
        earlyDeparture: false,
        overtimeHours: 0,
        remarks: `Leave: ${leave.leaveType}`,
      };
      upsertMemory(memory.attendance, (a) => a.id === attRecord.id, attRecord);
      await persist("attendance", attRecord.id, attRecord);
    }
  }

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: `LEAVE_${status.toUpperCase()}`,
    employeeId: leave.employeeId,
    employeeName: leave.employeeName,
    details: `${status} ${leave.days} day(s) of ${leave.leaveType} leave for ${leave.employeeName}`,
  });

  return leave;
}

export async function applyLeave(
  data: {
    employeeId: string;
    employeeName: string;
    department?: string;
    leaveType: any;
    startDate: string;
    endDate: string;
    days?: number;
    reason?: string;
  },
  actor: { name: string; role: string }
): Promise<LeaveRequest> {
  const emp = memory.employees.find(
    (e) => e.employeeId.toLowerCase() === data.employeeId.toLowerCase() || e.id === data.employeeId
  );
  return createLeaveRequest(
    {
      employeeId: emp?.employeeId || data.employeeId,
      employeeName: data.employeeName || emp?.personal.fullName || actor.name,
      department: data.department || emp?.employment.department || "General",
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      days: data.days || 1,
      reason: data.reason || "",
    },
    actor
  );
}

export const reviewLeave = updateLeaveRequest;

// ----------------- PAYROLL -----------------

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  let runs: PayrollRun[] = memory.payrollRuns;
  try {
    runs = fromStore(await getCollectionFromFirestore<PayrollRun>("payroll_runs"), memory.payrollRuns);
  } catch (e) {
    console.warn("Firestore getPayrollRuns fallback:", e);
  }
  // Newest first: Firestore returns documents in ID order, and callers treat runs[0] as the latest run.
  return [...runs].sort(
    (a, b) => (b.month || "").localeCompare(a.month || "") || (b.createdAt || "").localeCompare(a.createdAt || "")
  );
}

export async function getPayrollRunById(runIdOrCode: string): Promise<PayrollRun | null> {
  try {
    const single = await getDocumentFromFirestore<PayrollRun>("payroll_runs", runIdOrCode);
    if (single) return single;
  } catch (e) {}

  const runs = await getPayrollRuns();
  return runs.find((r) => r.id === runIdOrCode || r.runCode === runIdOrCode) || null;
}

export async function savePayrollRun(
  run: PayrollRun,
  actor: { name: string; role: string }
): Promise<PayrollRun> {
  upsertMemory(memory.payrollRuns, (r) => r.id === run.id || r.runCode === run.runCode, run);

  await persist("payroll_runs", run.runCode, run);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "PAYROLL_UPDATED",
    details: `Payroll run ${run.runCode} (${run.month}) updated to status: ${run.status}`,
  });

  return run;
}

// ----------------- INCENTIVES -----------------

export async function getIncentiveSchemes(): Promise<IncentiveScheme[]> {
  if (!isFirestoreConfigured()) {
    if (memory.incentiveSchemes.length === 0) memory.incentiveSchemes = [...INITIAL_INCENTIVE_SCHEMES];
    return memory.incentiveSchemes;
  }
  const stored = await getCollectionFromFirestore<IncentiveScheme>("incentive_schemes").catch(() => []);
  if (stored.length > 0) return stored;

  // First use: store the standard schemes so edits made later are kept.
  try {
    for (const scheme of INITIAL_INCENTIVE_SCHEMES) await persist("incentive_schemes", scheme.id, scheme);
  } catch (e) {
    console.warn("Could not seed incentive schemes:", e);
  }
  return [...INITIAL_INCENTIVE_SCHEMES];
}

export async function getEmployeeIncentives(month?: string): Promise<EmployeeIncentiveRecord[]> {
  try {
    const stored = month
      ? await queryCollectionFromFirestore<EmployeeIncentiveRecord>("incentives", [
          { field: "month", op: "==", value: month },
        ])
      : await getCollectionFromFirestore<EmployeeIncentiveRecord>("incentives");
    if (isFirestoreConfigured()) return stored;
  } catch (e) {
    console.warn("Firestore getEmployeeIncentives fallback:", e);
  }
  return month ? memory.employeeIncentives.filter((i) => i.month === month) : memory.employeeIncentives;
}

export async function recordEmployeeIncentive(
  data: Omit<EmployeeIncentiveRecord, "id">,
  actor: { name: string; role: string }
): Promise<EmployeeIncentiveRecord> {
  const record: EmployeeIncentiveRecord = {
    ...data,
    id: `inc-${Date.now()}`,
  };

  memory.employeeIncentives.unshift(record);

  await persist("incentives", record.id, record);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "INCENTIVE_RECORDED",
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    details: `Recorded incentive of ₹${record.incentiveAmount} under '${record.schemeName}' for ${record.month}`,
  });

  return record;
}

export const addIncentiveRecord = recordEmployeeIncentive;

export async function updateEmployeeIncentive(
  id: string,
  updates: Partial<EmployeeIncentiveRecord>,
  actor: { name: string; role: string }
): Promise<EmployeeIncentiveRecord | null> {
  const current = await loadForUpdate<EmployeeIncentiveRecord>("incentives", id, memory.employeeIncentives, (i) => i.id === id);
  if (!current) return null;

  const updated: EmployeeIncentiveRecord = {
    ...current,
    ...updates,
    id: current.id,
  };

  upsertMemory(memory.employeeIncentives, (i) => i.id === id, updated);
  await persist("incentives", updated.id, updated);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "INCENTIVE_UPDATED",
    employeeId: updated.employeeId,
    employeeName: updated.employeeName,
    details: `Updated incentive record to ₹${updated.incentiveAmount} (Status: ${updated.status})`,
  });

  return updated;
}

export async function deleteEmployeeIncentive(
  id: string,
  actor: { name: string; role: string }
): Promise<boolean> {
  const removed = await loadForUpdate<EmployeeIncentiveRecord>("incentives", id, memory.employeeIncentives, (i) => i.id === id);
  if (!removed) return false;

  memory.employeeIncentives = memory.employeeIncentives.filter((i) => i.id !== id);
  await persistDelete("incentives", id);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "INCENTIVE_DELETED",
    employeeId: removed.employeeId,
    employeeName: removed.employeeName,
    details: `Deleted incentive record of ₹${removed.incentiveAmount} for ${removed.month}`,
  });

  return true;
}

export async function updateIncentiveScheme(
  id: string,
  updates: Partial<IncentiveScheme>,
  actor: { name: string; role: string }
): Promise<IncentiveScheme | null> {
  const existing = (await getIncentiveSchemes()).find((sch) => sch.id === id);
  const scheme: IncentiveScheme = existing
    ? { ...existing, ...updates, id }
    : {
        name: "Custom Scheme",
        type: "slab",
        description: "",
        active: true,
        ...updates,
        id,
      };

  upsertMemory(memory.incentiveSchemes, (sch) => sch.id === id, scheme, false);
  await persist("incentive_schemes", id, scheme);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "INCENTIVE_SCHEME_UPDATED",
    details: `Updated incentive scheme ${id}`,
  });

  return scheme;
}

// ----------------- LOGIN SHEET (daily Excel-style file tracker) -----------------

// ----------------- LENDER BANKS (remembered names) -----------------
const LENDER_BANKS_COLLECTION = "lender_banks";

type LenderBankDoc = { id: string; name: string; createdAt: string; addedBy: string };

async function readSavedLenderBanks(): Promise<LenderBankDoc[]> {
  if (isFirestoreConfigured()) {
    return (await getCollectionFromFirestore<LenderBankDoc>(LENDER_BANKS_COLLECTION)) ?? [];
  }
  return memory.lenderBanks;
}

/** Built-in banks followed by every name saved before, without duplicates. */
export async function getLenderBanks(): Promise<string[]> {
  let saved: LenderBankDoc[] = [];
  try {
    saved = await readSavedLenderBanks();
  } catch (e) {
    console.warn("getLenderBanks fallback:", e);
  }
  const names = [...saved].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).map((b) => b.name);
  return mergeBankLists(PRESET_LENDER_BANKS, names.sort((a, b) => a.localeCompare(b)));
}

/**
 * Remembers bank names so they are offered next time. Names already known (built-in or saved) are
 * skipped. Never throws: a failure here must not fail the login or import that triggered it.
 * Returns the names that were newly saved.
 */
export async function rememberLenderBanks(names: unknown[], addedBy: string): Promise<string[]> {
  try {
    const known = new Set(mergeBankLists(PRESET_LENDER_BANKS).map(bankKey));
    const saved = await readSavedLenderBanks();
    for (const b of saved) known.add(bankKey(b.name));

    const added: string[] = [];
    for (const raw of names) {
      const name = cleanBankName(raw);
      const key = bankKey(name);
      if (!key || known.has(key)) continue;
      if (saved.length + added.length >= MAX_SAVED_BANKS) break;
      known.add(key);
      const doc: LenderBankDoc = { id: key, name, createdAt: new Date().toISOString(), addedBy };
      if (!isFirestoreConfigured()) memory.lenderBanks.push(doc);
      await persist(LENDER_BANKS_COLLECTION, doc.id, doc);
      added.push(name);
    }
    return added;
  } catch (e) {
    console.warn("rememberLenderBanks failed:", e);
    return [];
  }
}

const LOGIN_SHEET_COLLECTION = "login_sheet";

export async function getLoginSheetEntryById(id: string): Promise<LoginSheetEntry | null> {
  return loadForUpdate<LoginSheetEntry>(LOGIN_SHEET_COLLECTION, id, memory.loginSheet, (e) => e.id === id);
}

/** Rows whose date falls in [from, to] (inclusive, "YYYY-MM-DD"). Newest first. */
export async function getLoginSheetEntries(from: string, to: string): Promise<LoginSheetEntry[]> {
  let rows: LoginSheetEntry[];
  if (isFirestoreConfigured()) {
    rows = await queryCollectionFromFirestore<LoginSheetEntry>(LOGIN_SHEET_COLLECTION, [
      { field: "date", op: ">=", value: from },
      { field: "date", op: "<=", value: to },
    ]);
  } else {
    rows = memory.loginSheet.filter((e) => e.date >= from && e.date <= to);
  }
  return [...rows].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.time || "").localeCompare(a.time || "") ||
      (b.createdAt || "").localeCompare(a.createdAt || "")
  );
}

export async function createLoginSheetEntries(
  owner: { employeeId: string; empName: string },
  inputs: LoginSheetInput[],
  actor: { name: string; role: string }
): Promise<LoginSheetEntry[]> {
  const now = new Date().toISOString();
  const created: LoginSheetEntry[] = [];
  for (const input of inputs) {
    const entry: LoginSheetEntry = {
      ...input,
      id: `ls-${globalThis.crypto.randomUUID()}`,
      employeeId: owner.employeeId,
      empName: owner.empName,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.name,
    };
    upsertMemory(memory.loginSheet, (e) => e.id === entry.id, entry);
    await persist(LOGIN_SHEET_COLLECTION, entry.id, entry);
    created.push(entry);
  }

  await rememberLenderBanks(inputs.map((i) => i.bankName), actor.name);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LOGIN_SHEET_ADDED",
    employeeId: owner.employeeId,
    employeeName: owner.empName,
    details: `Added ${created.length} login sheet ${created.length === 1 ? "row" : "rows"}: ${created
      .map((e) => `${e.customerName} / ${e.bankName} (${e.status})`)
      .join(", ")}`,
  });
  return created;
}

/** Replaces the editable fields of a row. `owner` (admin/HR only) reassigns it to another employee. */
export async function updateLoginSheetEntry(
  id: string,
  input: LoginSheetInput,
  owner: { employeeId: string; empName: string } | null,
  actor: { name: string; role: string }
): Promise<LoginSheetEntry | null> {
  const existing = await loadForUpdate<LoginSheetEntry>(LOGIN_SHEET_COLLECTION, id, memory.loginSheet, (e) => e.id === id);
  if (!existing) return null;

  // Optional fields the caller cleared must be removed, so start from the row without them.
  const {
    panNo: _p, phone: _ph, location: _l, time: _t, dsaName: _d, loginId: _li, product: _pr, branch: _b,
    file: _f, remarks: _r, insuranceDetails: _i, amount2: _a2, ...kept
  } = existing;
  void _p; void _ph; void _l; void _t; void _d; void _li; void _pr; void _b; void _f; void _r; void _i; void _a2;

  const record: LoginSheetEntry = {
    ...kept,
    ...input,
    employeeId: owner?.employeeId ?? existing.employeeId,
    empName: owner?.empName ?? existing.empName,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.name,
  };
  upsertMemory(memory.loginSheet, (e) => e.id === id, record);
  await persist(LOGIN_SHEET_COLLECTION, id, record);
  // The query cache merges writes into cached rows, which would bring back a field the user just cleared.
  invalidateFirestoreCache(LOGIN_SHEET_COLLECTION);
  await rememberLenderBanks([record.bankName], actor.name);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LOGIN_SHEET_UPDATED",
    employeeId: record.employeeId,
    employeeName: record.empName,
    details: `Updated login sheet row: ${record.customerName} / ${record.bankName} (${existing.status} → ${record.status})`,
  });
  return record;
}

export async function deleteLoginSheetEntry(id: string, actor: { name: string; role: string }): Promise<boolean> {
  const removed = await getLoginSheetEntryById(id);
  if (!removed) return false;

  memory.loginSheet = memory.loginSheet.filter((e) => e.id !== id);
  await persistDelete(LOGIN_SHEET_COLLECTION, id);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LOGIN_SHEET_DELETED",
    employeeId: removed.employeeId,
    employeeName: removed.empName,
    details: `Deleted login sheet row: ${removed.customerName} / ${removed.bankName}`,
  });
  return true;
}

export async function getEmployeeLoginById(id: string): Promise<EmployeeLoginRecord | null> {
  try {
    const stored = await getDocumentFromFirestore<EmployeeLoginRecord>("employee_logins", id);
    if (stored) return stored;
  } catch (e) {
    console.warn("Firestore getEmployeeLoginById fallback:", e);
  }
  return memory.employeeLogins.find((l) => l.id === id) || null;
}

export async function deleteEmployeeLogin(
  id: string,
  actor: { name: string; role: string }
): Promise<boolean> {
  const removed = await getEmployeeLoginById(id);
  if (!removed) return false;

  memory.employeeLogins = memory.employeeLogins.filter((l) => l.id !== id);
  await persistDelete("employee_logins", id);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LOGIN_DELETED",
    employeeId: removed.employeeId,
    employeeName: removed.employeeName,
    details: `Deleted login record for ${removed.month}`,
  });

  return true;
}

export interface DeleteAllLoginDataResult {
  loginRecords: number;
  loginSheetRows: number;
}

/**
 * Deletes ALL login data of one employee, across every month: the saved Logins & Disbursals records and every
 * Login Sheet row. Both go because the hub re-adds Login Sheet rows to each record on every read, so deleting
 * only the saved record would bring the row straight back. Incentives are left alone.
 */
export async function deleteAllEmployeeLoginData(
  employeeId: string,
  actor: { name: string; role: string }
): Promise<DeleteAllLoginDataResult> {
  const query = async <T extends { employeeId: string }>(collection: string, memoryRows: T[]): Promise<T[]> =>
    isFirestoreConfigured()
      ? await queryCollectionFromFirestore<T>(collection, [{ field: "employeeId", op: "==", value: employeeId }])
      : memoryRows.filter((r) => r.employeeId === employeeId);

  const records = await query<EmployeeLoginRecord>("employee_logins", memory.employeeLogins);
  const rows = await query<LoginSheetEntry>(LOGIN_SHEET_COLLECTION, memory.loginSheet);

  for (const r of records) await persistDelete("employee_logins", r.id);
  for (const r of rows) await persistDelete(LOGIN_SHEET_COLLECTION, r.id);
  memory.employeeLogins = memory.employeeLogins.filter((l) => l.employeeId !== employeeId);
  memory.loginSheet = memory.loginSheet.filter((e) => e.employeeId !== employeeId);

  const emp = await getEmployeeById(employeeId);
  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LOGIN_DELETED",
    employeeId,
    employeeName: emp?.personal.fullName || records[0]?.employeeName || rows[0]?.empName || employeeId,
    details: `Deleted all login data: ${records.length} monthly login records and ${rows.length} login sheet rows.`,
  });

  return { loginRecords: records.length, loginSheetRows: rows.length };
}

export async function getEmployeeLogins(month?: string): Promise<EmployeeLoginRecord[]> {
  const targetMonth = month || getISTDateString().slice(0, 7);

  // Read only this month's records (not the whole, ever-growing collection).
  let stored: EmployeeLoginRecord[] = [];
  try {
    stored = await queryCollectionFromFirestore<EmployeeLoginRecord>("employee_logins", [
      { field: "month", op: "==", value: targetMonth },
    ]);
  } catch (e) {
    console.warn("Firestore getEmployeeLogins fallback:", e);
  }

  const byId = new Map<string, EmployeeLoginRecord>();
  for (const l of memory.employeeLogins) if (l.month === targetMonth) byId.set(l.id, l);
  for (const d of stored) {
    byId.set(d.id, d);
    const idx = memory.employeeLogins.findIndex((l) => l.id === d.id);
    if (idx >= 0) memory.employeeLogins[idx] = d;
    else memory.employeeLogins.push(d);
  }

  // Every active employee gets a row. Employees with no saved record yet get an EMPTY,
  // zeroed placeholder (never fabricated numbers, never written to the database) that is
  // only persisted when someone actually saves it — it uses the same deterministic id.
  const employees = await getEmployees();
  for (const emp of employees) {
    if (["Exited", "Terminated", "Resigned"].includes(emp.employment.employmentStatus as string)) continue;
    if ([...byId.values()].some((l) => l.employeeId === emp.employeeId)) continue;
    const id = `login-${emp.employeeId}-${targetMonth}`;
    byId.set(id, {
      id,
      employeeId: emp.employeeId,
      employeeName: emp.personal.fullName,
      department: emp.employment.department,
      branch: emp.employment.branch,
      month: targetMonth,
      commitment: 0,
      loginCommitment: 0,
      loginsCount: 0,
      totalDisbursal: 0,
      axisBankDisbursal: 0,
      otherBanksDisbursal: 0,
      banks: [],
      remarks: "",
      lastUpdatedAt: "",
    });
  }

  // Login Sheet rows feed the record automatically (files count, banks, customers, disbursals).
  const rowsByEmployee = groupByEmployee(await getLoginSheetEntries(`${targetMonth}-01`, `${targetMonth}-31`));
  for (const [employeeId, rows] of rowsByEmployee) {
    if ([...byId.values()].some((l) => l.employeeId === employeeId)) continue;
    // Someone with sheet rows but no record yet (e.g. left the company, or not in the directory).
    const emp = employees.find((e) => e.employeeId === employeeId);
    const id = `login-${employeeId}-${targetMonth}`;
    byId.set(id, {
      id,
      employeeId,
      employeeName: emp?.personal.fullName || rows[0].empName,
      department: emp?.employment.department,
      branch: emp?.employment.branch ?? rows[0].branch,
      month: targetMonth,
      commitment: 0,
      loginCommitment: 0,
      loginsCount: 0,
      totalDisbursal: 0,
      axisBankDisbursal: 0,
      otherBanksDisbursal: 0,
      banks: [],
      remarks: "",
      lastUpdatedAt: "",
    });
  }

  // Never invent targets: a missing/invalid login target is simply 0 ("not set").
  return [...byId.values()].map((l) =>
    applySheetRows(
      typeof l.loginCommitment === "number" && l.loginCommitment > 0 ? l : { ...l, loginCommitment: 0 },
      rowsByEmployee.get(l.employeeId) ?? []
    )
  );
}

export async function saveEmployeeLogin(
  data: Partial<EmployeeLoginRecord> & { employeeId: string; month: string },
  actor: { name: string; role: string }
): Promise<EmployeeLoginRecord> {
  const employees = await getEmployees();
  const emp = employees.find((e) => e.employeeId === data.employeeId);
  const targetMonth = data.month;
  // Deterministic id → one record per employee per month (no duplicates on repeated saves)
  const id = data.id || `login-${data.employeeId}-${targetMonth}`;

  // Only the hand-entered part is stored. Cases pulled from the Login Sheet are added again on every read,
  // so they are stripped here (the page sends back the combined record it received).
  const manual = totalsFromBanks(stripSheetEntries(data.banks || []));
  const banks = manual.banks;
  const { axisBankDisbursal, otherBanksDisbursal, totalDisbursal } = manual;

  // Merge with the stored record (Firestore-first) so fields the caller did not send are kept.
  const existing = await getEmployeeLoginById(id);

  // With sheet rows present the files count and totals shown on screen are computed, not typed:
  // keep the stored values instead of saving the computed ones as if someone had entered them.
  const sheetRows = (await getLoginSheetEntries(`${targetMonth}-01`, `${targetMonth}-31`)).filter(
    (r) => r.employeeId === data.employeeId
  );
  const fromSheet = sheetRows.length > 0;

  // Totals come from the hand-entered banks when there are any, or when the caller deleted the last one.
  // A record that only ever had typed totals (no banks) keeps them, unless the totals on screen were computed.
  const clearedAllBanks = Array.isArray(data.banks) && banks.length === 0 && (existing?.banks?.length ?? 0) > 0;
  const manualTotals = banks.length > 0 || clearedAllBanks;
  const legacyTotal = (key: "totalDisbursal" | "axisBankDisbursal" | "otherBanksDisbursal") =>
    Number((fromSheet ? undefined : data[key]) ?? existing?.[key] ?? 0);

  const record: EmployeeLoginRecord = {
    id: existing?.id || id,
    employeeId: data.employeeId,
    employeeName: data.employeeName || emp?.personal.fullName || existing?.employeeName || data.employeeId,
    department: data.department || emp?.employment.department || existing?.department || "Sales",
    branch: data.branch || emp?.employment.branch || existing?.branch || "Delhi",
    month: targetMonth,
    commitment: Number(data.commitment ?? existing?.commitment ?? 0),
    loginCommitment: Number(data.loginCommitment ?? existing?.loginCommitment ?? 0),
    loginsCount: Number((fromSheet ? existing?.loginsCount : data.loginsCount ?? existing?.loginsCount) ?? 0),
    submissionDate: data.submissionDate ?? existing?.submissionDate ?? getISTDateString(),
    lastLoginDate: fromSheet
      ? existing?.lastLoginDate ?? getISTDateString()
      : data.lastLoginDate ?? existing?.lastLoginDate ?? getISTDateString(),
    totalDisbursal: manualTotals ? totalDisbursal : legacyTotal("totalDisbursal"),
    axisBankDisbursal: manualTotals ? axisBankDisbursal : legacyTotal("axisBankDisbursal"),
    otherBanksDisbursal: manualTotals ? otherBanksDisbursal : legacyTotal("otherBanksDisbursal"),
    banks: manualTotals ? banks : existing?.banks || [],
    remarks: data.remarks ?? existing?.remarks ?? "",
    lastUpdatedAt: new Date().toISOString(),
    updatedBy: actor.name,
  };

  upsertMemory(memory.employeeLogins, (l) => l.id === record.id, record);
  await persist("employee_logins", record.id, record);
  await rememberLenderBanks(banks.map((b) => b.bankName), actor?.name || "User");

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LOGINS_UPDATED",
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    details: `Updated logins record for ${record.month} (Total Disbursal: ₹${record.totalDisbursal.toLocaleString("en-IN")}, Axis: ₹${record.axisBankDisbursal.toLocaleString("en-IN")})`,
  });

  // Hand back the same combined view the page loads, with the Login Sheet rows folded in.
  return applySheetRows(record, sheetRows);
}

export async function calculateAndSyncIncentivesFromLogins(
  month: string,
  actor: { name: string; role: string }
): Promise<EmployeeIncentiveRecord[]> {
  const employees = await getEmployees();
  const logins = await getEmployeeLogins(month);
  const existingForMonth = await getEmployeeIncentives(month);
  const slabScheme = (await getIncentiveSchemes()).find((sch) => sch.id === "scheme-disbursal-slab");
  const updatedRecords: EmployeeIncentiveRecord[] = [];

  for (const login of logins) {
    const emp = employees.find(
      (e) =>
        e.employeeId === login.employeeId ||
        e.personal?.fullName?.toLowerCase() === login.employeeName?.toLowerCase()
    );

    const breakdown = calculateDisbursalIncentive({
      monthlySalary: resolveIncentiveSalary(emp),
      hurdleMultiplier: slabScheme?.hurdleMultiplier,
      axisRatePerLakh: slabScheme?.axisRatePerLakh,
      totalDisbursal: login.totalDisbursal,
      axisBankDisbursal: login.axisBankDisbursal,
      otherBanksDisbursal: login.otherBanksDisbursal,
    });

    const existing = existingForMonth.find(
      (i) => i.employeeId === login.employeeId && i.schemeId === "scheme-disbursal-slab"
    );

    const record: EmployeeIncentiveRecord = {
      id: existing?.id ?? `inc-disbursal-${login.employeeId}-${month}`,
      employeeId: login.employeeId,
      employeeName: login.employeeName,
      month,
      schemeId: "scheme-disbursal-slab",
      schemeName: "Disbursal Slab Incentive (CreditExpert)",
      target: login.commitment,
      achievement: login.totalDisbursal,
      eligibleAmount: breakdown.remainingDisbursalForSlabs,
      incentiveAmount: breakdown.totalIncentive,
      status: "Approved",
      approvedBy: actor.name,
      approvedDate: getISTDateString(),
      calculationBreakdown: breakdown,
      sourceLoginRecordId: login.id,
    };

    upsertMemory(memory.employeeIncentives, (i) => i.id === record.id, record);
    await persist("incentives", record.id, record);
    updatedRecords.push(record);
  }

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "INCENTIVES_AUTO_CALCULATED",
    details: `Auto-calculated disbursal incentives for ${updatedRecords.length} employees for ${month}`,
  });

  return updatedRecords;
}

// ----------------- ASSETS -----------------

export async function getAssets(): Promise<AssetRecord[]> {
  let list: AssetRecord[] = memory.assets;
  try {
    list = fromStore(await getCollectionFromFirestore<AssetRecord>("assets"), memory.assets);
  } catch (e) {
    console.warn("Firestore getAssets fallback:", e);
  }
  return list;
}

export async function createAsset(
  data: Omit<AssetRecord, "id"> & { id?: string },
  actor: { name: string; role: string }
): Promise<AssetRecord> {
  // Assets are stored under their tag: never overwrite an existing asset
  const clash = await loadForUpdate<AssetRecord>("assets", data.assetTag, memory.assets, (a) => a.assetTag === data.assetTag);
  if (clash) {
    throw new Error(`Asset tag ${data.assetTag} already exists.`);
  }

  const item: AssetRecord = {
    ...data,
    id: data.id || `ast-${Date.now()}`,
  };
  memory.assets.unshift(item);

  await persist("assets", item.assetTag, item);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ASSET_CREATED",
    details: `Created asset ${item.assetTag} (${item.model}) - Status: ${item.status}`,
  });

  return item;
}

export async function updateAsset(
  assetTag: string,
  updates: Partial<AssetRecord>,
  actor: { name: string; role: string }
): Promise<AssetRecord | null> {
  // Assets are stored under their asset tag
  const current = await loadForUpdate<AssetRecord>("assets", assetTag, memory.assets, (a) => a.assetTag === assetTag);
  if (!current) return null;

  const item: AssetRecord = { ...current, ...updates, assetTag: current.assetTag };
  upsertMemory(memory.assets, (a) => a.assetTag === assetTag, item);

  await persist("assets", item.assetTag, item);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ASSET_UPDATED",
    details: `Updated asset ${assetTag} (Status: ${item.status})`,
  });

  return item;
}

// ----------------- REQUESTS -----------------

export async function getRequests(employeeId?: string): Promise<EmployeeRequestItem[]> {
  let list: EmployeeRequestItem[] = memory.requests;
  try {
    list = fromStore(await getCollectionFromFirestore<EmployeeRequestItem>("requests"), memory.requests);
  } catch (e) {
    console.warn("Firestore getRequests fallback:", e);
  }
  return newestFirst(employeeId ? list.filter((x) => x.employeeId === employeeId) : list, (r) => r.createdAt);
}

export async function createRequest(
  item: Partial<EmployeeRequestItem> & {
    employeeId: string;
    employeeName: string;
    requestType: any;
    subject: string;
    details: string;
  },
  actor: { name: string; role: string }
): Promise<EmployeeRequestItem> {
  const newReq: EmployeeRequestItem = {
    id: item.id || `req-${Date.now()}`,
    status: item.status || "Pending",
    createdAt: item.createdAt || new Date().toISOString(),
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    department: item.department || "General",
    requestType: item.requestType,
    subject: item.subject,
    details: item.details,
    resolutionNotes: item.resolutionNotes,
    resolvedBy: item.resolvedBy,
    resolvedAt: item.resolvedAt,
  };
  memory.requests.unshift(newReq);

  await persist("requests", newReq.id, newReq);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "REQUEST_SUBMITTED",
    employeeId: newReq.employeeId,
    employeeName: newReq.employeeName,
    details: `Submitted ${newReq.requestType} request: ${newReq.subject}`,
  });

  return newReq;
}

export async function updateRequest(
  requestId: string,
  updates: Partial<EmployeeRequestItem>,
  actor: { name: string; role: string }
): Promise<EmployeeRequestItem | null> {
  const current = await loadForUpdate<EmployeeRequestItem>("requests", requestId, memory.requests, (r) => r.id === requestId);
  if (!current) return null;

  const item: EmployeeRequestItem & { updatedAt: string } = { ...current, ...updates, updatedAt: new Date().toISOString() };
  upsertMemory(memory.requests, (r) => r.id === requestId, item);

  await persist("requests", item.id, item);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "REQUEST_UPDATED",
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    details: `Updated request ${requestId} to status: ${item.status}`,
  });

  return item;
}

export async function updateRequestStatus(
  requestId: string,
  status: "Pending" | "Approved" | "Rejected",
  resolutionNotes?: string,
  actor?: { name: string; role: string }
): Promise<EmployeeRequestItem | null> {
  return updateRequest(
    requestId,
    { status, resolutionNotes, resolvedAt: new Date().toISOString() },
    actor || { name: "System", role: "admin" }
  );
}

// ----------------- ANNOUNCEMENTS -----------------

export async function getAnnouncements(): Promise<AnnouncementItem[]> {
  let list: AnnouncementItem[] = memory.announcements;
  try {
    list = fromStore(await getCollectionFromFirestore<AnnouncementItem>("announcements"), memory.announcements);
  } catch (e) {
    console.warn("Firestore getAnnouncements fallback:", e);
  }
  return newestFirst(list, (a) => `${a.publishDate}|${a.id}`);
}

export async function createAnnouncement(
  data: Omit<AnnouncementItem, "id"> & { id?: string },
  actor: { name: string; role: string }
): Promise<AnnouncementItem> {
  const item: AnnouncementItem = {
    ...data,
    id: data.id || `ann-${Date.now()}`,
  };
  memory.announcements.unshift(item);

  await persist("announcements", item.id, item);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ANNOUNCEMENT_POSTED",
    details: `Posted announcement: "${item.title}" for audience: ${item.targetAudience}`,
  });

  return item;
}

// ----------------- DOCUMENTS -----------------

export async function getDocuments(employeeId?: string): Promise<EmployeeDocument[]> {
  let list: EmployeeDocument[] = memory.documents;
  try {
    list = fromStore(await getCollectionFromFirestore<EmployeeDocument>("documents"), memory.documents);
  } catch (e) {
    console.warn("Firestore getDocuments fallback:", e);
  }
  return newestFirst(employeeId ? list.filter((x) => x.employeeId === employeeId) : list, (d) => d.uploadDate);
}

export async function createDocument(
  data: Omit<EmployeeDocument, "id">,
  actor?: { name: string; role: string }
): Promise<EmployeeDocument> {
  const newDoc: EmployeeDocument = {
    ...data,
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
  };

  memory.documents.unshift(newDoc);
  await persist("documents", newDoc.id, newDoc);

  if (actor) {
    recordAuditLog({
      who: actor.name,
      role: actor.role,
      action: "DOCUMENT_UPLOADED",
      employeeId: newDoc.employeeId,
      employeeName: newDoc.employeeName,
      details: `Uploaded document ${newDoc.title} (${newDoc.documentType})`,
    }).catch(() => {});
  }

  return newDoc;
}

// ----------------- AUDIT LOGS -----------------

export async function getAuditLogs(): Promise<AuditLogItem[]> {
  let list: AuditLogItem[] = memory.auditLogs;
  try {
    // The latest 100 events, newest first (without ordering, "limit 100" returns an arbitrary 100)
    list = fromStore(
      await getCollectionFromFirestore<AuditLogItem>("audit_logs", {
        limitCount: 100,
        orderBy: { field: "timestamp", direction: "desc" },
      }),
      memory.auditLogs
    );
  } catch (e) {
    console.warn("Firestore getAuditLogs fallback:", e);
  }
  return newestFirst(list, (l) => l.timestamp);
}

// ----------------- ATTENDANCE POLICY -----------------

export async function getPolicy(): Promise<AttendancePolicy> {
  if (isFirestoreConfigured()) {
    const stored = await getDocumentFromFirestore<AttendancePolicy>("settings", "attendance_policy").catch(() => null);
    memory.policy = { ...INITIAL_POLICY, ...(stored || {}) };
  }
  return memory.policy;
}

export async function updatePolicy(
  updates: Partial<AttendancePolicy>,
  actor: { name: string; role: string }
): Promise<AttendancePolicy> {
  const next: AttendancePolicy = { ...(await getPolicy()), ...updates };
  await persist("settings", "attendance_policy", next);
  memory.policy = next;

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "POLICY_UPDATED",
    details: `Updated company attendance policy (Grace period: ${next.gracePeriodMinutes}m)`,
  });

  return next;
}

// ----------------- USERS -----------------


// ----------------- HOLIDAYS -----------------

export async function getHolidays(branch?: string): Promise<Holiday[]> {
  let holidays = memory.holidays;

  try {
    holidays = fromStore(await getCollectionFromFirestore<Holiday>("holidays"), memory.holidays);
  } catch (e) {
    console.warn("Firestore getHolidays fallback:", e);
  }

  if (branch && branch !== "All") {
    return holidays.filter((h) => h.branch === branch || h.branch === "All");
  }
  return holidays;
}

export async function createHoliday(
  holidayData: Omit<Holiday, "id">,
  actor: { name: string; role: string }
): Promise<Holiday> {
  const newHoliday: Holiday = {
    ...holidayData,
    id: `hol-${Date.now()}`,
  };

  memory.holidays.push(newHoliday);

  await persist("holidays", newHoliday.id, newHoliday);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "HOLIDAY_CREATED",
    details: `Created holiday '${newHoliday.name}' on ${newHoliday.date} for branch '${newHoliday.branch}'`,
  });

  return newHoliday;
}

export async function updateHoliday(
  id: string,
  updates: Partial<Holiday>,
  actor: { name: string; role: string }
): Promise<Holiday | null> {
  const current = await loadForUpdate<Holiday>("holidays", id, memory.holidays, (h) => h.id === id);
  if (!current) return null;

  const updatedHoliday: Holiday = { ...current, ...updates, id };
  upsertMemory(memory.holidays, (h) => h.id === id, updatedHoliday, false);

  await persist("holidays", id, updatedHoliday);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "HOLIDAY_UPDATED",
    details: `Updated holiday '${updatedHoliday.name}' for branch '${updatedHoliday.branch}'`,
  });

  return updatedHoliday;
}

export async function deleteHoliday(
  id: string,
  actor: { name: string; role: string }
): Promise<boolean> {
  const deleted = await loadForUpdate<Holiday>("holidays", id, memory.holidays, (h) => h.id === id);
  if (!deleted) return false;

  memory.holidays = memory.holidays.filter((h) => h.id !== id);
  await persistDelete("holidays", id);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "HOLIDAY_DELETED",
    details: `Deleted holiday '${deleted.name}' scheduled for ${deleted.date} (${deleted.branch})`,
  });

  return true;
}

// ============================================================================
// USER ACCOUNT & SINGLE ACTIVE SESSION ENGINE (FIRESTORE POWERED)
// ============================================================================

export async function getUserAccountByEmail(email: string): Promise<UserAccount | null> {
  const normalized = email.toLowerCase().trim();

  // Uncached lookup first: login, registration and activation must see the latest account state.
  if (isFirestoreConfigured()) {
    try {
      const fresh = await queryFreshFromFirestore<UserAccount>("users", "email", normalized);
      if (fresh.length > 0) return fresh[0];
    } catch (e) {
      console.warn("Firestore fresh account lookup failed:", e);
    }
  }

  try {
    const firestoreUsers = await getCollectionFromFirestore<UserAccount>("users");
    const found = firestoreUsers.find((u) => u.email.toLowerCase() === normalized);
    if (found) return found;
  } catch (e) {
    console.warn("Firestore getUserAccountByEmail fallback:", e);
  }

  // Only allow demo/seed account fallback on local host
  if (isLocalEnvironment()) {
    const memoryUser = memory.userAccounts.find((u) => u.email.toLowerCase() === normalized);
    if (memoryUser) return memoryUser;
  }

  return null;
}

export async function getUserAccountById(uid: string): Promise<UserAccount | null> {
  try {
    const doc = await getDocumentFromFirestore<UserAccount>("users", uid);
    if (doc) return doc;
  } catch (e) {
    console.warn("Firestore getUserAccountById fallback:", e);
  }

  // Only allow demo/seed account fallback on local host
  if (isLocalEnvironment()) {
    const memoryUser = memory.userAccounts.find((u) => u.uid === uid);
    if (memoryUser) return memoryUser;
  }

  return null;
}

export async function createUserAccount(user: UserAccount): Promise<UserAccount> {
  const normalized = user.email.toLowerCase().trim();

  // One login per email address
  const existing = await getUserAccountByEmail(normalized);
  if (existing && existing.uid !== user.uid) {
    throw new ConflictError("An account with this email address already exists.");
  }

  upsertMemory(memory.userAccounts, (u) => u.email.toLowerCase() === normalized, { ...(existing || {}), ...user }, false);
  await persist("users", user.uid, user);
  return user;
}

export async function updateUserAccount(
  uid: string,
  updates: Partial<UserAccount>
): Promise<UserAccount | null> {
  const current = await loadForUpdate<UserAccount>("users", uid, memory.userAccounts, (u) => u.uid === uid);
  if (!current) return null;

  const updated: UserAccount = { ...current, ...updates };
  upsertMemory(memory.userAccounts, (u) => u.uid === uid, updated, false);
  await persist("users", uid, updated);
  return updated;
}

/**
 * Brings the in-memory role list in line with Firestore (the source of truth), so roles saved or
 * deleted on another serverless instance are reflected here. System roles are always present.
 */
async function syncCustomRoles(): Promise<CustomRole[]> {
  const byId = new Map<string, CustomRole>();
  for (const def of DEFAULT_ROLES) byId.set(def.id, def);
  if (isFirestoreConfigured()) {
    try {
      const stored = await getCollectionFromFirestore<CustomRole>("custom_roles");
      for (const fr of stored) if (fr?.id) byId.set(fr.id, fr);
    } catch (e) {
      console.warn("Firestore custom roles fallback:", e);
    }
  } else {
    for (const r of memory.customRoles || []) if (r?.id) byId.set(r.id, r);
  }
  memory.customRoles = Array.from(byId.values());
  return memory.customRoles;
}

const ROLE_GRANTS_TTL_MS = 15_000;
let roleGrantsCache: { at: number; byRole: Map<string, Permission[]> } | null = null;

/**
 * Extra permissions the custom role carries. System roles (admin, hr, employee) have none here:
 * admin and HR hold everything already and the employee role is self-service only.
 * Cached briefly so authenticated requests do not each read the roles collection.
 */
export async function getCustomRoleGrants(roleId: string | undefined | null): Promise<Permission[]> {
  const id = (roleId || "").toString().toLowerCase().trim();
  if (!id || id === "admin" || id === "hr" || id === "employee") return [];
  if (!roleGrantsCache || Date.now() - roleGrantsCache.at > ROLE_GRANTS_TTL_MS) {
    const roles = await syncCustomRoles();
    const byRole = new Map<string, Permission[]>();
    for (const r of roles) byRole.set(r.id.toLowerCase().trim(), effectiveRoleGrants(r));
    roleGrantsCache = { at: Date.now(), byRole };
  }
  return roleGrantsCache.byRole.get(id) ?? [];
}

export async function getCustomRoles(): Promise<CustomRole[]> {
  await syncCustomRoles();

  // Calculate user counts for each role safely
  try {
    const allUsers = await getAllUserAccounts();
    return memory.customRoles.map((role) => {
      const targetRole = (role?.id || "").toString().toLowerCase().trim();
      const count = (allUsers || []).filter((u) => {
        const uRole = (u?.role || "employee").toString().toLowerCase().trim();
        return uRole === targetRole || (targetRole === "employee" && (!u?.role || uRole === "employee"));
      }).length;
      return {
        ...role,
        sections: Array.isArray(role.sections) ? role.sections : [],
        permissions: effectiveRoleGrants(role),
        userCount: count,
      };
    });
  } catch (err) {
    console.warn("getCustomRoles calculate user counts error:", err);
    return memory.customRoles.map((role) => ({
      ...role,
      sections: Array.isArray(role.sections) ? role.sections : [],
      permissions: effectiveRoleGrants(role),
      userCount: 0,
    }));
  }
}

export async function saveCustomRole(
  role: Partial<CustomRole> & { name: string; sections: string[] },
  actor?: { name: string; role: string }
): Promise<CustomRole> {
  await syncCustomRoles();
  const id =
    role.id ||
    `role-${role.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")}-${Date.now().toString().slice(-4)}`;
  const existingIdx = memory.customRoles.findIndex((r) => r.id === id);

  const fullRole: CustomRole = {
    id,
    name: role.name.trim(),
    description: role.description || `Custom role with ${role.sections.length} module permissions`,
    isSystem: role.isSystem || (existingIdx !== -1 ? memory.customRoles[existingIdx].isSystem : false),
    color: role.color || "indigo",
    sections: role.sections,
    permissions:
      role.permissions !== undefined
        ? sanitizeGrantedPermissions(role.permissions)
        : existingIdx !== -1
          ? memory.customRoles[existingIdx].permissions
          : undefined,
    timingSlot: role.timingSlot ?? (existingIdx !== -1 ? memory.customRoles[existingIdx].timingSlot : undefined),
    createdAt: existingIdx !== -1 ? memory.customRoles[existingIdx].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx !== -1) {
    memory.customRoles[existingIdx] = fullRole;
  } else {
    memory.customRoles.push(fullRole);
  }

  await persist("custom_roles", fullRole.id, fullRole);
  roleGrantsCache = null;

  if (actor) {
    await recordAuditLog({
      who: actor.name,
      role: actor.role,
      action: "ROLE_UPDATED",
      details: `Saved custom role "${fullRole.name}" with ${fullRole.sections.length} accessible sections`,
    });
  }

  return fullRole;
}

export async function deleteCustomRole(
  roleId: string,
  actor?: { name: string; role: string }
): Promise<boolean> {
  await syncCustomRoles();
  const target = memory.customRoles.find((r) => r.id === roleId);
  if (!target) return false;
  if (target.isSystem || ["admin", "hr", "employee"].includes(target.id)) {
    throw new Error("System default roles (Admin, HR, Employee) cannot be deleted.");
  }

  memory.customRoles = memory.customRoles.filter((r) => r.id !== roleId);
  await persistDelete("custom_roles", roleId);
  roleGrantsCache = null;

  // Reassign any users who had this role to employee
  for (const u of await getAllUserAccounts()) {
    if (u.role === roleId) {
      await updateUserAccount(u.uid, { role: "employee" });
    }
  }

  if (actor) {
    await recordAuditLog({
      who: actor.name,
      role: actor.role,
      action: "ROLE_DELETED",
      details: `Deleted custom role "${target.name}". Reassigned active users to Employee.`,
    });
  }

  return true;
}

export async function getAllUserAccounts(): Promise<UserAccount[]> {
  memory.userAccounts = memory.userAccounts || (isLocalEnvironment() ? [...SEED_USER_ACCOUNTS] : []);
  try {
    const firestoreUsers = await getCollectionFromFirestore<UserAccount>("users");
    if (firestoreUsers && firestoreUsers.length > 0) {
      for (const fu of firestoreUsers) {
        if (!fu) continue;
        const fuEmail = fu.email ? fu.email.toLowerCase().trim() : null;
        const idx = memory.userAccounts.findIndex(
          (u) =>
            (fu.uid && u.uid === fu.uid) ||
            (fuEmail && u.email && u.email.toLowerCase().trim() === fuEmail)
        );
        if (idx !== -1) {
          memory.userAccounts[idx] = fu;
        } else {
          memory.userAccounts.push(fu);
        }
      }
    }
  } catch (e) {
    console.warn("Firestore getAllUserAccounts fallback:", e);
  }

  // Ensure every Employee in the directory has a matching UserAccount representation
  try {
    const employees = await getEmployees();
    for (const emp of employees) {
      if (!emp || !emp.employeeId) continue;
      const empIdLower = emp.employeeId.toLowerCase().trim();
      const empWorkEmailLower = emp.personal?.workEmail ? emp.personal.workEmail.toLowerCase().trim() : null;

      const hasAccount = memory.userAccounts.some(
        (u) =>
          (u.employeeId && u.employeeId.toLowerCase().trim() === empIdLower) ||
          (empWorkEmailLower && u.email && u.email.toLowerCase().trim() === empWorkEmailLower)
      );
      if (!hasAccount) {
        const isExecutive =
          emp.employment?.department?.toLowerCase().includes("executive") || emp.employeeId === "EMP-001";
        const isHr =
          emp.employment?.department?.toLowerCase().includes("human") || emp.employeeId === "EMP-002";
        const newAcc: UserAccount = {
          uid: `usr-${emp.employeeId.toLowerCase().trim()}`,
          employeeId: emp.employeeId,
          email:
            emp.personal?.workEmail ||
            `${(emp.personal?.firstName || "employee").toLowerCase()}.${emp.employeeId.toLowerCase()}@creditexpertindia.com`,
          password: hashPassword(generateTempPassword()),
          name: emp.personal?.fullName || "Employee",
          role: isExecutive ? "admin" : isHr ? "hr" : "employee",
          branch: emp.employment?.branch || "Delhi",
          department: emp.employment?.department || "General Operations",
          avatar:
            emp.personal?.avatarUrl ||
            "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
          status: "Active",
          createdAt: emp.createdAt || new Date().toISOString(),
        };
        memory.userAccounts.push(newAcc);
      }
    }
  } catch (empErr) {
    console.warn("getAllUserAccounts employee sync error:", empErr);
  }

  return memory.userAccounts;
}

/**
 * Only the login accounts that are really stored. getAllUserAccounts() also builds placeholder
 * accounts (with made-up email addresses) for employees who have none, which must never be emailed.
 */
export async function getPersistedUserAccounts(): Promise<UserAccount[]> {
  if (isFirestoreConfigured()) {
    return getCollectionFromFirestore<UserAccount>("users");
  }
  return memory.userAccounts;
}

export async function assignUserRole(
  identifier: string,
  newRole: string,
  actor: { name: string; role: string }
): Promise<UserAccount> {
  // 1. Ensure user accounts are freshly synced
  await getAllUserAccounts().catch(() => {});
  const norm = (identifier || "").toString().toLowerCase().trim();

  let account = memory.userAccounts.find(
    (u) =>
      (u.uid && u.uid.toLowerCase().trim() === norm) ||
      (u.employeeId && u.employeeId.toLowerCase().trim() === norm) ||
      (u.email && u.email.toLowerCase().trim() === norm)
  );

  // 2. Direct Firestore fallback if not present in memory
  if (!account) {
    const directUser = await getUserAccountById(identifier).catch(() => null);
    if (directUser) {
      account = directUser;
      memory.userAccounts.push(account);
    }
  }

  // 3. Match against employees if not yet registered in users
  if (!account) {
    const employees = await getEmployees().catch(() => []);
    const emp = employees.find(
      (e) =>
        (e.employeeId && e.employeeId.toLowerCase().trim() === norm) ||
        (e.id && e.id.toLowerCase().trim() === norm)
    );
    if (emp) {
      account = {
        uid: `usr-${emp.employeeId.toLowerCase().trim()}`,
        employeeId: emp.employeeId,
        email:
          emp.personal?.workEmail ||
          `${(emp.personal?.firstName || "user").toLowerCase()}@creditexpertindia.com`,
        password: hashPassword(generateTempPassword()),
        name: emp.personal?.fullName || "Employee",
        role: newRole,
        branch: emp.employment?.branch || "Delhi",
        department: emp.employment?.department || "General Operations",
        avatar: emp.personal?.avatarUrl || "",
        status: "Active",
        createdAt: new Date().toISOString(),
      };
      memory.userAccounts.push(account);
    } else {
      throw new Error(`User or employee with identifier "${identifier}" not found.`);
    }
  }

  const oldRole = account.role || "employee";
  account.role = newRole;

  await persist("users", account.uid, account);

  // Sessions no longer carry the role: authenticateRequest reads it from the user account.

  await recordAuditLog({
    who: actor?.name || "System",
    role: actor?.role || "admin",
    action: "USER_ROLE_CHANGED",
    employeeId: account.employeeId,
    employeeName: account.name,
    details: `Updated system role for ${account.name} (${account.employeeId}) from ${(oldRole || "employee").toUpperCase()} to ${(newRole || "employee").toUpperCase()}`,
  });

  return account;
}

function getSessionEnvironment(session: UserSession): "development" | "production" {
  if (session.environment) return session.environment;
  if (session.ipHash === "::1" || session.ipHash === "127.0.0.1" || session.sessionId?.startsWith("sess-local")) {
    return "development";
  }
  return "production";
}

/**
 * Creates a new active session and enforces SINGLE ACTIVE SESSION rule:
 * Isolates local development workstation sessions from live production sessions.
 * Any prior active session for this user in the same environment is revoked.
 */
export async function createSession(data: {
  userId: string;
  employeeId: string;
  role: UserRole;
  branch: Branch;
  email: string;
  name: string;
  deviceId?: string;
  userAgent?: string;
  ipHash?: string;
  environment?: "development" | "production";
}): Promise<UserSession> {
  const now = new Date().toISOString();
  const targetEnv = data.environment || (isLocalEnvironment() ? "development" : "production");

  // 1. Enforce Single Active Session within the same environment:
  // (Development workstation sessions on localhost and production sessions are strictly isolated)
  const priorSessions = memory.sessions.filter(
    (s) => s.userId === data.userId && s.isActive && getSessionEnvironment(s) === targetEnv
  );
  for (const oldSess of priorSessions) {
    oldSess.isActive = false;
    oldSess.revokedAt = now;
    oldSess.revocationReason = "signed_in_from_another_device";
    await persist("sessions", oldSess.sessionId, oldSess);
  }

  // Also verify across Firestore sessions for this user & environment
  let revokedAnyFirestore = false;
  try {
    const firestoreUserSessions = await getUserSessionsFromFirestore(data.userId);
    for (const s of firestoreUserSessions) {
      if (
        s.isActive &&
        getSessionEnvironment(s) === targetEnv &&
        !priorSessions.some((p) => p.sessionId === s.sessionId)
      ) {
        s.isActive = false;
        s.revokedAt = now;
        s.revocationReason = "signed_in_from_another_device";
        revokedAnyFirestore = true;
        await persist("sessions", s.sessionId, s);
      }
    }
  } catch (e) {
    console.warn("Firestore prior session revocation fallback:", e);
  }

  if (priorSessions.length > 0 || revokedAnyFirestore) {
    await recordAuditLog({
      who: data.name,
      role: data.role,
      action: "SESSION_REVOKED",
      details: `Active session for ${data.name} was revoked because the account signed in from another device (${targetEnv})`,
    });
  }

  // 2. Initialize new active session (valid for 24 hours)
  const sessionId = "sess_" + randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const newSession: UserSession = {
    sessionId,
    userId: data.userId,
    employeeId: data.employeeId,
    email: data.email,
    name: data.name,
    role: data.role,
    branch: data.branch,
    createdAt: now,
    lastActivityAt: now,
    expiresAt,
    deviceId: data.deviceId,
    userAgent: data.userAgent,
    ipHash: data.ipHash,
    isActive: true,
    environment: targetEnv,
  };

  memory.sessions.push(newSession);
  // CRITICAL FOR SERVERLESS: Must await write to Firestore so subsequent API calls immediately find it
  await persist("sessions", newSession.sessionId, newSession);

  await recordAuditLog({
    who: data.name,
    role: data.role,
    action: "LOGIN",
    details: `${data.role.toUpperCase()} "${data.name}" authenticated (${targetEnv}). Single active session started for branch: ${data.branch}`,
  });

  return newSession;
}

export async function getSession(sessionId: string): Promise<UserSession | null> {
  // Firestore is the source of truth: a session revoked on another instance must not stay
  // valid here. (Reads are cached for up to 60 s, so revocation can take up to a minute to show.)
  if (isFirestoreConfigured()) {
    try {
      const doc = await getDocumentFromFirestore<UserSession>("sessions", sessionId);
      return doc || null;
    } catch (e) {
      console.warn("Firestore getSession failed:", e);
      return null;
    }
  }

  // Local development without Firebase credentials: in-memory sessions only.
  return memory.sessions.find((s) => s.sessionId === sessionId) || null;
}

export async function touchSession(sessionId: string): Promise<void> {
  const session = memory.sessions.find((s) => s.sessionId === sessionId);
  if (session && session.isActive) {
    session.lastActivityAt = new Date().toISOString();
  }
}

export async function revokeSession(
  sessionId: string,
  reason: "signed_in_from_another_device" | "user_logged_out" | "expired" | "admin_revoked" = "user_logged_out"
): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) return false;

  const now = new Date().toISOString();
  session.isActive = false;
  session.revokedAt = now;
  session.revocationReason = reason;

  await persist("sessions", session.sessionId, session);

  await recordAuditLog({
    who: session.name,
    role: session.role,
    action: "LOGOUT",
    details: `${session.role.toUpperCase()} "${session.name}" session terminated (Reason: ${reason})`,
  });

  return true;
}

// ----------------- ONBOARDING -----------------

export async function getOnboardingRecords(branch?: Branch | "All"): Promise<OnboardingRecord[]> {
  let records: OnboardingRecord[] = memory.onboardingRecords;

  try {
    records = fromStore(await getCollectionFromFirestore<OnboardingRecord>("onboarding"), memory.onboardingRecords);
  } catch (e) {
    console.warn("Firestore getOnboardingRecords fallback:", e);
  }

  const ALLOWED_CHECKLIST_KEYS = new Set(["pan_card", "aadhaar_card", "bank_details", "photograph"]);

  // Ensure progressPercentage and status accurately reflect checklist truth & normalize legacy items
  records = newestFirst(records, (r) => r.createdAt).map((record) => {
    let normRecord = record;
    if ((record.lifecycleStatus as string) === "Probation") {
      normRecord = { ...record, lifecycleStatus: "Active" };
    }
    
    // Filter checklist strictly to the 4 mandatory items
    const checklist = normRecord.checklist || [];
    let filtered = checklist.filter((i) => ALLOWED_CHECKLIST_KEYS.has(i.key));
    if (filtered.length === 0) {
      filtered = STANDARD_ONBOARDING_CHECKLIST.map((item) => ({
        ...item,
        completed: false,
        verified: false,
      }));
    } else {
      for (const std of STANDARD_ONBOARDING_CHECKLIST) {
        if (!filtered.some((i) => i.key === std.key)) {
          filtered.push({ ...std, completed: false, verified: false });
        }
      }
    }

    const done = filtered.filter((i) => i.completed).length;
    const total = filtered.length;
    const truePct = total > 0 ? Math.round((done / total) * 100) : 0;
    const trueStatus = truePct === 100 ? "Completed" : (done > 0 ? "In Progress" : "Pending");

    return {
      ...normRecord,
      checklist: filtered,
      progressPercentage: truePct,
      status: trueStatus,
    };
  });

  if (branch && branch !== "All") {
    return records.filter((r) => r.branch === branch);
  }
  return records;
}

export async function getOnboardingRecordById(id: string): Promise<OnboardingRecord | null> {
  let record: OnboardingRecord | null = null;
  try {
    const single = await getDocumentFromFirestore<OnboardingRecord>("onboarding", id);
    if (single) record = single;
  } catch (e) {}

  if (!record) {
    const records = await getOnboardingRecords();
    return records.find((r) => r.id === id || r.employeeId === id) || null;
  }

  if ((record.lifecycleStatus as string) === "Probation") {
    record.lifecycleStatus = "Active";
  }

  const ALLOWED_CHECKLIST_KEYS = new Set(["pan_card", "aadhaar_card", "bank_details", "photograph"]);
  const checklist = record.checklist || [];
  let filtered = checklist.filter((i) => ALLOWED_CHECKLIST_KEYS.has(i.key));
  if (filtered.length === 0) {
    filtered = STANDARD_ONBOARDING_CHECKLIST.map((item) => ({
      ...item,
      completed: false,
      verified: false,
    }));
  } else {
    for (const std of STANDARD_ONBOARDING_CHECKLIST) {
      if (!filtered.some((i) => i.key === std.key)) {
        filtered.push({ ...std, completed: false, verified: false });
      }
    }
  }

  record.checklist = filtered;
  const done = filtered.filter((i) => i.completed).length;
  const total = filtered.length;
  record.progressPercentage = total > 0 ? Math.round((done / total) * 100) : 0;
  record.status = record.progressPercentage === 100 ? "Completed" : (done > 0 ? "In Progress" : "Pending");

  return record;
}

export async function createOnboardingRecord(
  data: {
    candidateName: string;
    email: string;
    phone: string;
    branch: Branch;
    department: string;
    designation: string;
    joiningDate: string;
    annualCtc?: number;
    offerLetterUrl?: string;
    assignedHrName?: string;
    notes?: string;
    userId?: string;
    selfRegistered?: boolean;
    kycDocuments?: KycDocumentItem[];
    personalDetails?: OnboardingRecord["personalDetails"];
    statutoryDetails?: OnboardingRecord["statutoryDetails"];
    progressPercentage?: number;
    lifecycleStatus?: EmploymentStatus;
    checklist?: OnboardingChecklistItem[];
  },
  actor: { name: string; role: string }
): Promise<OnboardingRecord> {
  const now = new Date().toISOString();
  const id = `onb-${Date.now()}`;

  const initialChecklist: OnboardingChecklistItem[] =
    data.checklist ||
    STANDARD_ONBOARDING_CHECKLIST.map((item) => ({
      ...item,
      completed: false,
      verified: false,
    }));

  const record: OnboardingRecord = {
    id,
    userId: data.userId,
    candidateName: data.candidateName,
    email: data.email,
    phone: data.phone,
    branch: data.branch,
    department: data.department,
    designation: data.designation,
    joiningDate: data.joiningDate,
    annualCtc: data.annualCtc,
    lifecycleStatus: data.lifecycleStatus || "Offer Sent",
    status: "Pending",
    progressPercentage: data.progressPercentage !== undefined ? data.progressPercentage : 0,
    checklist: initialChecklist,
    assignedHrName: data.assignedHrName || actor.name,
    notes: data.notes || "Initialized onboarding profile",
    selfRegistered: data.selfRegistered || false,
    kycDocuments: data.kycDocuments || [],
    personalDetails: data.personalDetails,
    statutoryDetails: data.statutoryDetails,
    createdAt: now,
    updatedAt: now,
  };

  memory.onboardingRecords.unshift(record);

  // Sync to Firestore
  await persist("onboarding", id, record);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ONBOARDING_INITIATED",
    details: `Initiated onboarding profile for ${record.candidateName} (${record.designation}) at ${record.branch} branch`,
  });

  return record;
}

export async function updateOnboardingChecklist(
  id: string,
  itemKey: string,
  updates: boolean | { completed?: boolean; verified?: boolean; notes?: string },
  actor: { name: string; role: string },
  verificationNotes?: string
): Promise<OnboardingRecord | null> {
  const records = await getOnboardingRecords();
  const record = records.find((r) => r.id === id);
  if (!record) return null;

  const now = new Date().toISOString();
  let updatedAny = false;

  const completedVal = typeof updates === "boolean" ? updates : updates.completed;
  const verifiedVal = typeof updates === "object" ? updates.verified : undefined;
  const notesVal = typeof updates === "object" ? updates.notes || verificationNotes : verificationNotes;

  record.checklist = record.checklist.map((item) => {
    if (item.key === itemKey) {
      updatedAny = true;
      const isCompleted = completedVal !== undefined ? completedVal : item.completed;
      const isVerified = verifiedVal !== undefined ? verifiedVal : item.verified;
      return {
        ...item,
        completed: isCompleted,
        completedAt: isCompleted ? (item.completedAt || now) : undefined,
        completedBy: isCompleted ? (item.completedBy || actor.name) : undefined,
        verified: isVerified,
        verifiedAt: isVerified ? (item.verifiedAt || now) : undefined,
        verifiedBy: isVerified ? (item.verifiedBy || actor.name) : undefined,
        notes: notesVal !== undefined ? notesVal : item.notes,
      };
    }
    return item;
  });

  if (!updatedAny) return null;

  // Recalculate progress percentage
  const total = record.checklist.length;
  const done = record.checklist.filter((i) => i.completed).length;
  record.progressPercentage = Math.round((done / total) * 100);

  if (record.progressPercentage === 100) {
    record.status = "Completed";
  } else if (record.progressPercentage > 0) {
    record.status = "In Progress";
  }

  record.updatedAt = now;

  // 1. Memory update
  const memIndex = memory.onboardingRecords.findIndex((r) => r.id === id);
  if (memIndex !== -1) {
    memory.onboardingRecords[memIndex] = record;
  }

  // 2. Firestore update
  await persist("onboarding", id, record);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ONBOARDING_CHECKLIST_UPDATED",
    details: `Updated checklist item '${itemKey}' for ${record.candidateName} (Progress: ${record.progressPercentage}%)`,
  });

  return record;
}

/** Records the offered annual CTC (0 = incentive-only) on an onboarding record, before activation. */
export async function setOnboardingCtc(
  id: string,
  annualCtc: number,
  actor: { name: string; role: string }
): Promise<OnboardingRecord | null> {
  if (!Number.isFinite(annualCtc) || annualCtc < 0) {
    throw new ValidationError("CTC must be a number of zero or more.");
  }
  const current = await loadForUpdate<OnboardingRecord>("onboarding", id, memory.onboardingRecords, (r) => r.id === id);
  if (!current) return null;
  if (current.employeeId) {
    throw new ConflictError("This candidate is already activated; change the salary from the employee profile instead.");
  }

  const updated: OnboardingRecord = { ...current, annualCtc, updatedAt: new Date().toISOString() };
  upsertMemory(memory.onboardingRecords, (r) => r.id === id, updated);
  await persist("onboarding", id, updated);

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ONBOARDING_CTC_SET",
    details: `Set offered annual CTC for ${updated.candidateName} to ₹${annualCtc.toLocaleString("en-IN")}`,
  });
  return updated;
}

export async function advanceEmployeeLifecycle(
  idOrEmpId: string,
  newStatus: EmploymentStatus,
  actor: { name: string; role: string }
): Promise<OnboardingRecord | null> {
  const records = await getOnboardingRecords();
  const record = records.find((r) => r.id === idOrEmpId || r.employeeId === idOrEmpId);
  const now = new Date().toISOString();

  if (record) {
    record.lifecycleStatus = newStatus;
    record.updatedAt = now;

    const memIndex = memory.onboardingRecords.findIndex((r) => r.id === record.id);
    if (memIndex !== -1) {
      memory.onboardingRecords[memIndex] = record;
    }

    await persist("onboarding", record.id, record);
  }

  // Also update employee record if exists
  const employees = await getEmployees();
  const employee = employees.find(
    (e) => e.employeeId === (record?.employeeId || idOrEmpId) || e.id === idOrEmpId
  );

  if (employee) {
    employee.employment.employmentStatus = newStatus;
    const empIndex = memory.employees.findIndex((e) => e.id === employee.id);
    if (empIndex !== -1) {
      memory.employees[empIndex] = employee;
    }
    await persist("employees", employee.employeeId, employee);
  }

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LIFECYCLE_STAGE_ADVANCED",
    employeeId: record?.employeeId || employee?.employeeId,
    employeeName: record?.candidateName || employee?.personal.fullName,
    details: `Transitioned lifecycle status to '${newStatus}' for ${record?.candidateName || employee?.personal.fullName}`,
  });

  return record || null;
}

export async function activateOnboardedEmployee(
  onboardingId: string,
  actor: { name: string; role: string }
): Promise<{ onboarding: OnboardingRecord; employee: Employee } | null> {
  const records = await getOnboardingRecords();
  const record = records.find((r) => r.id === onboardingId);
  if (!record) return null;

  const photoDoc = record.kycDocuments?.find(
    (d) => d.type === "photograph" || d.title?.toLowerCase().includes("passport") || d.title?.toLowerCase().includes("photo")
  );
  const passportPhoto = photoDoc?.fileUrl;
  // The offered CTC must be entered by HR (0 means incentive-only). No silent default salary.
  if (typeof record.annualCtc !== "number" || !Number.isFinite(record.annualCtc) || record.annualCtc < 0) {
    throw new ValidationError("Enter the offered annual CTC (0 for incentive-only) before activating this employee.");
  }
  const annualCtc = record.annualCtc;
  const incentiveOnly = annualCtc === 0;
  const salaryBreakdown = incentiveOnly
    ? calculateSalaryFromMonthly({ monthlyAmount: 0, salaryBasis: "incentive_only", includePf: false })
    : calculateSalaryBreakdown(annualCtc);
  const now = new Date().toISOString();

  const buildEmployee = (employeeId: string): Employee => ({
    id: employeeId,
    employeeId,
    personal: {
      employeeId,
      firstName: record.candidateName.split(" ")[0] || record.candidateName,
      lastName: record.candidateName.split(" ").slice(1).join(" ") || "",
      fullName: record.candidateName,
      avatarUrl: passportPhoto || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
      passportPhotoUrl: passportPhoto,
      avatarPreference: "passport",
      dob: record.personalDetails?.dob || "",
      gender: record.personalDetails?.gender || "Other",
      mobileNumber: record.phone,
      personalEmail: record.email,
      workEmail: record.email,
      address: record.personalDetails?.currentAddress || record.personalDetails?.permanentAddress || "",
      emergencyContact: record.personalDetails?.emergencyContact || {
        name: "",
        relationship: "",
        phone: "",
      },
    },
    employment: {
      dateOfJoining: record.joiningDate,
      department: record.department,
      designation: record.designation,
      branch: record.branch,
      workLocation: `${record.branch} Office`,
      employmentType: "Full-time",
      employmentStatus: "Active",
      probationMonths: 0,
      employeeCategory: "White Collar",
      reportingManagerName: "HR Team",
    },
    statutory: {
      pan: record.statutoryDetails?.pan || "",
      aadhaar: record.statutoryDetails?.aadhaar || "",
      uan: "",
      pfAccountNumber: "",
      bankAccountNumber: record.statutoryDetails?.bankAccountNumber || "",
      ifscCode: record.statutoryDetails?.ifscCode || "",
      bankName: record.statutoryDetails?.bankName || "",
    },
    currentSalary: salaryBreakdown,
    salaryHistory: [
      {
        id: `rev-${employeeId}-initial`,
        effectiveFrom: record.joiningDate,
        annualCtc,
        isIncentiveOnly: incentiveOnly,
        components: salaryBreakdown,
        revisionReason: incentiveOnly ? "Incentive-Only (Commission Based) Contract" : "Initial Offer Onboarding",
        updatedBy: actor.name,
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  });

  const finalise = (employeeId: string): OnboardingRecord => {
    const done = record.checklist?.filter((i) => i.completed).length || 0;
    const total = record.checklist?.length || 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      ...record,
      employeeId,
      lifecycleStatus: "Active",
      progressPercentage: pct,
      status: pct === 100 ? "Completed" : done > 0 ? "In Progress" : "Pending",
      ...(pct === 100 ? { completedAt: now } : {}),
      updatedAt: now,
      approvedBy: actor.name,
      approvedAt: now,
    };
  };

  // 1. Allocate the ID and create the employee + finalise the onboarding record in ONE step.
  //    If the record already has an employee ID, activation was done before: nothing is created again.
  type Outcome =
    | { created: false; employeeId: string }
    | { created: true; employeeId: string; employee: Employee; onboarding: OnboardingRecord };
  let outcome: Outcome;

  if (isFirestoreConfigured()) {
    outcome = await withTransaction(
      async (tx, db): Promise<Outcome> => {
        const onbRef = db.collection("onboarding").doc(onboardingId);
        const snap = await tx.get(onbRef);
        const already = snap.exists ? (snap.data()?.employeeId as string | undefined) : undefined;
        if (already) return { created: false, employeeId: already };

        const employeeId = await allocateEmployeeId(tx, db);
        const employee = buildEmployee(employeeId);
        const onboarding = finalise(employeeId);
        tx.create(db.collection("employees").doc(employeeId), toFirestoreData(employee));
        tx.set(onbRef, toFirestoreData(onboarding));
        return { created: true, employeeId, employee, onboarding };
      },
      ["employees", "onboarding", "counters"]
    );
  } else if (record.employeeId) {
    outcome = { created: false, employeeId: record.employeeId };
  } else {
    const employeeId = nextEmployeeId(memory.employees.map((e) => e.employeeId));
    const employee = buildEmployee(employeeId);
    const onboarding = finalise(employeeId);
    memory.employees.unshift(employee);
    upsertMemory(memory.onboardingRecords, (r) => r.id === onboardingId, onboarding);
    outcome = { created: true, employeeId, employee, onboarding };
  }

  const employeeId = outcome.employeeId;

  // 2. Everything below is safe to repeat: fixed document IDs and upserts.
  const kycDocs = record.kycDocuments || [];
  for (let i = 0; i < kycDocs.length; i++) {
    const doc = kycDocs[i];
    const docItem: EmployeeDocument = {
      id: `doc-${onboardingId}-${i}`,
      employeeId,
      employeeName: record.candidateName,
      documentType: doc.type,
      title: doc.title || (doc.type === "photograph" ? "Passport Size Photograph" : doc.type),
      fileUrl: doc.fileUrl,
      uploadedBy: record.candidateName,
      uploadDate: doc.uploadedAt || now,
      status: "Verified",
      notes: "Uploaded during candidate self-registration onboarding KYC",
    };
    upsertMemory(memory.documents, (d) => d.id === docItem.id, docItem);
    await persist("documents", docItem.id, docItem);
  }

  // Activate or create the official login account (refuse to take over someone else's ID)
  const userAccount = await getUserAccountByEmail(record.email);
  if (userAccount) {
    if (userAccount.employeeId && userAccount.employeeId !== "PENDING" && userAccount.employeeId !== employeeId) {
      throw new ConflictError(
        `The login account for ${record.email} is already linked to ${userAccount.employeeId}. Resolve this before activating.`
      );
    }
    await updateUserAccount(userAccount.uid, {
      status: "Active",
      employeeId,
      branch: record.branch,
      department: record.department,
      ...(passportPhoto ? { avatar: passportPhoto } : {}),
    });
  } else {
    await createUserAccount({
      uid: record.userId || `usr-${employeeId.toLowerCase()}`,
      employeeId,
      email: record.email.toLowerCase().trim(),
      password: hashPassword(generateTempPassword()),
      name: record.candidateName,
      role: "employee",
      branch: record.branch,
      department: record.department,
      avatar: passportPhoto || `https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150`,
      status: "Active",
      createdAt: now,
    });
  }

  if (!outcome.created) {
    const employee = await getEmployeeById(employeeId);
    if (!employee) {
      throw new ConflictError(`This onboarding record is linked to ${employeeId}, but that employee record is missing.`);
    }
    const onboarding = (await getOnboardingRecordById(onboardingId)) || record;
    return { onboarding, employee };
  }

  // 3. Only the call that actually created the employee notifies and audits.
  sendAccountApprovedEmail(record.email, record.candidateName, employeeId).catch((e) =>
    console.warn("Could not dispatch approval email:", e)
  );

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "EMPLOYEE_ACTIVATED",
    employeeId,
    employeeName: record.candidateName,
    details: `Onboarding finalized (${outcome.onboarding.progressPercentage}%). Activated employee profile with ID ${employeeId} as Full-time Active at ${record.branch} branch and granted full HRMS login access.`,
  });

  return { onboarding: outcome.onboarding, employee: outcome.employee };
}

// ============================================================================
// INCOMPLETE REGISTRATION DRAFT ENGINE
// ============================================================================

export async function saveRegistrationDraft(
  email: string,
  draft: RegistrationDraft
): Promise<void> {
  const normalized = email.toLowerCase().trim();
  const safeId = normalized.replace(/[^a-z0-9]/g, "_");
  memory.registrationDrafts.set(normalized, draft);

  await persist("registration_drafts", safeId, {
    ...draft,
    email: normalized,
    id: safeId,
    updatedAt: new Date().toISOString(),
  });
}

export async function getRegistrationDraft(
  email: string
): Promise<RegistrationDraft | null> {
  const normalized = email.toLowerCase().trim();
  const safeId = normalized.replace(/[^a-z0-9]/g, "_");

  const memDraft = memory.registrationDrafts.get(normalized);
  if (memDraft) return memDraft;

  try {
    const firestoreDraft = await getDocumentFromFirestore<RegistrationDraft>(
      "registration_drafts",
      safeId
    );
    if (firestoreDraft) {
      memory.registrationDrafts.set(normalized, firestoreDraft);
      return firestoreDraft;
    }
  } catch (e) {
    console.warn("Firestore getRegistrationDraft fallback:", e);
  }

  return null;
}

export async function deleteRegistrationDraft(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  const safeId = normalized.replace(/[^a-z0-9]/g, "_");

  memory.registrationDrafts.delete(normalized);
  await persistDelete("registration_drafts", safeId);
}

