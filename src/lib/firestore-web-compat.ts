import "server-only";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  collection as webCollection,
  deleteDoc,
  doc as webDoc,
  getDoc,
  getDocs,
  getFirestore,
  limit as webLimit,
  orderBy as webOrderBy,
  query as webQuery,
  runTransaction,
  setDoc,
  where as webWhere,
  writeBatch,
  type DocumentSnapshot,
  type Firestore as WebFirestore,
  type QueryConstraint,
  type Transaction as WebTransaction,
  type WhereFilterOp,
} from "firebase/firestore";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Admin-shaped facade over the Firebase web SDK.
 *
 * The data layer is written against the Admin SDK calls (collection/doc/where/orderBy/limit/get/
 * set/delete/batch/runTransaction). When no Admin service-account key is configured, this facade
 * serves the same calls from the project's NEXT_PUBLIC_FIREBASE_* web config instead, so the app
 * keeps working with the credentials it already has.
 *
 * Unlike the Admin SDK, the web SDK is subject to Firestore security rules. The rules must allow
 * the access (they do while firestore.rules is not deployed; the deny-all version needs Admin credentials).
 *
 * Two web-SDK differences, handled here:
 *  - Transactions cannot run queries, so a query inside a transaction runs outside it. The only
 *    caller is the one-off bootstrap read of the employee counter; the ID it picks is still
 *    checked and written through single-document transactional reads.
 *  - There is no transactional create(). It is written as set(); callers read the document
 *    in the same transaction first (allocateEmployeeId does), so the existence check still holds.
 */

type Data = Record<string, unknown>;
type SetOptions = { merge?: boolean };

class DocSnap {
  constructor(readonly ref: DocRef, private readonly raw: DocumentSnapshot) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this.raw.exists();
  }
  data(): Data | undefined {
    return this.raw.data() as Data | undefined;
  }
}

class QuerySnap {
  readonly docs: DocSnap[];
  constructor(docs: DocSnap[]) {
    this.docs = docs;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
}

class DocRef {
  constructor(private readonly db: WebFirestore, readonly path: string) {}
  get id(): string {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }
  raw() {
    return webDoc(this.db, this.path);
  }
  async get(): Promise<DocSnap> {
    return new DocSnap(this, await getDoc(this.raw()));
  }
  async set(data: Data, options?: SetOptions): Promise<void> {
    if (options?.merge) await setDoc(this.raw(), data, { merge: true });
    else await setDoc(this.raw(), data);
  }
  async delete(): Promise<void> {
    await deleteDoc(this.raw());
  }
}

class QueryRef {
  constructor(
    protected readonly db: WebFirestore,
    protected readonly path: string,
    protected readonly constraints: QueryConstraint[] = []
  ) {}
  where(field: string, op: WhereFilterOp, value: unknown): QueryRef {
    return new QueryRef(this.db, this.path, [...this.constraints, webWhere(field, op, value)]);
  }
  orderBy(field: string, direction: "asc" | "desc" = "asc"): QueryRef {
    return new QueryRef(this.db, this.path, [...this.constraints, webOrderBy(field, direction)]);
  }
  limit(count: number): QueryRef {
    return new QueryRef(this.db, this.path, [...this.constraints, webLimit(count)]);
  }
  async get(): Promise<QuerySnap> {
    const snap = await getDocs(webQuery(webCollection(this.db, this.path), ...this.constraints));
    return new QuerySnap(snap.docs.map((d) => new DocSnap(new DocRef(this.db, d.ref.path), d)));
  }
}

class CollectionRef extends QueryRef {
  doc(id: string): DocRef {
    return new DocRef(this.db, `${this.path}/${id}`);
  }
}

class TransactionCompat {
  constructor(private readonly tx: WebTransaction) {}
  async get(target: DocRef | QueryRef): Promise<DocSnap | QuerySnap> {
    if (target instanceof DocRef) return new DocSnap(target, await this.tx.get(target.raw()));
    return target.get(); // web transactions cannot run queries (see header note)
  }
  set(ref: DocRef, data: Data, options?: SetOptions): this {
    if (options?.merge) this.tx.set(ref.raw(), data, { merge: true });
    else this.tx.set(ref.raw(), data);
    return this;
  }
  create(ref: DocRef, data: Data): this {
    this.tx.set(ref.raw(), data);
    return this;
  }
  delete(ref: DocRef): this {
    this.tx.delete(ref.raw());
    return this;
  }
}

class BatchCompat {
  private readonly batch;
  constructor(db: WebFirestore) {
    this.batch = writeBatch(db);
  }
  set(ref: DocRef, data: Data, options?: SetOptions): this {
    if (options?.merge) this.batch.set(ref.raw(), data, { merge: true });
    else this.batch.set(ref.raw(), data);
    return this;
  }
  delete(ref: DocRef): this {
    this.batch.delete(ref.raw());
    return this;
  }
  commit(): Promise<void> {
    return this.batch.commit();
  }
}

class FirestoreCompat {
  constructor(private readonly db: WebFirestore) {}
  collection(name: string): CollectionRef {
    return new CollectionRef(this.db, name);
  }
  batch(): BatchCompat {
    return new BatchCompat(this.db);
  }
  runTransaction<T>(fn: (tx: TransactionCompat) => Promise<T>): Promise<T> {
    return runTransaction(this.db, (tx) => fn(new TransactionCompat(tx)));
  }
}

function webConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    projectId,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

let cached: Firestore | null = null;

/** Admin-shaped Firestore handle backed by the web SDK, or null when NEXT_PUBLIC_FIREBASE_* is not set. */
export function getWebCompatFirestore(): Firestore | null {
  if (cached) return cached;
  const config = webConfig();
  if (!config) return null;
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    cached = new FirestoreCompat(getFirestore(app)) as unknown as Firestore;
    return cached;
  } catch (err) {
    console.warn("Failed to initialise Firestore through the web SDK:", err);
    return null;
  }
}
