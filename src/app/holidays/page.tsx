"use client";

import React, { useState, useEffect } from "react";
import { Holiday, Branch, BRANCHES } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import {
  Calendar,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Sparkles,
  Info,
  Building,
  Flag,
  Search,
  Filter,
} from "lucide-react";

export default function HolidaysPage() {
  const { currentUser } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formBranch, setFormBranch] = useState<Branch | "All">("All");
  const [formType, setFormType] = useState<Holiday["type"]>("National");
  const [formDescription, setFormDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Authorization check: Admin and HR have full management; Employees have view-only access
  const canManage = ["admin", "hr"].includes(currentUser.role);

  const loadHolidays = async () => {
    try {
      const url = selectedBranch !== "All" ? `/api/holidays?branch=${selectedBranch}` : "/api/holidays";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.data) {
        // Sort chronologically by date
        const sorted = (data.data as Holiday[]).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setHolidays(sorted);
      }
    } catch (e) {
      console.error("Failed to load holidays:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, [selectedBranch]);

  const handleOpenAddModal = () => {
    setEditingHoliday(null);
    setFormName("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormBranch(currentUser.branch || "All");
    setFormType("National");
    setFormDescription("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (h: Holiday) => {
    setEditingHoliday(h);
    setFormName(h.name);
    setFormDate(h.date);
    setFormBranch(h.branch);
    setFormType(h.type);
    setFormDescription(h.description || "");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingHoliday) {
        // Update
        const res = await fetch("/api/holidays", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingHoliday.id,
            updates: {
              name: formName,
              date: formDate,
              branch: formBranch,
              type: formType,
              description: formDescription,
            },
            actor: { name: currentUser.name, role: currentUser.role },
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          loadHolidays();
        } else {
          alert(data.error || "Failed to update holiday");
        }
      } else {
        // Create
        const res = await fetch("/api/holidays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            date: formDate,
            branch: formBranch,
            type: formType,
            description: formDescription,
            actor: { name: currentUser.name, role: currentUser.role },
          }),
        });
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          loadHolidays();
        } else {
          alert(data.error || "Failed to create holiday");
        }
      }
    } catch (e) {
      console.error("Error submitting holiday form:", e);
      alert("Error saving holiday");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}" from the holiday calendar?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/holidays?id=${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadHolidays();
      } else {
        alert(data.error || "Failed to delete holiday");
      }
    } catch (e) {
      console.error("Error deleting holiday:", e);
      alert("Error deleting holiday");
    }
  };

  const filteredHolidays = holidays.filter((h) => {
    const matchesSearch =
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.branch.toLowerCase().includes(search.toLowerCase()) ||
      h.type.toLowerCase().includes(search.toLowerCase()) ||
      (h.description && h.description.toLowerCase().includes(search.toLowerCase()));

    const matchesBranch = selectedBranch === "All" || h.branch === "All" || h.branch === selectedBranch;

    return matchesSearch && matchesBranch;
  });

  const getBranchBadge = (branch: Branch | "All") => {
    switch (branch) {
      case "All":
        return <Badge variant="indigo">All Branches</Badge>;
      case "Delhi":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <MapPin className="w-2.5 h-2.5" /> Delhi
          </span>
        );
      case "Dehradun":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <MapPin className="w-2.5 h-2.5" /> Dehradun
          </span>
        );
      case "Rudrapur":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <MapPin className="w-2.5 h-2.5" /> Rudrapur
          </span>
        );
      default:
        return <Badge>{branch}</Badge>;
    }
  };

  const getTypeBadge = (type: Holiday["type"]) => {
    switch (type) {
      case "National":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Flag className="w-2.5 h-2.5 text-blue-500" /> National
          </span>
        );
      case "Regional":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Building className="w-2.5 h-2.5 text-emerald-500" /> Regional
          </span>
        );
      case "Company":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <Sparkles className="w-2.5 h-2.5 text-slate-500" /> Company
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-blue-600" />
            Corporate & Branch Holidays
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Official paid non-working days for Delhi, Dehradun, and Rudrapur branch operations.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={handleOpenAddModal}
            size="sm"
            icon={<Plus className="w-4 h-4" />}
          >
            Add Holiday
          </Button>
        )}
      </div>

      {/* Policy Notice Box */}
      <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <p className="font-semibold text-blue-950">Holiday Policy Notice (Current Version)</p>
          <p className="text-blue-800/90 mt-0.5">
            Holidays are centrally managed by <strong>Admin</strong> & <strong>HR</strong> across our three branches:{" "}
            <span className="font-semibold">Delhi</span>, <span className="font-semibold">Dehradun</span>, and{" "}
            <span className="font-semibold">Rudrapur</span>. Employees can view holidays applicable to their branch.
            Under current policy, corporate holidays are non-working days and do not deduct from individual leave balances.
          </p>
        </div>
      </div>

      {/* Filter and Branch Tab Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Branch Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            onClick={() => setSelectedBranch("All")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedBranch === "All"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            All Branches
          </button>
          {BRANCHES.map((b) => (
            <button
              key={b}
              onClick={() => setSelectedBranch(b)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedBranch === b
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <MapPin className="w-3 h-3" />
              <span>{b}</span>
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search holiday name, branch, or type..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 font-medium"
          />
        </div>
      </div>

      {/* Holidays Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredHolidays.map((h) => {
          const holidayDate = new Date(h.date);
          const isUpcoming = holidayDate.getTime() >= new Date().setHours(0, 0, 0, 0);
          const formattedDate = holidayDate.toLocaleDateString("en-IN", {
            weekday: "long",
            year: "numeric",
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={h.id}
              className={`bg-white rounded-2xl p-5 border transition-all space-y-4 shadow-xs hover:shadow-md ${
                isUpcoming ? "border-slate-200 hover:border-blue-300" : "border-slate-200/60 opacity-80"
              }`}
            >
              {/* Card Top */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {getBranchBadge(h.branch)}
                    {getTypeBadge(h.type)}
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{h.name}</h3>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenEditModal(h)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Edit Holiday"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(h.id, h.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete Holiday"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Date Block */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-semibold font-mono">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>{formattedDate}</span>
                </div>
                {isUpcoming ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Upcoming
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-medium">Concluded</span>
                )}
              </div>

              {/* Description */}
              {h.description && (
                <p className="text-xs text-slate-600 leading-relaxed">{h.description}</p>
              )}

              {/* Card Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Branch: {h.branch}</span>
                {h.createdBy && <span>Posted by {h.createdBy}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {filteredHolidays.length === 0 && !isLoading && (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-500 text-xs">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No holidays found</p>
          <p className="text-slate-400 mt-1">Try selecting a different branch filter or clearing your search.</p>
        </div>
      )}

      {/* Add / Edit Holiday Modal (Admin & HR) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingHoliday ? "Edit Corporate Holiday" : "Declare Corporate Holiday"}
        subtitle="Manage official paid holiday dates for Delhi, Dehradun, and Rudrapur branches."
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Holiday Name *</label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Diwali (Deepavali), Uttarakhand Day"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Holiday Date *</label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Applicable Branch *</label>
              <select
                value={formBranch}
                onChange={(e) => setFormBranch(e.target.value as Branch | "All")}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 font-medium"
              >
                <option value="All">All Branches</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b} Branch
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Holiday Classification *</label>
            <div className="grid grid-cols-3 gap-2">
              {(["National", "Regional", "Company"] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setFormType(type)}
                  className={`p-2 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                    formType === type
                      ? "bg-blue-50 border-blue-500 text-blue-700 font-semibold"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes</label>
            <textarea
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Provide context regarding this holiday declaration..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              {editingHoliday ? "Update Holiday" : "Publish Holiday"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
