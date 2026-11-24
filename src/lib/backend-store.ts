import "server-only";

/**
 * Client for NodeBankend-Server's staff data API (`/internal/staff-data`), which stores the HRMS
 * data in RDS (it used to live in Firestore). RDS is private to the backend's network, so the
 * HRMS never connects to it directly.
 *
 * Environment:
 *   BACKEND_API_URL  Backend base URL including its prefix, e.g. https://api.example.com/api/v1
 *   BACKEND_API_KEY  Shared secret; must equal DASHBOARD_API_KEY in the backend's .env
 */

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "BackendApiError";
  }
}

export type StoreFilter = { field: string; op: "==" | ">=" | "<="; value: string | number | boolean };
export interface StoredDoc {
  id: string;
  data: Record<string, any>;
  version: number;
}
export interface BatchOp {
  op: "create" | "set" | "delete";
  collection: string;
  id: string;
  data?: Record<string, unknown>;
}
export interface Precondition {
  collection: string;
  id: string;
  /** The version that was read, or null when the document did not exist. */
  version: number | null;
}

export function isBackendConfigured(): boolean {
  return Boolean(process.env.BACKEND_API_URL && process.env.BACKEND_API_KEY);
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: { query?: Record<string, string | number | undefined>; body?: unknown } = {}
): Promise<T> {
  const baseUrl = (process.env.BACKEND_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.BACKEND_API_KEY || "";
  if (!baseUrl || !apiKey) {
    throw new BackendApiError(503, "Backend API is not configured: set BACKEND_API_URL and BACKEND_API_KEY.");
  }
  const url = new URL(`${baseUrl}/internal/staff-data${path}`);
  for (const [k, v] of Object.entries(options.query || {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "x-internal-api-key": apiKey, ...(options.body !== undefined ? { "content-type": "application/json" } : {}) },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new BackendApiError(0, `Could not reach the backend API: ${(err as Error).message}`);
  }
  // The backend wraps every answer as { success, data, error: { message } }.
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    throw new BackendApiError(res.status, payload?.error?.message || `Backend API answered HTTP ${res.status}`);
  }
  return payload.data as T;
}

const enc = encodeURIComponent;

export async function listDocs(
  collection: string,
  opts: { filters?: StoreFilter[]; orderBy?: { field: string; direction: "asc" | "desc" }; limit?: number } = {}
): Promise<StoredDoc[]> {
  const { docs } = await request<{ docs: StoredDoc[] }>("GET", `/${enc(collection)}`, {
    query: {
      filters: opts.filters?.length ? JSON.stringify(opts.filters) : undefined,
      orderField: opts.orderBy?.field,
      orderDir: opts.orderBy?.direction,
      limit: opts.limit,
    },
  });
  return docs;
}

export async function getDoc(collection: string, id: string): Promise<StoredDoc | null> {
  try {
    return await request<StoredDoc>("GET", `/${enc(collection)}/${enc(id)}`);
  } catch (e) {
    if (e instanceof BackendApiError && e.status === 404) return null;
    throw e;
  }
}

export function putDoc(collection: string, id: string, data: unknown): Promise<StoredDoc> {
  return request<StoredDoc>("PUT", `/${enc(collection)}/${enc(id)}`, { body: { data } });
}

export async function deleteDoc(collection: string, id: string): Promise<void> {
  await request("DELETE", `/${enc(collection)}/${enc(id)}`);
}

export async function clearCollection(collection: string): Promise<number> {
  return (await request<{ deleted: number }>("DELETE", `/${enc(collection)}`)).deleted;
}

export async function commitBatch(ops: BatchOp[], preconditions: Precondition[]): Promise<void> {
  await request("POST", "/batch", { body: { ops, preconditions } });
}

export function importDocs(collection: string, docs: { id: string; data: unknown }[], overwrite = false) {
  return request<{ written: number; skipped: number }>("POST", "/import", { body: { collection, docs, overwrite } });
}

export function countByCollection(): Promise<Record<string, number>> {
  return request("GET", "/counts");
}

/** Stores a file in S3 through the backend and returns its storage key. */
export function uploadFile(input: { folder: string; filename: string; contentType: string; data: Buffer }) {
  return request<{ key: string; bytes: number }>("POST", "/files", {
    body: { folder: input.folder, filename: input.filename, contentType: input.contentType, dataBase64: input.data.toString("base64") },
  });
}

/** A short-lived download link for a stored file. */
export async function fileUrl(key: string): Promise<string> {
  return (await request<{ url: string }>("GET", "/files/url", { query: { key } })).url;
}
