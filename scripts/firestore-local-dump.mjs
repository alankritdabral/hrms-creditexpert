#!/usr/bin/env node
/**
 * Two-step variant of the Firestore -> RDS import, for when the Firestore quota is tight:
 *
 *   node scripts/firestore-local-dump.mjs export --dir=<folder> --only=a,b,c   # Firestore -> local JSON files
 *   node scripts/firestore-local-dump.mjs import --dir=<folder> [--overwrite]    # local files -> RDS (no Firestore reads)
 *
 * Firestore is read once (one read per document) and never written. Files are plain JSON, one per
 * collection, with Timestamps already converted to ISO strings (same conversion as the direct import).
 * They contain password hashes: keep the folder private (it is created with mode 700).
 *
 * Environment (or .env.local): FIREBASE_ADMIN_* or FIREBASE_SERVICE_ACCOUNT_BASE64 (export),
 * BACKEND_API_URL + BACKEND_API_KEY (import).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const [mode, ...rest] = process.argv.slice(2);
const arg = (n) => (rest.find((a) => a.startsWith(`--${n}=`)) || "").slice(n.length + 3);
const dir = arg("dir");
const only = arg("only").split(",").filter(Boolean);
const OVERWRITE = rest.includes("--overwrite");
const PAGE = 400;
const CHUNK = 100;

if (!["export", "import"].includes(mode) || !dir) {
  console.error("Usage: firestore-local-dump.mjs <export|import> --dir=<folder> [--only=a,b]");
  process.exit(1);
}

if (mode === "export") {
  if (!only.length) {
    console.error("export needs --only=<collections> so nothing unplanned is read.");
    process.exit(1);
  }
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT_BASE;
  const credential = b64
    ? cert(JSON.parse(Buffer.from(b64, "base64").toString("utf8")))
    : cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      });
  const plain = (v) => {
    if (v instanceof Timestamp) return v.toDate().toISOString();
    if (Array.isArray(v)) return v.map(plain);
    if (v && typeof v === "object") {
      if (typeof v.toDate === "function") return v.toDate().toISOString();
      return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, plain(x)]));
    }
    return v;
  };
  const db = getFirestore(initializeApp({ credential }));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const name of only) {
    const docs = [];
    let last = null;
    for (;;) {
      let q = db.collection(name).orderBy("__name__").limit(PAGE);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      last = snap.docs[snap.docs.length - 1];
      for (const d of snap.docs) docs.push({ id: d.id, data: plain(d.data()) });
      if (snap.size < PAGE) break;
    }
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(docs), { mode: 0o600 });
    console.log(`saved ${name.padEnd(24)} ${docs.length} documents`);
  }
} else {
  const baseUrl = (process.env.BACKEND_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.BACKEND_API_KEY || "";
  if (!baseUrl || !apiKey) {
    console.error("Set BACKEND_API_URL and BACKEND_API_KEY.");
    process.exit(1);
  }
  const call = async (method, path, body) => {
    const res = await fetch(`${baseUrl}/internal/staff-data${path}`, {
      method,
      headers: { "x-internal-api-key": apiKey, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.message || ""}`);
    return json.data;
  };
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).filter((f) => !only.length || only.includes(f.slice(0, -5)));
  const expected = {};
  for (const f of files) {
    const name = f.slice(0, -5);
    const docs = JSON.parse(readFileSync(join(dir, f), "utf8"));
    expected[name] = docs.length;
    let written = 0;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const r = await call("POST", "/import", { collection: name, docs: docs.slice(i, i + CHUNK), overwrite: OVERWRITE });
      written += r.written;
    }
    console.log(`${name.padEnd(24)} file=${docs.length}  imported=${written}  already-there=${docs.length - written}`);
  }
  const inRds = await call("GET", "/counts");
  console.log("\nVerification (RDS rows vs local files):");
  let bad = 0;
  for (const [name, n] of Object.entries(expected)) {
    const rds = inRds[name] || 0;
    if (rds < n) bad++;
    console.log(`${rds >= n ? "OK     " : "MISSING"} ${name.padEnd(24)} file=${n} rds=${rds}`);
  }
  process.exit(bad ? 2 : 0);
}
