"use client";

import React, { useState, useEffect } from "react";
import { AuditLogItem } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollText, ShieldAlert, Clock, User, Filter } from "lucide-react";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // One page of the ledger per request
  useEffect(() => {
    async function loadLogs() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: "25" });
        if (debouncedSearch) params.set("q", debouncedSearch);
        const res = await fetch(`/api/audit-logs?${params.toString()}`);
        const data = await res.json();
        if (data.success) {
          setLogs(data.data);
          setMeta({ total: data.meta.total, totalPages: data.meta.totalPages });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, [page, debouncedSearch]);

  const filteredLogs = logs;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ScrollText className="w-6 h-6 text-blue-600" />
            Immutable System Audit Logs
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-proof ledger of financial revisions, salary structures, attendance overrides, and administrative actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="indigo" className="py-1 px-3">
            Append-Only Protection Active
          </Badge>
        </div>
      </div>

      {/* Search Input */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter audit logs by user, action, employee, or detail..."
          className="w-full sm:w-96 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <span className="text-xs text-slate-400 shrink-0">{meta.total} events logged</span>
      </div>

      {/* Logs Table */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3 font-medium">Timestamp</th>
                <th className="pb-3 font-medium">Actor</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">Action</th>
                <th className="pb-3 font-medium">Target Employee</th>
                <th className="pb-3 font-medium">Details & Changes Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/20">
                  <td className="py-3 font-mono text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="py-3 font-semibold text-white whitespace-nowrap">{log.who}</td>
                  <td className="py-3">
                    <Badge variant="indigo" className="uppercase text-[10px]">
                      {log.role}
                    </Badge>
                  </td>
                  <td className="py-3 font-medium text-indigo-300">{log.action}</td>
                  <td className="py-3 text-slate-300 whitespace-nowrap">
                    {log.employeeName ? `${log.employeeName} (${log.employeeId})` : "—"}
                  </td>
                  <td className="py-3 text-slate-300 leading-relaxed font-mono text-[11px]">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={meta.totalPages} total={meta.total} onPageChange={setPage} disabled={isLoading} />
      </div>
    </div>
  );
}
