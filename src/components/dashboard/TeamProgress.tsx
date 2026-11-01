"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Target, TrendingUp } from "lucide-react";
import { EmployeeLoginRecord } from "@/lib/types";

type Health = "ahead" | "on-track" | "behind" | "no-target";

const HEALTH_STYLE: Record<Health, { bar: string; chip: string; label: string }> = {
  ahead: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", label: "Ahead" },
  "on-track": { bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700", label: "On track" },
  behind: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700", label: "Behind" },
  "no-target": { bar: "bg-slate-300", chip: "bg-slate-100 text-slate-500", label: "No target" },
};

const inr = (n: number) =>
  n >= 10000000 ? `₹${(n / 10000000).toFixed(2)} Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Compare achievement against how much of the month has elapsed. */
function healthOf(pct: number | null, elapsedPct: number): Health {
  if (pct === null) return "no-target";
  if (pct >= 100 || pct >= elapsedPct + 10) return "ahead";
  if (pct >= elapsedPct - 15) return "on-track";
  return "behind";
}

function Bar({ pct, health }: { pct: number | null; health: Health }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={Math.min(pct ?? 0, 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${HEALTH_STYLE[health].bar}`} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
    </div>
  );
}

/**
 * Simple at-a-glance view of how every employee is tracking against their
 * monthly disbursal / login targets, compared with how far into the month we are.
 */
export function TeamProgress() {
  const [rows, setRows] = useState<EmployeeLoginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Health | "all">("all");

  useEffect(() => {
    const month = new Date().toISOString().slice(0, 7);
    fetch(`/api/logins?month=${month}`)
      .then((r) => r.json())
      .then((j) => j.success && setRows(j.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const elapsedPct = useMemo(() => {
    const d = new Date();
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return (d.getDate() / days) * 100;
  }, []);

  const data = useMemo(
    () =>
      rows
        .map((r) => {
          const pct = r.commitment > 0 ? (r.totalDisbursal / r.commitment) * 100 : null;
          const loginPct = r.loginCommitment && r.loginCommitment > 0 ? (r.loginsCount / r.loginCommitment) * 100 : null;
          return { r, pct, loginPct, health: healthOf(pct, elapsedPct) };
        })
        .sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1)), // those needing attention first
    [rows, elapsedPct]
  );

  const counts = useMemo(() => {
    const c: Record<Health, number> = { ahead: 0, "on-track": 0, behind: 0, "no-target": 0 };
    data.forEach((d) => c[d.health]++);
    return c;
  }, [data]);

  const visible = data.filter((d) => filter === "all" || d.health === filter);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600" /> Team Progress — this month
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {Math.round(elapsedPct)}% of the month has passed. Bars show achievement against target.
          </p>
        </div>
        <Link href="/logins" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          Open logins & disbursals
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "behind", "on-track", "ahead", "no-target"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-colors ${
              filter === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {k === "all" ? `All (${data.length})` : `${HEALTH_STYLE[k].label} (${counts[k]})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Loading progress…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No records for this view yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
          {visible.map(({ r, pct, loginPct, health }) => (
            <li key={r.id} className="py-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.2fr)] gap-2 sm:gap-4 sm:items-center">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{r.employeeName}</div>
                <div className="text-[11px] text-slate-500 truncate">{[r.department, r.branch].filter(Boolean).join(" · ") || r.employeeId}</div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Disbursal</span>
                  <span>
                    {inr(r.totalDisbursal)} / {r.commitment ? inr(r.commitment) : "—"}
                    {pct !== null && <b className="ml-1 text-slate-900">{Math.round(pct)}%</b>}
                  </span>
                </div>
                <Bar pct={pct} health={health} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>
                    Logins {r.loginsCount}
                    {r.loginCommitment ? ` / ${r.loginCommitment}` : ""}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${HEALTH_STYLE[health].chip}`}>{HEALTH_STYLE[health].label}</span>
                </div>
                <Bar pct={loginPct} health={health} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
