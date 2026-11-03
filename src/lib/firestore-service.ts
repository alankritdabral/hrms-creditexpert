import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  limit as firestoreLimit,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./firebase";
import { getFirebaseAdminFirestore } from "./firebase-admin";
import { UserSession } from "./types";
import {
  INITIAL_EMPLOYEES,
  INITIAL_ATTENDANCE,
  INITIAL_LEAVES,
  INITIAL_INCENTIVE_SCHEMES,
  INITIAL_EMPLOYEE_INCENTIVES,
  INITIAL_ASSETS,
  INITIAL_REQUESTS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_PAYROLL_RUNS,
  INITIAL_POLICY,
  INITIAL_HOLIDAYS,
  INITIAL_ONBOARDING_RECORDS,
  SEED_USER_ACCOUNTS,
} from "./db/seed-data";

// ============================================================================
// FIRESTORE FREE (SPARK) PLAN ARCHITECTURE & QUOTA BUDGET
// ============================================================================
// Google Cloud Firestore Free Tier Limits:
// - Daily Reads: 50,000 documents / day
// - Daily Writes: 20,000 documents / day
// - Daily Deletes: 20,000 documents / day
// - Total Storage: 1 GiB (1,024 MB)
// - Outbound Network: 10 GiB / month
// - Monthly Cost: $0.00 / ₹0 (Spark Plan)
//
// In a typical 50-100 employee company:
// - Without caching: ~15,000 - 35,000 reads/day (risking quota exhaustion).
// - With 60-second TTL in-memory caching: ~1,200 - 2,500 reads/day (< 5% of quota).
// - Writes for attendance, leaves & payroll: ~250 - 500 writes/day (< 3% of quota).
// ============================================================================

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

// In-Memory Read Cache for Firestore collections (TTL 60 seconds)
const collectionCache = new Map<string, CacheEntry<any>>();
const singleDocCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// Filtered-query cache (server-side `where` reads) — keeps large, ever-growing
// collections such as attendance from ever being loaded in full.
export type QueryFilter = { field: string; op: "==" | ">=" | "<="; value: string | number | boolean };
interface QueryCacheEntry extends CacheEntry<any[]> { collection: string; filters: QueryFilter[] }
const queryCache = new Map<string, QueryCacheEntry>();
const inflightQueries = new Map<string, Promise<unknown[]>>();

function matchesFilters(doc: any, filters: QueryFilter[]): boolean {
  return filters.every((f) => {
    const v = doc?.[f.field];
    if (v === undefined || v === null) return false;
    if (f.op === "==") return v === f.value;
    if (f.op === ">=") return v >= f.value;
    return v <= f.value;
  });
}

/** Cache key for a collection read; limited reads must never be mistaken for the full collection. */
const colKey = (name: string, limitCount?: number) => (limitCount ? `${name}#limit${limitCount}` : name);

/**
 * Write-through: after a successful write, patch every cached copy in place
 * instead of discarding it, so a single clock-in/edit doesn't force a full re-read.
 */
function applyWriteToCaches(collectionName: string, docId: string, data: any | null) {
  // Limited (top-N) caches can't be patched correctly — drop them.
  for (const k of Array.from(collectionCache.keys())) {
    if (k.startsWith(`${collectionName}#`)) collectionCache.delete(k);
  }
  const patchList = (list: any[], filters?: QueryFilter[]): any[] => {
    const idx = list.findIndex((d) => d.id === docId);
    if (data === null) return idx === -1 ? list : list.filter((_, i) => i !== idx);
    const merged = { ...(idx === -1 ? {} : list[idx]), ...data, id: docId };
    const belongs = !filters || matchesFilters(merged, filters);
    if (idx === -1) return belongs ? [...list, merged] : list;
    if (!belongs) return list.filter((_, i) => i !== idx);
    const next = list.slice();
    next[idx] = merged;
    return next;
  };
  const col = collectionCache.get(collectionName);
  if (col) col.data = patchList(col.data);
  for (const q of queryCache.values()) {
    if (q.collection === collectionName) q.data = patchList(q.data, q.filters);
  }
  if (data === null) singleDocCache.delete(`${collectionName}/${docId}`);
  else if (collectionName !== "sessions") {
    const sd = singleDocCache.get(`${collectionName}/${docId}`);
    singleDocCache.set(`${collectionName}/${docId}`, { data: { ...(sd?.data || {}), ...data, id: docId }, cachedAt: Date.now() });
  }
}

