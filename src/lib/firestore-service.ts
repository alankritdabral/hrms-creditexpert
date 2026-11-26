import "server-only";
import {
  BackendApiError,
  clearCollection,
  commitBatch,
  deleteDoc,
  getDoc,
  isBackendConfigured,
  listDocs,
  putDoc,
  type BatchOp,
  type Precondition,
} from "./backend-store";
import { isLocalEnvironment } from "./env";
import { UserSession } from "./types";
import { matchesFilters, patchCachedList, docWithId, type CacheFilter } from "./cache-patch";

// ============================================================================
// DATA ACCESS LAYER (RDS, through the backend's /internal/staff-data API)
// ============================================================================
// The HRMS data used to live in Firestore; it now lives in the backend's RDS database. The file
// and its export names are unchanged (so the rest of the app is untouched), but every call goes
// to the backend: RDS is private to the backend's network. Documents keep their Firestore shape:
// a JSON object under collection + id.
//
// A short in-memory cache (60 s) sits in front, because a server render often reads the same
// collection several times; writes patch the cached copies in place.
// ============================================================================

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const collectionCache = new Map<string, CacheEntry<any>>();
const singleDocCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export type QueryFilter = CacheFilter;
interface QueryCacheEntry extends CacheEntry<any[]> { collection: string; filters: QueryFilter[] }
const queryCache = new Map<string, QueryCacheEntry>();
const inflightQueries = new Map<string, Promise<unknown[]>>();

export interface CollectionReadOptions {
  forceRefresh?: boolean;
  limitCount?: number;
  /** Server-side ordering (single field). */
  orderBy?: { field: string; direction: "asc" | "desc" };
}

const colKey = (name: string, limitCount?: number, orderBy?: CollectionReadOptions["orderBy"]) =>
  limitCount || orderBy
    ? `${name}#limit${limitCount ?? ""}${orderBy ? `#${orderBy.field}-${orderBy.direction}` : ""}`
    : name;

/** Collections whose reads must never come from a cache (instant revocation / resent codes). */
const NEVER_CACHED = new Set(["sessions", "otps"]);

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
  else if (!NEVER_CACHED.has(collectionName)) {
    const sd = singleDocCache.get(`${collectionName}/${docId}`);
    singleDocCache.set(`${collectionName}/${docId}`, { data: { ...(sd?.data || {}), ...data, id: docId }, cachedAt: Date.now() });
  }
}


/**
 * True when the server can reach the backend store. When false (local development without
 * BACKEND_API_*) callers fall back to the in-memory store.
 */
export function isFirestoreConfigured(): boolean {
  return isBackendConfigured();
}

/** In production a missing configuration is a hard error; in local development it is the memory fallback. */
function assertStoreReady(): boolean {
  if (isBackendConfigured()) return true;
  if (!isLocalEnvironment()) {
    throw new Error("Backend store is not configured: set BACKEND_API_URL and BACKEND_API_KEY.");
  }
  return false;
}

/** Invalidate in-memory cache for a collection or specific document */
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

async function fetchCollection<T>(collectionName: string, options?: CollectionReadOptions): Promise<T[]> {
  const key = colKey(collectionName, options?.limitCount, options?.orderBy);

  if (!options?.forceRefresh) {
    const cached = collectionCache.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.data as T[];
    }
  }

  if (!assertStoreReady()) return [];
  try {
    const rows = await listDocs(collectionName, { orderBy: options?.orderBy, limit: options?.limitCount });
    const docs = rows.map((d) => docWithId<T>(d.id, d.data));
    collectionCache.set(key, { data: docs, cachedAt: Date.now() });
    return docs;
  } catch (err: any) {
    console.warn(`Backend read failed for collection "${collectionName}":`, err.message);
    // Serve a stale copy rather than an empty list if the backend hiccups.
    const stale = collectionCache.get(key);
    if (stale) return stale.data as T[];
    throw err;
  }
}

/**
 * Server-side filtered read (single-field filters). Cached per filter set, patched in place by
 * writes, and shared between concurrent callers.
 */
