export type UserRole = "admin" | "hr" | "employee";

export type Branch = "Delhi" | "Dehradun" | "Rudrapur";
export const BRANCHES: Branch[] = ["Delhi", "Dehradun", "Rudrapur"];

export type EmploymentType = "Full-time" | "Part-time" | "Intern" | "Consultant" | "Contract";
export type EmploymentStatus =
  | "Candidate"
  | "Offer Sent"
  | "Offer Accepted"
  | "Onboarding"
  | "Probation"
  | "Confirmed"
  | "Active"
  | "On Notice"
  | "Resigned"
  | "Terminated"
  | "Relieved"
  | "Exited";
export type AttendanceStatus = "Present" | "Absent" | "Half Day" | "Late" | "Early Leave" | "Work From Home" | "Holiday" | "Leave" | "Weekend";
export type LeaveType = "Casual Leave" | "Sick Leave";
export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export type PayrollStatus =
  | "DRAFT"
  | "ATTENDANCE_LOCKED"
  | "CALCULATED"
  | "HR_REVIEW"
  | "APPROVED"
  | "FINALIZED"
  | "PAYSLIP_GENERATED"
  | "PAID";

export type IncentiveType = "fixed" | "percentage" | "slab";
export type AssetStatus = "Assigned" | "Returned" | "Damaged" | "Lost" | "Repair" | "Retired";
export type RequestStatus = "Pending" | "In Review" | "Approved" | "Rejected" | "Completed";

export interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  branch: Branch | "All";
  type: "National" | "Regional" | "Company";
  description?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  employeeId: string;
  branch: Branch;
  department?: string;
  avatar?: string;
}

export interface UserAccount {
  uid: string;
  employeeId: string;
  email: string;
  password: string; // Hashed or test credential
  name: string;
  role: UserRole;
  branch: Branch;
  department: string;
  avatar: string;
  status: "Active" | "Pending_Approval" | "Suspended" | "Deactivated";
  createdAt: string;
  lastLoginAt?: string;
  security?: {
    failedLoginAttempts: number;
    lockoutUntil?: string;
  };
}

export interface UserSession {
  sessionId: string;
  userId: string;
  employeeId: string;
  email: string;
  name: string;
  role: UserRole;
  branch: Branch;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  deviceId?: string;
  userAgent?: string;
  ipHash?: string;
  isActive: boolean;
  revokedAt?: string;
  revocationReason?: "signed_in_from_another_device" | "user_logged_out" | "expired" | "admin_revoked";
}

export interface PersonalInfo {
  employeeId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl?: string;
  parentsName?: string;
  dob: string;
  gender: "Male" | "Female" | "Other";
  mobileNumber: string;
  personalEmail: string;
  workEmail: string;
  address: string;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
}

export interface EmploymentInfo {
  dateOfJoining: string;
  department: string;
  designation: string;
  branch: Branch;
  reportingManagerId?: string;
  reportingManagerName?: string;
  employmentType: EmploymentType;
  workLocation: string;
  employmentStatus: EmploymentStatus;
  probationMonths: number;
  confirmationDate?: string;
  employeeCategory: string;
}

export interface StatutoryInfo {
  pan: string; // Sensitive (masked by default)
  aadhaar: string; // Sensitive (masked by default)
  uan: string;
  pfAccountNumber: string;
  esicNumber?: string;
  bankAccountNumber: string; // Sensitive (masked by default)
  ifscCode: string;
  bankName: string;
}

export interface SalaryComponent {
  annualCtc: number;
  monthlyCtc: number;
  basic: number;
  hra: number;
  specialAllowance: number;
  otherAllowance: number;
  grossSalary: number;
  employerPf: number;
  employerEsic: number;
  employeePf: number;
  professionalTax: number;
}

