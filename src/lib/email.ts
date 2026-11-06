import "server-only";
import nodemailer from "nodemailer";
import {
  saveDocumentToFirestore,
  getDocumentFromFirestore,
  deleteDocumentFromFirestore,
} from "./firestore-service";
import { isLocalEnvironment } from "./env";
import { generateOtpCode, hashOtp, otpMatches } from "./otp";
import { ordinal } from "./attendance/late-policy";

// OTP records live in Firestore (collection "otps") so they survive restarts and work across
// serverless instances; the memory maps are only a read-through cache. Only a hash of the code is stored.
interface StoredOtp {
  otpHash: string;
  expiresAt: number;
  attempts: number;
  verified: boolean;
  createdAt: number;
}

const globalForOtp = globalThis as unknown as {
  __hrms_otp_store?: Map<string, StoredOtp>;
  __hrms_pwd_reset_otp_store?: Map<string, StoredOtp>;
};

const otpStore = (globalForOtp.__hrms_otp_store ??= new Map<string, StoredOtp>());
const passwordResetOtpStore = (globalForOtp.__hrms_pwd_reset_otp_store ??= new Map<string, StoredOtp>());
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

type OtpKind = "registration" | "password_reset";
const stores: Record<OtpKind, Map<string, StoredOtp>> = {
  registration: otpStore,
  password_reset: passwordResetOtpStore,
};

function getOtpDocId(kind: OtpKind, email: string): string {
  const safe = email.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_");
  return (kind === "registration" ? "otp_" : "pwdreset_") + safe;
}

async function loadOtp(kind: OtpKind, email: string): Promise<StoredOtp | undefined> {
  const store = stores[kind];
  let record = store.get(email);
  if (!record) {
    try {
      const doc = await getDocumentFromFirestore<StoredOtp>("otps", getOtpDocId(kind, email));
      if (doc && typeof doc.otpHash === "string") {
        record = doc;
        store.set(email, record);
      }
    } catch (e) {
      console.warn("Firestore OTP fetch fallback:", e);
    }
  }
  return record;
}

async function saveOtp(kind: OtpKind, email: string, record: StoredOtp): Promise<void> {
  stores[kind].set(email, record);
  // Awaited: on serverless the next request may land on another instance.
  await saveDocumentToFirestore("otps", getOtpDocId(kind, email), record).catch((e) =>
    console.warn("Failed to persist OTP:", e)
  );
}

async function removeOtp(kind: OtpKind, email: string): Promise<void> {
  stores[kind].delete(email);
  await deleteDocumentFromFirestore("otps", getOtpDocId(kind, email)).catch(() => {});
}

// Check if SMTP is configured
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
    });
  }

  return null;
}

/**
 * Generates a random 6-digit numeric OTP
 */
export function generateOtp(): string {
  return generateOtpCode();
}

/**
 * Sends a 6-digit OTP to the candidate's email address.
 * If SMTP credentials are not yet configured in .env.local,
 * logs the code clearly in the terminal and returns it in dev mode.
 */
export async function sendEmailOtp(
  email: string,
  candidateName: string = "Candidate"
): Promise<{ success: boolean; message: string; devOtp?: string; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const code = generateOtp();
  const now = Date.now();

  const record: StoredOtp = {
    otpHash: hashOtp(code, normalizedEmail),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    verified: false,
    createdAt: now,
  };

  await saveOtp("registration", normalizedEmail, record);

  // Always log OTP in development console for fast verification & debugging
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n==================================================`);
    console.log(`🔑 [DEV HRMS OTP] Recipient: ${normalizedEmail}`);
    console.log(`🔑 [DEV HRMS OTP] 6-Digit Code: ${code} (Valid for 10 mins)`);
    console.log(`==================================================\n`);
  }

  const transporter = getTransporter();
  const fromAddress = process.env.SMTP_FROM || `"Credit Expert HRMS" <no-reply@creditexpertindia.com>`;

  const subject = `Your HRMS Verification Code: ${code}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #4f46e5; margin: 0;">Credit Expert India</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Human Resource Management System</p>
      </div>
      <div style="padding: 20px; background-color: #f8fafc; border-radius: 6px; margin-bottom: 20px;">
        <p style="color: #334155; font-size: 15px; margin: 0 0 12px 0;">Hello <strong>${candidateName}</strong>,</p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 20px 0;">
          Thank you for starting your employee registration with Credit Expert India. Please enter the following 6-digit verification code to confirm your email:
        </p>
        <div style="text-align: center; padding: 16px; background-color: #ffffff; border: 2px dashed #cbd5e1; border-radius: 6px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b; font-family: monospace;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center;">
          This code is valid for 10 minutes. If you did not request this, please ignore this email.
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Credit Expert India. All rights reserved.
      </p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: normalizedEmail,
        subject,
        html: htmlContent,
      });

      return {
        success: true,
        message: `Verification code sent to ${normalizedEmail}.`,
        devOtp: isLocalEnvironment() ? code : undefined,
      };
    } catch (error: any) {
      console.error("SMTP sendMail failed:", error);
      return {
        success: true,
        message: `OTP logged to development console (SMTP failed: ${error.message}).`,
        devOtp: isLocalEnvironment() ? code : undefined,
      };
    }
  }

  // Dev mode console fallback
  return {
    success: true,
    message: `Verification code generated. (Check server terminal for code).`,
    devOtp: isLocalEnvironment() ? code : undefined,
  };
}

