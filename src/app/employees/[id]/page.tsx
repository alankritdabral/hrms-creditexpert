"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";
import { EmployeeProfile } from "@/components/employees/EmployeeProfile";
import { Employee, AttendanceRecord, LeaveRequest, EmployeeIncentiveRecord, AssetRecord, EmployeeDocument } from "@/lib/types";

function EmployeeDetailContent() {
  const params = useParams();
  const employeeId = params?.id as string;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [incentives, setIncentives] = useState<EmployeeIncentiveRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    if (!employeeId) return;
    try {
      const [empRes, attRes, levRes, incRes, astRes] = await Promise.all([
        fetch(`/api/employees/${employeeId}`).then((r) => r.json()),
        fetch("/api/attendance").then((r) => r.json()),
        fetch(`/api/leaves?employeeId=${employeeId}`).then((r) => r.json()),
        fetch("/api/incentives").then((r) => r.json()),
        fetch("/api/assets").then((r) => r.json()),
      ]);

      if (empRes.success) setEmployee(empRes.data);
      if (attRes.success) {
        setAttendance(attRes.data.filter((a: AttendanceRecord) => a.employeeId === employeeId));
      }
      if (levRes.success) setLeaves(levRes.data);
      if (incRes.success && incRes.data?.incentives) {
        setIncentives(
          incRes.data.incentives.filter((i: EmployeeIncentiveRecord) => i.employeeId === employeeId)
        );
      }
      if (astRes.success) {
        setAssets(
          astRes.data.filter((a: AssetRecord) => a.assignedToEmployeeId === employeeId)
        );
      }
    } catch (e) {
      console.error("Employee profile fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [employeeId]);

  if (isLoading) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
        Loading employee profile workspace...
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="py-24 text-center text-slate-400 glass-card rounded-2xl border border-slate-800">
        <h2 className="text-lg font-bold text-white">Employee Not Found</h2>
        <p className="text-xs text-slate-500 mt-1">
          Could not find employee record with ID: {employeeId}
        </p>
      </div>
    );
  }

  return (
    <EmployeeProfile
      employee={employee}
      attendance={attendance}
      leaves={leaves}
      incentives={incentives}
      assets={assets}
      documents={documents}
      onRefresh={loadData}
    />
  );
}

export default function SingleEmployeePage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-slate-500 text-xs">
          <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
          Loading employee profile...
        </div>
      }
    >
      <EmployeeDetailContent />
    </Suspense>
  );
}
