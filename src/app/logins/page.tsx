"use client";

import React, { useState, useEffect } from "react";
import { EmployeeLoginRecord, BankDisbursalBreakdown, CustomerDisbursalEntry, Employee } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import {
  TrendingUp,
  Building2,
  Calendar,
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  ExternalLink,
  DollarSign,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const PRESET_BANKS = [
  "Axis Bank",
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India (SBI)",
  "Kotak Mahindra Bank",
  "Bajaj Finserv",
  "Tata Capital",
  "Piramal Finance",
  "IDFC First Bank",
  "Other Bank / NBFC",
];

export default function LoginsPage() {
  const { currentUser } = useAuth();
  const [logins, setLogins] = useState<EmployeeLoginRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Bank Disbursal Modal State
  const [activeLogin, setActiveLogin] = useState<EmployeeLoginRecord | null>(null);
  const [isDisbursalModalOpen, setIsDisbursalModalOpen] = useState(false);
  const [modalBanks, setModalBanks] = useState<BankDisbursalBreakdown[]>([]);
  const [newBankName, setNewBankName] = useState("Axis Bank");
  const [isSavingDisbursals, setIsSavingDisbursals] = useState(false);

  // Quick Edit Modal State
  const [editingRecord, setEditingRecord] = useState<EmployeeLoginRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Add New Login Entry Modal State
  const [isAddLoginModalOpen, setIsAddLoginModalOpen] = useState(false);
  const [addEmpId, setAddEmpId] = useState("");
  const [addEmpName, setAddEmpName] = useState("");
  const [addDepartment, setAddDepartment] = useState("Sales");
  const [addBranch, setAddBranch] = useState("Delhi");
  const [isCustomEmployee, setIsCustomEmployee] = useState(false);
  const [addCommitment, setAddCommitment] = useState<number | "">(5000000);
  const [addLoginsCount, setAddLoginsCount] = useState<number | "">(5);
  const [addSubmissionDate, setAddSubmissionDate] = useState(new Date().toISOString().split("T")[0]);
  const [addLastLoginDate, setAddLastLoginDate] = useState(new Date().toISOString().split("T")[0]);
  const [addRemarks, setAddRemarks] = useState("");
  const [addInitialBank, setAddInitialBank] = useState("Axis Bank");
  const [addInitialDisbursal, setAddInitialDisbursal] = useState<number | "">("");
  const [addInitialCustomerName, setAddInitialCustomerName] = useState("");
  const [isAddingLogin, setIsAddingLogin] = useState(false);

  const openAddLoginModal = () => {
    if (employees.length > 0 && !addEmpId) {
      setAddEmpId(employees[0].employeeId);
      setAddEmpName(employees[0].personal.fullName);
      setAddDepartment(employees[0].employment.department || "Sales");
      setAddBranch(employees[0].employment.branch || "Delhi");
    }
    setIsAddLoginModalOpen(true);
  };

  // New Customer Form inside Bank Modal
  const [activeBankIdForNewCustomer, setActiveBankIdForNewCustomer] = useState<string | null>(null);
  const [newCustName, setNewCustName] = useState("");
  const [newCustAmount, setNewCustAmount] = useState<number | "">("");
  const [newCustStatus, setNewCustStatus] = useState<"Disbursed" | "Sanctioned" | "In Process" | "Rejected">("Disbursed");
  const [newCustRemarks, setNewCustRemarks] = useState("");
  const [newCustDate, setNewCustDate] = useState(new Date().toISOString().split("T")[0]);

  // Edit Existing Customer Form inside Bank Modal
  const [editingCustomer, setEditingCustomer] = useState<{
    bankId: string;
    customer: CustomerDisbursalEntry;
  } | null>(null);

  const canManage = Boolean(currentUser);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [loginRes, empRes] = await Promise.all([
        fetch(`/api/logins?month=${selectedMonth}`).then((r) => r.json()),
        fetch("/api/employees").then((r) => r.json()),
      ]);

      if (loginRes.success && Array.isArray(loginRes.data)) {
        setLogins(loginRes.data);
      }
      if (empRes.success && Array.isArray(empRes.data)) {
        setEmployees(empRes.data);
        if (empRes.data.length > 0 && !addEmpId) {
          setAddEmpId(empRes.data[0].employeeId);
          setAddEmpName(empRes.data[0].personal.fullName);
          setAddDepartment(empRes.data[0].employment.department || "Sales");
          setAddBranch(empRes.data[0].employment.branch || "Delhi");
        }
      }
    } catch (e) {
      console.error("Error fetching logins:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  // Open Disbursal Management Modal
  const handleOpenDisbursals = (record: EmployeeLoginRecord) => {
    setActiveLogin(record);
    setModalBanks(JSON.parse(JSON.stringify(record.banks || [])));
    setIsDisbursalModalOpen(true);
  };

  // Helper to immediately persist bank & customer edits so changes are never lost
  const persistBanks = async (
    loginRecord: EmployeeLoginRecord,
    banksToSave: BankDisbursalBreakdown[]
  ) => {
    try {
      const res = await fetch("/api/logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...loginRecord,
          banks: banksToSave,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setActiveLogin(json.data);
        loadData();
      }
    } catch (e) {
      console.error("Auto-persist error:", e);
    }
  };

  // Add Bank in Modal
  const handleAddBank = () => {
    if (!newBankName) return;
    const isAxis = newBankName.toLowerCase().includes("axis");
    const newBank: BankDisbursalBreakdown = {
      id: `bank-${Date.now()}`,
      bankName: newBankName,
      isAxisBank: isAxis,
      totalAmount: 0,
      customers: [],
    };
    const updated = [...modalBanks, newBank];
    setModalBanks(updated);
    if (activeLogin) {
      persistBanks(activeLogin, updated);
    }
  };

  // Delete Bank in Modal
  const handleDeleteBank = (bankId: string) => {
    const updated = modalBanks.filter((b) => b.id !== bankId);
    setModalBanks(updated);
    if (activeLogin) {
      persistBanks(activeLogin, updated);
    }
  };

  // Add Customer Case under a Bank
  const handleAddCustomer = (bankId: string) => {
    if (!newCustName.trim() || !newCustAmount) {
      alert("Please enter customer name and disbursal amount.");
      return;
    }

    const amountNum = Number(newCustAmount) || 0;
    const newCustomer: CustomerDisbursalEntry = {
      id: `cust-${Date.now()}`,
      customerName: newCustName.trim(),
      amount: amountNum,
      status: newCustStatus,
      remarks: newCustRemarks.trim(),
      date: newCustDate || new Date().toISOString().split("T")[0],
    };

    const updatedBanks = modalBanks.map((bank) => {
      if (bank.id !== bankId) return bank;
      const updatedCustomers = [...bank.customers, newCustomer];
      const newTotal = updatedCustomers.reduce(
        (sum, c) => sum + (c.status === "Disbursed" ? c.amount : 0),
        0
      );
      return {
        ...bank,
        customers: updatedCustomers,
        totalAmount: newTotal,
      };
    });

    setModalBanks(updatedBanks);
    if (activeLogin) {
      persistBanks(activeLogin, updatedBanks);
    }

    // Reset customer form
    setNewCustName("");
    setNewCustAmount("");
    setNewCustRemarks("");
    setActiveBankIdForNewCustomer(null);
  };

  // Update Existing Customer
  const handleSaveCustomerEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    const { bankId, customer } = editingCustomer;
    const updatedBanks = modalBanks.map((bank) => {
      if (bank.id !== bankId) return bank;
      const updatedCustomers = bank.customers.map((c) =>
        c.id === customer.id ? customer : c
      );
      const newTotal = updatedCustomers.reduce(
        (sum, c) => sum + (c.status === "Disbursed" ? c.amount : 0),
        0
      );
      return {
        ...bank,
        customers: updatedCustomers,
        totalAmount: newTotal,
      };
    });

    setModalBanks(updatedBanks);
    if (activeLogin) {
      persistBanks(activeLogin, updatedBanks);
    }

    setEditingCustomer(null);
  };

  // Delete Customer Case
  const handleDeleteCustomer = (bankId: string, customerId: string) => {
    const updatedBanks = modalBanks.map((bank) => {
      if (bank.id !== bankId) return bank;
      const updatedCustomers = bank.customers.filter((c) => c.id !== customerId);
      const newTotal = updatedCustomers.reduce(
        (sum, c) => sum + (c.status === "Disbursed" ? c.amount : 0),
        0
      );
      return {
        ...bank,
        customers: updatedCustomers,
        totalAmount: newTotal,
      };
    });

    setModalBanks(updatedBanks);
    if (activeLogin) {
      persistBanks(activeLogin, updatedBanks);
    }
  };

  // Save Disbursals back to server
  const handleSaveDisbursals = async () => {
    if (!activeLogin) return;
    setIsSavingDisbursals(true);

    try {
      const res = await fetch("/api/logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...activeLogin,
          banks: modalBanks,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setIsDisbursalModalOpen(false);
        loadData();
      } else {
        alert(json.error || "Failed to update disbursals");
      }
    } catch (e) {
      console.error(e);
      alert("Error saving disbursal details");
    } finally {
      setIsSavingDisbursals(false);
    }
  };

  // Save Quick Edit
  const handleSaveQuickEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setIsSavingEdit(true);

    try {
      const res = await fetch("/api/logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingRecord),
      });
      const json = await res.json();
      if (json.success) {
        setIsEditModalOpen(false);
        loadData();
      } else {
        alert(json.error || "Failed to save record");
      }
    } catch (e) {
      console.error(e);
      alert("Error updating record");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Create New Login Entry
  const handleCreateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingLogin(true);

    const selectedEmp = employees.find((e) => e.employeeId === addEmpId);
    const finalEmpName = (isCustomEmployee || employees.length === 0)
      ? addEmpName.trim()
      : (selectedEmp?.personal.fullName || addEmpName.trim() || addEmpId);

    if (!finalEmpName) {
      alert("Please enter or select an employee name.");
      setIsAddingLogin(false);
      return;
    }

    const finalEmpId = (isCustomEmployee || employees.length === 0)
      ? (addEmpId.trim() || `EMP-${Date.now().toString().slice(-4)}`)
      : (addEmpId || selectedEmp?.employeeId || `EMP-${Date.now().toString().slice(-4)}`);

    const finalDept = (isCustomEmployee || employees.length === 0)
      ? (addDepartment || "Sales")
      : (selectedEmp?.employment.department || addDepartment || "Sales");

    const finalBranch = (isCustomEmployee || employees.length === 0)
      ? (addBranch || "Delhi")
      : (selectedEmp?.employment.branch || addBranch || "Delhi");

    try {
      const initialAmount = Number(addInitialDisbursal) || 0;
      const initialBanks: BankDisbursalBreakdown[] = [];

      if (initialAmount > 0) {
        const isAxis = addInitialBank.toLowerCase().includes("axis");
        initialBanks.push({
          id: `bank-${Date.now()}`,
          bankName: addInitialBank,
          isAxisBank: isAxis,
          totalAmount: initialAmount,
          customers: [
            {
              id: `cust-${Date.now()}`,
              customerName: addInitialCustomerName.trim() || `${finalEmpName} - Case 1`,
              amount: initialAmount,
              status: "Disbursed",
              remarks: addRemarks || "Initial disbursal",
              date: addSubmissionDate,
            },
          ],
        });
        if (!isAxis) {
          initialBanks.push({
            id: `bank-axis-${finalEmpId}-${Date.now()}`,
            bankName: "Axis Bank",
            isAxisBank: true,
            totalAmount: 0,
            customers: [],
          });
        }
      } else {
        initialBanks.push({
          id: `bank-axis-${finalEmpId}-${Date.now()}`,
          bankName: "Axis Bank",
          isAxisBank: true,
          totalAmount: 0,
          customers: [],
        });
      }

      const res = await fetch("/api/logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: finalEmpId,
          employeeName: finalEmpName,
          department: finalDept,
          branch: finalBranch,
          month: selectedMonth,
          commitment: Number(addCommitment) || 0,
          loginsCount: Number(addLoginsCount) || 0,
          submissionDate: addSubmissionDate,
          lastLoginDate: addLastLoginDate,
          remarks: addRemarks,
          banks: initialBanks,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setIsAddLoginModalOpen(false);
        setAddRemarks("");
        setAddInitialDisbursal("");
        setAddInitialCustomerName("");
        if (isCustomEmployee) {
          setAddEmpName("");
          setAddEmpId("");
        }
        await loadData();
      } else {
        alert(json.error || "Failed to create login entry");
      }
    } catch (e: any) {
      console.error(e);
      alert("Error creating login entry: " + (e?.message || "Network error"));
    } finally {
      setIsAddingLogin(false);
    }
  };

  // Delete Login Record
  const handleDeleteLoginRecord = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the login record for ${name}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/logins?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        loadData();
      } else {
        alert(data.error || "Failed to delete login record");
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting login record");
    }
  };

  // Calculate Metrics
  const totalCommitment = logins.reduce((acc, curr) => acc + (curr.commitment || 0), 0);
  const totalDisbursal = logins.reduce((acc, curr) => acc + (curr.totalDisbursal || 0), 0);
  const totalAxisDisbursal = logins.reduce((acc, curr) => acc + (curr.axisBankDisbursal || 0), 0);
  const totalLoginsCount = logins.reduce((acc, curr) => acc + (curr.loginsCount || 0), 0);
  const achievementPct = totalCommitment > 0 ? Math.round((totalDisbursal / totalCommitment) * 100) : 0;

  const filteredLogins = logins.filter((l) => {
    const q = search.toLowerCase();
    return (
      l.employeeName.toLowerCase().includes(q) ||
      l.employeeId.toLowerCase().includes(q) ||
      (l.department && l.department.toLowerCase().includes(q)) ||
      (l.remarks && l.remarks.toLowerCase().includes(q))
    );
  });

  // Calculate modal preview totals
  const modalTotalDisbursal = modalBanks.reduce((sum, b) => {
    return sum + b.customers.reduce((cSum, c) => cSum + (c.status === "Disbursed" ? c.amount : 0), 0);
  }, 0);
  const modalAxisDisbursal = modalBanks
    .filter((b) => b.isAxisBank)
    .reduce((sum, b) => sum + b.customers.reduce((cSum, c) => cSum + (c.status === "Disbursed" ? c.amount : 0), 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Logins & Disbursals Hub
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage monthly loan file logins, commitments, bank-wise disbursals, and customer pipeline.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none cursor-pointer"
            />
          </div>

          <Link href="/incentives">
            <Button size="sm" variant="outline" icon={<Sparkles className="w-4 h-4 text-amber-500" />}>
              Incentives Engine
            </Button>
          </Link>

          {canManage && (
            <Button
              size="sm"
              onClick={openAddLoginModal}
              icon={<Plus className="w-4 h-4" />}
            >
              + Add Login Entry
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Disbursal Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Disbursed
            </span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              ₹{(totalDisbursal / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakhs
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
              <span>Raw: ₹{totalDisbursal.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        {/* Axis Bank Disbursal Card */}
        <div className="bg-white rounded-2xl p-5 border border-rose-200/80 shadow-xs relative overflow-hidden bg-gradient-to-br from-rose-50/40 to-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
              Axis Bank Disbursed
            </span>
            <span className="p-2 rounded-xl bg-rose-100 text-rose-700 border border-rose-200">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-900 tracking-tight">
              ₹{(totalAxisDisbursal / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakhs
            </div>
            <div className="text-[11px] text-rose-600 font-medium mt-1">
              ₹200/lakh incentive rate partner
            </div>
          </div>
        </div>

        {/* Logins Submitted Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Logins Submitted
            </span>
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {totalLoginsCount} Files
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Across {logins.length} active employees
            </div>
          </div>
        </div>

        {/* Commitment vs Disbursal Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Target Commitment
            </span>
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              ₹{(totalCommitment / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakhs
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
              <span className={`font-semibold ${achievementPct >= 100 ? "text-emerald-600" : "text-amber-600"}`}>
                {achievementPct}% Achieved
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Table Filter Bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee, ID, branch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Showing {filteredLogins.length} of {logins.length} records</span>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={openAddLoginModal}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Login Entry
              </Button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[980px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Employee</th>
                <th className="py-3.5 px-4">Commitment</th>
                <th className="py-3.5 px-4">Logins Count</th>
                <th className="py-3.5 px-4">Submission Date</th>
                <th className="py-3.5 px-4">Last Login Date</th>
                <th className="py-3.5 px-4">Total Disbursal (Click to Manage)</th>
                <th className="py-3.5 px-4">Last Updated</th>
                <th className="py-3.5 px-4">Remarks</th>
                {canManage && <th className="py-3.5 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading logins records for {selectedMonth}...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLogins.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="space-y-3">
                      <div>No login records found for this month.</div>
                      {canManage && (
                        <Button
                          size="sm"
                          onClick={openAddLoginModal}
                          icon={<Plus className="w-4 h-4" />}
                        >
                          + Add First Login Record
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogins.map((record) => {
                  const isAxisPresent = (record.axisBankDisbursal || 0) > 0;
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Employee Column */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                            {record.employeeName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{record.employeeName}</div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 font-mono">
                              <span>{record.employeeId}</span>
                              {record.branch && (
                                <>
                                  <span>•</span>
                                  <span>{record.branch}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Commitment */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 font-mono">
                          ₹{record.commitment.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(record.commitment / 100000).toFixed(1)} Lakhs
                        </div>
                      </td>

                      {/* Logins Count */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-bold border border-blue-100">
                          {record.loginsCount} Files
                        </span>
                      </td>

                      {/* Submission Date */}
                      <td className="py-3 px-4 text-slate-700">
                        {record.submissionDate ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{record.submissionDate}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not set</span>
                        )}
                      </td>

                      {/* Last Login Date */}
                      <td className="py-3 px-4 text-slate-700">
                        {record.lastLoginDate ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{record.lastLoginDate}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>

                      {/* Total Disbursal (Interactive Button/Badge) */}
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleOpenDisbursals(record)}
                          className="group text-left p-1.5 -m-1.5 rounded-xl hover:bg-blue-50/80 transition-all border border-transparent hover:border-blue-200 cursor-pointer block"
                          title="Click to view and edit bank breakdown and customers"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 font-mono text-sm group-hover:text-blue-700">
                              ₹{record.totalDisbursal.toLocaleString("en-IN")}
                            </span>
                            <span className="text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              Manage Banks →
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                            {isAxisPresent && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200">
                                Axis: ₹{(record.axisBankDisbursal / 100000).toFixed(1)}L
                              </span>
                            )}
                            {(record.otherBanksDisbursal || 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                Others: ₹{(record.otherBanksDisbursal / 100000).toFixed(1)}L
                              </span>
                            )}
                            {!isAxisPresent && (record.otherBanksDisbursal || 0) === 0 && (
                              <span className="text-slate-400 italic">0 banks recorded</span>
                            )}
                          </div>
                        </button>
                      </td>

                      {/* Last Updated Date */}
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        <div>{new Date(record.lastUpdatedAt || Date.now()).toLocaleDateString("en-IN")}</div>
                        <div className="text-[10px] text-slate-400">
                          by {record.updatedBy || "System"}
                        </div>
                      </td>

                      {/* Remarks */}
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={record.remarks}>
                        {record.remarks || <span className="text-slate-400 italic">—</span>}
                      </td>

                      {/* Actions */}
                      {canManage && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRecord(record);
                                setIsEditModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit commitments and submission dates"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDisbursals(record)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Manage banks and disbursals"
                            >
                              <Building2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLoginRecord(record.id, record.employeeName)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete login record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Bank & Customer Disbursals Manager                   */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isDisbursalModalOpen}
        onClose={() => {
          setIsDisbursalModalOpen(false);
          setEditingCustomer(null);
        }}
        title={`Disbursal Breakdown — ${activeLogin?.employeeName || ""}`}
        subtitle="Manage lending partner banks and customer cases. Axis Bank disbursals earn ₹200/lakh incentive rate."
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* Top Summary Header */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-500 font-medium">Computed Total Disbursal:</span>
              <div className="text-xl font-bold text-slate-900 font-mono">
                ₹{modalTotalDisbursal.toLocaleString("en-IN")}
                <span className="text-xs font-normal text-slate-500 ml-2">
                  ({(modalTotalDisbursal / 100000).toFixed(2)} Lakhs)
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-rose-600 font-semibold flex items-center justify-end gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                Axis Bank Subtotal:
              </span>
              <div className="text-lg font-bold text-rose-900 font-mono">
                ₹{modalAxisDisbursal.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* Add Bank Bar */}
          {canManage && (
            <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <span className="text-xs font-semibold text-blue-900 shrink-0">Add Bank:</span>
              <select
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                className="flex-1 text-xs rounded-lg border border-slate-200 px-3 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
              >
                {PRESET_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b} {b === "Axis Bank" ? "★ (Incentive Partner)" : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={handleAddBank} icon={<Plus className="w-3.5 h-3.5" />}>
                Add Bank
              </Button>
            </div>
          )}

          {/* Banks Accordion / Cards List */}
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {modalBanks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl p-6">
                No banks added yet. Use the dropdown above to add Axis Bank or other partner banks.
              </div>
            ) : (
              modalBanks.map((bank) => {
                const isAxis = bank.isAxisBank || bank.bankName.toLowerCase().includes("axis");
                const isAddingCustomerToThis = activeBankIdForNewCustomer === bank.id;

                return (
                  <div
                    key={bank.id}
                    className={`rounded-xl border transition-all ${
                      isAxis
                        ? "border-rose-200 bg-rose-50/20"
                        : "border-slate-200 bg-white"
                    } p-4 space-y-3`}
                  >
                    {/* Bank Header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg ${
                            isAxis
                              ? "bg-rose-100 text-rose-700 border border-rose-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                            {bank.bankName}
                            {isAxis && (
                              <Badge variant="danger" className="text-[10px]">
                                Axis Incentive Rate (₹200/L)
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Subtotal: ₹{bank.totalAmount.toLocaleString("en-IN")} ({bank.customers.length} cases)
                          </div>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingCustomer(null);
                              setActiveBankIdForNewCustomer(isAddingCustomerToThis ? null : bank.id);
                            }}
                            icon={<Plus className="w-3 h-3" />}
                          >
                            {isAddingCustomerToThis ? "Close" : "Add Customer"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBank(bank.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete this bank"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline Form to Add Customer Case */}
                    {isAddingCustomerToThis && (
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 animate-fadeIn">
                        <div className="text-xs font-bold text-slate-800">
                          Add Customer Case under {bank.bankName}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Customer Name *
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Rahul Verma"
                              value={newCustName}
                              onChange={(e) => setNewCustName(e.target.value)}
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Disbursed Amount (₹) *
                            </label>
                            <input
                              type="number"
                              placeholder="e.g. 2500000"
                              value={newCustAmount}
                              onChange={(e) =>
                                setNewCustAmount(e.target.value ? Number(e.target.value) : "")
                              }
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Status
                            </label>
                            <select
                              value={newCustStatus}
                              onChange={(e) => setNewCustStatus(e.target.value as any)}
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
                            >
                              <option value="Disbursed">Disbursed (Counts in Total)</option>
                              <option value="Sanctioned">Sanctioned</option>
                              <option value="In Process">In Process</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Date
                            </label>
                            <input
                              type="date"
                              value={newCustDate}
                              onChange={(e) => setNewCustDate(e.target.value)}
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Remarks / Loan Purpose
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Personal Loan, Sanction #4512"
                              value={newCustRemarks}
                              onChange={(e) => setNewCustRemarks(e.target.value)}
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setActiveBankIdForNewCustomer(null)}
                          >
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => handleAddCustomer(bank.id)}>
                            Save Customer
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Inline Form to Edit Existing Customer Case */}
                    {editingCustomer && editingCustomer.bankId === bank.id && (
                      <form onSubmit={handleSaveCustomerEdit} className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3 animate-fadeIn">
                        <div className="text-xs font-bold text-blue-900 flex items-center justify-between">
                          <span>Edit Customer Case ({editingCustomer.customer.customerName})</span>
                          <button
                            type="button"
                            onClick={() => setEditingCustomer(null)}
                            className="text-xs text-slate-400 hover:text-slate-600"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Customer Name *
                            </label>
                            <input
                              type="text"
                              value={editingCustomer.customer.customerName}
                              onChange={(e) =>
                                setEditingCustomer({
                                  ...editingCustomer,
                                  customer: {
                                    ...editingCustomer.customer,
                                    customerName: e.target.value,
                                  },
                                })
                              }
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Disbursed Amount (₹) *
                            </label>
                            <input
                              type="number"
                              value={editingCustomer.customer.amount}
                              onChange={(e) =>
                                setEditingCustomer({
                                  ...editingCustomer,
                                  customer: {
                                    ...editingCustomer.customer,
                                    amount: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Status
                            </label>
                            <select
                              value={editingCustomer.customer.status}
                              onChange={(e) =>
                                setEditingCustomer({
                                  ...editingCustomer,
                                  customer: {
                                    ...editingCustomer.customer,
                                    status: e.target.value as any,
                                  },
                                })
                              }
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
                            >
                              <option value="Disbursed">Disbursed (Counts in Total)</option>
                              <option value="Sanctioned">Sanctioned</option>
                              <option value="In Process">In Process</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Date
                            </label>
                            <input
                              type="date"
                              value={editingCustomer.customer.date}
                              onChange={(e) =>
                                setEditingCustomer({
                                  ...editingCustomer,
                                  customer: {
                                    ...editingCustomer.customer,
                                    date: e.target.value,
                                  },
                                })
                              }
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                              Remarks
                            </label>
                            <input
                              type="text"
                              value={editingCustomer.customer.remarks || ""}
                              onChange={(e) =>
                                setEditingCustomer({
                                  ...editingCustomer,
                                  customer: {
                                    ...editingCustomer.customer,
                                    remarks: e.target.value,
                                  },
                                })
                              }
                              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => setEditingCustomer(null)}
                          >
                            Cancel
                          </Button>
                          <Button size="sm" type="submit">
                            Save Changes
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Customer Cases List Table */}
                    {bank.customers.length === 0 ? (
                      <div className="text-[11px] text-slate-400 italic py-2 pl-1">
                        No customer cases added yet under {bank.bankName}.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-slate-100">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-50/80 text-slate-500 text-[10px] uppercase font-semibold">
                              <th className="py-2 px-3">Customer</th>
                              <th className="py-2 px-3">Amount</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3">Date</th>
                              <th className="py-2 px-3">Remarks</th>
                              {canManage && <th className="py-2 px-3 text-right">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {bank.customers.map((cust) => (
                              <tr key={cust.id} className="hover:bg-slate-50/40">
                                <td className="py-2 px-3 font-medium text-slate-900">
                                  {cust.customerName}
                                </td>
                                <td className="py-2 px-3 font-semibold font-mono text-slate-900">
                                  ₹{cust.amount.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2 px-3">
                                  <Badge
                                    variant={
                                      cust.status === "Disbursed"
                                        ? "success"
                                        : cust.status === "Rejected"
                                        ? "danger"
                                        : "warning"
                                    }
                                    className="text-[10px]"
                                  >
                                    {cust.status}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px]">
                                  {cust.date}
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px] max-w-xs truncate">
                                  {cust.remarks || "—"}
                                </td>
                                {canManage && (
                                  <td className="py-2 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingCustomer({
                                            bankId: bank.id,
                                            customer: { ...cust },
                                          })
                                        }
                                        className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                                        title="Edit customer details"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCustomer(bank.id, cust.id)}
                                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                        title="Remove customer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div className="text-[11px] text-slate-500">
              Disbursal amounts marked as &quot;Disbursed&quot; automatically sum into the employee&apos;s total.
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsDisbursalModalOpen(false);
                  setEditingCustomer(null);
                }}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  isLoading={isSavingDisbursals}
                  onClick={handleSaveDisbursals}
                  className="w-full sm:w-auto"
                >
                  Save & Update Disbursal
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Quick Edit Employee Record Modal                      */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Logins Details — ${editingRecord?.employeeName || ""}`}
        subtitle="Update sales commitment target, login submission dates, and performance remarks."
        maxWidth="md"
      >
        {editingRecord && (
          <form onSubmit={handleSaveQuickEdit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Commitment (₹) *
              </label>
              <input
                type="number"
                value={editingRecord.commitment}
                onChange={(e) =>
                  setEditingRecord({ ...editingRecord, commitment: Number(e.target.value) })
                }
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                placeholder="e.g. 5000000"
                required
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {(editingRecord.commitment / 100000).toFixed(1)} Lakhs target
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Logins Files Count
                </label>
                <input
                  type="number"
                  value={editingRecord.loginsCount}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, loginsCount: Number(e.target.value) })
                  }
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                  placeholder="e.g. 5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Submission Date
                </label>
                <input
                  type="date"
                  value={editingRecord.submissionDate || ""}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, submissionDate: e.target.value })
                  }
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Last Login Date
              </label>
              <input
                type="date"
                value={editingRecord.lastLoginDate || ""}
                onChange={(e) =>
                  setEditingRecord({ ...editingRecord, lastLoginDate: e.target.value })
                }
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Remarks & Notes
              </label>
              <textarea
                rows={3}
                value={editingRecord.remarks || ""}
                onChange={(e) =>
                  setEditingRecord({ ...editingRecord, remarks: e.target.value })
                }
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Notes on commitments, pending sanction letters, lender coordination..."
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditModalOpen(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={isSavingEdit} className="w-full sm:w-auto">
                Save Record
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Add New Login Entry Modal                            */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={isAddLoginModalOpen}
        onClose={() => setIsAddLoginModalOpen(false)}
        title="Add Employee Login Record"
        subtitle={`Create new loan login and target commitment entry for ${selectedMonth}.`}
        maxWidth="md"
      >
        <form onSubmit={handleCreateLogin} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Employee Details *
              </label>
              {employees.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomEmployee(!isCustomEmployee);
                    if (!isCustomEmployee) {
                      setAddEmpName("");
                      setAddEmpId("");
                    } else if (employees.length > 0) {
                      setAddEmpId(employees[0].employeeId);
                      setAddEmpName(employees[0].personal.fullName);
                    }
                  }}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  {isCustomEmployee ? "← Select from Roster" : "+ Type New / Other Staff"}
                </button>
              )}
            </div>

            {!isCustomEmployee && employees.length > 0 ? (
              <select
                value={addEmpId}
                onChange={(e) => {
                  setAddEmpId(e.target.value);
                  const matched = employees.find((emp) => emp.employeeId === e.target.value);
                  if (matched) {
                    setAddEmpName(matched.personal.fullName);
                    setAddDepartment(matched.employment.department || "Sales");
                    setAddBranch(matched.employment.branch || "Delhi");
                  }
                }}
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 bg-slate-50 font-medium"
                required
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.employeeId}>
                    {e.personal.fullName} ({e.employeeId} • {e.employment.department} • {e.employment.branch})
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2.5 p-3 rounded-xl bg-blue-50/60 border border-blue-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={addEmpName}
                      onChange={(e) => setAddEmpName(e.target.value)}
                      placeholder="e.g. Vikram Malhotra"
                      className="w-full text-xs rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Employee ID / Code
                    </label>
                    <input
                      type="text"
                      value={addEmpId}
                      onChange={(e) => setAddEmpId(e.target.value)}
                      placeholder="e.g. EMP-0105 (Auto-generated if empty)"
                      className="w-full text-xs rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500 bg-white font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={addDepartment}
                      onChange={(e) => setAddDepartment(e.target.value)}
                      placeholder="Sales"
                      className="w-full text-xs rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Branch
                    </label>
                    <select
                      value={addBranch}
                      onChange={(e) => setAddBranch(e.target.value)}
                      className="w-full text-xs rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-500 bg-white"
                    >
                      <option value="Delhi">Delhi</option>
                      <option value="Dehradun">Dehradun</option>
                      <option value="Rudrapur">Rudrapur</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Monthly Commitment (₹)
            </label>
            <input
              type="number"
              value={addCommitment}
              onChange={(e) =>
                setAddCommitment(e.target.value ? Number(e.target.value) : "")
              }
              className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-blue-500"
              placeholder="e.g. 5000000 (Defaults to 0 if left blank)"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Logins Files Count
              </label>
              <input
                type="number"
                value={addLoginsCount}
                onChange={(e) =>
                  setAddLoginsCount(e.target.value ? Number(e.target.value) : "")
                }
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                placeholder="e.g. 5"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Submission Date
              </label>
              <input
                type="date"
                value={addSubmissionDate}
                onChange={(e) => setAddSubmissionDate(e.target.value)}
                className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Last Login Date
            </label>
            <input
              type="date"
              value={addLastLoginDate}
              onChange={(e) => setAddLastLoginDate(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Initial Disbursal & Bank Partner (Optional) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Initial Disbursal & Bank (Optional)
              </label>
              <span className="text-[10px] text-slate-500 font-medium">Can also be added later</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Lender Bank
                </label>
                <select
                  value={addInitialBank}
                  onChange={(e) => setAddInitialBank(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 bg-white focus:outline-none focus:border-blue-500"
                >
                  {PRESET_BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b} {b === "Axis Bank" ? "★ (Axis Incentive Rate)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Disbursed Amount (₹)
                </label>
                <input
                  type="number"
                  value={addInitialDisbursal}
                  onChange={(e) =>
                    setAddInitialDisbursal(e.target.value ? Number(e.target.value) : "")
                  }
                  placeholder="e.g. 2500000 (Optional)"
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 bg-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            {addInitialDisbursal && Number(addInitialDisbursal) > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Customer / Borrower Name
                </label>
                <input
                  type="text"
                  value={addInitialCustomerName}
                  onChange={(e) => setAddInitialCustomerName(e.target.value)}
                  placeholder="e.g. Vikas Aggarwal (Home Loan)"
                  className="w-full text-xs rounded-xl border border-slate-200 px-3 py-1.5 text-slate-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks & Performance Notes
            </label>
            <textarea
              rows={2}
              value={addRemarks}
              onChange={(e) => setAddRemarks(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 resize-none"
              placeholder="e.g. Primary partner Axis Bank, targets home loans and personal loans..."
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddLoginModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isAddingLogin} className="w-full sm:w-auto">
              Create Login Entry
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