/**
 * Validates a submitted OTP for an email address.
 */
export async function verifyEmailOtp(
  email: string,
  submittedOtp: string
): Promise<{ success: boolean; error?: string }> {
  return verifyOtp("registration", email, submittedOtp, "No active verification code found for this email. Please request a new OTP.");
}

/**
 * Checks if an email has recently been verified via OTP
 */
export async function isEmailOtpVerified(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const record = await loadOtp("registration", normalizedEmail);
  return Boolean(record && record.verified && Date.now() <= record.expiresAt + 60 * 60 * 1000);
}

async function verifyOtp(
  kind: OtpKind,
  email: string,
  submittedOtp: string,
  missingMessage: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const record = await loadOtp(kind, normalizedEmail);

  if (!record) {
    return { success: false, error: missingMessage };
  }

  if (Date.now() > record.expiresAt) {
    await removeOtp(kind, normalizedEmail);
    return { success: false, error: "Verification code has expired. Please request a new one." };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await removeOtp(kind, normalizedEmail);
    return { success: false, error: "Maximum verification attempts exceeded. Please request a new code." };
  }

  record.attempts += 1;

  if (!otpMatches(submittedOtp, normalizedEmail, record.otpHash)) {
    const remaining = MAX_ATTEMPTS - record.attempts;
    await saveOtp(kind, normalizedEmail, record);
    return { success: false, error: `Invalid verification code. ${remaining} attempt(s) remaining.` };
  }

  record.verified = true;
  await saveOtp(kind, normalizedEmail, record);
  return { success: true };
}

/**
 * Sends an email notification when an employee application is approved by HR/Admin
 */
export async function sendAccountApprovedEmail(
  email: string,
  candidateName: string,
  employeeId: string
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const transporter = getTransporter();
  const fromAddress = process.env.SMTP_FROM || `"Credit Expert HRMS" <no-reply@creditexpertindia.com>`;

  const subject = `Welcome to Credit Expert India! Your HRMS Account is Approved (${employeeId})`;
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #10b981; margin: 0;">Application Approved!</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Credit Expert India HRMS</p>
      </div>
      <div style="padding: 20px; background-color: #f8fafc; border-radius: 6px; margin-bottom: 20px;">
        <p style="color: #334155; font-size: 15px; margin: 0 0 12px 0;">Dear <strong>${candidateName}</strong>,</p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 16px 0;">
          Congratulations! Your onboarding details and KYC documents have been reviewed and approved by HR & Admin.
        </p>
        <div style="padding: 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0; color: #166534; font-size: 14px;"><strong>Official Employee ID:</strong> <span style="font-family: monospace; font-size: 16px;">${employeeId}</span></p>
          <p style="margin: 8px 0 0 0; color: #166534; font-size: 14px;"><strong>Account Status:</strong> Active</p>
        </div>
        <p style="color: #475569; font-size: 14px; margin: 16px 0;">
          You can now log in to the portal using your registered email address and password.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${loginUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
            Log In to HRMS Portal
          </a>
        </div>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Credit Expert India. All rights reserved.
      </p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: normalizedEmail,
        subject,
        html: htmlContent,
      });
      return true;
    } catch (e) {
      console.error("Failed to send approval email via SMTP:", e);
    }
  }

  console.log(`\n==================================================`);
  console.log(`🎉 [DEV EMAIL NOTIFICATION] Employee Approved: ${candidateName}`);
  console.log(`📧 [DEV EMAIL NOTIFICATION] Email: ${normalizedEmail}`);
  console.log(`🆔 [DEV EMAIL NOTIFICATION] Employee ID: ${employeeId}`);
  console.log(`==================================================\n`);

  return true;
}