// Spark Plan Quota & Telemetry Metrics
let totalReadsAttempted = 0;
let cacheHits = 0;
let cacheMisses = 0;
let totalWrites = 0;
let quotaExhaustedUntil: number | null = null;
let lastQuotaWarningTime = 0;

/**
 * Check if error indicates Firestore daily quota has been exceeded
 */
function isQuotaExhaustedError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const code = String(err.code || "").toLowerCase();
  return (
    code.includes("resource-exhausted") ||
    code === "8" ||
    msg.includes("quota exceeded") ||
    msg.includes("resource has been exhausted") ||
    msg.includes("too many requests")
  );
}

/**
 * Trip circuit breaker when quota exhaustion is encountered
 */
function handleQuotaExhausted(operation: string, err: any) {
  // Cooldown for 15 minutes before retrying Firestore
  quotaExhaustedUntil = Date.now() + 15 * 60 * 1000;
  const now = Date.now();
  if (now - lastQuotaWarningTime > 60 * 1000) {
    lastQuotaWarningTime = now;
    console.warn(
      `⚠️ [Firestore Free (Spark) Plan] Daily quota limit reached during "${operation}". ` +
      `Activating Graceful Fallback Circuit Breaker (In-Memory Fallback Tier). Error: ${err.message}`
    );
  }
}

/**
 * Wraps a promise with an automatic timeout to prevent hanging on slow/offline connections
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs = 3500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Firestore operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Invalidate in-memory cache for a collection or specific document
 */
export function invalidateFirestoreCache(collectionName?: string, docId?: string) {
  if (!collectionName) {
    collectionCache.clear();
    singleDocCache.clear();
    queryCache.clear();
    return;
  }
  for (const k of Array.from(collectionCache.keys())) {
    if (k === collectionName || k.startsWith(`${collectionName}#`)) collectionCache.delete(k);
  }
  for (const [k, q] of Array.from(queryCache.entries())) {
    if (q.collection === collectionName) queryCache.delete(k);
  }
  if (docId) {
    singleDocCache.delete(`${collectionName}/${docId}`);
  }
}

/**
 * Reads a full collection from Firestore with smart Free-Plan TTL caching
 */
const inflightReads = new Map<string, Promise<unknown[]>>();

/**
 * Reads a collection, sharing a single in-flight request between concurrent callers
 * (e.g. a dashboard firing several API calls that all need the same collection).
 */
export function getCollectionFromFirestore<T>(
  collectionName: string,
  options?: { forceRefresh?: boolean; limitCount?: number }
): Promise<T[]> {
  const key = `${collectionName}|${options?.limitCount ?? ""}`;
  if (options?.forceRefresh) return fetchCollection<T>(collectionName, options);
  const existing = inflightReads.get(key);
  if (existing) return existing as Promise<T[]>;
  const p = fetchCollection<T>(collectionName, options).finally(() => inflightReads.delete(key));
  inflightReads.set(key, p);
  return p;
}

async function fetchCollection<T>(
  collectionName: string,
  options?: { forceRefresh?: boolean; limitCount?: number }
): Promise<T[]> {
  totalReadsAttempted++;

  // 1. Check Circuit Breaker (If quota is exhausted, fail-fast to memory fallback tier)
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    // Return cached data if present, otherwise empty array to let memory store take over
    const cached = collectionCache.get(colKey(collectionName, options?.limitCount));
    if (cached) return cached.data as T[];
    return [];
  }

  // 2. Check In-Memory TTL Cache (Conserves reads against 50k daily limit)
  if (!options?.forceRefresh) {
    const cached = collectionCache.get(colKey(collectionName, options?.limitCount));
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      cacheHits++;
      return cached.data as T[];
    }
  }

  cacheMisses++;

  // 3. Try Firebase Admin SDK first (zero security-rules evaluation read overhead)
  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      let queryRef: any = adminDb.collection(collectionName);
      if (options?.limitCount) {
        queryRef = queryRef.limit(options.limitCount);
      }
      const snapshot = await queryRef.get();
      const docs = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as T));
      collectionCache.set(colKey(collectionName, options?.limitCount), { data: docs, cachedAt: Date.now() });
      return docs;
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) {
        handleQuotaExhausted(`adminDb.collection("${collectionName}")`, err);
      } else {
        console.warn(`Firestore Admin read failed for collection "${collectionName}":`, err.message);
      }
    }
  }

  // 4. Try Firebase Client SDK
  const clientDb = getFirebaseFirestore();
  if (!clientDb) return [];

  try {
    let q: any = collection(clientDb, collectionName);
    if (options?.limitCount) {
      q = query(q, firestoreLimit(options.limitCount));
    }
    const snapshot = await withTimeout(getDocs(q), 4000);
    const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) } as T));
    collectionCache.set(colKey(collectionName, options?.limitCount), { data: docs, cachedAt: Date.now() });
    return docs;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`clientDb.collection("${collectionName}")`, err);
    } else {
      console.warn(`Firestore Client read failed for collection "${collectionName}":`, err.message);
    }
    return [];
  }
}

