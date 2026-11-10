"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { findSimilarEmployees } from "@/lib/name-match";
import type { SheetEmployee } from "@/components/login-sheet/EntryFormModal";

interface Details {
  employeeId: string;
  name: string;
  branch: string;
  department: string;
  designation: string;
  status: string;
  isTemporary: boolean;
  email: string;
  mobile: string;
  loginSheetRows: number;
}

interface Props {
  /** The employee being managed; null keeps the dialog closed. */
  employee: { employeeId: string; name: string } | null;
  /** Everyone the sheet knows, for choosing who a temporary employee is merged into. */
  people: SheetEmployee[];
  onClose: () => void;
  onRenamed: (employeeId: string, name: string, rows: number) => void;
  onMerged: (temporaryId: string, target: { employeeId: string; name: string }, rows: number) => void;
}

const inputCls =
  "w-full py-2 px-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

function DetailsGrid({ details }: { details: Details }) {
  const facts: [string, string][] = [
    ["Emp code", details.employeeId],
    ["Branch", details.branch],
    ["Department", details.department],
    ["Designation", details.designation],
    ["Status", details.isTemporary ? `${details.status} (temporary)` : details.status],
    ["Email", details.email || "—"],
    ["Mobile", details.mobile || "—"],
    ["Login Sheet rows", String(details.loginSheetRows)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
      {facts.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{k}</dt>
          <dd className={`break-words text-slate-800 ${k === "Emp code" ? "font-mono font-semibold" : ""}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

async function fetchDetails(id: string): Promise<{ data?: Details; error?: string }> {
  try {
    const json = await (await fetch(`/api/login-sheet/employee?employeeId=${encodeURIComponent(id)}`)).json();
    return json.success ? { data: json.data } : { error: json.error || "Could not load this employee." };
  } catch {
    return { error: "Could not load this employee." };
  }
}

/**
 * Manage one employee from the Login Sheet: change their name (the emp code stays the same) or, for a
 * temporary employee, merge their login data into a registered employee.
 */
export function RenameEmployeeModal({ employee, people, onClose, onRenamed, onMerged }: Props) {
  const [details, setDetails] = useState<Details | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [targetId, setTargetId] = useState("");
  const [target, setTarget] = useState<Details | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const id = employee?.employeeId;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setDetails(null);
    setLoadError(null);
    setError(null);
    setTargetId("");
    setTarget(null);
    setTargetError(null);
    setMergeError(null);
    setName(employee?.name ?? "");
    fetchDetails(id).then((r) => {
      if (cancelled) return;
      if (r.data) {
        setDetails(r.data);
        setName(r.data.name);
      } else setLoadError(r.error ?? "Could not load this employee.");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Show who the temporary employee would be merged into as soon as one is chosen.
  useEffect(() => {
    setTarget(null);
    setTargetError(null);
    setMergeError(null);
    if (!targetId) return;
    let cancelled = false;
    fetchDetails(targetId).then((r) => {
      if (cancelled) return;
      if (r.data) setTarget(r.data);
      else setTargetError(r.error ?? "Could not load this employee.");
    });
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const registered = useMemo(
    () => people.filter((p) => !p.isTemporary && p.employeeId !== id).sort((a, b) => a.name.localeCompare(b.name)),
    [people, id]
  );
  const similar = useMemo(() => (details ? findSimilarEmployees(details.name, registered) : []), [details, registered]);

  const trimmed = name.trim().replace(/\s+/g, " ");
  const unchanged = !details || trimmed === details.name;

  const save = async () => {
    if (!id || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/login-sheet/employee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: id, name: trimmed }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not rename the employee.");
      onRenamed(json.data.employeeId, json.data.name, json.data.loginSheetRows);
    } catch (e: any) {
      setError(e?.message || "Could not rename the employee.");
    } finally {
      setSaving(false);
    }
  };

  const merge = async () => {
    if (!id || !details || !target) return;
    if (
      !window.confirm(
        `Merge ${details.name} (${details.employeeId}) into ${target.name} (${target.employeeId})?\n\nThe login data moves to ${target.name} and the temporary record is removed. This cannot be undone.`
      )
    )
      return;
    setMerging(true);
    setMergeError(null);
    try {
      const res = await fetch("/api/login-sheet/employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temporaryId: id, targetEmployeeId: target.employeeId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Could not merge the employees.");
      onMerged(id, { employeeId: json.data.employeeId, name: json.data.name }, json.data.loginSheetRows);
    } catch (e: any) {
      setMergeError(e?.message || "Could not merge the employees.");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Modal
      isOpen={!!employee}
      onClose={onClose}
      title="Rename employee"
      subtitle="The emp code stays the same. The new name replaces the old one in the employee record and on all their Login Sheet rows."
      maxWidth="lg"
    >
      <div className="space-y-4">
        {loadError ? (
          <p className="text-sm text-rose-600">{loadError}</p>
        ) : !details ? (
          <p className="text-sm text-slate-400">Loading employee details…</p>
        ) : (
          <DetailsGrid details={details} />
        )}

        <div>
          <label htmlFor="rename-employee-name" className="mb-1 block text-xs font-semibold text-slate-600">
            New name
          </label>
          <input
            id="rename-employee-name"
            className={inputCls}
            value={name}
            maxLength={80}
            autoFocus
            disabled={!details}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
        </div>

        {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2.5">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} isLoading={saving} disabled={unchanged || trimmed.length < 2}>
            Rename
          </Button>
        </div>

        {details?.isTemporary && (
          <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div>
              <h3 className="text-sm font-bold text-amber-900">Merge into a registered employee</h3>
              <p className="mt-0.5 text-xs text-amber-800">
                {details.name} is a temporary employee. If this is a registered employee under another name, merge them: only the
                login data (Login Sheet rows, monthly login records and manual incentives) moves to the registered employee. The
                registered employee&apos;s own record and name are kept, so every moved row will show their name instead of
                &ldquo;{details.name}&rdquo;. The temporary record is then removed, and a login account on it, if any, moves to
                the registered employee.
              </p>
            </div>

            {similar.length > 0 && (
              <div className="text-xs text-amber-900">
                Looks like:{" "}
                {similar.map((m, i) => (
                  <button
                    key={m.employee.employeeId}
                    type="button"
                    onClick={() => setTargetId(m.employee.employeeId)}
                    className="mr-2 cursor-pointer font-semibold underline underline-offset-2"
                  >
                    {m.employee.name} ({m.employee.employeeId}){i < similar.length - 1 ? "," : ""}
                  </button>
                ))}
              </div>
            )}

            <select
              className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              aria-label="Registered employee to merge into"
            >
              <option value="">Choose registered employee…</option>
              {registered.map((p) => (
                <option key={p.employeeId} value={p.employeeId}>
                  {p.name} ({p.employeeId}){p.branch ? ` · ${p.branch}` : ""}
                </option>
              ))}
            </select>

            {targetId && !target && !targetError && <p className="text-xs text-amber-800">Loading employee details…</p>}
            {targetError && <p className="text-xs text-rose-700">{targetError}</p>}
            {target && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-amber-900">Merging into</div>
                <DetailsGrid details={target} />
                <p className="text-xs text-amber-900">
                  {details.loginSheetRows} Login Sheet {details.loginSheetRows === 1 ? "row" : "rows"} will move from{" "}
                  <b>{details.name}</b> to <b>{target.name}</b>, who then has {target.loginSheetRows + details.loginSheetRows}.
                </p>
              </div>
            )}

            {mergeError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {mergeError}
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={merge} disabled={!target || merging} isLoading={merging} icon={<Link2 className="h-3.5 w-3.5" />}>
                Merge
              </Button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
