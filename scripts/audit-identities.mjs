#!/usr/bin/env node
/**
 * READ-ONLY identity audit. Reports data problems that can attach one person's records to another:
 *  - user accounts whose employeeId belongs to an employee with a different email
 *  - several user accounts sharing one email
 *  - several onboarding records sharing one employeeId
 *  - employees sharing a PAN (compared as hashes; the PAN itself is never printed)
 *
 * Prints only IDs and counts, never names, PAN, Aadhaar or bank details.
 * Needs FIREBASE_ADMIN_* in the environment or .env.local. It never writes.
 * Usage: node scripts/audit-identities.mjs
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY.");
  process.exit(1);
}

const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));
const read = async (c) => (await db.collection(c).get()).docs.map((d) => ({ _id: d.id, ...d.data() }));
const norm = (v) => String(v || "").toLowerCase().trim();
const group = (items, keyOf) => {
  const m = new Map();
  for (const it of items) {
    const k = keyOf(it);
    if (!k) continue;
    m.set(k, [...(m.get(k) || []), it]);
  }
  return [...m.entries()].filter(([, v]) => v.length > 1);
};

const [users, employees, onboarding] = await Promise.all([read("users"), read("employees"), read("onboarding")]);
const empById = new Map(employees.map((e) => [e.employeeId || e._id, e]));
let findings = 0;
const report = (title, lines) => {
  console.log(`\n${title}: ${lines.length}`);
  lines.forEach((l) => console.log(`  - ${l}`));
  findings += lines.length;
};

report(
  "User accounts linked to an employee with a different email",
  users
    .filter((u) => u.employeeId && u.employeeId !== "PENDING" && empById.has(u.employeeId))
    .filter((u) => {
      const e = empById.get(u.employeeId);
      const emails = [e.personal?.workEmail, e.personal?.personalEmail].map(norm);
      return !emails.includes(norm(u.email));
    })
    .map((u) => `user ${u.uid} -> ${u.employeeId}`)
);

report(
  "User accounts pointing at an employee ID that does not exist",
  users
    .filter((u) => u.employeeId && u.employeeId !== "PENDING" && !empById.has(u.employeeId))
    .map((u) => `user ${u.uid} -> ${u.employeeId}`)
);

report(
  "Several user accounts share one email",
  group(users, (u) => norm(u.email)).map(([, v]) => `uids ${v.map((u) => u.uid).join(", ")}`)
);

report(
  "Several onboarding records share one employeeId",
  group(onboarding, (o) => o.employeeId).map(([k, v]) => `${k}: onboarding ${v.map((o) => o._id).join(", ")}`)
);

report(
  "Employees sharing one PAN (hash compared)",
  group(employees, (e) => (e.statutory?.pan ? createHash("sha256").update(norm(e.statutory.pan)).digest("hex") : ""))
    .map(([, v]) => `employees ${v.map((e) => e.employeeId || e._id).join(", ")}`)
);

console.log(`\n${findings === 0 ? "No identity problems found." : `${findings} finding(s). Nothing was changed.`}`);
