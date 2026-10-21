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
  SEED_USERS,
  SEED_USER_ACCOUNTS,
} from "./seed-data";
import {
  Employee,
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
} from "../types";
import { calculateSalaryBreakdown, calculateSalaryFromMonthly } from "../payroll-engine";
import { sendAccountApprovedEmail } from "../email";
import {
  getCollectionFromFirestore,
  getDocumentFromFirestore,
  saveDocumentToFirestore,
  deleteDocumentFromFirestore,
} from "../firestore-service";
import { isLocalEnvironment } from "../env";

// Memory storage for fallback/dev cache
class MemoryStore {
  // Only load seed/mock demo data on local development workstation
  users: User[] = isLocalEnvironment() ? [...SEED_USERS] : [];
  userAccounts: UserAccount[] = isLocalEnvironment() ? [...SEED_USER_ACCOUNTS] : [];
  sessions: UserSession[] = [];
  employees: Employee[] = isLocalEnvironment() ? [...INITIAL_EMPLOYEES] : [];
  attendance: AttendanceRecord[] = isLocalEnvironment() ? [...INITIAL_ATTENDANCE] : [];
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
}

const globalForMemory = globalThis as unknown as { __hrms_memory_store?: MemoryStore };
const memory = (globalForMemory.__hrms_memory_store ??= new MemoryStore());

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

  // Sync to Google Cloud Firestore
  saveDocumentToFirestore("audit_logs", logItem.id, logItem).catch(() => {});
}

// ----------------- EMPLOYEES -----------------