export function queryCollectionFromFirestore<T>(
  collectionName: string,
  filters: QueryFilter[]
): Promise<T[]> {
  const key = `${collectionName}|${JSON.stringify(filters)}`;
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.data as T[]);
  }
  // A fresh full-collection copy can answer the query with no backend call.
  const full = collectionCache.get(collectionName);
  if (full && Date.now() - full.cachedAt < CACHE_TTL_MS) {
    return Promise.resolve(full.data.filter((d: any) => matchesFilters(d, filters)) as T[]);
  }
  const existing = inflightQueries.get(key);
  if (existing) return existing as Promise<T[]>;
  const p = runQuery<T>(collectionName, filters, key).finally(() => inflightQueries.delete(key));
  inflightQueries.set(key, p);
  return p;
}

async function runQuery<T>(collectionName: string, filters: QueryFilter[], key: string): Promise<T[]> {
  if (!assertStoreReady()) return [];
  try {
    const rows = await listDocs(collectionName, { filters });
    const docs = rows.map((d) => docWithId<T>(d.id, d.data));
    queryCache.set(key, { data: docs, cachedAt: Date.now(), collection: collectionName, filters });
    return docs;
  } catch (err: any) {
    console.warn(`Backend query failed for "${collectionName}":`, err.message);
    const stale = queryCache.get(key);
    if (stale) return stale.data as T[];
    throw err;
  }
}

/** Fetch a single document by ID. */
export async function getDocumentFromFirestore<T>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  const cacheKey = `${collectionName}/${docId}`;

  // 1. A fresh copy of the parent collection answers with no backend call (never for sessions / OTPs).
  if (!NEVER_CACHED.has(collectionName)) {
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
        return match as T;
      }
    }
  }

  // 2. Single document cache (one-time codes are never cached: a resent code must win immediately)
  const cachedDoc = collectionName === "otps" ? undefined : singleDocCache.get(cacheKey);
  if (cachedDoc && Date.now() - cachedDoc.cachedAt < CACHE_TTL_MS) {
    return cachedDoc.data as T;
  }
  if (!assertStoreReady()) return null;
  try {
    const row = await getDoc(collectionName, docId);
    if (!row) return null;
    const data = docWithId<T>(row.id, row.data);
    singleDocCache.set(cacheKey, { data, cachedAt: Date.now() });
    return data;
  } catch (err: any) {
    console.warn(`Backend read failed for "${cacheKey}":`, err.message);
    throw err;
  }
}

/** Firestore-style JSON clean-up: undefined values are dropped by the round trip. */
export function toFirestoreData<T>(data: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data));
}

/**
 * Saves or replaces a document, keeping the caches in step. Returns false when the write failed.
 * A full-document overwrite: a field a caller removed must really disappear.
 */
export async function saveDocumentToFirestore(
  collectionName: string,
  docId: string,
  data: any
): Promise<boolean> {
  const cleanData = toFirestoreData(data);
  try {
    if (!assertStoreReady()) {
      invalidateFirestoreCache(collectionName, docId);
      return false;
    }
    await putDoc(collectionName, docId, cleanData);
    applyWriteToCaches(collectionName, docId, cleanData);
    return true;
  } catch (err: any) {
    console.warn(`Backend write failed for "${collectionName}/${docId}":`, err.message);
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }
}

