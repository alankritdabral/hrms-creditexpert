"use client";

import React, { useState, useEffect } from "react";
import { EmployeeDocument, Employee } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import {
  FolderLock,
  Upload,
  AlertTriangle,
  FileText,
  CheckCircle,
  Clock,
  Download,
  Search,
} from "lucide-react";

export default function DocumentsPage() {
  const { currentUser } = useAuth();
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Upload Form
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [documentType, setDocumentType] = useState("Offer Letter");
  const [title, setTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const canUpload = ["admin", "hr"].includes(currentUser.role);

  const loadData = async () => {
    try {
      const [empRes, docRes] = await Promise.all([
        fetch("/api/employees").then((r) => r.json()),
        fetch("/api/employees/EMP-0012").then((r) => r.json()), // fallback query
      ]);

      if (empRes.success && empRes.data) {
        setEmployees(empRes.data);
        if (empRes.data.length > 0) setSelectedEmployeeId(empRes.data[0].employeeId);
      }

      // Initial document catalog
      setDocuments([
        {
          id: "doc-1",
          employeeId: "EMP-0012",
          employeeName: "Sneha Patel",
          documentType: "Offer Letter",
          title: "Offer_Letter_Sneha_Patel.pdf",
          fileUrl: "#",
          uploadedBy: "Rahul Sharma (HR)",
          uploadDate: "2024-06-10",
          status: "Verified",
          notes: "Official signed acceptance",
        },
        {
          id: "doc-2",
          employeeId: "EMP-0012",
          employeeName: "Sneha Patel",
          documentType: "Passport / Visa",
          title: "Passport_Sneha_Patel.pdf",
          fileUrl: "#",
          uploadedBy: "Rahul Sharma (HR)",
          uploadDate: "2024-06-15",
          expiryDate: "2026-11-15",
          status: "Verified",
          notes: "Requires renewal for upcoming client travel",
        },
        {
          id: "doc-3",
          employeeId: "EMP-0005",
          employeeName: "Vikram Rao",
          documentType: "Non-Disclosure Agreement (NDA)",
          title: "NDA_Enterprise_Sales_Vikram.pdf",
          fileUrl: "#",
          uploadedBy: "Rahul Sharma (HR)",
          uploadDate: "2025-01-15",
          status: "Verified",
          notes: "Full IP and confidentiality agreement",
        },
        {
          id: "doc-4",
          employeeId: "EMP-0008",
          employeeName: "Ananya Deshmukh",
          documentType: "Degree Certificate",
          title: "BDes_Design_Degree.pdf",
          fileUrl: "#",
          uploadedBy: "Ananya Deshmukh",
          uploadDate: "2025-08-01",
          status: "Verified",
          notes: "Education background verified",
        },
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    const emp = employees.find((e) => e.employeeId === selectedEmployeeId);

    const newDoc: EmployeeDocument = {
      id: `doc-${Date.now()}`,
      employeeId: selectedEmployeeId,
      employeeName: emp?.personal.fullName || selectedEmployeeId,
      documentType,
      title: title || `${documentType.replace(/\s+/g, "_")}.pdf`,
      fileUrl: "#",
      uploadedBy: currentUser.name,
      uploadDate: new Date().toISOString().split("T")[0],
      expiryDate: expiryDate || undefined,
      status: "Verified",
      notes,
    };

    setDocuments([newDoc, ...documents]);
    setIsUploading(false);
    setIsModalOpen(false);
    setTitle("");
    setExpiryDate("");
    setNotes("");
  };

  const filteredDocs = documents.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      d.documentType.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "All" || d.documentType === typeFilter;
    return matchesSearch && matchesType;
  });

  const expiringDocs = documents.filter((d) => {
    if (!d.expiryDate) return false;
    const diffDays = Math.ceil(
      (new Date(d.expiryDate).getTime() - new Date("2026-10-17").getTime()) / (1000 * 60 * 60 * 24)
    );
    return diffDays > 0 && diffDays <= 45;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FolderLock className="w-6 h-6 text-blue-600" />
            Employee Documents & Compliance
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Secure cloud document repository with automated expiry monitoring and compliance tracking.
          </p>
        </div>
        {canUpload && (
          <Button
            onClick={() => setIsModalOpen(true)}
            size="sm"
            icon={<Upload className="w-4 h-4" />}
          >
            Upload Document
          </Button>
        )}
      </div>

      {/* Document Expiry Alerts Banner (Section 4.1 of PRD) */}
      {expiringDocs.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h3 className="font-semibold text-amber-300">
              {expiringDocs.length} Document(s) Expiring Soon
            </h3>
            <p className="text-slate-300 mt-0.5">
              The following employee credentials require renewal within 45 days:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {expiringDocs.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-medium"
                >
                  {d.employeeName} — {d.title} (Expires: {d.expiryDate})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search Bar */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by title or employee..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="All">All Types</option>
            <option value="Offer Letter">Offer Letter</option>
            <option value="Passport / Visa">Passport / Visa</option>
            <option value="Non-Disclosure Agreement (NDA)">NDA</option>
            <option value="Degree Certificate">Degree Certificate</option>
          </select>
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDocs.map((d) => (
          <div
            key={d.id}
            className="glass-card rounded-2xl p-5 border border-slate-800 hover:border-indigo-500/40 transition-all space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-xs truncate max-w-[160px]">{d.title}</h3>
                  <span className="text-[11px] text-slate-400 block">{d.documentType}</span>
                </div>
              </div>
              <Badge variant={d.status === "Verified" ? "success" : "warning"}>{d.status}</Badge>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Employee:</span>
                <span className="text-slate-200 font-medium">{d.employeeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Uploaded On:</span>
                <span className="text-slate-300 font-mono">{d.uploadDate}</span>
              </div>
              {d.expiryDate && (
                <div className="flex justify-between text-amber-400 font-medium pt-1 border-t border-slate-800">
                  <span>Expiry Date:</span>
                  <span className="font-mono">{d.expiryDate}</span>
                </div>
              )}
            </div>

            {d.notes && <p className="text-[11px] text-slate-400 italic leading-snug">{d.notes}</p>}

            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={() => alert(`Downloading document: ${d.title}`)}
            >
              Download Secure Copy
            </Button>
          </div>
        ))}
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Upload Employee Document"
        subtitle="Store official identification, contract letters, or certifications with optional expiry notification rules."
        maxWidth="md"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Employee *</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.employeeId}>
                  {e.personal.fullName} ({e.employeeId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Document Type *</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="Offer Letter">Offer Letter</option>
              <option value="Appointment Letter">Appointment Letter</option>
              <option value="Non-Disclosure Agreement (NDA)">Non-Disclosure Agreement (NDA)</option>
              <option value="Passport / Visa">Passport / Visa</option>
              <option value="Aadhaar Card">Aadhaar Card</option>
              <option value="PAN Card">PAN Card</option>
              <option value="Degree Certificate">Degree Certificate</option>
              <option value="Salary Revision Letter">Salary Revision Letter</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Document Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Passport_Renewal_2026.pdf"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Expiry Date (Optional)
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              HR will receive automatic warnings when within 30 days of expiry.
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Internal Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Scanned original, verified in person"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isUploading}>
              Upload Document
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
