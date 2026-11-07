"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { findSimilarEmployees } from "@/lib/name-match";
import type { Employee } from "@/lib/types";

interface Props {
  employee: Employee;
}

/** Shown on a temporary employee's profile: merge it into the registered employee it really is. */
export function AttachTemporaryBanner({ employee }: Props) {
  const router = useRouter();
  const [people, setPeople] = useState<{ employeeId: string; name: string }[]>([]);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((json) => {
        if (!json.success || !Array.isArray(json.data)) return;
        setPeople(
          (json.data as Employee[])
            .filter((e) => !e.isTemporary && e.employeeId !== employee.employeeId)
            .map((e) => ({ employeeId: e.employeeId, name: e.personal?.fullName || e.employeeId }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => {});
  }, [employee.employeeId]);

  const similar = useMemo(() => findSimilarEmployees(employee.personal.fullName, people), [employee.personal.fullName, people]);
  const target = people.find((p) => p.employeeId === targetId);

  const attach = async () => {
    if (!target) return;
    if (!window.confirm(`Move everything from ${employee.personal.fullName} to ${target.name} (${target.employeeId})? The temporary record will be removed.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(employee.employeeId)}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEmployeeId: target.employeeId }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Could not attach. Please try again.");
        return;
      }
      router.push(`/employees/${encodeURIComponent(target.employeeId)}`);
    } catch {
      setError("Could not attach. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div>
        <div className="text-sm font-bold text-amber-900">Temporary employee</div>
        <p className="text-xs text-amber-800 mt-0.5">
          This record was created automatically so entries had an owner. Once the real person is registered, attach it to them:
          their Login Sheet rows, login records and incentives move across and this record is removed. If this record has a login account, the account moves to them too.
        </p>
      </div>

      {similar.length > 0 && (
        <div className="text-xs text-amber-900">
          Looks like a registered employee:{" "}
          {similar.map((m, i) => (
            <button
              key={m.employee.employeeId}
              type="button"
              onClick={() => setTargetId(m.employee.employeeId)}
              className="font-semibold underline underline-offset-2 mr-2 cursor-pointer"
            >
              {m.employee.name} ({m.employee.employeeId}){i < similar.length - 1 ? "," : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="text-xs rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 min-w-[16rem] text-slate-900"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          aria-label="Registered employee to attach to"
        >
          <option value="">Choose registered employee…</option>
          {people.map((p) => (
            <option key={p.employeeId} value={p.employeeId}>
              {p.name} ({p.employeeId})
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={attach} disabled={!target || busy} isLoading={busy} icon={<Link2 className="w-3.5 h-3.5" />}>
          Attach
        </Button>
      </div>

      {error && (
        <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
