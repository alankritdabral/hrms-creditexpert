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
import {
  Employee,
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
  BankDisbursalBreakdown,
  CustomerDisbursalEntry,
  IncentiveCalculationBreakdown,
  CustomRole,
  DEFAULT_ROLES,
  AppSection,
  APP_SECTIONS,
} from "../types";
import { calculateDisbursalIncentive } from "../incentive-calculator";
import { calculateSalaryBreakdown, calculateSalaryFromMonthly } from "../payroll-engine";
import { sendAccountApprovedEmail } from "../email";
import {
  getCollectionFromFirestore,
  getDocumentFromFirestore,
  saveDocumentToFirestore,
  deleteDocumentFromFirestore,
  clearCollectionInFirestore,
} from "../firestore-service";
import { calculateHaversineDistance } from "../attendance/geolocation";
import {
  getISTDateString,
  getIST24HourTime,
  evaluateLateArrivalIST,
} from "../attendance/ist-time";
import { isLocalEnvironment } from "../env";

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
memory.userAccounts ??= isLocalEnvironment() ? [...SEED_USER_ACCOUNTS] : [];

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
  let list = memory.employees;
  try {
    const firestoreDocs = await getCollectionFromFirestore<Employee>("employees");
    if (firestoreDocs && firestoreDocs.length > 0) {
      list = firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getEmployees fallback:", e);
  }

  if ((!list || list.length === 0) && isLocalEnvironment()) {
    list = INITIAL_EMPLOYEES;
    memory.employees = [...INITIAL_EMPLOYEES];
  }

  // Helper to normalize legacy records (Probation -> Active, and Basic Pay = Net Pay apart from PF)
  const normalizeEmployee = (emp: Employee): Employee => {
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

    // Normalize avatar preference and passport photo URL
    const docPassport = memory.documents.find(
      (d) =>
        d.employeeId === norm.employeeId &&
        (d.documentType === "photograph" || d.title?.toLowerCase().includes("passport"))
    )?.fileUrl;

    const passportPhoto = norm.personal.passportPhotoUrl || docPassport || (norm.personal.avatarPreference !== "custom" ? norm.personal.avatarUrl : undefined);
    const pref = norm.personal.avatarPreference || "passport";

    let activeAvatar = norm.personal.avatarUrl;
    if (pref === "passport" && passportPhoto) {
      activeAvatar = passportPhoto;
    } else if (pref === "custom" && norm.personal.customAvatarUrl) {
      activeAvatar = norm.personal.customAvatarUrl;
    } else if (passportPhoto) {
      activeAvatar = passportPhoto;
    }

    norm = {
      ...norm,
      personal: {
        ...norm.personal,
        passportPhotoUrl: passportPhoto || norm.personal.passportPhotoUrl,
        avatarPreference: pref,
        avatarUrl: activeAvatar || norm.personal.avatarUrl || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
      },
    };

    return norm;
  };

  return list.map(normalizeEmployee);
}