/**
 * Server-side filtered read (single-field filters only, so no composite index is needed).
 * Cached per filter set, patched in place by writes, and shared between concurrent callers.
 */
export function queryCollectionFromFirestore<T>(
  collectionName: string,
  filters: QueryFilter[]
): Promise<T[]> {
  const key = `${collectionName}|${JSON.stringify(filters)}`;
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    cacheHits++;
    return Promise.resolve(cached.data as T[]);
  }
  // A fresh full-collection copy can answer the query with zero reads.
  const full = collectionCache.get(collectionName);
  if (full && Date.now() - full.cachedAt < CACHE_TTL_MS) {
    cacheHits++;
    return Promise.resolve(full.data.filter((d: any) => matchesFilters(d, filters)) as T[]);
  }
  const existing = inflightQueries.get(key);
  if (existing) return existing as Promise<T[]>;
  const p = runQuery<T>(collectionName, filters, key).finally(() => inflightQueries.delete(key));
  inflightQueries.set(key, p);
  return p;
}

async function runQuery<T>(collectionName: string, filters: QueryFilter[], key: string): Promise<T[]> {
  totalReadsAttempted++;
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    return (queryCache.get(key)?.data as T[]) || [];
  }
  cacheMisses++;
  const store = (docs: T[]) => {
    queryCache.set(key, { data: docs, cachedAt: Date.now(), collection: collectionName, filters });
    return docs;
  };

  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      let ref: any = adminDb.collection(collectionName);
      for (const f of filters) ref = ref.where(f.field, f.op, f.value);
      const snap = await ref.get();
      return store(snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as T)));
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) handleQuotaExhausted(`adminDb.query("${collectionName}")`, err);
      else console.warn(`Firestore Admin query failed for "${collectionName}":`, err.message);
    }
  }

  const clientDb = getFirebaseFirestore();
  if (!clientDb) return [];
  try {
    const q = query(collection(clientDb, collectionName), ...filters.map((f) => where(f.field, f.op, f.value)));
    const snap = await withTimeout(getDocs(q), 4000);
    return store(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as T)));
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) handleQuotaExhausted(`clientDb.query("${collectionName}")`, err);
    else console.warn(`Firestore Client query failed for "${collectionName}":`, err.message);
    return [];
  }
}

/**
 * Fetch a single document by ID (Optimized to cost 1 read instead of N reads)
 */
export async function getDocumentFromFirestore<T>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  const cacheKey = `${collectionName}/${docId}`;

  // 1. Check if the parent collection is already cached in memory (0 Firestore reads!)
  // Note: "sessions" collection must never use stale collection cache to ensure instant revocation/authentication
  if (collectionName !== "sessions") {
    const cachedCol = collectionCache.get(collectionName);
    if (cachedCol && Date.now() - cachedCol.cachedAt < CACHE_TTL_MS) {
      const list = cachedCol.data as any[];
      const match = list.find(
        (item) =>
          item.id === docId ||
          item.employeeId === docId ||
          item.runCode === docId ||
          item.assetTag === docId ||
          item.uid === docId
      );
      if (match) {
        cacheHits++;
        return match as T;
      }
    }
  }

  // 2. Check single document cache
  const cachedDoc = singleDocCache.get(cacheKey);
  if (cachedDoc && Date.now() - cachedDoc.cachedAt < CACHE_TTL_MS) {
    cacheHits++;
    return cachedDoc.data as T;
  }

  // 3. Check Circuit Breaker
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    return null;
  }

  cacheMisses++;

  // 4. Try Admin SDK
  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      const docSnap = await adminDb.collection(collectionName).doc(docId).get();
      if (!docSnap.exists) return null;
      const data = { id: docSnap.id, ...docSnap.data() } as T;
      singleDocCache.set(cacheKey, { data, cachedAt: Date.now() });
      return data;
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) {
        handleQuotaExhausted(`adminDb.doc("${cacheKey}")`, err);
      }
    }
  }

  // 5. Try Client SDK
  const clientDb = getFirebaseFirestore();
  if (!clientDb) return null;

  try {
    const docRef = doc(clientDb, collectionName, docId);
    const docSnap = await withTimeout(getDoc(docRef), 3000);
    if (!docSnap.exists()) return null;
    const data = { id: docSnap.id, ...(docSnap.data() as any) } as T;
    singleDocCache.set(cacheKey, { data, cachedAt: Date.now() });
    return data;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`clientDb.doc("${cacheKey}")`, err);
    } else {
      console.warn(`Firestore read failed for "${cacheKey}":`, err.message);
    }
    return null;
  }
}