// ============================================================================
// PASSWORD RESET OTP & NOTIFICATION ENGINE
// ============================================================================


/**
 * Sends a 6-digit password reset OTP to the user's email address.
 */
export async function sendPasswordResetOtp(
  email: string,
  userName: string = "Employee"
): Promise<{ success: boolean; message: string; devOtp?: string; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const code = generateOtp();
  const now = Date.now();

  await saveOtp("password_reset", normalizedEmail, {
    otpHash: hashOtp(code, normalizedEmail),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    verified: false,
    createdAt: now,
  });

  if (process.env.NODE_ENV !== "production") {
    console.log(`\n==================================================`);
    console.log(`🔑 [DEV HRMS RESET OTP] Recipient: ${normalizedEmail}`);
    console.log(`🔑 [DEV HRMS RESET OTP] Code:      ${code} (Valid for 10 mins)`);
    console.log(`==================================================\n`);
  }

  const transporter = getTransporter();
  const fromAddress = process.env.SMTP_FROM || `"Credit Expert HRMS Security" <security@creditexpertindia.com>`;

  const subject = `Your HRMS Password Reset Code: ${code}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #4f46e5; margin: 0;">Credit Expert India</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">HRMS Security Alert</p>
      </div>
      <div style="padding: 20px; background-color: #f8fafc; border-radius: 6px; margin-bottom: 20px;">
        <p style="color: #334155; font-size: 15px; margin: 0 0 12px 0;">Hello <strong>${userName}</strong>,</p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 20px 0;">
          We received a request to reset your password for your Credit Expert India HRMS account.
          Please use the following 6-digit verification code to proceed:
        </p>
        <div style="text-align: center; padding: 16px; background-color: #ffffff; border: 2px dashed #cbd5e1; border-radius: 6px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #dc2626; font-family: monospace;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center;">
          This code is valid for 10 minutes. If you did NOT request a password reset, please contact your HR or IT department immediately.
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Credit Expert India. All rights reserved.
      </p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: normalizedEmail,
        subject,
        html: htmlContent,
      });

      return {
        success: true,
        message: `Password reset verification code sent to ${normalizedEmail}.`,
        devOtp: isLocalEnvironment() ? code : undefined,
      };
    } catch (error: any) {
      console.error("SMTP sendMail failed for password reset:", error);
      if (isLocalEnvironment()) {
        console.log(`\n==================================================`);
        console.log(`🔑 [DEV HRMS RESET OTP] Email: ${normalizedEmail}`);
        console.log(`🔑 [DEV HRMS RESET OTP] Code:  ${code} (Valid for 10 mins)`);
        console.log(`==================================================\n`);
      }

      return {
        success: true,
        message: `Reset OTP logged to development console (SMTP failed: ${error.message}).`,
        devOtp: isLocalEnvironment() ? code : undefined,
      };
    }
  }

  // Dev mode console fallback
  return {
    success: true,
    message: `Password reset code generated. (Check server terminal for code).`,
    devOtp: isLocalEnvironment() ? code : undefined,
  };
}

/**
 * Validates a submitted password reset OTP.
 */
export async function verifyPasswordResetOtp(
  email: string,
  submittedOtp: string
): Promise<{ success: boolean; error?: string }> {
  return verifyOtp(
    "password_reset",
    email,
    submittedOtp,
    "No active password reset request found for this email. Please request a new code."
  );
}

/**
 * Checks if a password reset OTP was verified in the last 15 minutes.
 */
export async function isPasswordResetOtpVerified(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const record = await loadOtp("password_reset", normalizedEmail);
  return Boolean(record && record.verified && Date.now() <= record.expiresAt + 15 * 60 * 1000);
}

/**
 * Consumes/clears the password reset OTP once the new password has been set.
 */
export async function clearPasswordResetOtp(email: string): Promise<void> {
  await removeOtp("password_reset", email.toLowerCase().trim());
}

/**
 * Sends a security confirmation email notifying the user their password was updated.
 */
export async function sendPasswordChangedEmail(
  email: string,
  userName: string
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const transporter = getTransporter();
  const fromAddress = process.env.SMTP_FROM || `"Credit Expert HRMS Security" <security@creditexpertindia.com>`;

  const subject = `Security Notice: Your HRMS Password Was Changed`;
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #4f46e5; margin: 0;">Credit Expert India</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Security Notification</p>
      </div>
      <div style="padding: 20px; background-color: #f8fafc; border-radius: 6px; margin-bottom: 20px;">
        <p style="color: #334155; font-size: 15px; margin: 0 0 12px 0;">Hello <strong>${userName}</strong>,</p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 16px 0;">
          This is to confirm that the password for your Credit Expert India HRMS account was successfully changed on <strong>${new Date().toLocaleString()}</strong>.
        </p>
        <div style="padding: 14px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0; color: #1e40af; font-size: 13px;">
            If you made this change, you can safely disregard this email.
          </p>
          <p style="margin: 8px 0 0 0; color: #dc2626; font-size: 13px; font-weight: bold;">
            If you did NOT change your password, please contact IT Support and HR immediately to secure your account.
          </p>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${loginUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">
            Sign In with New Password
          </a>
        </div>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Credit Expert India. All rights reserved.
      </p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: normalizedEmail,
        subject,
        html: htmlContent,
      });
      return true;
    } catch (e) {
      console.error("Failed to send password changed confirmation email via SMTP:", e);
    }
  }

  console.log(`\n==================================================`);
  console.log(`🔐 [DEV EMAIL NOTIFICATION] Password changed successfully for ${userName} (${normalizedEmail})`);
  console.log(`==================================================\n`);

  return true;
}

/** The automatic half-day rule shown in the attendance reminder. Times are "HH:mm" (IST). */
export interface AttendanceRuleReminder {
  /** Arrivals after this time are late. */
  lateAfter: string;
  weeklyLateAllowance: number;
  /** An arrival after this time is always a Half Day. */
  hardCutoffTime?: string;
}

function clock12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Public base URL of the portal: NEXT_PUBLIC_APP_URL, else the Vercel production domain, else localhost. */
function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export function attendanceLink(): string {
  return `${appBaseUrl()}/attendance`;
}

export function ruleReminderHtml(rule: AttendanceRuleReminder): string {
  const late = clock12(rule.lateAfter);
  const allowed = rule.weeklyLateAllowance;
  const items = [
    `Clock in by ${late}; arrivals after ${late.replace(" AM", "").replace(" PM", "")} are Late.`,
    `You can be late ${allowed} time${allowed === 1 ? "" : "s"} a week (Mon–Sat). From the ${ordinal(allowed + 1)} late arrival in a week, every arrival after ${late.replace(" AM", "").replace(" PM", "")} is an automatic Half Day.`,
  ];
  if (rule.hardCutoffTime) items.push(`Arriving after ${clock12(rule.hardCutoffTime)} is always a Half Day.`);
  items.push("A Half Day deducts half a day of salary.");
  return `
      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
        <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 13px; line-height: 1.7;">
          ${items.map((i) => `<li>${i}</li>`).join("\n          ")}
        </ul>
      </div>`;
}

/**
 * Daily reminder: attendance has not been marked yet. Includes the employee's timing rule when given.
 */
export async function sendAttendanceReminderEmail(
  email: string,
  name: string,
  date: string,
  rule?: AttendanceRuleReminder
): Promise<boolean> {
  const transporter = getTransporter();
  const fromAddress = process.env.SMTP_FROM || `"Credit Expert HRMS" <no-reply@creditexpertindia.com>`;
  const portalUrl = attendanceLink();
  const safeName = name.replace(/[<>&"]/g, "");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #f59e0b; margin: 0 0 12px 0;">Attendance Reminder</h2>
      <p style="color: #334155; font-size: 15px;">Dear <strong>${safeName}</strong>,</p>
      <p style="color: #475569; font-size: 14px;">
        Your attendance for <strong>${date}</strong> has not been marked yet. Please clock in on the HRMS portal as soon as possible.
      </p>${rule ? ruleReminderHtml(rule) : ""}
      <div style="text-align: center; margin: 24px 0;">
        <a href="${portalUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Mark Attendance</a>
        <p style="color: #64748b; font-size: 12px; margin: 12px 0 0 0;">
          Or open this link: <a href="${portalUrl}" style="color: #4f46e5;">${portalUrl}</a>
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Credit Expert India</p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: email.toLowerCase().trim(),
        subject: `Reminder: Attendance not marked for ${date}`,
        html,
      });
      return true;
    } catch (e) {
      console.error("Failed to send attendance reminder:", e);
      return false;
    }
  }

  console.log(`[DEV EMAIL] Attendance reminder -> ${email} (${date})`);
  return true;
}
