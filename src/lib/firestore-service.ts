import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "./firebase-admin";
import { getWebCompatFirestore } from "./firestore-web-compat";
import { isLocalEnvironment } from "./env";
import { UserSession } from "./types";
import { matchesFilters, patchCachedList, docWithId, type CacheFilter } from "./cache-patch";
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
export type QueryFilter = CacheFilter;
interface QueryCacheEntry extends CacheEntry<any[]> { collection: string; filters: QueryFilter[] }
const queryCache = new Map<string, QueryCacheEntry>();
const inflightQueries = new Map<string, Promise<unknown[]>>();

/** Cache key for a collection read; limited reads must never be mistaken for the full collection. */
export interface CollectionReadOptions {
  forceRefresh?: boolean;
  limitCount?: number;
  /** Server-side ordering (single field, so no composite index is needed). */
  orderBy?: { field: string; direction: "asc" | "desc" };
}

const colKey = (name: string, limitCount?: number, orderBy?: CollectionReadOptions["orderBy"]) =>
  limitCount || orderBy
    ? `${name}#limit${limitCount ?? ""}${orderBy ? `#${orderBy.field}-${orderBy.direction}` : ""}`
    : name;

/**
 * Write-through: after a successful write, patch every cached copy in place
 * instead of discarding it, so a single clock-in/edit doesn't force a full re-read.
 */
function applyWriteToCaches(collectionName: string, docId: string, data: any | null) {
  // Limited (top-N) caches can't be patched correctly — drop them.
  for (const k of Array.from(collectionCache.keys())) {
    if (k.startsWith(`${collectionName}#`)) collectionCache.delete(k);
  }
  const col = collectionCache.get(collectionName);
  if (col) col.data = patchCachedList(col.data, docId, data);
  for (const q of queryCache.values()) {
    if (q.collection === collectionName) q.data = patchCachedList(q.data, docId, data, q.filters);
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
 * The Firestore handle: the Admin SDK when a service-account key is configured (bypasses rules),
 * otherwise the web SDK through the NEXT_PUBLIC_FIREBASE_* config (subject to firestore.rules).
 */
function resolveDb(): Firestore | null {
  return getFirebaseAdminFirestore() ?? getWebCompatFirestore();
}

/**
 * True when the server can reach Firestore (Admin credentials or the web config).
 * When false (local development with neither) callers fall back to the in-memory store.
 */
export function isFirestoreConfigured(): boolean {
  return resolveDb() !== null;
}

/**
 * Returns the Firestore handle. In production a missing configuration is a hard error.
 * In local development it returns null so the in-memory fallback keeps working.
 */
function getAdminDb() {
  const db = resolveDb();
  if (!db && !isLocalEnvironment()) {
    throw new Error(
      "Firestore is not configured: set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID, or the FIREBASE_ADMIN_* credentials."
    );
  }
  return db;
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
  options?: CollectionReadOptions
): Promise<T[]> {
  const key = `${collectionName}|${options?.limitCount ?? ""}|${options?.orderBy ? `${options.orderBy.field}-${options.orderBy.direction}` : ""}`;
  if (options?.forceRefresh) return fetchCollection<T>(collectionName, options);
  const existing = inflightReads.get(key);
  if (existing) return existing as Promise<T[]>;
  const p = fetchCollection<T>(collectionName, options).finally(() => inflightReads.delete(key));
  inflightReads.set(key, p);
  return p;
}

async function fetchCollection<T>(
  collectionName: string,
  options?: CollectionReadOptions
): Promise<T[]> {
  totalReadsAttempted++;

  // 1. Check Circuit Breaker (If quota is exhausted, fail-fast to memory fallback tier)
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    // Return cached data if present, otherwise empty array to let memory store take over
    const cached = collectionCache.get(colKey(collectionName, options?.limitCount, options?.orderBy));
    if (cached) return cached.data as T[];
    return [];
  }

  // 2. Check In-Memory TTL Cache (Conserves reads against 50k daily limit)
  if (!options?.forceRefresh) {
    const cached = collectionCache.get(colKey(collectionName, options?.limitCount, options?.orderBy));
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      cacheHits++;
      return cached.data as T[];
    }
  }

  cacheMisses++;

  // 3. Read through the Admin SDK (the only server path to Firestore)
  const adminDb = getAdminDb();
  if (!adminDb) return [];
  try {
    let queryRef: any = adminDb.collection(collectionName);
    if (options?.orderBy) {
      queryRef = queryRef.orderBy(options.orderBy.field, options.orderBy.direction);
    }
    if (options?.limitCount) {
      queryRef = queryRef.limit(options.limitCount);
    }
    const snapshot = await queryRef.get();
    const docs = snapshot.docs.map((d: any) => docWithId<T>(d.id, d.data()));
    collectionCache.set(colKey(collectionName, options?.limitCount, options?.orderBy), { data: docs, cachedAt: Date.now() });
    return docs;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`adminDb.collection("${collectionName}")`, err);
    } else {
      console.warn(`Firestore Admin read failed for collection "${collectionName}":`, err.message);
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

  const adminDb = getAdminDb();
  if (!adminDb) return [];
  try {
    let ref: any = adminDb.collection(collectionName);
    for (const f of filters) ref = ref.where(f.field, f.op, f.value);
    const snap = await ref.get();
    return store(snap.docs.map((d: any) => docWithId<T>(d.id, d.data())));
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) handleQuotaExhausted(`adminDb.query("${collectionName}")`, err);
    else console.warn(`Firestore Admin query failed for "${collectionName}":`, err.message);
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
  if (collectionName !== "sessions" && collectionName !== "otps") {
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

  // 2. Check single document cache (one-time codes are never cached: a resent code must win immediately)
  const cachedDoc = collectionName === "otps" ? undefined : singleDocCache.get(cacheKey);
  if (cachedDoc && Date.now() - cachedDoc.cachedAt < CACHE_TTL_MS) {
    cacheHits++;
    return cachedDoc.data as T;
  }

  // 3. Check Circuit Breaker
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    return null;
  }

  cacheMisses++;

  // 4. Read through the Admin SDK
  const adminDb = getAdminDb();
  if (!adminDb) return null;
  try {
    const docSnap = await adminDb.collection(collectionName).doc(docId).get();
    if (!docSnap.exists) return null;
    const data = docWithId<T>(docSnap.id, docSnap.data());
    singleDocCache.set(cacheKey, { data, cachedAt: Date.now() });
    return data;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`adminDb.doc("${cacheKey}")`, err);
    } else {
      console.warn(`Firestore Admin read failed for "${cacheKey}":`, err.message);
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

  // Write through the Admin SDK. A full-document overwrite (no merge): a field a caller removed must really disappear.
  let adminDb;
  try {
    adminDb = getAdminDb();
  } catch (err: any) {
    console.error(err.message);
    return false;
  }
  if (!adminDb) {
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }

  try {
    await adminDb.collection(collectionName).doc(docId).set(cleanData);
    applyWriteToCaches(collectionName, docId, cleanData);
    return true;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`adminDb.save("${collectionName}/${docId}")`, err);
    } else {
      console.warn(`Firestore Admin write failed for "${collectionName}/${docId}":`, err.message);
    }
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }
}

