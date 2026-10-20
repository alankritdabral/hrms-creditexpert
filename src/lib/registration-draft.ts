import { RegistrationDraft } from "./types";

export const DRAFT_STORAGE_KEY = "hrms_registration_draft_v1";

/**
 * Saves draft to browser localStorage
 */
export function saveLocalDraft(draft: RegistrationDraft): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (err) {
    console.warn("Failed to save draft to localStorage:", err);
  }
}

/**
 * Retrieves draft from browser localStorage
 */
export function getLocalDraft(): RegistrationDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as RegistrationDraft;
  } catch (err) {
    console.warn("Failed to parse draft from localStorage:", err);
    return null;
  }
}

/**
 * Clears draft from browser localStorage
 */
export function clearLocalDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear draft from localStorage:", err);
  }
}

/**
 * Syncs draft to server
 */
export async function saveServerDraft(email: string, draft: RegistrationDraft): Promise<boolean> {
  if (!email || !email.includes("@")) return false;
  try {
    const res = await fetch("/api/auth/register/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toLowerCase().trim(), draft }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Retrieves draft from server by email
 */
export async function fetchServerDraft(email: string): Promise<RegistrationDraft | null> {
  if (!email || !email.includes("@")) return null;
  try {
    const res = await fetch(`/api/auth/register/draft?email=${encodeURIComponent(email.toLowerCase().trim())}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.success && json.draft ? (json.draft as RegistrationDraft) : null;
  } catch {
    return null;
  }
}

/**
 * Deletes server draft
 */
export async function deleteServerDraft(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const res = await fetch(`/api/auth/register/draft?email=${encodeURIComponent(email.toLowerCase().trim())}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Formats ISO timestamp into human-readable relative time
 */
export function formatTimeAgo(isoString: string): string {
  if (!isoString) return "just now";
  try {
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins === 1) return "1 minute ago";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return "yesterday";
    return `${diffDays} days ago`;
  } catch {
    return "recently";
  }
}

export const STEP_NAMES: Record<number, string> = {
  1: "Account & OTP Verification",
  2: "Personal Details",
  3: "Statutory & Banking Information",
  4: "KYC Document Uploads",
};
