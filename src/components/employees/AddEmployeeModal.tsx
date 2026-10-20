"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddEmployeeModal({ isOpen, onClose, onSuccess }: AddEmployeeModalProps) {
  const { currentUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    gender: "Female",
    dob: "1998-05-20",
    mobileNumber: "",
    personalEmail: "",
    workEmail: "",
    address: "",
    department: "Technology",
    designation: "",
    branch: "Delhi",
    employmentType: "Full-time",
    workLocation: "Delhi Branch",
    employmentStatus: "Probation",
    probationMonths: 3,
    dateOfJoining: "2026-10-17",
    annualCtc: 480000,
    pan: "",
    aadhaar: "",
    bankAccountNumber: "",
    ifscCode: "HDFC0000123",
    bankName: "HDFC Bank Ltd",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personal: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            dob: formData.dob,
            gender: formData.gender,
            mobileNumber: formData.mobileNumber,
            personalEmail: formData.personalEmail,
            workEmail: formData.workEmail,
            address: formData.address,
            avatarUrl: `https://images.unsplash.com/photo-${
              formData.gender === "Male" ? "1507003211169-0a1dd7228f2d" : "1494790108377-be9c29b29330"
            }?w=150&auto=format&fit=crop&q=80`,
            emergencyContact: {
              name: "Emergency Contact",
              relationship: "Family",
              phone: formData.mobileNumber,
            },
          },
          employment: {
            department: formData.department,
            designation: formData.designation,
            branch: formData.branch as any,
            employmentType: formData.employmentType,
            workLocation: `${formData.branch} Branch`,
            employmentStatus: formData.employmentStatus,
            probationMonths: Number(formData.probationMonths),
            dateOfJoining: formData.dateOfJoining,
            employeeCategory: "Permanent Staff",
          },
          statutory: {
            pan: formData.pan.toUpperCase(),
            aadhaar: formData.aadhaar,
            uan: `100${Math.floor(100000000 + Math.random() * 900000000)}`,
            pfAccountNumber: `KN/BNG/0012345/000/${Math.floor(10000 + Math.random() * 90000)}`,
            bankAccountNumber: formData.bankAccountNumber,
            ifscCode: formData.ifscCode.toUpperCase(),
            bankName: formData.bankName,
          },
          annualCtc: Number(formData.annualCtc),
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        alert(data.error || "Failed to create employee");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Employee"
      subtitle="Create an employee record with employment details, salary structure, and statutory information."
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`text-xs font-semibold pb-1 cursor-pointer transition-colors ${
              activeStep === 1 ? "text-indigo-400 border-b-2 border-indigo-500" : "text-slate-400"
            }`}
          >
            1. Personal Info
          </button>
          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className={`text-xs font-semibold pb-1 cursor-pointer transition-colors ${
              activeStep === 2 ? "text-indigo-400 border-b-2 border-indigo-500" : "text-slate-400"
            }`}
          >
            2. Employment & CTC
          </button>
          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className={`text-xs font-semibold pb-1 cursor-pointer transition-colors ${
              activeStep === 3 ? "text-indigo-400 border-b-2 border-indigo-500" : "text-slate-400"
            }`}
          >
            3. Statutory & Bank
          </button>
        </div>

        {/* STEP 1: Personal Info */}
        {activeStep === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">First Name *</label>
                <input
                  type="text"
                  name="firstName"
                  required
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Rohan"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Verma"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Date of Birth</label>
                <input
                  type="date"
                  name="dob"
                  value={formData.dob}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Mobile Number *</label>
                <input
                  type="tel"
                  name="mobileNumber"
                  required
                  value={formData.mobileNumber}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  placeholder="9876543210"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Work Email *</label>
                <input
                  type="email"
                  name="workEmail"
                  required
                  value={formData.workEmail}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  placeholder="rohan.verma@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Residential Address</label>
              <textarea
                name="address"
                rows={2}
                value={formData.address}
                onChange={handleChange}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                placeholder="Residential address with city & PIN"
              />
            </div>
          </div>
        )}

        {/* STEP 2: Employment & CTC */}
        {activeStep === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Department *</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Technology">Technology</option>
                  <option value="Product Design">Product Design</option>
                  <option value="Sales">Sales</option>
                  <option value="Human Resources">Human Resources</option>
                  <option value="Finance & Payroll">Finance & Payroll</option>
                  <option value="Operations">Operations</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Designation *</label>
                <input
                  type="text"
                  name="designation"
                  required
                  value={formData.designation}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Backend Engineer"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Employment Type</label>
                <select
                  name="employmentType"
                  value={formData.employmentType}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Intern">Intern</option>
                  <option value="Consultant">Consultant</option>
                  <option value="Contract">Contract</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                <select
                  name="employmentStatus"
                  value={formData.employmentStatus}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Probation">Probation</option>
                  <option value="Active">Active</option>
                  <option value="Confirmed">Confirmed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Branch *</label>
                <select
                  name="branch"
                  value={formData.branch}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Delhi">Delhi Branch</option>
                  <option value="Dehradun">Dehradun Branch</option>
                  <option value="Rudrapur">Rudrapur Branch</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Joining Date</label>
                <input
                  type="date"
                  name="dateOfJoining"
                  value={formData.dateOfJoining}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Annual CTC (₹ INR) *
              </label>
              <input
                type="number"
                name="annualCtc"
                step="10000"
                required
                value={formData.annualCtc}
                onChange={handleChange}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                placeholder="480000"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Server-side engine will auto-compute Basic, HRA, Allowances, PF, and PT from CTC.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: Statutory & Bank */}
        {activeStep === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">PAN Number *</label>
                <input
                  type="text"
                  name="pan"
                  required
                  maxLength={10}
                  value={formData.pan}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                  placeholder="ABCDE1234F"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Aadhaar (12 Digits) *</label>
                <input
                  type="text"
                  name="aadhaar"
                  required
                  maxLength={12}
                  value={formData.aadhaar}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="123456789012"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bank Account Number *</label>
                <input
                  type="text"
                  name="bankAccountNumber"
                  required
                  value={formData.bankAccountNumber}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="5010023456789"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">IFSC Code *</label>
                <input
                  type="text"
                  name="ifscCode"
                  required
                  value={formData.ifscCode}
                  onChange={handleChange}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                  placeholder="HDFC0000123"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Bank Name</label>
              <input
                type="text"
                name="bankName"
                value={formData.bankName}
                onChange={handleChange}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                placeholder="HDFC Bank Ltd"
              />
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div>
            {activeStep > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveStep((prev) => (prev - 1) as any)}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {activeStep < 3 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setActiveStep((prev) => (prev + 1) as any)}
              >
                Continue
              </Button>
            ) : (
              <Button type="submit" size="sm" isLoading={isSubmitting}>
                Save & Create Employee
              </Button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