export async function getEmployeeById(idOrEmpId: string): Promise<Employee | null> {
  let emp: Employee | null = null;
  // 1. Try single-document read / memory cache (0 or 1 Firestore read)
  try {
    const single = await getDocumentFromFirestore<Employee>("employees", idOrEmpId);
    if (single) emp = single;
  } catch (e) {
    // Graceful fallback to collection search
  }

  if (!emp) {
    const employees = await getEmployees();
    emp =
      employees.find(
        (e) => e.id === idOrEmpId || e.employeeId.toLowerCase() === idOrEmpId.toLowerCase()
      ) || null;
  }

  if (emp) {
    const normalizeEmployee = (raw: Employee): Employee => {
      let norm = { ...raw };
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

      const passportPhoto = norm.personal.passportPhotoUrl || docPassport || (norm.personal.avatarPreference !== "custom" ? norm.personal.avatarUrl : undefined);
      const pref = norm.personal.avatarPreference || "passport";

      let activeAvatar = norm.personal.avatarUrl;
      if (pref === "passport" && passportPhoto) {
        activeAvatar = passportPhoto;
      } else if (pref === "custom" && norm.personal.customAvatarUrl) {
        activeAvatar = norm.personal.customAvatarUrl;
      } else if (passportPhoto) {
        activeAvatar = passportPhoto;
      }

      norm = {
        ...norm,
        personal: {
          ...norm.personal,
          passportPhotoUrl: passportPhoto || norm.personal.passportPhotoUrl,
          avatarPreference: pref,
          avatarUrl: activeAvatar || norm.personal.avatarUrl || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
        },
      };

      return norm;
    };

    return normalizeEmployee(emp);
  }

  return null;
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

export interface UpdateEmployeeAvatarInput {
  avatarUrl?: string;
  passportPhotoUrl?: string;
  customAvatarUrl?: string;
  avatarPreference?: "passport" | "custom";
}

export async function updateEmployeeAvatar(
  employeeId: string,
  input: UpdateEmployeeAvatarInput,
  actor: { name: string; role: string }
): Promise<Employee | null> {
  let index = memory.employees.findIndex(
    (e) => e.employeeId.toLowerCase() === employeeId.toLowerCase() || e.id === employeeId
  );

  if (index === -1) {
    try {
      const docEmp = await getDocumentFromFirestore<Employee>("employees", employeeId);
      if (docEmp) {
        memory.employees.push(docEmp);
        index = memory.employees.length - 1;
      }
    } catch (e) {
      console.warn("Firestore fetch error in updateEmployeeAvatar:", e);
    }
  }

  if (index === -1) return null;

  const currentEmp = memory.employees[index];

  const docPassport = memory.documents.find(
    (d) =>
      d.employeeId === currentEmp.employeeId &&
      (d.documentType === "photograph" || d.title?.toLowerCase().includes("passport"))
  )?.fileUrl;

  const newPassportUrl = input.passportPhotoUrl !== undefined ? input.passportPhotoUrl : (currentEmp.personal.passportPhotoUrl || docPassport);
  const newCustomUrl = input.customAvatarUrl !== undefined ? input.customAvatarUrl : currentEmp.personal.customAvatarUrl;
  const newPreference = input.avatarPreference !== undefined ? input.avatarPreference : (currentEmp.personal.avatarPreference || "passport");

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
        newPassportUrl ||
        nonCustomAvatar ||
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150";
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

  memory.employees[index] = updatedEmp;
  saveDocumentToFirestore("employees", updatedEmp.employeeId, updatedEmp).catch(() => {});

  // Sync with matching UserAccount
  try {
    const userAcc = memory.userAccounts.find(
      (u) =>
        u.employeeId.toLowerCase() === updatedEmp.employeeId.toLowerCase() ||
        u.email.toLowerCase() === updatedEmp.personal.workEmail.toLowerCase() ||
        u.email.toLowerCase() === updatedEmp.personal.personalEmail.toLowerCase()
    );
    if (userAcc) {
      userAcc.avatar = effectiveAvatarUrl;
      saveDocumentToFirestore("users", userAcc.uid, userAcc).catch(() => {});
    }
  } catch (e) {
    console.warn("User account avatar sync error:", e);
  }

  // If a passport photo was newly provided or changed, ensure a verified EmployeeDocument exists
  if (input.passportPhotoUrl) {
    const existingDoc = memory.documents.find(
      (d) =>
        d.employeeId === updatedEmp.employeeId &&
        (d.documentType === "photograph" || d.title?.toLowerCase().includes("passport"))
    );
    if (existingDoc) {
      existingDoc.fileUrl = input.passportPhotoUrl;
      saveDocumentToFirestore("documents", existingDoc.id, existingDoc).catch(() => {});
    } else {
      const newDoc: EmployeeDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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
      saveDocumentToFirestore("documents", newDoc.id, newDoc).catch(() => {});
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
    effectiveFrom: new Date().toISOString().split("T")[0],
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

  memory.employees[index] = updatedEmp;
  saveDocumentToFirestore("employees", updatedEmp.employeeId, updatedEmp).catch(() => {});

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
    details: `Clock-in registered at ${record.checkIn} IST on ${record.date}`,
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

  saveDocumentToFirestore("offices", updatedOffice.id, updatedOffice).catch(() => {});

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
  const index = memory.offices.findIndex((o) => o.id === id);
  if (index === -1) return false;

  const office = memory.offices[index];
  memory.offices.splice(index, 1);
  deleteDocumentFromFirestore("offices", id).catch(() => {});

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "OFFICE_DELETED",
    details: `Deleted office geofence for ${office.name}`,
  });

  return true;
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

  let emp = memory.employees.find(
    (e) => e.employeeId.toLowerCase() === employeeId.toLowerCase() || e.id === employeeId
  );
  if (!emp) {
    emp = (await getEmployeeById(employeeId)) || undefined;
  }
  const employeeName = emp?.personal?.fullName || actor.name;

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
    const activeOffices = offices.filter((o) => o.isActive);

    const empBranch = emp?.employment?.branch;
    matchedOffice = activeOffices.find((o) => o.branch === empBranch) || activeOffices[0];

    if (!matchedOffice) {
      throw new Error("No active office location is assigned to your branch. Please contact HR.");
    }

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

  // Calculate Late vs Present status per policy in IST
  const startTime = memory.policy.officeStartTime || "10:00";
  const grace = memory.policy.gracePeriodMinutes ?? 15;
  const isLate = evaluateLateArrivalIST(nowTime, startTime, grace);

  const newRec: AttendanceRecord = {
    id: `att-${Date.now()}`,
    employeeId: emp?.employeeId || employeeId,
    employeeName,
    date: today,
    checkIn: nowTime,
    totalWorkingHours: memory.policy.fullDayMinHours || 8,
    breakDurationMinutes: (memory.policy.standardBreakHours || 1) * 60,
    status: isLate ? "Late" : "Present",
    lateArrival: isLate,
    earlyDeparture: false,
    overtimeHours: 0,
    remarks: locationData
      ? `GPS Clock-In (${distanceMeters}m from ${matchedOffice?.name || "Office"})`
      : "Manual / Admin Check-In",
    checkInLatitude: locationData?.latitude,
    checkInLongitude: locationData?.longitude,
    checkInAccuracy: locationData ? Math.round(locationData.accuracy) : undefined,
    checkInDistanceMeters: distanceMeters,
    checkInLocationStatus: verificationStatus,
    checkInOfficeId: matchedOffice?.id,
    checkInOfficeName: matchedOffice?.name,
  };

  memory.attendance.unshift(newRec);
  saveDocumentToFirestore("attendance", newRec.id, newRec).catch(() => {});

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

export async function updateEmployeeIncentive(
  id: string,
  updates: Partial<EmployeeIncentiveRecord>,
  actor: { name: string; role: string }
): Promise<EmployeeIncentiveRecord | null> {
  const idx = memory.employeeIncentives.findIndex((i) => i.id === id);
  if (idx === -1) return null;

  const current = memory.employeeIncentives[idx];
  const updated: EmployeeIncentiveRecord = {
    ...current,
    ...updates,
    id: current.id,
  };

  memory.employeeIncentives[idx] = updated;
  saveDocumentToFirestore("incentives", updated.id, updated).catch(() => {});

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
  const idx = memory.employeeIncentives.findIndex((i) => i.id === id);
  if (idx === -1) return false;

  const removed = memory.employeeIncentives.splice(idx, 1)[0];
  deleteDocumentFromFirestore("incentives", id).catch(() => {});

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
  const idx = memory.incentiveSchemes.findIndex((s) => s.id === id);
  if (idx === -1) {
    const newScheme: IncentiveScheme = {
      id,
      name: updates.name || "Custom Scheme",
      type: updates.type || "slab",
      description: updates.description || "",
      active: true,
      ...updates,
    };
    memory.incentiveSchemes.push(newScheme);
    return newScheme;
  }

  memory.incentiveSchemes[idx] = {
    ...memory.incentiveSchemes[idx],
    ...updates,
  };

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "INCENTIVE_SCHEME_UPDATED",
    details: `Updated incentive scheme ${id}`,
  });

  return memory.incentiveSchemes[idx];
}

