"use client";

import React, { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Lock,
  Mail,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  MapPin,
  CheckCircle2,
  Clock,
  UserPlus,
} from "lucide-react";

import { useIsLocalhost } from "@/lib/use-is-localhost";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reason = searchParams?.get("reason");
  const isRevokedByAnotherDevice = reason === "another_device";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        router.push("/dashboard");
      } else {
        setErrorMessage(res.error || "Authentication failed. Please check your credentials.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6 relative z-10">
      {/* Brand Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-white border border-slate-200 shadow-md shadow-blue-500/5">
          <Image
            src="/img/logo_with_name.webp"
            alt="Credit Expert India Logo"
            width={260}
            height={60}
            className="h-10 sm:h-12 w-auto object-contain"
            priority
          />
        </div>
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            Enterprise Authentication & Single Active Session
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Workforce Management Portal</h1>
          <p className="text-xs text-slate-500 mt-1">
            Sign in with your verified employee credentials. One active session allowed per user.
          </p>
        </div>
      </div>

      {/* SINGLE ACTIVE SESSION REVOCATION BANNER */}
      {isRevokedByAnotherDevice && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-sm animate-fadeIn">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-amber-900">Session Terminated</p>
              <p className="text-amber-800 leading-relaxed font-medium">
                Your session has ended because your account was signed in from another device.
              </p>
              <p className="text-[11px] text-amber-700">
                To resume using this workstation, sign in again.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SESSION EXPIRED BANNER */}
      {reason === "session_expired" && !isRevokedByAnotherDevice && (
        <div className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-200 text-blue-900 shadow-sm animate-fadeIn">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-blue-900">Session Expired</p>
              <p className="text-blue-800 leading-relaxed font-medium">
                Your security session has expired. Please sign in again to continue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ERROR / PENDING NOTICE BANNER */}
      {errorMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs animate-fadeIn ${
            errorMessage.toLowerCase().includes("pending")
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {errorMessage.toLowerCase().includes("pending") ? (
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div>
            {errorMessage.toLowerCase().includes("pending") && (
              <span className="font-bold block text-amber-800 mb-0.5">Application Under Review</span>
            )}
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Secure Credentials Form */}
      <form onSubmit={handleLogin} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <span className="text-xs font-semibold text-slate-700">Secure Account Sign In</span>
          <Badge variant="indigo">Single Session</Badge>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Work Email</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@creditexpertindia.com"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-medium transition-all"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-700">Password</label>
            <Link
              href="/forgot-password"
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 font-medium transition-all"
            />
          </div>
        </div>

        <Button type="submit" size="sm" className="w-full py-2.5 mt-2" isLoading={isSubmitting}>
          Sign In to Workplace
        </Button>

        {/* Self Registration Link */}
        <div className="pt-3 border-t border-slate-100 text-center">
          <span className="text-xs text-slate-500">New employee or candidate? </span>
          <Link
            href="/register"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline inline-flex items-center gap-1"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Self-Register Online
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[88vh] flex items-center justify-center p-4 relative">
      {/* Background ambient blue glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-sky-200/20 rounded-full blur-3xl pointer-events-none" />

      <Suspense fallback={<div className="text-xs text-slate-500">Loading sign-in portal...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