/**
 * Saves or updates a document in Firestore, invalidating the TTL cache
 */
export async function saveDocumentToFirestore(
  collectionName: string,
  docId: string,
  data: any
): Promise<boolean> {
  totalWrites++;

  // If circuit breaker is tripped due to write quota, fail fast to Memory store
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }

  const cleanData = JSON.parse(JSON.stringify(data));

  // 1. Try Firebase Admin SDK
  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      await adminDb.collection(collectionName).doc(docId).set(cleanData, { merge: true });
      applyWriteToCaches(collectionName, docId, cleanData);
      return true;
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) {
        handleQuotaExhausted(`adminDb.save("${collectionName}/${docId}")`, err);
      } else {
        console.warn(`Firestore Admin write failed for "${collectionName}/${docId}":`, err.message);
      }
    }
  }

  // 2. Try Firebase Client SDK
  const clientDb = getFirebaseFirestore();
  if (!clientDb) {
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }

  try {
    const docRef = doc(clientDb, collectionName, docId);
    await withTimeout(setDoc(docRef, cleanData, { merge: true }), 3500);
    if (collectionName === "sessions") {
      singleDocCache.set(`${collectionName}/${docId}`, { data: cleanData, cachedAt: Date.now() });
    }
    applyWriteToCaches(collectionName, docId, cleanData);
    return true;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`clientDb.save("${collectionName}/${docId}")`, err);
    } else {
      console.warn(`Firestore Client write failed for "${collectionName}/${docId}":`, err.message);
    }
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }
}

/**
 * Query active sessions for a specific user ID directly from Firestore (Admin or Client SDK)
 */
export async function getUserSessionsFromFirestore(userId: string): Promise<UserSession[]> {
  // 1. Try Admin SDK
  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      const snapshot = await adminDb
        .collection("sessions")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();
      if (!snapshot.empty) {
        return snapshot.docs.map((d: any) => ({ sessionId: d.id, ...d.data() } as UserSession));
      }
      return [];
    } catch (err: any) {
      console.warn("Admin SDK getUserSessionsFromFirestore fallback:", err?.message);
    }
  }

  // 2. Try Client SDK
  const clientDb = getFirebaseFirestore();
  if (clientDb) {
    try {
      const q = query(
        collection(clientDb, "sessions"),
        where("userId", "==", userId),
        where("isActive", "==", true)
      );
      const snapshot = await withTimeout(getDocs(q), 3000);
      if (snapshot && !snapshot.empty) {
        return snapshot.docs.map((docSnap) => ({ sessionId: docSnap.id, ...(docSnap.data() as any) } as UserSession));
      }
      return [];
    } catch (err: any) {
      // In case composite indexing is needed, fallback to simple query by userId
      try {
        const qSimple = query(collection(clientDb, "sessions"), where("userId", "==", userId));
        const snapshot = await withTimeout(getDocs(qSimple), 3000);
        if (snapshot && !snapshot.empty) {
          return snapshot.docs
            .map((docSnap) => ({ sessionId: docSnap.id, ...(docSnap.data() as any) } as UserSession))
            .filter((s) => s.isActive);
        }
      } catch (innerErr: any) {
        console.warn("Client SDK getUserSessionsFromFirestore fallback:", innerErr?.message);
      }
    }
  }

  return [];
}

/**
 * Deletes a document from Firestore and purges it from cache
 */
export async function deleteDocumentFromFirestore(
  collectionName: string,
  docId: string
): Promise<boolean> {
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }

  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      await adminDb.collection(collectionName).doc(docId).delete();
      applyWriteToCaches(collectionName, docId, null);
      return true;
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) {
        handleQuotaExhausted(`adminDb.delete("${collectionName}/${docId}")`, err);
      }
    }
  }

  const clientDb = getFirebaseFirestore();
  if (!clientDb) {
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }

  try {
    const docRef = doc(clientDb, collectionName, docId);
    await deleteDoc(docRef);
    applyWriteToCaches(collectionName, docId, null);
    return true;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`clientDb.delete("${collectionName}/${docId}")`, err);
    }
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }
}