export async function getEmployees(): Promise<Employee[]> {
  try {
    const firestoreDocs = await getCollectionFromFirestore<Employee>("employees");
    if (firestoreDocs && firestoreDocs.length > 0) {
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getEmployees fallback:", e);
  }

  return memory.employees;
}

export async function getEmployeeById(idOrEmpId: string): Promise<Employee | null> {
  // 1. Try single-document read / memory cache (0 or 1 Firestore read)
  try {
    const single = await getDocumentFromFirestore<Employee>("employees", idOrEmpId);
    if (single) return single;
  } catch (e) {
    // Graceful fallback to collection search
  }

  const employees = await getEmployees();
  return (
    employees.find(
      (e) => e.id === idOrEmpId || e.employeeId.toLowerCase() === idOrEmpId.toLowerCase()
    ) || null
  );
}

export async function createEmployee(
  data: Omit<Employee, "id" | "createdAt" | "updatedAt">,
  actor: { name: string; role: string }
): Promise<Employee> {
  const newEmp: Employee = {
    ...data,
    id: `emp-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  memory.employees.unshift(newEmp);

  // Sync to Firestore
  saveDocumentToFirestore("employees", newEmp.employeeId, newEmp).catch(() => {});

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

export async function updateEmployee(
  employeeId: string,
  updates: Partial<Employee>,
  actor: { name: string; role: string }
): Promise<Employee | null> {
  const index = memory.employees.findIndex(
    (e) => e.employeeId.toLowerCase() === employeeId.toLowerCase() || e.id === employeeId
  );
  if (index === -1) return null;

  const emp = {
    ...memory.employees[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  memory.employees[index] = emp;

  // Sync to Firestore
  saveDocumentToFirestore("employees", emp.employeeId, emp).catch(() => {});

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "EMPLOYEE_UPDATED",
    employeeId: emp.employeeId,
    employeeName: emp.personal.fullName,
    details: `Updated details for ${emp.personal.fullName}`,
  });

  return emp;
}

export type SalaryRevisionInput = {
  newAnnualCtc?: number;
  monthlySalary?: number;
  salaryBasis?: "monthly_gross" | "monthly_ctc";
  includePf?: boolean;
  revisionReason?: string;
};

export async function reviseSalary(
  employeeId: string,
  salaryParam: number | SalaryRevisionInput,
  revisionReasonArg?: string,
  actorArg?: { name: string; role: string },
  optionsArg?: {
    monthlySalary?: number;
    includePf?: boolean;
    salaryBasis?: "monthly_gross" | "monthly_ctc";
  }
): Promise<Employee | null> {
  let index = memory.employees.findIndex(
    (e) => e.employeeId.toLowerCase() === employeeId.toLowerCase() || e.id === employeeId
  );
  if (index === -1) {
    const docEmp = await getDocumentFromFirestore<Employee>("employees", employeeId);
    if (docEmp) {
      memory.employees.push(docEmp);
      index = memory.employees.length - 1;
    }
  }
  if (index === -1) return null;

  const currentEmp = memory.employees[index];

  let newAnnualCtc = 0;
  let monthlySalary: number | undefined;
  let salaryBasis: "monthly_gross" | "monthly_ctc" = "monthly_gross";
  let includePf = true;
  let revisionReason = "Salary Revision";
  let actor = actorArg || { name: "System", role: "admin" };

  if (typeof salaryParam === "number") {
    newAnnualCtc = salaryParam;
    revisionReason = revisionReasonArg || "Salary Revision";
    if (optionsArg) {
      monthlySalary = optionsArg.monthlySalary;
      if (optionsArg.includePf !== undefined) includePf = optionsArg.includePf;
      if (optionsArg.salaryBasis) salaryBasis = optionsArg.salaryBasis;
    }
  } else {
    newAnnualCtc = salaryParam.newAnnualCtc || 0;
    monthlySalary = salaryParam.monthlySalary;
    if (salaryParam.includePf !== undefined) includePf = salaryParam.includePf;
    if (salaryParam.salaryBasis) salaryBasis = salaryParam.salaryBasis;
    revisionReason = salaryParam.revisionReason || revisionReasonArg || "Salary Revision";
  }

  let newComponents: SalaryComponent;
  if (monthlySalary && monthlySalary > 0) {
    newComponents = calculateSalaryFromMonthly({
      monthlyAmount: monthlySalary,
      salaryBasis,
      includePf,
    });
  } else {
    newComponents = calculateSalaryBreakdown(newAnnualCtc, includePf);
  }

  const revisionRecord: SalaryRevisionRecord = {
    id: `rev-${Date.now()}`,
    effectiveFrom: new Date().toISOString().split("T")[0],
    annualCtc: newComponents.annualCtc,
    monthlySalary: newComponents.grossSalary,
    includePf: Boolean(newComponents.includePf),
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

  memory.employees[index] = updatedEmp;
  saveDocumentToFirestore("employees", updatedEmp.employeeId, updatedEmp).catch(() => {});

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "SALARY_REVISED",
    employeeId: updatedEmp.employeeId,
    employeeName: updatedEmp.personal.fullName,
    details: `Revised salary to ₹${newComponents.grossSalary.toLocaleString("en-IN")}/mo (Annual CTC: ₹${newComponents.annualCtc.toLocaleString("en-IN")}, PF: ${includePf ? "Included" : "Excluded"}) - ${revisionReason}`,
  });

  return updatedEmp;
}

// ----------------- ATTENDANCE -----------------

export async function getAttendanceRecords(date?: string): Promise<AttendanceRecord[]> {
  try {
    const firestoreDocs = await getCollectionFromFirestore<AttendanceRecord>("attendance");
    if (firestoreDocs && firestoreDocs.length > 0) {
      if (date) {
        return firestoreDocs.filter((a) => a.date === date);
      }
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getAttendanceRecords fallback:", e);
  }

  if (date) {
    return memory.attendance.filter((a) => a.date === date);
  }
  return memory.attendance;
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
  saveDocumentToFirestore("attendance", record.id, record).catch(() => {});

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ATTENDANCE_PUNCH",
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    details: `Clock-in registered at ${record.checkIn} on ${record.date}`,
  });

  return record;
}

export async function updateAttendanceRecord(
  recordId: string,
  updates: Partial<AttendanceRecord>,
  actor: { name: string; role: string }
): Promise<AttendanceRecord | null> {
  const index = memory.attendance.findIndex((a) => a.id === recordId);
  if (index === -1) return null;

  const updated = {
    ...memory.attendance[index],
    ...updates,
  };
  memory.attendance[index] = updated;

  // Sync to Firestore
  saveDocumentToFirestore("attendance", recordId, updated).catch(() => {});

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

export async function punchAttendance(
  employeeId: string,
  type: "checkIn" | "checkOut",
  actor: { name: string; role: string }
): Promise<AttendanceRecord> {
  const today = new Date().toISOString().split("T")[0];
  const nowTime = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

  const emp = memory.employees.find(
    (e) => e.employeeId.toLowerCase() === employeeId.toLowerCase() || e.id === employeeId
  );
  const employeeName = emp?.personal.fullName || actor.name;

  let record = memory.attendance.find(
    (a) => a.employeeId.toLowerCase() === employeeId.toLowerCase() && a.date === today
  );

  if (type === "checkIn") {
    if (record) {
      record.checkIn = nowTime;
      record.status = "Present";
    } else {
      const isLate = nowTime > "10:15";
      const newRec: AttendanceRecord = {
        id: `att-${Date.now()}`,
        employeeId: emp?.employeeId || employeeId,
        employeeName,
        date: today,
        checkIn: nowTime,
        checkOut: "--",
        totalWorkingHours: 0,
        breakDurationMinutes: 0,
        status: isLate ? "Late" : "Present",
        lateArrival: isLate,
        earlyDeparture: false,
        overtimeHours: 0,
        remarks: "Web Check-In",
      };
      memory.attendance.unshift(newRec);
      record = newRec;
    }
  } else {
    // checkOut
    if (!record) {
      const newRec: AttendanceRecord = {
        id: `att-${Date.now()}`,
        employeeId: emp?.employeeId || employeeId,
        employeeName,
        date: today,
        checkIn: "10:00",
        checkOut: nowTime,
        totalWorkingHours: 8,
        breakDurationMinutes: 60,
        status: "Present",
        lateArrival: false,
        earlyDeparture: false,
        overtimeHours: 0,
        remarks: "Web Check-Out",
      };
      memory.attendance.unshift(newRec);
      record = newRec;
    } else {
      record.checkOut = nowTime;
      if (record.checkIn && record.checkIn !== "--") {
        const [inH, inM] = record.checkIn.split(":").map(Number);
        const [outH, outM] = nowTime.split(":").map(Number);
        const diffHours = Math.max(0, (outH * 60 + outM - (inH * 60 + inM)) / 60);
        record.totalWorkingHours = Number(diffHours.toFixed(1));
        record.overtimeHours = Number(Math.max(0, diffHours - 8).toFixed(1));
        if (diffHours < 4) {
          record.status = "Half Day";
        } else if (record.status !== "Late") {
          record.status = "Present";
        }
      }
    }
  }

  saveDocumentToFirestore("attendance", record.id, record).catch(() => {});

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: `ATTENDANCE_${type.toUpperCase()}`,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    details: `${type === "checkIn" ? "Clocked in" : "Clocked out"} at ${nowTime} on ${today}`,
  });

  return record;
}

export const adjustAttendance = updateAttendanceRecord;

// ----------------- LEAVES -----------------

export async function getLeaveRequests(employeeId?: string): Promise<LeaveRequest[]> {
  try {
    const firestoreDocs = await getCollectionFromFirestore<LeaveRequest>("leaves");
    if (firestoreDocs && firestoreDocs.length > 0) {
      if (employeeId) {
        return firestoreDocs.filter((l) => l.employeeId === employeeId);
      }
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getLeaveRequests fallback:", e);
  }

  if (employeeId) {
    return memory.leaves.filter((l) => l.employeeId === employeeId);
  }
  return memory.leaves;
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
  saveDocumentToFirestore("leaves", newLeave.id, newLeave).catch(() => {});

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
  const index = memory.leaves.findIndex((l) => l.id === leaveId);
  if (index === -1) return null;

  const leave = {
    ...memory.leaves[index],
    status,
    reviewedBy: actor.name,
    reviewedAt: new Date().toISOString(),
    reviewNotes,
  };
  memory.leaves[index] = leave;

  // Sync to Firestore
  saveDocumentToFirestore("leaves", leaveId, leave).catch(() => {});

  // If approved, create attendance record
  if (status === "Approved") {
    const attRecord: AttendanceRecord = {
      id: `att-lev-${Date.now()}`,
      employeeId: leave.employeeId,
      employeeName: leave.employeeName,
      date: leave.startDate,
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
    memory.attendance.unshift(attRecord);
    saveDocumentToFirestore("attendance", attRecord.id, attRecord).catch(() => {});
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
  try {
    const firestoreDocs = await getCollectionFromFirestore<PayrollRun>("payroll_runs");
    if (firestoreDocs && firestoreDocs.length > 0) {
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getPayrollRuns fallback:", e);
  }

  return memory.payrollRuns;
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
  const existingIndex = memory.payrollRuns.findIndex(
    (r) => r.id === run.id || r.runCode === run.runCode
  );

  if (existingIndex >= 0) {
    memory.payrollRuns[existingIndex] = run;
  } else {
    memory.payrollRuns.unshift(run);
  }

  // Sync to Firestore
  saveDocumentToFirestore("payroll_runs", run.runCode, run).catch(() => {});

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
  return memory.incentiveSchemes;
}

export async function getEmployeeIncentives(month?: string): Promise<EmployeeIncentiveRecord[]> {
  if (month) {
    return memory.employeeIncentives.filter((i) => i.month === month);
  }
  return memory.employeeIncentives;
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

  saveDocumentToFirestore("incentives", record.id, record).catch(() => {});

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

// ----------------- ASSETS -----------------

export async function getAssets(): Promise<AssetRecord[]> {
  try {
    const firestoreDocs = await getCollectionFromFirestore<AssetRecord>("assets");
    if (firestoreDocs && firestoreDocs.length > 0) {
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getAssets fallback:", e);
  }

  return memory.assets;
}

export async function createAsset(
  data: Omit<AssetRecord, "id"> & { id?: string },
  actor: { name: string; role: string }
): Promise<AssetRecord> {
  const item: AssetRecord = {
    ...data,
    id: data.id || `ast-${Date.now()}`,
  };
  memory.assets.unshift(item);

  saveDocumentToFirestore("assets", item.assetTag, item).catch(() => {});

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
  const index = memory.assets.findIndex((a) => a.assetTag === assetTag);
  if (index === -1) return null;

  const item = { ...memory.assets[index], ...updates };
  memory.assets[index] = item;

  saveDocumentToFirestore("assets", item.assetTag, item).catch(() => {});

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
  try {
    const firestoreDocs = await getCollectionFromFirestore<EmployeeRequestItem>("requests");
    if (firestoreDocs && firestoreDocs.length > 0) {
      if (employeeId) {
        return firestoreDocs.filter((r) => r.employeeId === employeeId);
      }
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getRequests fallback:", e);
  }

  if (employeeId) {
    return memory.requests.filter((r) => r.employeeId === employeeId);
  }
  return memory.requests;
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

  saveDocumentToFirestore("requests", newReq.id, newReq).catch(() => {});

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
  const index = memory.requests.findIndex((r) => r.id === requestId);
  if (index === -1) return null;

  const item = { ...memory.requests[index], ...updates, updatedAt: new Date().toISOString() };
  memory.requests[index] = item;

  saveDocumentToFirestore("requests", item.id, item).catch(() => {});

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
  try {
    const firestoreDocs = await getCollectionFromFirestore<AnnouncementItem>("announcements");
    if (firestoreDocs && firestoreDocs.length > 0) {
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getAnnouncements fallback:", e);
  }

  return memory.announcements;
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

  saveDocumentToFirestore("announcements", item.id, item).catch(() => {});

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
  if (employeeId) {
    return memory.documents.filter((d) => d.employeeId === employeeId);
  }
  return memory.documents;
}

// ----------------- AUDIT LOGS -----------------

export async function getAuditLogs(): Promise<AuditLogItem[]> {
  try {
    const firestoreDocs = await getCollectionFromFirestore<AuditLogItem>("audit_logs", { limitCount: 100 });
    if (firestoreDocs && firestoreDocs.length > 0) {
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getAuditLogs fallback:", e);
  }
  return memory.auditLogs;
}

// ----------------- ATTENDANCE POLICY -----------------

export async function getPolicy(): Promise<AttendancePolicy> {
  return memory.policy;
}

export async function updatePolicy(
  updates: Partial<AttendancePolicy>,
  actor: { name: string; role: string }
): Promise<AttendancePolicy> {
  memory.policy = { ...memory.policy, ...updates };

  saveDocumentToFirestore("settings", "attendance_policy", memory.policy).catch(() => {});

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "POLICY_UPDATED",
    details: `Updated company attendance policy (Grace period: ${memory.policy.gracePeriodMinutes}m)`,
  });

  return memory.policy;
}

// ----------------- USERS -----------------

export async function getUsers(): Promise<User[]> {
  return memory.users;
}

// ----------------- HOLIDAYS -----------------

export async function getHolidays(branch?: string): Promise<Holiday[]> {
  let holidays = memory.holidays;

  try {
    const firestoreDocs = await getCollectionFromFirestore<Holiday>("holidays");
    if (firestoreDocs && firestoreDocs.length > 0) {
      holidays = firestoreDocs;
    }
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

  saveDocumentToFirestore("holidays", newHoliday.id, newHoliday).catch(() => {});

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
  const index = memory.holidays.findIndex((h) => h.id === id);
  if (index === -1) return null;

  const updatedHoliday = {
    ...memory.holidays[index],
    ...updates,
  };
  memory.holidays[index] = updatedHoliday;

  saveDocumentToFirestore("holidays", id, updatedHoliday).catch(() => {});

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
  const index = memory.holidays.findIndex((h) => h.id === id);
  if (index === -1) return false;

  const deleted = memory.holidays[index];
  memory.holidays.splice(index, 1);

  deleteDocumentFromFirestore("holidays", id).catch(() => {});

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
  const existingIndex = memory.userAccounts.findIndex((u) => u.email.toLowerCase() === normalized);

  if (existingIndex !== -1) {
    memory.userAccounts[existingIndex] = { ...memory.userAccounts[existingIndex], ...user };
  } else {
    memory.userAccounts.push(user);
  }

  await saveDocumentToFirestore("users", user.uid, user).catch((e) =>
    console.warn("Firestore save user fallback:", e)
  );

  return user;
}

export async function updateUserAccount(
  uid: string,
  updates: Partial<UserAccount>
): Promise<UserAccount | null> {
  const index = memory.userAccounts.findIndex((u) => u.uid === uid);
  let updated: UserAccount | null = null;

  if (index !== -1) {
    memory.userAccounts[index] = { ...memory.userAccounts[index], ...updates };
    updated = memory.userAccounts[index];
  } else {
    const existing = await getUserAccountById(uid);
    if (existing) {
      updated = { ...existing, ...updates };
      memory.userAccounts.push(updated);
    }
  }

  if (updated) {
    await saveDocumentToFirestore("users", uid, updated).catch((e) =>
      console.warn("Firestore updateUserAccount fallback:", e)
    );
  }

  return updated;
}

/**
 * Creates a new active session and enforces SINGLE ACTIVE SESSION rule:
 * Any prior active session for this user is instantly revoked in memory and Firestore.
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
}): Promise<UserSession> {
  const now = new Date().toISOString();

  // 1. Enforce Single Active Session: revoke any existing active session for this user
  const priorSessions = memory.sessions.filter((s) => s.userId === data.userId && s.isActive);
  for (const oldSess of priorSessions) {
    oldSess.isActive = false;
    oldSess.revokedAt = now;
    oldSess.revocationReason = "signed_in_from_another_device";
    saveDocumentToFirestore("sessions", oldSess.sessionId, oldSess).catch(() => {});
  }

  // Also verify across Firestore sessions
  try {
    const firestoreSessions = await getCollectionFromFirestore<UserSession>("sessions");
    for (const s of firestoreSessions) {
      if (s.userId === data.userId && s.isActive && !priorSessions.some((p) => p.sessionId === s.sessionId)) {
        s.isActive = false;
        s.revokedAt = now;
        s.revocationReason = "signed_in_from_another_device";
        saveDocumentToFirestore("sessions", s.sessionId, s).catch(() => {});
      }
    }
  } catch (e) {}

  if (priorSessions.length > 0) {
    await recordAuditLog({
      who: data.name,
      role: data.role,
      action: "SESSION_REVOKED",
      details: `Active session for ${data.name} was revoked because the account signed in from another device`,
    });
  }

  // 2. Initialize new active session (valid for 24 hours)
  const sessionId = "sess_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
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
  };

  memory.sessions.push(newSession);
  saveDocumentToFirestore("sessions", newSession.sessionId, newSession).catch(() => {});

  await recordAuditLog({
    who: data.name,
    role: data.role,
    action: "LOGIN",
    details: `${data.role.toUpperCase()} "${data.name}" authenticated. Single active session started for branch: ${data.branch}`,
  });

  return newSession;
}

export async function getSession(sessionId: string): Promise<UserSession | null> {
  const inMem = memory.sessions.find((s) => s.sessionId === sessionId);
  if (inMem) return inMem;

  try {
    const doc = await getDocumentFromFirestore<UserSession>("sessions", sessionId);
    if (doc) return doc;
  } catch (e) {
    console.warn("Firestore getSession fallback:", e);
  }

  return null;
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
  const session = memory.sessions.find((s) => s.sessionId === sessionId);
  if (!session) return false;

  const now = new Date().toISOString();
  session.isActive = false;
  session.revokedAt = now;
  session.revocationReason = reason;

  saveDocumentToFirestore("sessions", session.sessionId, session).catch(() => {});

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
  let records: OnboardingRecord[] = [];

  try {
    const firestoreDocs = await getCollectionFromFirestore<OnboardingRecord>("onboarding");
    if (firestoreDocs && firestoreDocs.length > 0) {
      records = firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getOnboardingRecords fallback:", e);
  }

  if (records.length === 0) {
    records = memory.onboardingRecords;
  }

  if (branch && branch !== "All") {
    return records.filter((r) => r.branch === branch);
  }
  return records;
}

export async function getOnboardingRecordById(id: string): Promise<OnboardingRecord | null> {
  try {
    const single = await getDocumentFromFirestore<OnboardingRecord>("onboarding", id);
    if (single) return single;
  } catch (e) {}

  const records = await getOnboardingRecords();
  return records.find((r) => r.id === id || r.employeeId === id) || null;
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
    annualCtc: data.annualCtc || 480000,
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
  saveDocumentToFirestore("onboarding", id, record).catch(() => {});

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
  saveDocumentToFirestore("onboarding", id, record).catch(() => {});

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "ONBOARDING_CHECKLIST_UPDATED",
    details: `Updated checklist item '${itemKey}' for ${record.candidateName} (Progress: ${record.progressPercentage}%)`,
  });

  return record;
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

    saveDocumentToFirestore("onboarding", record.id, record).catch(() => {});
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
    saveDocumentToFirestore("employees", employee.employeeId, employee).catch(() => {});
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

  // Generate next sequential employee ID
  const employees = await getEmployees();
  const highestEmpNum = employees.reduce((max, e) => {
    const match = e.employeeId.match(/EMP-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }
    return max;
  }, 10);

  const nextNum = highestEmpNum + 1;
  const newEmpId = `EMP-${String(nextNum).padStart(4, "0")}`;

  const salaryBreakdown = calculateSalaryBreakdown(record.annualCtc || 480000);

  const newEmployee: Employee = {
    id: `emp-${Date.now()}`,
    employeeId: newEmpId,
    personal: {
      employeeId: newEmpId,
      firstName: record.candidateName.split(" ")[0] || record.candidateName,
      lastName: record.candidateName.split(" ").slice(1).join(" ") || "",
      fullName: record.candidateName,
      dob: record.personalDetails?.dob || "1995-01-01",
      gender: record.personalDetails?.gender || "Male",
      mobileNumber: record.phone,
      personalEmail: record.email,
      workEmail: record.email,
      address:
        record.personalDetails?.currentAddress ||
        record.personalDetails?.permanentAddress ||
        `Main Branch Commercial Rd, ${record.branch}, 248001`,
      emergencyContact: record.personalDetails?.emergencyContact || {
        name: "Family Contact",
        relationship: "Family",
        phone: record.phone,
      },
    },
    employment: {
      dateOfJoining: record.joiningDate,
      department: record.department,
      designation: record.designation,
      branch: record.branch,
      workLocation: `${record.branch} Office`,
      employmentType: "Full-time",
      employmentStatus: "Probation",
      probationMonths: 3,
      employeeCategory: "White Collar",
      reportingManagerName: "Priya Verma (HR)",
    },
    statutory: {
      pan: record.statutoryDetails?.pan || "ABCDE1234F",
      aadhaar: record.statutoryDetails?.aadhaar || "123456789012",
      uan: "100987654321",
      pfAccountNumber: `DL/${record.branch.toUpperCase()}/001/0001`,
      bankAccountNumber: record.statutoryDetails?.bankAccountNumber || "50100012345678",
      ifscCode: record.statutoryDetails?.ifscCode || "HDFC0000123",
      bankName: record.statutoryDetails?.bankName || "HDFC Bank Ltd",
    },
    currentSalary: salaryBreakdown,
    salaryHistory: [
      {
        id: `rev-${Date.now()}`,
        effectiveFrom: record.joiningDate,
        annualCtc: record.annualCtc || 480000,
        components: salaryBreakdown,
        revisionReason: "Initial Offer Onboarding",
        updatedBy: actor.name,
        createdAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Add to employee roster
  memory.employees.unshift(newEmployee);
  saveDocumentToFirestore("employees", newEmpId, newEmployee).catch(() => {});

  // Update onboarding record
  record.employeeId = newEmpId;
  record.lifecycleStatus = "Probation";
  record.status = "Completed";
  record.progressPercentage = 100;
  record.completedAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  record.approvedBy = actor.name;
  record.approvedAt = new Date().toISOString();

  const memIndex = memory.onboardingRecords.findIndex((r) => r.id === onboardingId);
  if (memIndex !== -1) {
    memory.onboardingRecords[memIndex] = record;
  }
  saveDocumentToFirestore("onboarding", onboardingId, record).catch(() => {});

  // 1. Activate or create official UserAccount
  const userAccount = await getUserAccountByEmail(record.email);
  if (userAccount) {
    userAccount.status = "Active";
    userAccount.employeeId = newEmpId;
    userAccount.branch = record.branch;
    userAccount.department = record.department;
    await updateUserAccount(userAccount.uid, userAccount);
  } else {
    const newUser: UserAccount = {
      uid: record.userId || `usr-${Date.now()}`,
      employeeId: newEmpId,
      email: record.email.toLowerCase().trim(),
      password: "Password@123",
      name: record.candidateName,
      role: "employee",
      branch: record.branch,
      department: record.department,
      avatar: `https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150`,
      status: "Active",
      createdAt: new Date().toISOString(),
    };
    await createUserAccount(newUser);
  }

  // 2. Dispatch approval & activation email
  sendAccountApprovedEmail(record.email, record.candidateName, newEmpId).catch((e) =>
    console.warn("Could not dispatch approval email:", e)
  );

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "EMPLOYEE_ACTIVATED",
    employeeId: newEmpId,
    employeeName: record.candidateName,
    details: `Onboarding finalized (100%). Activated employee profile with ID ${newEmpId} under Probation at ${record.branch} branch and granted full HRMS login access.`,
  });

  return { onboarding: record, employee: newEmployee };
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

  try {
    await saveDocumentToFirestore("registration_drafts", safeId, {
      ...draft,
      email: normalized,
      id: safeId,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Firestore saveRegistrationDraft fallback:", e);
  }
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

  try {
    await deleteDocumentFromFirestore("registration_drafts", safeId);
  } catch (e) {
    console.warn("Firestore deleteRegistrationDraft fallback:", e);
  }
}

