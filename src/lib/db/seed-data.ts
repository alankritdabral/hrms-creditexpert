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
  EmployeeDocument,
  Holiday,
  OnboardingRecord,
} from "../types";

export const SEED_USERS: User[] = [];

export const SEED_USER_ACCOUNTS: UserAccount[] = [];

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_POLICY: AttendancePolicy = {
  id: "pol-1",
  department: "All Departments",
  officeStartTime: "10:00",
  officeEndTime: "19:00",
  gracePeriodMinutes: 15,
  fullDayMinHours: 8,
  halfDayMinHours: 4,
  standardBreakHours: 1,
};

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

export const INITIAL_LEAVES: LeaveRequest[] = [];

export const INITIAL_INCENTIVE_SCHEMES: IncentiveScheme[] = [];

export const INITIAL_EMPLOYEE_INCENTIVES: EmployeeIncentiveRecord[] = [];

export const INITIAL_ASSETS: AssetRecord[] = [];

export const INITIAL_REQUESTS: EmployeeRequestItem[] = [];

export const INITIAL_ANNOUNCEMENTS: AnnouncementItem[] = [];

export const INITIAL_DOCUMENTS: EmployeeDocument[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogItem[] = [];

export const INITIAL_PAYROLL_RUNS: PayrollRun[] = [];

export const INITIAL_HOLIDAYS: Holiday[] = [
  {
    id: "hol-1",
    name: "Republic Day",
    date: "2026-01-26",
    branch: "All",
    type: "National",
    description: "Celebration of the Constitution of India across all branches",
    createdBy: "HR",
  },
  {
    id: "hol-2",
    name: "Holi Festival",
    date: "2026-03-04",
    branch: "All",
    type: "National",
    description: "Festival of Colours & Spring Celebration",
    createdBy: "HR",
  },
  {
    id: "hol-3",
    name: "Independence Day",
    date: "2026-08-15",
    branch: "All",
    type: "National",
    description: "National Independence Day of India",
    createdBy: "HR",
  },
  {
    id: "hol-4",
    name: "Mahatma Gandhi Jayanti",
    date: "2026-10-02",
    branch: "All",
    type: "National",
    description: "Commemoration of the birth of Mahatma Gandhi",
    createdBy: "HR",
  },
  {
    id: "hol-5",
    name: "Diwali (Deepavali)",
    date: "2026-11-08",
    branch: "All",
    type: "National",
    description: "Festival of Lights celebration",
    createdBy: "HR",
  },
  {
    id: "hol-6",
    name: "Uttarakhand Foundation Day",
    date: "2026-11-09",
    branch: "Dehradun",
    type: "Regional",
    description: "Regional state formation holiday for Dehradun branch",
    createdBy: "HR",
  },
  {
    id: "hol-7",
    name: "Kumaon Festival Day",
    date: "2026-11-20",
    branch: "Rudrapur",
    type: "Regional",
    description: "Regional festive holiday for Rudrapur branch office",
    createdBy: "HR",
  },
  {
    id: "hol-8",
    name: "Delhi Heritage Day",
    date: "2026-12-12",
    branch: "Delhi",
    type: "Regional",
    description: "Regional holiday for Delhi NCR branch office",
    createdBy: "HR",
  },
];

export const INITIAL_ONBOARDING_RECORDS: OnboardingRecord[] = [];