export interface SalaryRevisionRecord {
  id: string;
  effectiveFrom: string;
  annualCtc: number;
  components: SalaryComponent;
  revisionReason: string;
  updatedBy: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeId: string; // e.g. "EMP-0012"
  personal: PersonalInfo;
  employment: EmploymentInfo;
  statutory: StatutoryInfo;
  currentSalary: SalaryComponent;
  salaryHistory: SalaryRevisionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  checkIn?: string; // HH:mm:ss
  checkOut?: string; // HH:mm:ss
  totalWorkingHours: number;
  breakDurationMinutes: number;
  status: AttendanceStatus;
  lateArrival: boolean;
  earlyDeparture: boolean;
  overtimeHours: number;
  remarks?: string;
}

export interface AttendancePolicy {
  id: string;
  department: string;
  officeStartTime: string; // "10:00"
  officeEndTime: string; // "19:00"
  gracePeriodMinutes: number; // 15
  fullDayMinHours: number; // 8
  halfDayMinHours: number; // 4
  standardBreakHours: number; // 1
}

export interface LeaveRecordSummary {
  casualTaken: number;
  sickTaken: number;
  totalTaken: number;
  pendingRequests: number;
}

export type LeaveBalance = LeaveRecordSummary;

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface IncentiveScheme {
  id: string;
  name: string;
  type: IncentiveType;
  description: string;
  fixedRate?: number;
  percentageRate?: number;
  slabs?: { min: number; max: number; amount: number }[];
  active: boolean;
}

export interface EmployeeIncentiveRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string; // "YYYY-MM"
  schemeId: string;
  schemeName: string;
  target: number;
  achievement: number;
  eligibleAmount: number;
  incentiveAmount: number;
  status: "Pending" | "Approved" | "Rejected";
  approvedBy?: string;
  approvedDate?: string;
  payrollRunId?: string;
}

export interface PayrollItemSnapshot {
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  bankAccountMasked: string;
  ifscCode: string;
  panMasked: string;
  // Earnings
  basic: number;
  hra: number;
  otherAllowance: number;
  overtime: number;
  incentive: number;
  bonus: number;
  grossEarnings: number;
  // Deductions
  employeePf: number;
  professionalTax: number;
  lopDays: number;
  lopAmount: number;
  otherDeductions: number;
  totalDeductions: number;
  // Net
  netSalary: number;
  // Employer contributions
  employerPf: number;
  employerEsic: number;
}

export interface PayrollRun {
  id: string;
  runCode: string; // "PAY-2026-10"
  month: string; // "2026-10"
  periodLabel: string; // "October 2026"
  status: PayrollStatus;
  totalEmployees: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalPfEmployer: number;
  items: PayrollItemSnapshot[];
  createdAt: string;
  finalizedAt?: string;
  paidAt?: string;
  approvedBy?: string;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  employeeName: string;
  documentType: string;
  title: string;
  fileUrl: string;
  uploadedBy: string;
  uploadDate: string;
  expiryDate?: string;
  status: "Verified" | "Pending" | "Expired";
  notes?: string;
}

export interface AssetRecord {
  id: string;
  assetTag: string; // "LAP-023"
  type: string; // "Laptop", "Monitor", "Phone", etc.
  model: string;
  serialNumber: string;
  assignedToEmployeeId?: string;
  assignedToName?: string;
  issuedDate?: string;
  status: AssetStatus;
  notes?: string;
}

export interface EmployeeRequestItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  requestType: "Salary Certificate" | "Experience Letter" | "Address Change" | "Bank Account Change" | "Equipment" | "HR Clarification" | "Other";
  subject: string;
  details: string;
  status: RequestStatus;
  createdAt: string;
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  description: string;
  targetAudience: "All" | "Engineering" | "Sales" | "Operations" | "HR";
  priority: "High" | "Normal";
  publishDate: string;
  expiryDate?: string;
  publishedBy: string;
}

export interface AuditLogItem {
  id: string;
  who: string;
  role: string;
  action: string;
  employeeId?: string;
  employeeName?: string;
  details: string;
  timestamp: string;
}

// ----------------- ONBOARDING & LIFECYCLE -----------------

export type OnboardingCategory = "documentation" | "statutory" | "compliance" | "it_setup" | "account";

export interface OnboardingChecklistItem {
  key: string;
  label: string;
  category: OnboardingCategory;
  required: boolean;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
  documentUrl?: string;
}