/** Uncached equality query (used for uniqueness and login checks that must see the latest data). */
export async function queryFreshFromFirestore<T>(
  collectionName: string,
  field: string,
  value: string | number | boolean
): Promise<T[]> {
  if (!assertStoreReady()) return [];
  const rows = await listDocs(collectionName, { filters: [{ field, op: "==", value }], limit: 5 });
  return rows.map((d) => docWithId<T>(d.id, d.data));
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

/** Active sessions for one user (read fresh, never cached). */
export async function getUserSessionsFromFirestore(userId: string): Promise<UserSession[]> {
  if (!assertStoreReady()) return [];
  try {
    const rows = await listDocs("sessions", {
      filters: [
        { field: "userId", op: "==", value: userId },
        { field: "isActive", op: "==", value: true },
      ],
    });
    return rows.map((d) => ({ sessionId: d.id, ...d.data }) as unknown as UserSession);
  } catch (err: any) {
    console.warn("getUserSessionsFromFirestore failed:", err?.message);
    return [];
  }
}

/** Deletes a document and purges it from cache. */
export async function deleteDocumentFromFirestore(
  collectionName: string,
  docId: string
): Promise<boolean> {
  try {
    if (!assertStoreReady()) {
      invalidateFirestoreCache(collectionName, docId);
      return false;
    }
    await deleteDoc(collectionName, docId);
    applyWriteToCaches(collectionName, docId, null);
    return true;
  } catch (err: any) {
    console.warn(`Backend delete failed for "${collectionName}/${docId}":`, err.message);
    invalidateFirestoreCache(collectionName, docId);
    return false;
  }
}

/** Purges all documents in a collection and clears the cache. */
export async function clearCollectionInFirestore(collectionName: string): Promise<number> {
  invalidateFirestoreCache(collectionName);
  if (!assertStoreReady()) return 0;
  try {
    const n = await clearCollection(collectionName);
    invalidateFirestoreCache(collectionName);
    return n;
  } catch (err: any) {
    console.warn(`Clear collection "${collectionName}" error:`, err.message);
    return 0;
  }
}

// ============================================================================
// TRANSACTIONS
// ============================================================================
// Same call shape the app used with Firestore (`tx.get(ref)`, `tx.set/create/delete`,
// `db.collection(x).doc(id)`), emulated with optimistic concurrency: each document read is
// remembered with its version, writes are queued, and the backend applies them only if none of
// the documents read has changed. On a conflict the callback simply runs again, as Firestore's
// own transactions do.

export class DocRef {
  constructor(
    readonly collection: string,
    readonly id: string
  ) {}
}
export class CollectionRef {
  constructor(readonly name: string) {}
  doc(id: string) {
    return new DocRef(this.name, id);
  }
}
export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, any> | undefined;
}
export interface QuerySnap {
  docs: DocSnap[];
}
export interface StoreDb {
  collection(name: string): CollectionRef;
}
export interface StoreTx {
  get(ref: DocRef): Promise<DocSnap>;
  get(ref: CollectionRef): Promise<QuerySnap>;
  set(ref: DocRef, data: Record<string, unknown>): void;
  create(ref: DocRef, data: Record<string, unknown>): void;
  delete(ref: DocRef): void;
}

const MAX_TX_ATTEMPTS = 8;

/**
 * Runs `fn` as a transaction (all reads before any write; the callback may run more than once on
 * contention, so it must be free of side effects). Caches for the touched collections are dropped
 * after the commit. Requires the backend store to be configured.
 */
export async function withTransaction<T>(
  fn: (tx: StoreTx, db: StoreDb) => Promise<T>,
  touchedCollections: string[]
): Promise<T> {
  if (!isBackendConfigured()) throw new Error("Backend store is not configured: transactions need BACKEND_API_*.");
  const db: StoreDb = { collection: (name) => new CollectionRef(name) };

  for (let attempt = 1; ; attempt++) {
    const reads = new Map<string, Precondition>();
    const ops: BatchOp[] = [];
    const tx: StoreTx = {
      async get(ref: DocRef | CollectionRef): Promise<any> {
        if (ref instanceof CollectionRef) {
          const rows = await listDocs(ref.name);
          return { docs: rows.map((r) => ({ id: r.id, exists: true, data: () => r.data })) } as QuerySnap;
        }
        const row = await getDoc(ref.collection, ref.id);
        reads.set(`${ref.collection}/${ref.id}`, { collection: ref.collection, id: ref.id, version: row ? row.version : null });
        return { id: ref.id, exists: Boolean(row), data: () => row?.data } as DocSnap;
      },
      set: (ref, data) => void ops.push({ op: "set", collection: ref.collection, id: ref.id, data }),
      create: (ref, data) => void ops.push({ op: "create", collection: ref.collection, id: ref.id, data }),
      delete: (ref) => void ops.push({ op: "delete", collection: ref.collection, id: ref.id }),
    };

    const result = await fn(tx, db);
    try {
      if (ops.length > 0) await commitBatch(ops, Array.from(reads.values()));
      for (const c of touchedCollections) invalidateFirestoreCache(c);
      return result;
    } catch (err) {
      if (err instanceof BackendApiError && err.status === 409 && attempt < MAX_TX_ATTEMPTS) continue;
      throw err;
    }
  }
}