/**
 * Purges all documents in a collection from Firestore and clears cache
 */
export async function clearCollectionInFirestore(collectionName: string): Promise<number> {
  invalidateFirestoreCache(collectionName);
  let deletedCount = 0;

  // 1. Try Admin SDK
  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      const snapshot = await adminDb.collection(collectionName).get();
      if (!snapshot.empty) {
        // Firestore batches are limited to 500 operations — commit in chunks.
        for (let i = 0; i < snapshot.docs.length; i += 400) {
          const batch = adminDb.batch();
          snapshot.docs.slice(i, i + 400).forEach((d: any) => {
            batch.delete(d.ref);
            deletedCount++;
          });
          await batch.commit();
        }
      }
      invalidateFirestoreCache(collectionName);
      return deletedCount;
    } catch (err: any) {
      console.warn(`Admin clear collection "${collectionName}" error:`, err.message);
    }
  }

  // 2. Try Client SDK
  const clientDb = getFirebaseFirestore();
  if (clientDb) {
    try {
      const q = collection(clientDb, collectionName);
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        for (let i = 0; i < snapshot.docs.length; i += 400) {
          const batch = writeBatch(clientDb);
          snapshot.docs.slice(i, i + 400).forEach((docSnap) => {
            batch.delete(docSnap.ref);
            deletedCount++;
          });
          await batch.commit();
        }
      }
      invalidateFirestoreCache(collectionName);
      return deletedCount;
    } catch (err: any) {
      console.warn(`Client clear collection "${collectionName}" error:`, err.message);
    }
  }

  return deletedCount;
}

/**
 * High-performance atomic batch seeding for the Free (Spark) Plan.
 * Groups records into atomic batches (< 500 per batch) to respect write quotas
 * and minimize network round-trips.
 */
