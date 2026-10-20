"use client";

import React, { useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface SensitiveDataMaskProps {
  value: string;
  type?: "pan" | "aadhaar" | "bank" | "uan";
  label?: string;
  className?: string;
}

export function SensitiveDataMask({
  value,
  type = "pan",
  label,
  className = "",
}: SensitiveDataMaskProps) {
  const [revealed, setRevealed] = useState(false);
  const { currentUser } = useAuth();

  // Admin and HR can unmask sensitive statutory numbers
  const canUnmask = ["admin", "hr"].includes(currentUser.role);

  const getMaskedValue = (val: string) => {
    if (!val) return "••••••••";
    if (type === "pan") {
      return val.length >= 4 ? `${val.slice(0, 2)}•••••${val.slice(-2)}` : "••••••••••";
    }
    if (type === "aadhaar") {
      return val.length >= 4 ? `•••• •••• ${val.slice(-4)}` : "•••• •••• ••••";
    }
    if (type === "bank") {
      return val.length >= 4 ? `••••••••••••${val.slice(-4)}` : "••••••••••••";
    }
    return `••••${val.slice(-4)}`;
  };

  return (
    <div className={`inline-flex items-center gap-2 font-mono text-sm ${className}`}>
      <span className="text-slate-300 font-medium">
        {revealed && canUnmask ? value : getMaskedValue(value)}
      </span>
      {canUnmask ? (
        <button
          type="button"
          onClick={() => setRevealed(!revealed)}
          className="text-slate-500 hover:text-indigo-400 transition-colors p-1 rounded cursor-pointer"
          title={revealed ? "Mask sensitive value" : "Unmask sensitive data (Admin)"}
        >
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      ) : (
        <span title="Restricted by RBAC Policy" className="text-slate-600">
          <ShieldCheck className="w-3.5 h-3.5 inline text-slate-500" />
        </span>
      )}
    </div>
  );
}
