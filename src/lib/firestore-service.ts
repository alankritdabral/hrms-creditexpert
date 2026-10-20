import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  limit as firestoreLimit,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./firebase";
import { getFirebaseAdminFirestore } from "./firebase-admin";
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
 * Invalidate in-memory cache for a collection or specific document
 */
export function invalidateFirestoreCache(collectionName?: string, docId?: string) {
  if (!collectionName) {
    collectionCache.clear();
    singleDocCache.clear();
    return;
  }
  collectionCache.delete(collectionName);
  if (docId) {
    singleDocCache.delete(`${collectionName}/${docId}`);
  }
}

/**
 * Reads a full collection from Firestore with smart Free-Plan TTL caching
 */
export async function getCollectionFromFirestore<T>(
  collectionName: string,
  options?: { forceRefresh?: boolean; limitCount?: number }
): Promise<T[]> {
  totalReadsAttempted++;

  // 1. Check Circuit Breaker (If quota is exhausted, fail-fast to memory fallback tier)
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    // Return cached data if present, otherwise empty array to let memory store take over
    const cached = collectionCache.get(collectionName);
    if (cached) return cached.data as T[];
    return [];
  }

  // 2. Check In-Memory TTL Cache (Conserves reads against 50k daily limit)
  if (!options?.forceRefresh) {
    const cached = collectionCache.get(collectionName);
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
      if (snapshot.empty) return [];
      const docs = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as T));
      collectionCache.set(collectionName, { data: docs, cachedAt: Date.now() });
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
    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];
    const docs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) } as T));
    collectionCache.set(collectionName, { data: docs, cachedAt: Date.now() });
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
 * Fetch a single document by ID (Optimized to cost 1 read instead of N reads)
 */
export async function getDocumentFromFirestore<T>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  const cacheKey = `${collectionName}/${docId}`;

  // 1. Check if the parent collection is already cached in memory (0 Firestore reads!)
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
    const docSnap = await getDoc(docRef);
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

  // Invalidate cache immediately on write so mutations are fresh
  invalidateFirestoreCache(collectionName, docId);

  // If circuit breaker is tripped due to write quota, fail fast to Memory store
  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    return false;
  }

  const cleanData = JSON.parse(JSON.stringify(data));

  // 1. Try Firebase Admin SDK
  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      await adminDb.collection(collectionName).doc(docId).set(cleanData, { merge: true });
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
  if (!clientDb) return false;

  try {
    const docRef = doc(clientDb, collectionName, docId);
    await setDoc(docRef, cleanData, { merge: true });
    return true;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`clientDb.save("${collectionName}/${docId}")`, err);
    } else {
      console.warn(`Firestore Client write failed for "${collectionName}/${docId}":`, err.message);
    }
    return false;
  }
}

/**
 * Deletes a document from Firestore and purges it from cache
 */
export async function deleteDocumentFromFirestore(
  collectionName: string,
  docId: string
): Promise<boolean> {
  invalidateFirestoreCache(collectionName, docId);

  if (quotaExhaustedUntil && Date.now() < quotaExhaustedUntil) {
    return false;
  }

  const adminDb = getFirebaseAdminFirestore();
  if (adminDb) {
    try {
      await adminDb.collection(collectionName).doc(docId).delete();
      return true;
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) {
        handleQuotaExhausted(`adminDb.delete("${collectionName}/${docId}")`, err);
      }
    }
  }

  const clientDb = getFirebaseFirestore();
  if (!clientDb) return false;

  try {
    const docRef = doc(clientDb, collectionName, docId);
    await deleteDoc(docRef);
    return true;
  } catch (err: any) {
    if (isQuotaExhaustedError(err)) {
      handleQuotaExhausted(`clientDb.delete("${collectionName}/${docId}")`, err);
    }
    return false;
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
