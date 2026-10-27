"use client";

import React, { useState, useEffect } from "react";
import { AssetRecord, Employee, AssetStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import {
  Laptop,
  Monitor,
  Headphones,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Search,
} from "lucide-react";

export default function AssetsPage() {
  const { currentUser } = useAuth();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Edit / Status Update Modal
  const [editingAsset, setEditingAsset] = useState<AssetRecord | null>(null);
  const [editStatus, setEditStatus] = useState<AssetStatus>("Assigned");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Add Asset Form
  const [newTag, setNewTag] = useState("");
  const [newType, setNewType] = useState("Laptop");
  const [newModel, setNewModel] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const canManage = ["admin", "hr"].includes(currentUser.role);

  const loadData = async () => {
    try {
      const [astRes, empRes] = await Promise.all([
        fetch("/api/assets").then((r) => r.json()),
        fetch("/api/employees").then((r) => r.json()),
      ]);
      if (astRes.success) setAssets(astRes.data);
      if (empRes.success) setEmployees(empRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    const emp = employees.find((e) => e.employeeId === newAssignedTo);

    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetTag: newTag || `AST-${Math.floor(100 + Math.random() * 900)}`,
          type: newType,
          model: newModel,
          serialNumber: newSerial,
          assignedToEmployeeId: newAssignedTo || undefined,
          assignedToName: emp?.personal.fullName || undefined,
          status: newAssignedTo ? "Assigned" : "Returned",
          notes: newNotes,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAddModalOpen(false);
        setNewTag("");
        setNewModel("");
        setNewSerial("");
        setNewNotes("");
        loadData();
      }
    } catch (e) {
      console.error(e);
      alert("Error adding asset");
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsset) return;
    setIsUpdating(true);
    const emp = employees.find((e) => e.employeeId === editAssignedTo);

    try {
      const res = await fetch("/api/assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAsset.id,
          updates: {
            status: editStatus,
            assignedToEmployeeId: editStatus === "Assigned" ? editAssignedTo : undefined,
            assignedToName: editStatus === "Assigned" ? emp?.personal.fullName : undefined,
          },
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingAsset(null);
        loadData();
      }
    } catch (e) {
      console.error(e);
      alert("Error updating asset");
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredAssets = assets.filter((a) => {
    const matchesSearch =
      a.assetTag.toLowerCase().includes(search.toLowerCase()) ||
      a.model.toLowerCase().includes(search.toLowerCase()) ||
      a.serialNumber.toLowerCase().includes(search.toLowerCase()) ||
      (a.assignedToName && a.assignedToName.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "All" || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const assignedCount = assets.filter((a) => a.status === "Assigned").length;
  const inStockCount = assets.filter((a) => a.status === "Returned").length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Laptop className="w-6 h-6 text-blue-600" />
            Company Asset Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Track hardware allocation, serial numbers, warranty status, and asset return clearances.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setIsAddModalOpen(true)}
            size="sm"
            icon={<Plus className="w-4 h-4" />}
          >
            Register New Asset
          </Button>
        )}
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <span className="text-xs text-slate-400">Total Registered Equipment</span>
          <p className="text-2xl font-bold text-white mt-1">{assets.length}</p>
          <span className="text-[11px] text-slate-500">Laptops, monitors, and peripherals</span>
        </div>
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <span className="text-xs text-slate-400">Actively Assigned</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{assignedCount}</p>
          <span className="text-[11px] text-slate-500">With verified employee custody</span>
        </div>
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <span className="text-xs text-slate-400">In IT Inventory</span>
          <p className="text-2xl font-bold text-indigo-400 mt-1">{inStockCount}</p>
          <span className="text-[11px] text-slate-500">Available for immediate onboarding</span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tag, model, serial, employee..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="All">All Statuses</option>
            <option value="Assigned">Assigned</option>
            <option value="Returned">Returned / In Stock</option>
            <option value="Repair">Repair</option>
            <option value="Damaged">Damaged</option>
          </select>
        </div>
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAssets.map((a) => (
          <div
            key={a.id}
            className="glass-card rounded-2xl p-5 border border-slate-800 hover:border-indigo-500/40 transition-all space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                    {a.assetTag}
                  </span>
                  <Badge
                    variant={
                      a.status === "Assigned"
                        ? "success"
                        : a.status === "Returned"
                        ? "indigo"
                        : "danger"
                    }
                  >
                    {a.status}
                  </Badge>
                </div>
                <h3 className="font-bold text-white text-sm mt-2">{a.model}</h3>
                <span className="text-[11px] text-slate-400">{a.type}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Serial Number:</span>
                <span className="text-slate-200 font-mono font-medium">{a.serialNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned To:</span>
                <span className="text-white font-medium">{a.assignedToName || "Unassigned"}</span>
              </div>
              {a.issuedDate && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Issued Date:</span>
                  <span className="text-slate-300 font-mono">{a.issuedDate}</span>
                </div>
              )}
            </div>

            {a.notes && <p className="text-[11px] text-slate-400 italic leading-snug">{a.notes}</p>}

            {canManage && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                icon={<Edit2 className="w-3.5 h-3.5" />}
                onClick={() => {
                  setEditingAsset(a);
                  setEditStatus(a.status);
                  setEditAssignedTo(a.assignedToEmployeeId || "");
                }}
              >
                Update Status / Reassign
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Register New Asset Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register Company Asset"
        subtitle="Record equipment details, serial numbers, and assign custody to an active employee."
        maxWidth="md"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Asset Tag *</label>
              <input
                type="text"
                required
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="e.g. LAP-045"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Asset Type *</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Laptop">Laptop</option>
                <option value="Monitor">Monitor</option>
                <option value="Headset">Headset</option>
                <option value="Desktop">Desktop</option>
                <option value="Phone / Tablet">Phone / Tablet</option>
                <option value="Access Card / Key">Access Card / Key</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Model & Brand *</label>
            <input
              type="text"
              required
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="e.g. Apple MacBook Air M3 15-inch"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Serial Number *</label>
            <input
              type="text"
              required
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              placeholder="e.g. C02XYZ12345"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Assign to Employee (Optional)
            </label>
            <select
              value={newAssignedTo}
              onChange={(e) => setNewAssignedTo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Keep in IT Inventory (Unassigned)</option>
              {employees.map((e) => (
                <option key={e.id} value={e.employeeId}>
                  {e.personal.fullName} ({e.employeeId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Internal Notes</label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="e.g. Purchased with 3-year AppleCare warranty"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isAdding} className="w-full sm:w-auto">
              Save Asset
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit / Reassign Modal */}
      <Modal
        isOpen={!!editingAsset}
        onClose={() => setEditingAsset(null)}
        title={`Update Asset: ${editingAsset?.assetTag}`}
        subtitle={`Current Model: ${editingAsset?.model}`}
        maxWidth="md"
      >
        <form onSubmit={handleUpdateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Asset Status *</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="Assigned">Assigned to Employee</option>
              <option value="Returned">Returned to Inventory</option>
              <option value="Repair">Out for Maintenance / Repair</option>
              <option value="Damaged">Damaged / Write-off</option>
              <option value="Retired">Retired / Decommissioned</option>
            </select>
          </div>

          {editStatus === "Assigned" && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Assign to Employee *
              </label>
              <select
                value={editAssignedTo}
                onChange={(e) => setEditAssignedTo(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.employeeId}>
                    {e.personal.fullName} ({e.employeeId})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingAsset(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isUpdating} className="w-full sm:w-auto">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
