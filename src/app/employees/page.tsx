"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Employee } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AddEmployeeModal } from "@/components/employees/AddEmployeeModal";
import { useAuth } from "@/lib/auth-context";
import {
  Users,
  UserPlus,
  Search,
  ChevronRight,
  Filter,
  MapPin,
} from "lucide-react";
import { BRANCHES } from "@/lib/types";

export default function EmployeesPage() {
  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [branchFilter, setBranchFilter] = useState("All");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/employees");
      const json = await res.json();
      if (json.success) {
        setEmployees(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const canAdd = ["admin", "hr"].includes(currentUser.role);

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.personal.fullName.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      emp.employment.designation.toLowerCase().includes(search.toLowerCase()) ||
      emp.employment.department.toLowerCase().includes(search.toLowerCase()) ||
      (emp.employment.branch && emp.employment.branch.toLowerCase().includes(search.toLowerCase()));

    const matchesDept =
      departmentFilter === "All" || emp.employment.department === departmentFilter;
    const matchesStatus =
      statusFilter === "All" || emp.employment.employmentStatus === statusFilter;
    const matchesBranch =
      branchFilter === "All" || emp.employment.branch === branchFilter;

    return matchesSearch && matchesDept && matchesStatus && matchesBranch;
  });

  const departments = Array.from(new Set(employees.map((e) => e.employment.department)));

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Title & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-blue-600" />
            Employee Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Central repository of employees, organizational roles, CTC structures, and lifecycle records.
          </p>
        </div>
        {canAdd && (
          <Button
            onClick={() => setIsAddModalOpen(true)}
            size="sm"
            icon={<UserPlus className="w-4 h-4" />}
          >
            Add Employee
          </Button>
        )}
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, designation..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Dept:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600"
            >
              <option value="All">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>Branch:</span>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600"
            >
              <option value="All">All Branches</option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Confirmed">Confirmed</option>
              <option value="On Notice">On Notice</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employee Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEmployees.map((emp) => (
          <Link
            key={emp.id}
            href={`/employees/${emp.employeeId}`}
            className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 group relative block shadow-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <img
                  src={emp.personal.avatarUrl}
                  alt={emp.personal.fullName}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 group-hover:border-blue-400 transition-colors shadow-2xs"
                />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                    {emp.personal.fullName}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-mono text-blue-600 font-semibold">
                      {emp.employeeId}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-[11px] text-slate-500">{emp.employment.department}</span>
                  </div>
                </div>
              </div>

              <Badge
                variant={
                  emp.employment.employmentStatus === "Active" ||
                  emp.employment.employmentStatus === "Confirmed"
                    ? "success"
                    : "warning"
                }
              >
                {emp.employment.employmentStatus}
              </Badge>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Designation</span>
                <span className="text-slate-700 font-medium">{emp.employment.designation}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Branch</span>
                <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[10px]">
                  <MapPin className="w-2.5 h-2.5 text-blue-500" />
                  {emp.employment.branch || "Delhi"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Net Salary (In-Hand)</span>
                {emp.currentSalary.isIncentiveOnly || (emp.currentSalary.annualCtc === 0 && emp.currentSalary.grossSalary === 0) ? (
                  <span className="text-amber-700 font-semibold text-[10px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    ⚡ Incentive Only
                  </span>
                ) : (
                  <span className="text-emerald-600 font-bold font-mono">
                    ₹{(emp.currentSalary.netSalary || Math.max(0, emp.currentSalary.grossSalary - (emp.currentSalary.employeePf || 0))).toLocaleString("en-IN")}/mo
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Provident Fund (PF)</span>
                <span className="text-slate-700 font-medium font-mono text-[11px]">
                  {emp.currentSalary.isIncentiveOnly || (emp.currentSalary.annualCtc === 0 && emp.currentSalary.grossSalary === 0)
                    ? "Exempted"
                    : emp.currentSalary.employeePf > 0
                    ? `₹${emp.currentSalary.employeePf.toLocaleString("en-IN")}/mo`
                    : "Excluded"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Location</span>
                <span className="text-slate-700">{emp.employment.workLocation}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">
              <span>Open Employee Workspace</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </Link>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 animate-pulse space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-100 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-slate-100 rounded w-24" />
                  <div className="h-3 bg-slate-100 rounded w-16" />
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="h-3 bg-slate-100 rounded w-full" />
                <div className="h-3 bg-slate-100 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <Users className="w-10 h-10 mx-auto mb-2 text-slate-400" />
          No employees match your search criteria.
        </div>
      ) : null}

      {/* Add Employee Modal */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchEmployees}
      />
    </div>
  );
}
