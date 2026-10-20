"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ShieldCheck,
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  KeyRound,
  Sparkles,
  RefreshCw,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();

  // Step: 1 = Email Input, 2 = OTP Verification, 3 = New Password, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Dev code & loading states
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to dispatch reset code.");
      } else {
        setSuccessNotice(data.message);
        if (data.devOtp) {
          setDevOtpCode(data.devOtp);
        }
        setStep(2);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected network error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMessage("Please enter the 6-digit code received on your email.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpCode.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Invalid verification code.");
      } else {
        setDevOtpCode(null);
        setStep(3);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to verify code.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to update password.");
      } else {
        setStep(4);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background ambient radial glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 blur-[130px] rounded-full" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Credit Expert India</h1>
              <p className="text-xs text-slate-400">Account Recovery & Password Reset</p>
            </div>
          </div>
          <Link
            href="/login"
            className="text-xs font-semibold text-slate-400 hover:text-white transition-colors border border-slate-800 px-3 py-1.5 rounded-lg hover:border-slate-700"
          >
            Back to Sign In
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 max-w-md mx-auto w-full px-4 py-12 flex-1 flex flex-col justify-center">
        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-shake">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block text-rose-200">Security Notice</span>
              {errorMessage}
            </div>
          </div>
        )}

        {/* Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          {/* ============================================================== */}
          {/* STEP 1: ENTER REGISTERED EMAIL */}
          {/* ============================================================== */}
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 mx-auto flex items-center justify-center shadow-md shadow-indigo-500/10">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Forgot Your Password?
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter your registered work or personal email address. We will send you a 6-digit verification code to reset your password.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Registered Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@creditexpertindia.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                className="w-full py-2.5"
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Send 6-Digit Reset Code
              </Button>

              <div className="pt-3 border-t border-slate-800/80 text-center">
                <span className="text-xs text-slate-500">Remembered your password? </span>
                <Link
                  href="/login"
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline"
                >
                  Sign In
                </Link>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* STEP 2: ENTER OTP CODE */}
          {/* ============================================================== */}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center shadow-md shadow-amber-500/10">
                  <Clock className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Verify Reset Code
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  We sent a 6-digit code to <strong className="text-slate-200">{email}</strong>.
                  The code expires in 10 minutes.
                </p>
              </div>

              {/* Dev mode code helper */}
              {devOtpCode && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                  <span>
                    🛠️ <strong>Dev Mode Code:</strong>{" "}
                    <span className="font-mono text-base font-bold">{devOtpCode}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOtpCode(devOtpCode)}
                    className="text-[11px] underline font-semibold text-amber-200 hover:text-white"
                  >
                    Auto-fill
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 text-center">
                  6-Digit Verification Code *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="space-y-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isLoading}
                  className="w-full py-2.5"
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Verify Code
                </Button>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setErrorMessage(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Change Email
                  </button>

                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleSendOtp}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                  >
                    Resend Code
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* STEP 3: ENTER NEW PASSWORD */}
          {/* ============================================================== */}
          {step === 3 && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 mx-auto flex items-center justify-center shadow-md shadow-indigo-500/10">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Set New Password
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter your new secure password for <strong className="text-slate-200">{email}</strong>.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    New Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Confirm New Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your new password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                className="w-full py-2.5"
                icon={<CheckCircle2 className="w-4 h-4" />}
              >
                Reset Password
              </Button>
            </form>
          )}

          {/* ============================================================== */}
          {/* STEP 4: SUCCESS CONFIRMATION */}
          {/* ============================================================== */}
          {step === 4 && (
            <div className="text-center space-y-6 py-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <Badge variant="success" className="text-xs uppercase tracking-wider font-bold">
                  Password Updated
                </Badge>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Password Reset Successful!
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                  Your password has been successfully updated. A security notification was dispatched to your email. You can now sign in with your new password.
                </p>
              </div>

              <Link href="/login">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full py-2.5"
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Proceed to Sign In
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950 px-6 py-4 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} Credit Expert India HRMS. Encrypted & ISO Compliant Employee Data Management.
      </footer>
    </div>
  );
}
