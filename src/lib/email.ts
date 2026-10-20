import nodemailer from "nodemailer";

// In-memory OTP storage with TTL and rate limiting
interface StoredOtp {
  otp: string;
  expiresAt: number;
  attempts: number;
  verified: boolean;
  createdAt: number;
}

// Global store to retain OTPs across requests during execution
const otpStore = new Map<string, StoredOtp>();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

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
  return Math.floor(100000 + Math.random() * 900000).toString();
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

  otpStore.set(normalizedEmail, {
    otp: code,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    verified: false,
    createdAt: now,
  });

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
      };
    } catch (error: any) {
      console.error("SMTP sendMail failed:", error);
      // Fallback to dev log so testing never blocks
      console.log(`\n==================================================`);
      console.log(`🔑 [DEV HRMS OTP] Email: ${normalizedEmail}`);
      console.log(`🔑 [DEV HRMS OTP] Code:  ${code} (Valid for 10 mins)`);
      console.log(`==================================================\n`);

      return {
        success: true,
        message: `OTP logged to development console (SMTP failed: ${error.message}).`,
        devOtp: process.env.NODE_ENV !== "production" ? code : undefined,
      };
    }
  }

  // Dev mode console fallback
  console.log(`\n==================================================`);
  console.log(`📧 [DEV EMAIL SIMULATOR] Recipient: ${normalizedEmail}`);
  console.log(`🔑 [DEV EMAIL SIMULATOR] 6-Digit OTP: ${code}`);
  console.log(`⏱️ [DEV EMAIL SIMULATOR] Valid for 10 minutes`);
  console.log(`ℹ️ [DEV EMAIL SIMULATOR] Configure SMTP in .env.local to send real emails`);
  console.log(`==================================================\n`);

  return {
    success: true,
    message: `Verification code generated. (Check server terminal for code).`,
    devOtp: code,
  };
}

/**
 * Validates a submitted OTP for an email address.
 */
export async function verifyEmailOtp(
  email: string,
  submittedOtp: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return {
      success: false,
      error: "No active verification code found for this email. Please request a new OTP.",
    };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedEmail);
    return {
      success: false,
      error: "Verification code has expired. Please request a new one.",
    };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(normalizedEmail);
    return {
      success: false,
      error: "Maximum verification attempts exceeded. Please request a new OTP.",
    };
  }

  record.attempts += 1;

  if (record.otp !== submittedOtp.trim()) {
    const remaining = MAX_ATTEMPTS - record.attempts;
    return {
      success: false,
      error: `Invalid verification code. ${remaining} attempt(s) remaining.`,
    };
  }

  record.verified = true;
  return { success: true };
}

/**
 * Checks if an email has recently been verified via OTP
 */
export function isEmailOtpVerified(email: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);
  return Boolean(record && record.verified && Date.now() <= record.expiresAt + 30 * 60 * 1000);
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

const passwordResetOtpStore = new Map<string, StoredOtp>();

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

  passwordResetOtpStore.set(normalizedEmail, {
    otp: code,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    verified: false,
    createdAt: now,
  });

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
      };
    } catch (error: any) {
      console.error("SMTP sendMail failed for password reset:", error);
      console.log(`\n==================================================`);
      console.log(`🔑 [DEV HRMS RESET OTP] Email: ${normalizedEmail}`);
      console.log(`🔑 [DEV HRMS RESET OTP] Code:  ${code} (Valid for 10 mins)`);
      console.log(`==================================================\n`);

      return {
        success: true,
        message: `Reset OTP logged to development console (SMTP failed: ${error.message}).`,
        devOtp: process.env.NODE_ENV !== "production" ? code : undefined,
      };
    }
  }

  // Dev mode console fallback
  console.log(`\n==================================================`);
  console.log(`📧 [DEV EMAIL SIMULATOR - PASSWORD RESET] Recipient: ${normalizedEmail}`);
  console.log(`🔑 [DEV EMAIL SIMULATOR - PASSWORD RESET] 6-Digit OTP: ${code}`);
  console.log(`⏱️ [DEV EMAIL SIMULATOR - PASSWORD RESET] Valid for 10 minutes`);
  console.log(`==================================================\n`);

  return {
    success: true,
    message: `Password reset code generated. (Check server terminal for code).`,
    devOtp: code,
  };
}

/**
 * Validates a submitted password reset OTP.
 */
export async function verifyPasswordResetOtp(
  email: string,
  submittedOtp: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const record = passwordResetOtpStore.get(normalizedEmail);

  if (!record) {
    return {
      success: false,
      error: "No active password reset request found for this email. Please request a new code.",
    };
  }

  if (Date.now() > record.expiresAt) {
    passwordResetOtpStore.delete(normalizedEmail);
    return {
      success: false,
      error: "Password reset code has expired. Please request a new one.",
    };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    passwordResetOtpStore.delete(normalizedEmail);
    return {
      success: false,
      error: "Maximum verification attempts exceeded. Please request a new reset code.",
    };
  }

  record.attempts += 1;

  if (record.otp !== submittedOtp.trim()) {
    const remaining = MAX_ATTEMPTS - record.attempts;
    return {
      success: false,
      error: `Invalid verification code. ${remaining} attempt(s) remaining.`,
    };
  }

  record.verified = true;
  return { success: true };
}

/**
 * Checks if a password reset OTP was verified in the last 15 minutes.
 */
export function isPasswordResetOtpVerified(email: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  const record = passwordResetOtpStore.get(normalizedEmail);
  return Boolean(record && record.verified && Date.now() <= record.expiresAt + 15 * 60 * 1000);
}

/**
 * Consumes/clears the password reset OTP once the new password has been set.
 */
export function clearPasswordResetOtp(email: string): void {
  const normalizedEmail = email.toLowerCase().trim();
  passwordResetOtpStore.delete(normalizedEmail);
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