export async function deleteEmployeeLogin(
  id: string,
  actor: { name: string; role: string }
): Promise<boolean> {
  const idx = memory.employeeLogins.findIndex((l) => l.id === id);
  if (idx === -1) return false;

  const removed = memory.employeeLogins.splice(idx, 1)[0];
  deleteDocumentFromFirestore("employee_logins", id).catch(() => {});

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

export async function getEmployeeLogins(month?: string): Promise<EmployeeLoginRecord[]> {
  try {
    const firestoreDocs = await getCollectionFromFirestore<EmployeeLoginRecord>("employee_logins");
    if (firestoreDocs && firestoreDocs.length > 0) {
      for (const doc of firestoreDocs) {
        const idx = memory.employeeLogins.findIndex((l) => l.id === doc.id);
        if (idx >= 0) {
          memory.employeeLogins[idx] = doc;
        } else {
          memory.employeeLogins.push(doc);
        }
      }
    }
  } catch (e) {
    console.warn("Firestore getEmployeeLogins fallback:", e);
  }

  const targetMonth = month || new Date().toISOString().slice(0, 7);

  // If no logins exist for this month, auto-initialize from active employees
  const monthLogins = memory.employeeLogins.filter((l) => l.month === targetMonth);
  if (monthLogins.length === 0) {
    const employees = await getEmployees();
    const activeEmployees = employees.filter(
      (e) => !["Exited", "Terminated", "Resigned"].includes(e.employment.employmentStatus)
    );

    const initialLogins: EmployeeLoginRecord[] = activeEmployees.map((emp, index) => {
      const isSales =
        emp.employment.department?.toLowerCase().includes("sales") ||
        emp.employment.department?.toLowerCase().includes("loan") ||
        emp.employment.department?.toLowerCase().includes("credit") ||
        index < 4;

      const defaultAxisCustomers: CustomerDisbursalEntry[] = isSales
        ? [
            {
              id: `cust-${emp.employeeId}-1`,
              customerName: "Rohan Verma",
              amount: 2500000,
              status: "Disbursed",
              remarks: "Personal Loan processed via Axis Bank",
              date: `${targetMonth}-10`,
            },
          ]
        : [];

      const defaultOtherCustomers: CustomerDisbursalEntry[] = isSales
        ? [
            {
              id: `cust-${emp.employeeId}-2`,
              customerName: "Pooja Sharma",
              amount: 5500000,
              status: "Disbursed",
              remarks: "Home Loan disbursed via HDFC Bank",
              date: `${targetMonth}-16`,
            },
          ]
        : [];

      const axisTotal = defaultAxisCustomers.reduce((acc, c) => acc + (c.status === "Disbursed" ? c.amount : 0), 0);
      const otherTotal = defaultOtherCustomers.reduce((acc, c) => acc + (c.status === "Disbursed" ? c.amount : 0), 0);
      const totalDisbursal = axisTotal + otherTotal;

      const record: EmployeeLoginRecord = {
        id: `login-${emp.employeeId}-${targetMonth}`,
        employeeId: emp.employeeId,
        employeeName: emp.personal.fullName,
        department: emp.employment.department,
        branch: emp.employment.branch,
        month: targetMonth,
        commitment: isSales ? 10000000 : 3000000,
        loginCommitment: isSales ? 12 : 5,
        loginsCount: isSales ? 8 : 3,
        submissionDate: `${targetMonth}-05`,
        lastLoginDate: `${targetMonth}-22`,
        totalDisbursal,
        axisBankDisbursal: axisTotal,
        otherBanksDisbursal: otherTotal,
        banks: [
          {
            id: `bank-axis-${emp.employeeId}`,
            bankName: "Axis Bank",
            isAxisBank: true,
            totalAmount: axisTotal,
            customers: defaultAxisCustomers,
          },
          {
            id: `bank-hdfc-${emp.employeeId}`,
            bankName: "HDFC Bank",
            isAxisBank: false,
            totalAmount: otherTotal,
            customers: defaultOtherCustomers,
          },
        ],
        remarks: isSales ? "Files submitted across Axis and partner lenders." : "Branch regular submissions.",
        lastUpdatedAt: new Date().toISOString(),
        updatedBy: "System",
      };

      return record;
    });

    memory.employeeLogins.push(...initialLogins);
    for (const rec of initialLogins) {
      saveDocumentToFirestore("employee_logins", rec.id, rec).catch(() => {});
    }

    return initialLogins;
  }

  // Ensure every returned login record has a valid loginCommitment count
  for (const l of monthLogins) {
    if (typeof l.loginCommitment !== "number" || isNaN(l.loginCommitment) || l.loginCommitment <= 0) {
      l.loginCommitment = l.commitment >= 10000000 ? 15 : l.commitment >= 5000000 ? 10 : 5;
    }
  }

  return monthLogins;
}

export async function saveEmployeeLogin(
  data: Partial<EmployeeLoginRecord> & { employeeId: string; month: string },
  actor: { name: string; role: string }
): Promise<EmployeeLoginRecord> {
  const employees = await getEmployees();
  const emp = employees.find((e) => e.employeeId === data.employeeId);
  const targetMonth = data.month;
  const id = data.id || `login-${data.employeeId}-${targetMonth}-${Date.now()}`;

  // Recalculate totals from banks
  let banks = data.banks || [];
  let axisBankDisbursal = 0;
  let otherBanksDisbursal = 0;

  banks = banks.map((bank) => {
    const isAxis = bank.isAxisBank || bank.bankName.toLowerCase().includes("axis");
    const totalAmount = (bank.customers || []).reduce((sum, cust) => {
      return sum + (cust.status === "Disbursed" ? Number(cust.amount) || 0 : 0);
    }, 0);

    if (isAxis) {
      axisBankDisbursal += totalAmount;
    } else {
      otherBanksDisbursal += totalAmount;
    }

    return {
      ...bank,
      isAxisBank: isAxis,
      totalAmount,
    };
  });

  const totalDisbursal = axisBankDisbursal + otherBanksDisbursal;

  const existingIdx = data.id
    ? memory.employeeLogins.findIndex((l) => l.id === data.id)
    : -1;

  const existing = existingIdx >= 0 ? memory.employeeLogins[existingIdx] : null;

  const record: EmployeeLoginRecord = {
    id: existing?.id || id,
    employeeId: data.employeeId,
    employeeName: data.employeeName || emp?.personal.fullName || existing?.employeeName || data.employeeId,
    department: data.department || emp?.employment.department || existing?.department || "Sales",
    branch: data.branch || emp?.employment.branch || existing?.branch || "Delhi",
    month: targetMonth,
    commitment: Number(data.commitment ?? existing?.commitment ?? 0),
    loginCommitment: Number(data.loginCommitment ?? existing?.loginCommitment ?? 0),
    loginsCount: Number(data.loginsCount ?? existing?.loginsCount ?? 0),
    submissionDate: data.submissionDate ?? existing?.submissionDate ?? new Date().toISOString().split("T")[0],
    lastLoginDate: data.lastLoginDate ?? existing?.lastLoginDate ?? new Date().toISOString().split("T")[0],
    totalDisbursal: banks.length > 0 ? totalDisbursal : Number(data.totalDisbursal ?? existing?.totalDisbursal ?? 0),
    axisBankDisbursal: banks.length > 0 ? axisBankDisbursal : Number(data.axisBankDisbursal ?? existing?.axisBankDisbursal ?? 0),
    otherBanksDisbursal: banks.length > 0 ? otherBanksDisbursal : Number(data.otherBanksDisbursal ?? existing?.otherBanksDisbursal ?? 0),
    banks: banks.length > 0 ? banks : (existing?.banks || []),
    remarks: data.remarks ?? existing?.remarks ?? "",
    lastUpdatedAt: new Date().toISOString(),
    updatedBy: actor.name,
  };

  if (existingIdx >= 0) {
    memory.employeeLogins[existingIdx] = record;
  } else {
    memory.employeeLogins.unshift(record);
  }

  saveDocumentToFirestore("employee_logins", record.id, record).catch(() => {});

  await recordAuditLog({
    who: actor.name,
    role: actor.role,
    action: "LOGINS_UPDATED",
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    details: `Updated logins record for ${record.month} (Total Disbursal: ₹${record.totalDisbursal.toLocaleString("en-IN")}, Axis: ₹${record.axisBankDisbursal.toLocaleString("en-IN")})`,
  });

  return record;
}

export async function calculateAndSyncIncentivesFromLogins(
  month: string,
  actor: { name: string; role: string }
): Promise<EmployeeIncentiveRecord[]> {
  const employees = await getEmployees();
  const logins = await getEmployeeLogins(month);
  const updatedRecords: EmployeeIncentiveRecord[] = [];

  for (const login of logins) {
    const emp = employees.find(
      (e) =>
        e.employeeId === login.employeeId ||
        e.personal?.fullName?.toLowerCase() === login.employeeName?.toLowerCase()
    );

    const monthlySalary =
      emp?.currentSalary?.grossSalary ||
      emp?.currentSalary?.basic ||
      emp?.currentSalary?.monthlyCtc ||
      15000;
    const breakdown = calculateDisbursalIncentive({
      monthlySalary,
      totalDisbursal: login.totalDisbursal,
      axisBankDisbursal: login.axisBankDisbursal,
      otherBanksDisbursal: login.otherBanksDisbursal,
    });

    const existingIdx = memory.employeeIncentives.findIndex(
      (i) => i.employeeId === login.employeeId && i.month === month && i.schemeId === "scheme-disbursal-slab"
    );

    const record: EmployeeIncentiveRecord = {
      id: existingIdx >= 0 ? memory.employeeIncentives[existingIdx].id : `inc-disbursal-${login.employeeId}-${month}`,
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
      approvedDate: new Date().toISOString().split("T")[0],
      calculationBreakdown: breakdown,
      sourceLoginRecordId: login.id,
    };

    if (existingIdx >= 0) {
      memory.employeeIncentives[existingIdx] = record;
    } else {
      memory.employeeIncentives.unshift(record);
    }

    saveDocumentToFirestore("incentives", record.id, record).catch(() => {});
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
  try {
    const firestoreDocs = await getCollectionFromFirestore<EmployeeDocument>("documents");
    if (firestoreDocs && firestoreDocs.length > 0) {
      if (employeeId) {
        return firestoreDocs.filter((d) => d.employeeId === employeeId);
      }
      return firestoreDocs;
    }
  } catch (e) {
    console.warn("Firestore getDocuments fallback:", e);
  }

  if (employeeId) {
    return memory.documents.filter((d) => d.employeeId === employeeId);
  }
  return memory.documents;
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
  saveDocumentToFirestore("documents", newDoc.id, newDoc).catch(() => {});

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

export async function getCustomRoles(): Promise<CustomRole[]> {
  memory.customRoles = memory.customRoles || [...DEFAULT_ROLES];
  try {
    const firestoreRoles = await getCollectionFromFirestore<CustomRole>("custom_roles");
    if (firestoreRoles && firestoreRoles.length > 0) {
      for (const fr of firestoreRoles) {
        if (!fr || !fr.id) continue;
        const idx = memory.customRoles.findIndex((r) => r.id === fr.id);
        if (idx !== -1) {
          memory.customRoles[idx] = fr;
        } else {
          memory.customRoles.push(fr);
        }
      }
    }
  } catch (e) {
    console.warn("Firestore getCustomRoles fallback:", e);
  }

  // Ensure default roles exist
  for (const def of DEFAULT_ROLES) {
    if (!memory.customRoles.some((r) => r.id === def.id)) {
      memory.customRoles.unshift(def);
    }
  }

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
        userCount: count,
      };
    });
  } catch (err) {
    console.warn("getCustomRoles calculate user counts error:", err);
    return memory.customRoles.map((role) => ({
      ...role,
      sections: Array.isArray(role.sections) ? role.sections : [],
      userCount: 0,
    }));
  }
}

