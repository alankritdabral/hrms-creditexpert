"use client";

import React, { useState, useEffect } from "react";
import { EmployeeRequestItem, RequestStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import {
  HelpCircle,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  FileCheck,
} from "lucide-react";

export default function RequestsPage() {
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState<EmployeeRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Request Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [reqType, setReqType] = useState<EmployeeRequestItem["requestType"]>("Salary Certificate");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolution Modal (HR)
  const [resolvingItem, setResolvingItem] = useState<EmployeeRequestItem | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<RequestStatus>("Approved");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const canResolve = ["admin", "hr"].includes(currentUser.role);

  const loadRequests = async () => {
    try {
      const url =
        currentUser.role === "employee"
          ? `/api/requests?employeeId=${currentUser.employeeId}`
          : "/api/requests";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setRequests(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [currentUser]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentUser.employeeId,
          employeeName: currentUser.name,
          department: currentUser.department || "General",
          requestType: reqType,
          subject,
          details,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsNewModalOpen(false);
        setSubject("");
        setDetails("");
        loadRequests();
      }
    } catch (e) {
      console.error(e);
      alert("Error submitting HR request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingItem) return;
    setIsResolving(true);
    try {
      const res = await fetch("/api/requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: resolvingItem.id,
          status: resolutionStatus,
          resolutionNotes,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResolvingItem(null);
        setResolutionNotes("");
        loadRequests();
      }
    } catch (e) {
      console.error(e);
      alert("Error resolving request");
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <HelpCircle className="w-6 h-6 text-blue-600" />
            Centralized HR Helpdesk & Requests
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Submit service requests for salary certificates, experience letters, equipment needs, or profile changes.
          </p>
        </div>
        <Button
          onClick={() => setIsNewModalOpen(true)}
          size="sm"
          icon={<Plus className="w-4 h-4" />}
        >
          New HR Request
        </Button>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {requests.map((r) => (
          <div
            key={r.id}
            className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <Badge variant="indigo">{r.requestType}</Badge>
                <Badge
                  variant={
                    r.status === "Approved" || r.status === "Completed"
                      ? "success"
                      : r.status === "Pending"
                      ? "warning"
                      : "danger"
                  }
                >
                  {r.status}
                </Badge>
                <span className="text-[11px] text-slate-500 font-mono">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              <h3 className="font-bold text-white text-sm">{r.subject}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{r.details}</p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                <span>Raised by:</span>
                <span className="font-medium text-slate-200">
                  {r.employeeName} ({r.employeeId})
                </span>
                <span>• {r.department}</span>
              </div>
              {r.resolutionNotes && (
                <div className="mt-2 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  <span className="text-indigo-400 font-semibold block mb-0.5">
                    HR Resolution by {r.resolvedBy || "HR Admin"}:
                  </span>
                  {r.resolutionNotes}
                </div>
              )}
            </div>

            {canResolve && r.status === "Pending" && (
              <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
                <Button
                  size="sm"
                  onClick={() => {
                    setResolvingItem(r);
                    setResolutionStatus("Approved");
                  }}
                  className="flex-1 sm:flex-none text-xs bg-emerald-600 hover:bg-emerald-500 justify-center"
                >
                  Resolve / Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setResolvingItem(r);
                    setResolutionStatus("Rejected");
                  }}
                  className="flex-1 sm:flex-none text-xs justify-center"
                >
                  Reject
                </Button>
              </div>
            )}
          </div>
        ))}

        {requests.length === 0 && (
          <div className="py-12 text-center text-slate-500 glass-card rounded-2xl border border-slate-800 text-xs">
            No requests found in helpdesk queue.
          </div>
        )}
      </div>

      {/* New Request Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Submit New HR Service Request"
        subtitle="Your request will be routed directly to HR Operations for formal review and processing."
        maxWidth="md"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Request Type *</label>
            <select
              value={reqType}
              onChange={(e) => setReqType(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="Salary Certificate">Salary Certificate</option>
              <option value="Experience Letter">Experience Letter</option>
              <option value="Address Change">Address Change</option>
              <option value="Bank Account Change">Bank Account Change</option>
              <option value="Equipment">IT Equipment / Accessory</option>
              <option value="HR Clarification">General HR Clarification</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Subject *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Salary certificate for visa application"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Detailed Requirements *
            </label>
            <textarea
              rows={4}
              required
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide complete context, supporting details, and any deadline..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsNewModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting} className="w-full sm:w-auto">
              Submit Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* Resolve / Action Modal */}
      <Modal
        isOpen={!!resolvingItem}
        onClose={() => setResolvingItem(null)}
        title={`Process Request: ${resolvingItem?.requestType}`}
        subtitle={`Submitted by ${resolvingItem?.employeeName}`}
        maxWidth="md"
      >
        <form onSubmit={handleResolveSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Decision Status</label>
            <select
              value={resolutionStatus}
              onChange={(e) => setResolutionStatus(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="Approved">Approved</option>
              <option value="Completed">Completed & Dispatched</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Resolution Remarks / Attachment Link *
            </label>
            <textarea
              rows={3}
              required
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="e.g. Document generated and emailed to employee's official email address."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setResolvingItem(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isResolving} className="w-full sm:w-auto">
              Save Resolution
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