export interface KycDocumentItem {
  type: string;
  title: string;
  fileUrl: string;
  publicId?: string;
  fileSize?: number;
  uploadedAt: string;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
}

export interface OnboardingRecord {
  id: string;
  userId?: string;
  employeeId?: string;
  candidateName: string;
  email: string;
  phone: string;
  branch: Branch;
  department: string;
  designation: string;
  joiningDate: string;
  lifecycleStatus: EmploymentStatus;
  status: "Pending" | "In Progress" | "Completed" | "Rejected";
  progressPercentage: number;
  checklist: OnboardingChecklistItem[];
  assignedHrName: string;
  annualCtc?: number;
  notes?: string;
  selfRegistered?: boolean;
  kycDocuments?: KycDocumentItem[];
  personalDetails?: {
    dob?: string;
    gender?: "Male" | "Female" | "Other";
    parentsName?: string;
    currentAddress?: string;
    permanentAddress?: string;
    emergencyContact?: {
      name: string;
      relationship: string;
      phone: string;
    };
  };
  statutoryDetails?: {
    pan?: string;
    aadhaar?: string;
    bankAccountNumber?: string;
    ifscCode?: string;
    bankName?: string;
  };
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export const STANDARD_ONBOARDING_CHECKLIST: Omit<OnboardingChecklistItem, "completed" | "verified">[] = [
  { key: "offer_letter", label: "Offer Letter Generated & Signed", category: "compliance", required: true },
  { key: "appointment_letter", label: "Appointment Letter Issued", category: "compliance", required: true },
  { key: "pan_card", label: "PAN Card Verification", category: "statutory", required: true },
  { key: "aadhaar_card", label: "Aadhaar Card Verification", category: "statutory", required: true },
  { key: "bank_details", label: "Bank Account & IFSC Verification", category: "statutory", required: true },
  { key: "cancelled_cheque", label: "Cancelled Cheque / Passbook Proof", category: "statutory", required: true },
  { key: "photograph", label: "Formal Passport Photograph", category: "documentation", required: true },
  { key: "address_proof", label: "Permanent & Current Address Proof", category: "documentation", required: true },
  { key: "education_docs", label: "Educational Degree & Certificates", category: "documentation", required: true },
  { key: "prev_employment", label: "Previous Relieving & Experience Letters", category: "documentation", required: false },
  { key: "nda_signed", label: "Non-Disclosure Agreement (NDA)", category: "compliance", required: true },
  { key: "policy_ack", label: "Company Policy Handbook Acknowledgement", category: "compliance", required: true },
  { key: "asset_allocated", label: "IT Asset Allocation (Laptop & Peripherals)", category: "it_setup", required: true },
  { key: "email_created", label: "Corporate Email Account Provisioning", category: "account", required: true },
  { key: "hrms_account", label: "HRMS Login & Access Setup", category: "account", required: true },
];

export const LIFECYCLE_STAGES: { status: EmploymentStatus; label: string; step: number; description: string }[] = [
  { status: "Candidate", label: "Candidate", step: 1, description: "Interviewing & background evaluation" },
  { status: "Offer Sent", label: "Offer Sent", step: 2, description: "Formal offer letter dispatched" },
  { status: "Offer Accepted", label: "Offer Accepted", step: 3, description: "Candidate signed acceptance" },
  { status: "Onboarding", label: "Onboarding", step: 4, description: "15-point checklist & document verification" },
  { status: "Probation", label: "Probation", step: 5, description: "Initial probationary employment period" },
  { status: "Confirmed", label: "Confirmed", step: 6, description: "Evaluation passed & confirmed staff" },
  { status: "Active", label: "Active", step: 7, description: "Standard operational workforce member" },
  { status: "On Notice", label: "On Notice", step: 8, description: "Serving formal notice period" },
  { status: "Resigned", label: "Resigned", step: 9, description: "Voluntary resignation processed" },
  { status: "Terminated", label: "Terminated", step: 10, description: "Employment terminated" },
  { status: "Exited", label: "Exited", step: 11, description: "Full & Final settlement completed" },
];

