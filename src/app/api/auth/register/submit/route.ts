import { NextRequest, NextResponse } from "next/server";
import {
  getUserAccountByEmail,
  createUserAccount,
  createOnboardingRecord,
  recordAuditLog,
} from "@/lib/db/db-adapter";
import { isEmailOtpVerified } from "@/lib/email";
import { MAX_KYC_FILE_SIZE_BYTES } from "@/lib/upload-validation";
import { STANDARD_ONBOARDING_CHECKLIST, UserAccount, Branch } from "@/lib/types";

const REQUIRED_DOC_TYPES = [
  { type: "pan_card", label: "PAN Card" },
  { type: "aadhaar_card", label: "Aadhaar Card" },
  { type: "cancelled_cheque", label: "Bank Proof (Cancelled Cheque / Passbook)" },
  { type: "photograph", label: "Passport Photograph" },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      candidateName,
      email,
      password,
      phone,
      branch,
      department,
      designation,
      personalDetails,
      statutoryDetails,
      kycDocuments,
    } = body;

    // 1. Basic validation
    if (!candidateName || !email || !password || !branch) {
      return NextResponse.json(
        { success: false, error: "Candidate name, email, password, and branch are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Check if user already exists
    const existing = await getUserAccountByEmail(normalizedEmail);
    if (existing) {
      if (existing.status === "Active") {
        return NextResponse.json(
          { success: false, error: "An active account with this email already exists. Please log in." },
          { status: 409 }
        );
      }
      if (existing.status === "Pending_Approval") {
        return NextResponse.json(
          {
            success: false,
            error: "An application with this email is already submitted and pending verification by HR & Admin.",
          },
          { status: 409 }
        );
      }
    }

    // 3. Verify OTP was confirmed
    const isOtpDone = isEmailOtpVerified(normalizedEmail);
    if (!isOtpDone) {
      return NextResponse.json(
        {
          success: false,
          error: "Email verification required. Please verify your 6-digit OTP code before submitting.",
        },
        { status: 403 }
      );
    }

    // 4. Validate mandatory KYC documents
    const docList = Array.isArray(kycDocuments) ? kycDocuments : [];
    const missingDocs: string[] = [];

    for (const reqDoc of REQUIRED_DOC_TYPES) {
      const found = docList.find((d: any) => d.type === reqDoc.type && d.fileUrl);
      if (!found) {
        missingDocs.push(reqDoc.label);
      }
    }

    if (missingDocs.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Please upload all mandatory KYC documents. Missing: ${missingDocs.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    // 5. Enforce 2 MB limit on each submitted file metadata
    for (const doc of docList) {
      if (doc.fileSize && doc.fileSize > MAX_KYC_FILE_SIZE_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `Document "${doc.title || doc.type}" exceeds the 2 MB limit.`,
          },
          { status: 400 }
        );
      }
    }

    const userId = `usr-${Date.now()}`;
    const photoDoc = docList.find((d: any) => d.type === "photograph");
    const avatarUrl =
      photoDoc?.fileUrl ||
      `https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150`;

    // 6. Create UserAccount with status: "Pending_Approval"
    const userAccount: UserAccount = {
      uid: userId,
      employeeId: "PENDING",
      email: normalizedEmail,
      password: password,
      name: candidateName,
      role: "employee",
      branch: branch as Branch,
      department: department || "Operations",
      avatar: avatarUrl,
      status: "Pending_Approval",
      createdAt: new Date().toISOString(),
    };

    await createUserAccount(userAccount);

    // 7. Prepare initial onboarding checklist with uploaded items marked completed
    const uploadedTypes = new Set(docList.map((d: any) => d.type));
    const now = new Date().toISOString();

    const initialChecklist = STANDARD_ONBOARDING_CHECKLIST.map((item) => {
      let isCompleted = false;
      let docUrl = undefined;

      if (item.key === "pan_card" && uploadedTypes.has("pan_card")) {
        isCompleted = true;
        docUrl = docList.find((d: any) => d.type === "pan_card")?.fileUrl;
      } else if (item.key === "aadhaar_card" && uploadedTypes.has("aadhaar_card")) {
        isCompleted = true;
        docUrl = docList.find((d: any) => d.type === "aadhaar_card")?.fileUrl;
      } else if (
        (item.key === "bank_details" || item.key === "cancelled_cheque") &&
        uploadedTypes.has("cancelled_cheque")
      ) {
        isCompleted = true;
        docUrl = docList.find((d: any) => d.type === "cancelled_cheque")?.fileUrl;
      } else if (item.key === "photograph" && uploadedTypes.has("photograph")) {
        isCompleted = true;
        docUrl = docList.find((d: any) => d.type === "photograph")?.fileUrl;
      }

      return {
        ...item,
        completed: isCompleted,
        completedAt: isCompleted ? now : undefined,
        verified: false,
        documentUrl: docUrl,
      };
    });

    const completedCount = initialChecklist.filter((i) => i.completed).length;
    const progressPercentage = Math.round((completedCount / initialChecklist.length) * 100);

    // 8. Create OnboardingRecord in Firestore/Memory
    const onboardingRecord = await createOnboardingRecord(
      {
        userId,
        candidateName,
        email: normalizedEmail,
        phone: phone || personalDetails?.emergencyContact?.phone || "",
        branch: branch as Branch,
        department: department || "Operations",
        designation: designation || "Associate",
        joiningDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        annualCtc: 480000,
        assignedHrName: "Priya Verma (HR)",
        notes: "Self-registered online. KYC documents uploaded and awaiting HR verification.",
        selfRegistered: true,
        kycDocuments: docList.map((d: any) => ({
          type: d.type,
          title: d.title || d.fileName || d.type,
          fileUrl: d.fileUrl,
          publicId: d.publicId,
          fileSize: d.fileSize,
          uploadedAt: d.uploadedAt || now,
          verified: false,
        })),
        personalDetails,
        statutoryDetails,
        progressPercentage,
        lifecycleStatus: "Candidate",
        checklist: initialChecklist,
      },
      { name: candidateName, role: "candidate" }
    );

    // 9. Record Audit Log
    await recordAuditLog({
      who: candidateName,
      role: "candidate",
      action: "CANDIDATE_SELF_REGISTERED",
      details: `Candidate self-registered from ${branch} branch. 4 KYC documents uploaded (each <= 2MB). Application status: Pending HR/Admin verification.`,
    });

    return NextResponse.json({
      success: true,
      message:
        "Your registration and KYC documents have been submitted successfully. Your application is now pending verification by HR & Admin.",
      status: "pending_approval",
      recordId: onboardingRecord.id,
      candidate: {
        name: candidateName,
        email: normalizedEmail,
        branch,
      },
    });
  } catch (error: any) {
    console.error("register/submit error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to submit registration application." },
      { status: 500 }
    );
  }
}
