"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  Phone,
  Building2,
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  Upload,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Clock,
  FileText,
  CreditCard,
  Eye,
  AlertTriangle,
  RefreshCw,
  Home,
  Save,
  Bookmark,
  RotateCcw,
  Check,
  X,
} from "lucide-react";
import { Branch, BRANCHES, RegistrationDraft } from "@/lib/types";
import { validateKycFile, MAX_KYC_FILE_SIZE_LABEL } from "@/lib/upload-validation";
import {
  saveLocalDraft,
  getLocalDraft,
  clearLocalDraft,
  saveServerDraft,
  fetchServerDraft,
  deleteServerDraft,
  formatTimeAgo,
  STEP_NAMES,
} from "@/lib/registration-draft";

interface UploadedKycItem {
  type: "pan_card" | "aadhaar_card" | "cancelled_cheque" | "photograph";
  title: string;
  fileUrl: string;
  publicId?: string;
  fileSize?: number;
  formattedSize?: string;
  uploadedAt: string;
  uploading?: boolean;
  error?: string;
}

import { useIsLocalhost } from "@/lib/use-is-localhost";

export default function RegisterPage() {
  const router = useRouter();
  const isLocalhost = useIsLocalhost();

  // Wizard Step: 1 = Account/OTP, 2 = Personal, 3 = Statutory, 4 = KYC Uploads, 5 = Done/Pending
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form State: Step 1
  const [candidateName, setCandidateName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [branch, setBranch] = useState<Branch>("Delhi");

  // OTP State
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  // Form State: Step 2 (Personal Details)
  const [dob, setDob] = useState("1996-05-15");
  const [gender, setGender] = useState<"Male" | "Female" | "Other">("Male");
  const [parentsName, setParentsName] = useState("");
  const [currentAddress, setCurrentAddress] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("Parent");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  // Form State: Step 3 (Statutory & Bank)
  const [panNumber, setPanNumber] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");

  // Form State: Step 4 (KYC Documents with 2MB limit)
  const [kycDocs, setKycDocs] = useState<Record<string, UploadedKycItem>>({
    pan_card: {
      type: "pan_card",
      title: "PAN Card",
      fileUrl: "",
      uploadedAt: "",
    },
    aadhaar_card: {
      type: "aadhaar_card",
      title: "Aadhaar Card",
      fileUrl: "",
      uploadedAt: "",
    },
    cancelled_cheque: {
      type: "cancelled_cheque",
      title: "Bank Proof (Cancelled Cheque / Passbook)",
      fileUrl: "",
      uploadedAt: "",
    },
    photograph: {
      type: "photograph",
      title: "Passport Photograph",
      fileUrl: "",
      uploadedAt: "",
    },
  });

  // Global Error / Submitting states
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Incomplete Registration Draft Persistence
  const [pendingResumeDraft, setPendingResumeDraft] = useState<RegistrationDraft | null>(null);
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [highestStep, setHighestStep] = useState<number>(1);
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);
  const [emailDraftChecked, setEmailDraftChecked] = useState(false);

  // 1. Initial Load: Check for saved draft in localStorage
  React.useEffect(() => {
    const local = getLocalDraft();
    if (local && (local.candidateName || local.email || (local.currentStep && local.currentStep > 1))) {
      setPendingResumeDraft(local);
      setHighestStep(local.highestStep || local.currentStep || 1);
      setLastSavedNotice(`Saved ${formatTimeAgo(local.lastSavedAt)}`);
    }
    setIsInitialLoaded(true);
  }, []);

  // 2. Debounced Auto-Save
  React.useEffect(() => {
    if (!isInitialLoaded || currentStep >= 5 || submissionSuccess) return;
    if (!candidateName && !email) return;

    const timer = setTimeout(() => {
      saveDraftState(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [
    candidateName,
    email,
    password,
    confirmPassword,
    phone,
    branch,
    currentStep,
    highestStep,
    otpVerified,
    dob,
    gender,
    parentsName,
    currentAddress,
    permanentAddress,
    emergencyName,
    emergencyRelation,
    emergencyPhone,
    panNumber,
    aadhaarNumber,
    bankName,
    bankAccountNumber,
    ifscCode,
    kycDocs,
    isInitialLoaded,
    submissionSuccess,
  ]);

  // Saves current draft to localStorage and optionally server
  const saveDraftState = async (explicit: boolean = false) => {
    if (currentStep >= 5) return;
    if (explicit) setIsSavingDraft(true);

    const newHighest = Math.max(highestStep, currentStep);
    setHighestStep(newHighest);

    const draftData: RegistrationDraft = {
      candidateName,
      email,
      password,
      confirmPassword,
      phone,
      branch,
      currentStep,
      highestStep: newHighest,
      otpVerified,
      personalDetails: {
        dob,
        gender,
        parentsName,
        currentAddress,
        permanentAddress,
        emergencyName,
        emergencyRelation,
        emergencyPhone,
      },
      statutoryDetails: {
        panNumber,
        aadhaarNumber,
        bankName,
        bankAccountNumber,
        ifscCode,
      },
      kycDocuments: kycDocs,
      lastSavedAt: new Date().toISOString(),
    };

    saveLocalDraft(draftData);

    if (email && email.includes("@")) {
      saveServerDraft(email, draftData).catch(() => {});
    }

    setLastSavedNotice("Saved just now");

    if (explicit) {
      setIsSavingDraft(false);
      setShowSaveModal(true);
    }
  };

  // Restore draft handler
  const handleResumeDraft = () => {
    if (!pendingResumeDraft) return;

    setCandidateName(pendingResumeDraft.candidateName || "");
    setEmail(pendingResumeDraft.email || "");
    setPassword(pendingResumeDraft.password || "");
    setConfirmPassword(pendingResumeDraft.confirmPassword || pendingResumeDraft.password || "");
    setPhone(pendingResumeDraft.phone || "");
    setBranch(pendingResumeDraft.branch || "Delhi");

    if (pendingResumeDraft.otpVerified) {
      setOtpVerified(true);
      setOtpSent(true);
    }

    if (pendingResumeDraft.personalDetails) {
      setDob(pendingResumeDraft.personalDetails.dob || "1996-05-15");
      setGender(pendingResumeDraft.personalDetails.gender || "Male");
      setParentsName(pendingResumeDraft.personalDetails.parentsName || "");
      setCurrentAddress(pendingResumeDraft.personalDetails.currentAddress || "");
      setPermanentAddress(pendingResumeDraft.personalDetails.permanentAddress || "");
      setEmergencyName(pendingResumeDraft.personalDetails.emergencyName || "");
      setEmergencyRelation(pendingResumeDraft.personalDetails.emergencyRelation || "Parent");
      setEmergencyPhone(pendingResumeDraft.personalDetails.emergencyPhone || "");
    }

    if (pendingResumeDraft.statutoryDetails) {
      setPanNumber(pendingResumeDraft.statutoryDetails.panNumber || "");
      setAadhaarNumber(pendingResumeDraft.statutoryDetails.aadhaarNumber || "");
      setBankName(pendingResumeDraft.statutoryDetails.bankName || "");
      setBankAccountNumber(pendingResumeDraft.statutoryDetails.bankAccountNumber || "");
      setIfscCode(pendingResumeDraft.statutoryDetails.ifscCode || "");
    }

    if (pendingResumeDraft.kycDocuments) {
      setKycDocs((prev) => ({
        ...prev,
        ...pendingResumeDraft.kycDocuments,
      }));
    }

    const targetStep = pendingResumeDraft.currentStep || pendingResumeDraft.highestStep || 1;
    setCurrentStep(targetStep);
    setHighestStep(pendingResumeDraft.highestStep || targetStep);
    setPendingResumeDraft(null);
    setGlobalError(null);
  };

  // Discard draft handler
  const handleDiscardDraft = () => {
    clearLocalDraft();
    if (pendingResumeDraft?.email) {
      deleteServerDraft(pendingResumeDraft.email).catch(() => {});
    }
    setPendingResumeDraft(null);
    setCandidateName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setPhone("");
    setBranch("Delhi");
    setOtpCode("");
    setOtpSent(false);
    setOtpVerified(false);
    setDevOtpCode(null);
    setDob("1996-05-15");
    setGender("Male");
    setParentsName("");
    setCurrentAddress("");
    setPermanentAddress("");
    setEmergencyName("");
    setEmergencyPhone("");
    setPanNumber("");
    setAadhaarNumber("");
    setBankName("");
    setBankAccountNumber("");
    setIfscCode("");
    setCurrentStep(1);
    setHighestStep(1);
    setLastSavedNotice(null);
    setGlobalError(null);
  };

  // Check server draft when typing email in Step 1
  const handleCheckEmailDraft = async (inputEmail: string) => {
    if (!inputEmail || !inputEmail.includes("@") || pendingResumeDraft || emailDraftChecked) return;
    try {
      const serverDraft = await fetchServerDraft(inputEmail);
      if (serverDraft && (serverDraft.currentStep > 1 || serverDraft.candidateName || serverDraft.otpVerified)) {
        setPendingResumeDraft(serverDraft);
        setEmailDraftChecked(true);
      }
    } catch {}
  };

  // Step 1: Send OTP
  const handleSendOtp = async () => {
    if (!email || !email.includes("@")) {
      setGlobalError("Please enter a valid email address.");
      return;
    }
    if (!candidateName) {
      setGlobalError("Please enter your full name.");
      return;
    }

    setGlobalError(null);
    setIsSendingOtp(true);

    try {
      const res = await fetch("/api/auth/register/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, candidateName }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setGlobalError(data.error || "Failed to dispatch verification code.");
      } else {
        setOtpSent(true);
        if (data.devOtp) {
          setDevOtpCode(data.devOtp);
        }
      }
    } catch (err: any) {
      setGlobalError(err.message || "An unexpected network error occurred.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Step 1: Verify OTP
  const handleVerifyOtp = async (codeOverride?: string) => {
    const codeToVerify = (typeof codeOverride === "string" ? codeOverride : otpCode || "").trim();
    if (!codeToVerify || codeToVerify.length !== 6) {
      setGlobalError("Please enter the 6-digit code received on your email.");
      return;
    }

    setGlobalError(null);
    setIsVerifyingOtp(true);

    try {
      const res = await fetch("/api/auth/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: codeToVerify }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setGlobalError(data.error || "Invalid verification code.");
      } else {
        setOtpVerified(true);
        setDevOtpCode(null);
      }
    } catch (err: any) {
      setGlobalError(err.message || "Verification request failed.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Step 1: Proceed to Step 2
  const handleProceedStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    if (!candidateName || !email || !password || !phone) {
      setGlobalError("Please fill in all basic registration fields.");
      return;
    }

    if (password.length < 6) {
      setGlobalError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setGlobalError("Passwords do not match.");
      return;
    }

    if (!otpVerified) {
      setGlobalError("Please verify your email address with the 6-digit OTP code before proceeding.");
      return;
    }

    setHighestStep((h) => Math.max(h, 2));
    setCurrentStep(2);
  };

  // Step 2: Proceed to Step 3
  const handleProceedStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    if (!currentAddress || !emergencyName || !emergencyPhone) {
      setGlobalError("Please provide your current address and emergency contact details.");
      return;
    }

    setHighestStep((h) => Math.max(h, 3));
    setCurrentStep(3);
  };

  // Step 3: Proceed to Step 4
  const handleProceedStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    if (!panNumber || !aadhaarNumber || !bankAccountNumber || !ifscCode) {
      setGlobalError("Please fill in all statutory identification and bank account details.");
      return;
    }

    // Clean PAN and Aadhaar
    const cleanPan = panNumber.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      setGlobalError("Please enter a valid 10-character PAN number (e.g. ABCDE1234F).");
      return;
    }

    const cleanAadhaar = aadhaarNumber.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(cleanAadhaar)) {
      setGlobalError("Please enter a valid 12-digit Aadhaar number.");
      return;
    }

    setHighestStep((h) => Math.max(h, 4));
    setCurrentStep(4);
  };

  // Step 4: Handle File Upload with 2 MB Limit & Cloudinary
  const handleFileUpload = async (
    docKey: "pan_card" | "aadhaar_card" | "cancelled_cheque" | "photograph",
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Client-Side Strict 2 MB Limit Validation
    const validation = validateKycFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!validation.valid) {
      setKycDocs((prev) => ({
        ...prev,
        [docKey]: {
          ...prev[docKey],
          error: validation.error,
        },
      }));
      return;
    }

    // Clear error & set uploading state
    setKycDocs((prev) => ({
      ...prev,
      [docKey]: {
        ...prev[docKey],
        uploading: true,
        error: undefined,
      },
    }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", docKey);
      formData.append("identifier", email);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }

      setKycDocs((prev) => ({
        ...prev,
        [docKey]: {
          type: docKey,
          title: file.name,
          fileUrl: data.data.fileUrl,
          publicId: data.data.publicId,
          fileSize: file.size,
          formattedSize: data.data.formattedSize,
          uploadedAt: new Date().toISOString(),
          uploading: false,
          error: undefined,
        },
      }));
    } catch (err: any) {
      setKycDocs((prev) => ({
        ...prev,
        [docKey]: {
          ...prev[docKey],
          uploading: false,
          error: err.message || "Upload failed. Please try again.",
        },
      }));
    }
  };

  // Step 4: Final Submit Application
  const handleSubmitApplication = async () => {
    setGlobalError(null);

    // Validate that all 4 mandatory KYC documents are uploaded
    const requiredKeys: ("pan_card" | "aadhaar_card" | "cancelled_cheque" | "photograph")[] = [
      "pan_card",
      "aadhaar_card",
      "cancelled_cheque",
      "photograph",
    ];

    for (const key of requiredKeys) {
      if (!kycDocs[key].fileUrl) {
        setGlobalError(`Please upload the mandatory document: ${kycDocs[key].title}.`);
        return;
      }
    }

    setIsSubmittingFinal(true);

    try {
      const payload = {
        candidateName,
        email,
        password,
        phone,
        branch,
        department: "General Operations",
        designation: "Executive Associate",
        personalDetails: {
          dob,
          gender,
          parentsName,
          currentAddress,
          permanentAddress: permanentAddress || currentAddress,
          emergencyContact: {
            name: emergencyName,
            relationship: emergencyRelation,
            phone: emergencyPhone,
          },
        },
        statutoryDetails: {
          pan: panNumber.trim().toUpperCase(),
          aadhaar: aadhaarNumber.replace(/\s+/g, ""),
          bankAccountNumber,
          ifscCode: ifscCode.trim().toUpperCase(),
          bankName: bankName || "Primary Bank Ltd",
        },
        kycDocuments: Object.values(kycDocs).map((d) => ({
          type: d.type,
          title: d.title,
          fileUrl: d.fileUrl,
          publicId: d.publicId,
          fileSize: d.fileSize,
          uploadedAt: d.uploadedAt,
        })),
      };

      const res = await fetch("/api/auth/register/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setGlobalError(data.error || "Failed to submit application.");
      } else {
        setSubmissionSuccess(true);
        setCurrentStep(5);
        clearLocalDraft();
        deleteServerDraft(email).catch(() => {});
        setPendingResumeDraft(null);
      }
    } catch (err: any) {
      setGlobalError(err.message || "An unexpected error occurred while submitting.");
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background radial glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 blur-[130px] rounded-full" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Credit Expert India</h1>
              <p className="text-xs text-slate-400">Employee Self-Registration Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 hidden sm:inline">Already registered?</span>
            <Link
              href="/login"
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-500/30 px-3.5 py-1.5 rounded-lg hover:border-indigo-400/50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto w-full px-4 py-8 flex-1 flex flex-col justify-center">
        {/* Progress Tracker */}
        {currentStep < 5 && (
          <div className="mb-8">
            <div className="grid grid-cols-4 gap-2 sm:gap-4 text-center">
              {[
                { step: 1, title: "Account & OTP" },
                { step: 2, title: "Personal Details" },
                { step: 3, title: "Bank & KYC" },
                { step: 4, title: "Upload Docs" },
              ].map((item) => {
                const isActive = currentStep === item.step;
                const isDone = currentStep > item.step;
                const isAccessible = item.step <= highestStep;

                return (
                  <button
                    key={item.step}
                    type="button"
                    disabled={!isAccessible}
                    onClick={() => {
                      if (isAccessible) {
                        setCurrentStep(item.step);
                      }
                    }}
                    className={`flex flex-col items-center group transition-all ${
                      isAccessible ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all mb-2 ${
                        isDone
                          ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20 group-hover:ring-2 group-hover:ring-emerald-400"
                          : isActive
                          ? "bg-indigo-600 text-white ring-4 ring-indigo-500/20"
                          : isAccessible
                          ? "bg-slate-800 text-indigo-300 border border-indigo-500/40 group-hover:border-indigo-400"
                          : "bg-slate-800 text-slate-500 border border-slate-700"
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : item.step}
                    </div>
                    <span
                      className={`text-xs font-medium tracking-tight ${
                        isActive
                          ? "text-indigo-400 font-semibold"
                          : isDone
                          ? "text-slate-300"
                          : "text-slate-500"
                      }`}
                    >
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full transition-all duration-300"
                style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Incomplete Registration Detected Banner */}
        {pendingResumeDraft && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-900/60 via-indigo-900/50 to-slate-900/80 border border-blue-500/40 shadow-xl shadow-blue-900/20 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 shrink-0">
                  <Bookmark className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      Incomplete Registration Found
                    </h3>
                    <span className="text-[10px] font-semibold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">
                      Step {pendingResumeDraft.currentStep || pendingResumeDraft.highestStep || 1} of 4
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Applicant: <strong className="text-white">{pendingResumeDraft.candidateName || "Candidate"}</strong> ({pendingResumeDraft.email}) • Saved {formatTimeAgo(pendingResumeDraft.lastSavedAt)}
                  </p>
                  <p className="text-[11px] text-blue-300/80 mt-0.5">
                    {STEP_NAMES[pendingResumeDraft.currentStep || pendingResumeDraft.highestStep || 1] || "Registration Progress"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={handleResumeDraft}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Resume Step {pendingResumeDraft.currentStep || pendingResumeDraft.highestStep || 1}
                </button>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="px-3 py-2 rounded-xl text-slate-400 hover:text-rose-300 hover:bg-slate-800/80 text-xs font-medium border border-slate-700/60 transition-colors cursor-pointer"
                  title="Discard this draft and start a new registration"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {globalError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-shake">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block text-rose-200">Registration Notice</span>
              {globalError}
            </div>
          </div>
        )}

        {/* Auto-save bar and Save & Continue Later button */}
        {currentStep < 5 && (
          <div className="flex items-center justify-between mb-3 px-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400 font-mono text-[11px]">
                {lastSavedNotice || "Draft auto-saved locally"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => saveDraftState(true)}
              disabled={isSavingDraft}
              className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all cursor-pointer shadow-xs"
            >
              <Save className="w-3.5 h-3.5 text-blue-400" />
              <span>{isSavingDraft ? "Saving..." : "Save & Continue Later"}</span>
            </button>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          {/* ============================================================== */}
          {/* STEP 1: ACCOUNT DETAILS & EMAIL OTP VERIFICATION */}
          {/* ============================================================== */}
          {currentStep === 1 && (
            <form onSubmit={handleProceedStep1} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-400" />
                  Account Details & Email Verification
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Create your login credentials. We will send a 6-digit OTP code to verify your official or personal email address.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Full Name (as per Aadhaar/PAN) *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar Sharma"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Branch */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Joining Branch *
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value as Branch)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                      {BRANCHES.map((b) => (
                        <option key={b} value={b}>
                          {b} Branch
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Email Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Email Address *
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        disabled={otpVerified}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={(e) => handleCheckEmailDraft(e.target.value)}
                        placeholder="e.g. ramesh.sharma@gmail.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60 transition-colors"
                      />
                    </div>
                    {!otpVerified && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        isLoading={isSendingOtp}
                        onClick={handleSendOtp}
                        className="text-xs whitespace-nowrap"
                      >
                        {otpSent ? "Resend OTP" : "Send 6-Digit OTP"}
                      </Button>
                    )}
                    {otpVerified && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                        <CheckCircle2 className="w-4 h-4" /> Verified
                      </span>
                    )}
                  </div>
                </div>

                {/* OTP Verification Box */}
                {otpSent && !otpVerified && (
                  <div className="sm:col-span-2 p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> Enter the 6-Digit Code Sent to {email}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">Valid 10 mins</span>
                    </div>

                    {isLocalhost && devOtpCode && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                        <span>
                          🛠️ <strong>Dev Mode Code:</strong> <span className="font-mono text-base font-bold">{devOtpCode}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpCode(devOtpCode);
                            handleVerifyOtp(devOtpCode);
                          }}
                          className="text-[11px] underline font-semibold text-amber-200 hover:text-white cursor-pointer"
                        >
                          Auto-fill & Confirm
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otpCode}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleVerifyOtp();
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                          setOtpCode(val);
                          if (val.length === 6) {
                            handleVerifyOtp(val);
                          }
                        }}
                        placeholder="••••••"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-indigo-400"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        isLoading={isVerifyingOtp}
                        onClick={() => handleVerifyOtp()}
                        className="text-xs"
                      >
                        Confirm OTP
                      </Button>
                    </div>
                  </div>
                )}

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mobile Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Create Login Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your chosen password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => saveDraftState(true)}
                  disabled={isSavingDraft || (!candidateName && !email)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-indigo-400" />
                  {isSavingDraft ? "Saving..." : "Save & Continue Later"}
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  icon={<ArrowRight className="w-4 h-4" />}
                  disabled={!otpVerified}
                  className="w-full sm:w-auto"
                >
                  Continue to Personal Details
                </Button>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* STEP 2: PERSONAL & EMERGENCY CONTACT DETAILS */}
          {/* ============================================================== */}
          {currentStep === 2 && (
            <form onSubmit={handleProceedStep2} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  Personal Information & Contacts
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enter your address and emergency contact details for official employment records.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* DOB */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    required
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Gender *</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Father / Mother / Spouse Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Father&apos;s / Mother&apos;s Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={parentsName}
                    onChange={(e) => setParentsName(e.target.value)}
                    placeholder="Parent or Guardian name"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Current Residential Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Current Residential Address *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={currentAddress}
                    onChange={(e) => setCurrentAddress(e.target.value)}
                    placeholder="House/Flat No., Street, City, State, PIN Code"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Permanent Address */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Permanent Address
                    </label>
                    <button
                      type="button"
                      onClick={() => setPermanentAddress(currentAddress)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Same as current address
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={permanentAddress}
                    onChange={(e) => setPermanentAddress(e.target.value)}
                    placeholder="Permanent home address"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Emergency Contact Header */}
                <div className="sm:col-span-2 pt-2 border-t border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Emergency Contact Person
                  </h3>
                </div>

                {/* Emergency Contact Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="e.g. Sunita Sharma"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Emergency Relationship */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Relationship *
                  </label>
                  <input
                    type="text"
                    required
                    value={emergencyRelation}
                    onChange={(e) => setEmergencyRelation(e.target.value)}
                    placeholder="e.g. Spouse / Parent / Sibling"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Emergency Phone */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Emergency Contact Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="+91 98765 00000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  icon={<ArrowLeft className="w-4 h-4" />}
                  onClick={() => setCurrentStep(1)}
                  className="w-full sm:w-auto"
                >
                  Back
                </Button>
                <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => saveDraftState(true)}
                    disabled={isSavingDraft}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-indigo-400" />
                    {isSavingDraft ? "Saving..." : "Save & Continue Later"}
                  </button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    icon={<ArrowRight className="w-4 h-4" />}
                    className="w-full sm:w-auto"
                  >
                    Continue to Bank & Statutory Details
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* STEP 3: STATUTORY IDENTIFICATION & BANK DETAILS */}
          {/* ============================================================== */}
          {currentStep === 3 && (
            <form onSubmit={handleProceedStep3} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  Statutory Identification & Banking Details
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Required for salary credit, PF registration, and income tax compliance.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* PAN Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    PAN Card Number *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono uppercase text-white focus:outline-none focus:border-indigo-500 tracking-wider"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">10-character alphanumeric</span>
                </div>

                {/* Aadhaar Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Aadhaar Card Number *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={aadhaarNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setAadhaarNumber(val);
                    }}
                    placeholder="1234 5678 9012"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 tracking-wider"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">12-digit UIDAI number</span>
                </div>

                {/* Bank Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. HDFC Bank Ltd"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Bank Account Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Account Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="e.g. 50100012345678"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* IFSC Code */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    IFSC Code *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    placeholder="e.g. HDFC0000123"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono uppercase text-white focus:outline-none focus:border-indigo-500 tracking-wider"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  icon={<ArrowLeft className="w-4 h-4" />}
                  onClick={() => setCurrentStep(2)}
                  className="w-full sm:w-auto"
                >
                  Back
                </Button>
                <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => saveDraftState(true)}
                    disabled={isSavingDraft}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-indigo-400" />
                    {isSavingDraft ? "Saving..." : "Save & Continue Later"}
                  </button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    icon={<ArrowRight className="w-4 h-4" />}
                    className="w-full sm:w-auto"
                  >
                    Continue to Document Uploads
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* STEP 4: KYC DOCUMENT UPLOADS (STRICT 2 MB LIMIT & CLOUDINARY) */}
          {/* ============================================================== */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <FileCheck2 className="w-5 h-5 text-indigo-400" />
                    Upload Mandatory KYC Documents
                  </h2>
                  <Badge variant="warning" className="text-[11px] font-bold">
                    Strict Limit: Max {MAX_KYC_FILE_SIZE_LABEL} per file
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Upload clear scanned copies or photographs (PDF, PNG, JPG). Each file must be strictly under 2 MB.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    key: "pan_card" as const,
                    title: "1. PAN Card *",
                    desc: "Clear photo or PDF copy of government PAN card",
                  },
                  {
                    key: "aadhaar_card" as const,
                    title: "2. Aadhaar Card *",
                    desc: "Front and back side or masked e-Aadhaar PDF",
                  },
                  {
                    key: "cancelled_cheque" as const,
                    title: "3. Cancelled Cheque / Passbook *",
                    desc: "Proof of bank account showing name, account & IFSC",
                  },
                  {
                    key: "photograph" as const,
                    title: "4. Passport Size Photograph *",
                    desc: "Recent formal face portrait on plain background",
                  },
                ].map((item) => {
                  const doc = kycDocs[item.key];
                  const isUploaded = Boolean(doc.fileUrl);

                  return (
                    <div
                      key={item.key}
                      className={`p-4 rounded-xl border transition-all ${
                        isUploaded
                          ? "bg-emerald-950/20 border-emerald-500/40"
                          : doc.error
                          ? "bg-rose-950/20 border-rose-500/40"
                          : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                            {item.title}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
                        </div>
                        {isUploaded && (
                          <span className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        )}
                      </div>

                      {/* Error state */}
                      {doc.error && (
                        <p className="text-[11px] text-rose-400 font-medium mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {doc.error}
                        </p>
                      )}

                      {/* Uploaded state details */}
                      {isUploaded && (
                        <div className="mb-3 p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-[11px]">
                          <span className="truncate max-w-[180px] text-slate-300 font-mono">
                            {doc.title}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px]">
                            {doc.formattedSize || "Uploaded"}
                          </span>
                        </div>
                      )}

                      {/* Upload Button */}
                      <label className="cursor-pointer block">
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                          className="hidden"
                          disabled={doc.uploading}
                          onChange={(e) => handleFileUpload(item.key, e)}
                        />
                        <div
                          className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
                            doc.uploading
                              ? "bg-slate-800 text-slate-400 border-slate-700 cursor-wait"
                              : isUploaded
                              ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                              : "bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/30 hover:border-indigo-400/50"
                          }`}
                        >
                          {doc.uploading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Uploading to Cloudinary...
                            </>
                          ) : isUploaded ? (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              Re-upload (Max 2 MB)
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              Upload File (Max 2 MB)
                            </>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>

              {/* Note on approval policy */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Approval Policy:</strong> After submitting, your application goes into
                  <strong> Pending HR/Admin Verification</strong>. Once verified, HR will activate your official profile,
                  and you will be able to log in to the HRMS portal with your email and password.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  icon={<ArrowLeft className="w-4 h-4" />}
                  onClick={() => setCurrentStep(3)}
                  className="w-full sm:w-auto"
                >
                  Back
                </Button>
                <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => saveDraftState(true)}
                    disabled={isSavingDraft}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-indigo-400" />
                    {isSavingDraft ? "Saving..." : "Save & Continue Later"}
                  </button>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    isLoading={isSubmittingFinal}
                    onClick={handleSubmitApplication}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    className="w-full sm:w-auto"
                  >
                    Submit Application for HR Approval
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 5: APPLICATION SUBMITTED & PENDING VERIFICATION */}
          {/* ============================================================== */}
          {currentStep === 5 && (
            <div className="py-6 text-center space-y-6 animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center shadow-lg shadow-amber-500/10">
                <Clock className="w-8 h-8" />
              </div>

              <div className="max-w-md mx-auto space-y-2">
                <Badge variant="warning" className="text-xs uppercase tracking-wider font-bold">
                  Application Under Review
                </Badge>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Application Successfully Submitted!
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Thank you, <strong>{candidateName}</strong>. Your personal details and KYC documents
                  have been registered and submitted to the <strong>{branch} branch HR team</strong>.
                </p>
              </div>

              <div className="max-w-lg mx-auto p-4 rounded-xl bg-slate-950 border border-slate-800 text-left space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  What Happens Next?
                </h4>
                <ul className="text-xs text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      HR & Admin verify your PAN, Aadhaar, Bank Details, and Photograph.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Your official sequential <strong>Employee ID (EMP-XXXX)</strong> will be assigned.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      You will receive an <strong>Account Approval Email</strong> notification. From that moment, you can log in to HRMS with your email and password.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/login">
                  <Button variant="primary" size="md" icon={<ArrowRight className="w-4 h-4" />}>
                    Return to Sign In Screen
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Draft Saved Confirmation Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-200">
            <button
              type="button"
              onClick={() => setShowSaveModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Registration Progress Saved</h3>
                <p className="text-xs text-slate-400">Step {currentStep} of 4 • {STEP_NAMES[currentStep]}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Your registration progress has been securely saved. You can safely close your browser or navigate away. When you return to the registration page, your inputs and uploaded documents will be waiting for you.
            </p>

            {email && (
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-200 flex items-start gap-2.5 mb-5">
                <Mail className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>
                  Synchronized with <strong>{email}</strong>. Entering this email on any device will allow you to continue.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/80 transition-colors cursor-pointer"
              >
                Exit to Sign In
              </button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setShowSaveModal(false)}
              >
                Continue Editing
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950 px-6 py-4 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} Credit Expert India HRMS. Encrypted & ISO Compliant Employee Data Management.
      </footer>
    </div>
  );
}
