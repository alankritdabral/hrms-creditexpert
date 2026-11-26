import React from "react";

type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "indigo"
  | "purple"
  | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
  const styles: Record<BadgeVariant, string> = {
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    danger: "bg-rose-50 text-rose-700 border border-rose-200",
    info: "bg-brand-50 text-brand-700 border border-brand-200",
    indigo: "bg-brand-50 text-brand-700 border border-brand-200 font-semibold",
    purple: "bg-purple-50 text-purple-700 border border-purple-200",
    neutral: "bg-slate-100 text-slate-700 border border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