/** Firestore rejects undefined values; JSON round-tripping drops them. */
export function toFirestoreData<T>(data: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data));
}

/**
 * Runs an Admin SDK transaction (all reads before any write; the callback may run more than once on
 * contention, so it must be free of side effects). Caches for the touched collections are dropped
 * after the commit. Requires Firestore to be configured.
 */
export async function withTransaction<T>(
  fn: (tx: Transaction, db: Firestore) => Promise<T>,
  touchedCollections: string[]
): Promise<T> {
  const db = getAdminDb();
  if (!db) throw new Error("Firestore is not configured: transactions need the Admin SDK.");
  const result = await db.runTransaction((tx) => fn(tx, db));
  for (const c of touchedCollections) invalidateFirestoreCache(c);
  return result;
}

/** Uncached equality query (used for uniqueness and login checks that must see the latest data). */
export async function queryFreshFromFirestore<T>(
  collectionName: string,
  field: string,
  value: string | number | boolean
): Promise<T[]> {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db.collection(collectionName).where(field, "==", value).limit(5).get();
  return snap.docs.map((d) => docWithId<T>(d.id, d.data()));
}

/**
 * Like saveDocumentToFirestore, but a failed write throws instead of returning false, so the API
 * route reports an error instead of telling the user their change was saved.
 */
export async function saveOrThrow(collectionName: string, docId: string, data: any): Promise<void> {
  const ok = await saveDocumentToFirestore(collectionName, docId, data);
  if (!ok) {
    throw new Error(`Could not save ${collectionName}/${docId}. Please try again.`);
  }
}

/** Delete counterpart of saveOrThrow. */
export async function deleteOrThrow(collectionName: string, docId: string): Promise<void> {
  const ok = await deleteDocumentFromFirestore(collectionName, docId);
  if (!ok) {
    throw new Error(`Could not delete ${collectionName}/${docId}. Please try again.`);
  }
}

/**
 * Query active sessions for a specific user ID directly from Firestore (Admin SDK)
 */
export async function getUserSessionsFromFirestore(userId: string): Promise<UserSession[]> {
  const adminDb = getAdminDb();
  if (!adminDb) return [];
  try {
    const snapshot = await adminDb
      .collection("sessions")
      .where("userId", "==", userId)
      .where("isActive", "==", true)
      .get();
    return snapshot.docs.map((d: any) => ({ sessionId: d.id, ...d.data() } as UserSession));
  } catch (err: any) {
    console.warn("Admin SDK getUserSessionsFromFirestore failed:", err?.message);
    return [];
  }
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

  const adminDb = getAdminDb();
  if (!adminDb) {
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }
  try {
    await adminDb.collection(collectionName).doc(docId).delete();
    applyWriteToCaches(collectionName, docId, null);
    return true;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`adminDb.delete("${collectionName}/${docId}")`, err);
    } else {
      console.warn(`Firestore Admin delete failed for "${collectionName}/${docId}":`, err.message);
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

  const adminDb = getAdminDb();
  if (!adminDb) return deletedCount;
  try {
    const snapshot = await adminDb.collection(collectionName).get();
    if (!snapshot.empty) {
      // Keep each batch well under Firestore's per-batch write limit.
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
    return deletedCount;
  }
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

  const adminDb = resolveDb();

  if (!adminDb) {
    return {
      success: false,
      counts,
      batchMode: false,
      error: "Firestore is not configured (set NEXT_PUBLIC_FIREBASE_* or FIREBASE_ADMIN_* credentials).",
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
    const batch = adminDb.batch();
    for (const item of itemsToSeed) {
      const ref = adminDb.collection(item.collection).doc(item.docId);
      batch.set(ref, JSON.parse(JSON.stringify(item.data)), { merge: true });
    }
    await batch.commit();

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
      : getWebCompatFirestore()
        ? "Firebase web SDK (NEXT_PUBLIC_FIREBASE_* config, subject to firestore.rules)"
        : "Offline Fallback Tier (in-memory, local development only)",
  };
}