export async function saveCustomRole(
  role: Partial<CustomRole> & { name: string; sections: string[] },
  actor?: { name: string; role: string }
): Promise<CustomRole> {
  memory.customRoles = memory.customRoles || [...DEFAULT_ROLES];
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
    createdAt: existingIdx !== -1 ? memory.customRoles[existingIdx].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx !== -1) {
    memory.customRoles[existingIdx] = fullRole;
  } else {
    memory.customRoles.push(fullRole);
  }

  await saveDocumentToFirestore("custom_roles", fullRole.id, fullRole).catch((e) =>
    console.warn("Firestore save custom role error:", e)
  );

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
  memory.customRoles = memory.customRoles || [...DEFAULT_ROLES];
  memory.userAccounts = memory.userAccounts || (isLocalEnvironment() ? [...SEED_USER_ACCOUNTS] : []);
  const target = memory.customRoles.find((r) => r.id === roleId);
  if (!target) return false;
  if (target.isSystem || ["admin", "hr", "employee"].includes(target.id)) {
    throw new Error("System default roles (Admin, HR, Employee) cannot be deleted.");
  }

  memory.customRoles = memory.customRoles.filter((r) => r.id !== roleId);
  await deleteDocumentFromFirestore("custom_roles", roleId).catch((e) =>
    console.warn("Firestore delete custom role error:", e)
  );

  // Reassign any users who had this role to employee
  for (const u of memory.userAccounts) {
    if (u.role === roleId) {
      u.role = "employee";
      saveDocumentToFirestore("users", u.uid, u).catch(() => {});
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
          password: "Password@123",
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
        password: "Password@123",
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

  await saveDocumentToFirestore("users", account.uid, account).catch((e) =>
    console.warn("Firestore assignUserRole fallback:", e)
  );

  // Update active sessions in memory and firestore if this user has active sessions
  for (const s of memory.sessions) {
    if (s.userId === account.uid || (account.employeeId && s.employeeId === account.employeeId)) {
      s.role = newRole;
      saveDocumentToFirestore("sessions", s.sessionId, s).catch(() => {});
    }
  }

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

  const ALLOWED_CHECKLIST_KEYS = new Set(["pan_card", "aadhaar_card", "bank_details", "photograph"]);

  // Ensure progressPercentage and status accurately reflect checklist truth & normalize legacy items
  records = records.map((record) => {
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

  const photoDoc = record.kycDocuments?.find(
    (d) => d.type === "photograph" || d.title?.toLowerCase().includes("passport") || d.title?.toLowerCase().includes("photo")
  );
  const passportPhoto = photoDoc?.fileUrl;

  const newEmployee: Employee = {
    id: `emp-${Date.now()}`,
    employeeId: newEmpId,
    personal: {
      employeeId: newEmpId,
      firstName: record.candidateName.split(" ")[0] || record.candidateName,
      lastName: record.candidateName.split(" ").slice(1).join(" ") || "",
      fullName: record.candidateName,
      avatarUrl: passportPhoto || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
      passportPhotoUrl: passportPhoto,
      avatarPreference: "passport",
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
      employmentStatus: "Active",
      probationMonths: 0,
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

  // Register KYC documents to employee documents collection
  if (record.kycDocuments && record.kycDocuments.length > 0) {
    for (const doc of record.kycDocuments) {
      const docItem: EmployeeDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        employeeId: newEmpId,
        employeeName: record.candidateName,
        documentType: doc.type,
        title: doc.title || (doc.type === "photograph" ? "Passport Size Photograph" : doc.type),
        fileUrl: doc.fileUrl,
        uploadedBy: record.candidateName,
        uploadDate: doc.uploadedAt || new Date().toISOString(),
        status: "Verified",
        notes: "Uploaded during candidate self-registration onboarding KYC",
      };
      memory.documents.unshift(docItem);
      saveDocumentToFirestore("documents", docItem.id, docItem).catch(() => {});
    }
  }

  // Update onboarding record
  record.employeeId = newEmpId;
  record.lifecycleStatus = "Active";
  const done = record.checklist?.filter((i) => i.completed).length || 0;
  const total = record.checklist?.length || 0;
  record.progressPercentage = total > 0 ? Math.round((done / total) * 100) : 0;
  record.status = record.progressPercentage === 100 ? "Completed" : (done > 0 ? "In Progress" : "Pending");
  if (record.progressPercentage === 100) {
    record.completedAt = new Date().toISOString();
  }
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
    if (passportPhoto) {
      userAccount.avatar = passportPhoto;
    }
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
      avatar: passportPhoto || `https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150`,
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
    details: `Onboarding finalized (100%). Activated employee profile with ID ${newEmpId} as Full-time Active at ${record.branch} branch and granted full HRMS login access.`,
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

