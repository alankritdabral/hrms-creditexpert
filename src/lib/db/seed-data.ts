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
  OfficeLocation,
  EmployeeLoginRecord,
} from "../types";

export const SEED_USERS: User[] = [
  {
    id: "usr-5",
    email: "alankrit.dabral@creditexpertindia.com",
    name: "Alankrit Dabral",
    role: "admin",
    employeeId: "EMP-001",
    branch: "Delhi",
    department: "Management",
    avatar: "",
  },
];

// Local-development bootstrap admin only (never seeded in production). Password is
// hashed on first use; change it after first login.
export const SEED_USER_ACCOUNTS: UserAccount[] = [
  {
    uid: "usr-5",
    employeeId: "EMP-001",
    email: "alankrit.dabral@creditexpertindia.com",
    password: "Password@123",
    name: "Alankrit Dabral",
    role: "admin",
    branch: "Delhi",
    department: "Management",
    avatar: "",
    status: "Active",
    createdAt: new Date(0).toISOString(),
    security: { failedLoginAttempts: 0 },
  },
];

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_EMPLOYEE_LOGINS: EmployeeLoginRecord[] = [];

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

export const INITIAL_INCENTIVE_SCHEMES: IncentiveScheme[] = [
  {
    id: "scheme-disbursal-slab",
    name: "Disbursal Slab Incentive (CreditExpert)",
    type: "slab",
    description:
      "Automated loan sales model: Hurdle = Salary × 100. Axis Bank disbursals earn ₹200/lakh. Remaining disbursals earn flat rate: 15L-26L: ₹200/L, 26L-36L: ₹300/L, 36L-56L: ₹400/L, >56L: ₹500/L.",
    slabs: [
      { min: 1500000, max: 2600000, amount: 200 },
      { min: 2600001, max: 3600000, amount: 300 },
      { min: 3600001, max: 5600000, amount: 400 },
      { min: 5600001, max: 999999999, amount: 500 },
    ],
    active: true,
  },
  {
    id: "scheme-fixed-conversions",
    name: "Retail Lead Conversions",
    type: "fixed",
    description: "Flat incentive per verified loan conversion.",
    fixedRate: 500,
    active: true,
  },
];

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

export const INITIAL_OFFICES: OfficeLocation[] = [
  {
    id: "office-delhi",
    name: "Credit Expert - Delhi Branch",
    branch: "Delhi",
    latitude: 28.6289,
    longitude: 77.2065,
    allowedRadiusMeters: 150,
    maxAccuracyMeters: 100,
    address: "Connaught Place, Central Delhi, Delhi 110001",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "office-dehradun",
    name: "Credit Expert - Dehradun Branch",
    branch: "Dehradun",
    latitude: 30.3165,
    longitude: 78.0322,
    allowedRadiusMeters: 150,
    maxAccuracyMeters: 100,
    address: "Rajpur Road, Dehradun, Uttarakhand 248001",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "office-rudrapur",
    name: "Credit Expert - Rudrapur Branch",
    branch: "Rudrapur",
    latitude: 28.9800,
    longitude: 79.4000,
    allowedRadiusMeters: 150,
    maxAccuracyMeters: 100,
    address: "Kashipur Bypass Road, Rudrapur, Uttarakhand 263153",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