export async function seedAllToFirestore(): Promise<{
  success: boolean;
  counts: Record<string, number>;
  batchMode: boolean;
  error?: string;
}> {
  const counts: Record<string, number> = {
    employees: 0,
    attendance: 0,
    leaves: 0,
    payroll: 0,
    assets: 0,
    requests: 0,
    announcements: 0,
    holidays: 0,
    onboarding: 0,
    policy: 0,
    users: 0,
  };

  const adminDb = getFirebaseAdminFirestore();
  const clientDb = getFirebaseFirestore();

  if (!adminDb && !clientDb) {
    return {
      success: false,
      counts,
      batchMode: false,
      error: "Neither Firebase Admin SDK nor Client Firestore is initialized.",
    };
  }

  try {
    // Collect all documents to seed
    const itemsToSeed: Array<{ collection: string; docId: string; data: any }> = [];

    SEED_USER_ACCOUNTS.forEach((usr) => {
      itemsToSeed.push({ collection: "users", docId: usr.uid, data: usr });
      counts.users++;
    });

    INITIAL_EMPLOYEES.forEach((emp) => {
      itemsToSeed.push({ collection: "employees", docId: emp.employeeId, data: emp });
      counts.employees++;
    });

    INITIAL_ATTENDANCE.forEach((att) => {
      itemsToSeed.push({ collection: "attendance", docId: att.id, data: att });
      counts.attendance++;
    });

    INITIAL_LEAVES.forEach((lev) => {
      itemsToSeed.push({ collection: "leaves", docId: lev.id, data: lev });
      counts.leaves++;
    });

    INITIAL_PAYROLL_RUNS.forEach((pay) => {
      itemsToSeed.push({ collection: "payroll_runs", docId: pay.runCode, data: pay });
      counts.payroll++;
    });

    INITIAL_ASSETS.forEach((ast) => {
      itemsToSeed.push({ collection: "assets", docId: ast.assetTag, data: ast });
      counts.assets++;
    });

    INITIAL_REQUESTS.forEach((req) => {
      itemsToSeed.push({ collection: "requests", docId: req.id, data: req });
      counts.requests++;
    });

    INITIAL_ANNOUNCEMENTS.forEach((ann) => {
      itemsToSeed.push({ collection: "announcements", docId: ann.id, data: ann });
      counts.announcements++;
    });

    INITIAL_HOLIDAYS.forEach((hol) => {
      itemsToSeed.push({ collection: "holidays", docId: hol.id, data: hol });
      counts.holidays++;
    });

    INITIAL_ONBOARDING_RECORDS.forEach((onb) => {
      itemsToSeed.push({ collection: "onboarding", docId: onb.id, data: onb });
      counts.onboarding++;
    });

    itemsToSeed.push({
      collection: "settings",
      docId: "attendance_policy",
      data: INITIAL_POLICY,
    });
    counts.policy = 1;

    // Use Batch Writes (under 500 operations per batch)
    if (adminDb) {
      const batch = adminDb.batch();
      for (const item of itemsToSeed) {
        const ref = adminDb.collection(item.collection).doc(item.docId);
        batch.set(ref, JSON.parse(JSON.stringify(item.data)), { merge: true });
      }
      await batch.commit();
    } else if (clientDb) {
      const batch = writeBatch(clientDb);
      for (const item of itemsToSeed) {
        const ref = doc(clientDb, item.collection, item.docId);
        batch.set(ref, JSON.parse(JSON.stringify(item.data)), { merge: true });
      }
      await batch.commit();
    }

    // Invalidate all caches after complete seed
    invalidateFirestoreCache();

    return { success: true, counts, batchMode: true };
  } catch (err: any) {
    console.error("Firestore batch seed failed, falling back to sequential writes:", err.message);

    // Graceful sequential fallback if batch fails
    try {
      for (const usr of SEED_USER_ACCOUNTS) {
        await saveDocumentToFirestore("users", usr.uid, usr);
      }
      for (const emp of INITIAL_EMPLOYEES) {
        await saveDocumentToFirestore("employees", emp.employeeId, emp);
      }
      for (const att of INITIAL_ATTENDANCE) {
        await saveDocumentToFirestore("attendance", att.id, att);
      }
      for (const lev of INITIAL_LEAVES) {
        await saveDocumentToFirestore("leaves", lev.id, lev);
      }
      for (const pay of INITIAL_PAYROLL_RUNS) {
        await saveDocumentToFirestore("payroll_runs", pay.runCode, pay);
      }
      for (const ast of INITIAL_ASSETS) {
        await saveDocumentToFirestore("assets", ast.assetTag, ast);
      }
      for (const req of INITIAL_REQUESTS) {
        await saveDocumentToFirestore("requests", req.id, req);
      }
      for (const ann of INITIAL_ANNOUNCEMENTS) {
        await saveDocumentToFirestore("announcements", ann.id, ann);
      }
      for (const hol of INITIAL_HOLIDAYS) {
        await saveDocumentToFirestore("holidays", hol.id, hol);
      }
      for (const onb of INITIAL_ONBOARDING_RECORDS) {
        await saveDocumentToFirestore("onboarding", onb.id, onb);
      }
      await saveDocumentToFirestore("settings", "attendance_policy", INITIAL_POLICY);

      invalidateFirestoreCache();
      return { success: true, counts, batchMode: false };
    } catch (fallbackErr: any) {
      return { success: false, counts, batchMode: false, error: fallbackErr.message };
    }
  }
}

/**
 * Returns Firestore Free (Spark) Plan Quota Health, Cache Analytics & Circuit Breaker Status
 */
export function getFirestoreFreePlanMetrics() {
  const isCircuitBreakerTripped = Boolean(quotaExhaustedUntil && Date.now() < quotaExhaustedUntil);

  return {
    plan: "Firebase Spark (Free Tier)",
    cost: "₹0 / Free forever",
    quotas: {
      dailyReadsLimit: 50000,
      dailyWritesLimit: 20000,
      dailyDeletesLimit: 20000,
      storageLimitGiB: 1,
      networkEgressLimitGiB: 10,
    },
    caching: {
      ttlSeconds: CACHE_TTL_MS / 1000,
      cacheHits,
      cacheMisses,
      estimatedReadsSaved: cacheHits * 10, // Approx average docs per collection read
      cachedCollectionsCount: collectionCache.size,
    },
    usageInSession: {
      totalReadsAttempted,
      totalWrites,
    },
    circuitBreaker: {
      isTripped: isCircuitBreakerTripped,
      status: isCircuitBreakerTripped ? "Quota Exhausted (Serving from Local Fallback Tier)" : "Healthy",
      cooldownExpiresAt: quotaExhaustedUntil ? new Date(quotaExhaustedUntil).toISOString() : null,
    },
    activeSdk: getFirebaseAdminFirestore()
      ? "Firebase Admin SDK (Bypasses rules, zero rule evaluation cost)"
      : getFirebaseFirestore()
      ? "Firebase Client SDK"
      : "Offline Fallback Tier",
  };
}
