#!/usr/bin/env node
/**
 * ONE-TIME import of every Firestore collection (HRMS + staff dashboard share one Firebase
 * project) into the backend's RDS, through the backend's /internal/staff-data/import API.
 *
 *   node scripts/migrate-firestore-to-rds.mjs              # dry run: counts per collection, writes nothing
 *   node scripts/migrate-firestore-to-rds.mjs --run        # import
 *   node scripts/migrate-firestore-to-rds.mjs --run --overwrite   # also replace documents already in RDS
 *   node scripts/migrate-firestore-to-rds.mjs --run --only=employees,users
 *
 * Safe to rerun: documents already in RDS are kept unless --overwrite is given. Read-only on
 * Firestore. Sessions and one-time codes are skipped (everyone signs in again after the cutover).
 *
 * Environment (or .env.local):
 *   BACKEND_API_URL, BACKEND_API_KEY                 where to import to
 *   FIREBASE_ADMIN_PROJECT_ID / _CLIENT_EMAIL / _PRIVATE_KEY, or FIREBASE_SERVICE_ACCOUNT_BASE64
 *
 * Reads cost Firestore quota (one read per document); run it when the daily quota is available.
 */
import { existsSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const RUN = args.includes("--run");
const OVERWRITE = args.includes("--overwrite");
const only = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "").split(",").filter(Boolean);
const SKIP = new Set(["sessions", "otps"]);
const PAGE = 400; // documents read per Firestore page
const CHUNK = 100; // documents per import request

const baseUrl = (process.env.BACKEND_API_URL || "").replace(/\/+$/, "");
const apiKey = process.env.BACKEND_API_KEY || "";
if (!baseUrl || !apiKey) {
  console.error("Set BACKEND_API_URL and BACKEND_API_KEY.");
  process.exit(1);
}

function credential() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT_BASE;
  if (b64) return cert(JSON.parse(Buffer.from(b64, "base64").toString("utf8")));
  const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail } = process.env;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing Firebase admin credentials (FIREBASE_ADMIN_* or FIREBASE_SERVICE_ACCOUNT_BASE64).");
    process.exit(1);
  }
  return cert({ projectId, clientEmail, privateKey });
}

/** Firestore Timestamps become ISO strings; everything else is plain JSON already. */
function plain(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

async function backend(method, path, body) {
  const res = await fetch(`${baseUrl}/internal/staff-data${path}`, {
    method,
    headers: { "x-internal-api-key": apiKey, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.message || ""}`);
  return json.data;
}

const db = getFirestore(initializeApp({ credential: credential() }));
const collections = (await db.listCollections()).map((c) => c.id).filter((id) => !SKIP.has(id) && (!only.length || only.includes(id)));
console.log(`${RUN ? "IMPORTING" : "DRY RUN"} ${collections.length} collection(s): ${collections.join(", ")}\n`);

const report = [];
for (const name of collections) {
  let read = 0;
  let written = 0;
  let last = null;
  for (;;) {
    let q = db.collection(name).orderBy("__name__").limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    read += snap.size;
    last = snap.docs[snap.docs.length - 1];
    if (RUN) {
      const docs = snap.docs.map((d) => ({ id: d.id, data: plain(d.data()) }));
      for (let i = 0; i < docs.length; i += CHUNK) {
        const r = await backend("POST", "/import", { collection: name, docs: docs.slice(i, i + CHUNK), overwrite: OVERWRITE });
        written += r.written;
      }
    }
    if (snap.size < PAGE) break;
  }
  report.push({ collection: name, firestore: read, imported: RUN ? written : "-" });
  console.log(`${name.padEnd(24)} firestore=${read}${RUN ? `  imported=${written}  already-there=${read - written}` : ""}`);
}

if (RUN) {
  const inRds = await backend("GET", "/counts");
  console.log("\nVerification (RDS rows vs Firestore documents):");
  let bad = 0;
  for (const r of report) {
    const rds = inRds[r.collection] || 0;
    const ok = rds >= r.firestore;
    if (!ok) bad++;
    console.log(`${ok ? "OK  " : "MISSING"} ${r.collection.padEnd(24)} firestore=${r.firestore} rds=${rds}`);
  }
  process.exit(bad ? 2 : 0);
}
console.log("\nDry run only. Re-run with --run to import.");
