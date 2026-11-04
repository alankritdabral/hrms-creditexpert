export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Slices a list for one page when the request carries `?page=`; returns null otherwise so
 * callers that still need the whole list (dashboards, reports) keep working unchanged.
 */
export function paginateList<T>(
  items: T[],
  searchParams: URLSearchParams,
  matches?: (item: T, q: string) => boolean
): { data: T[]; meta: PageMeta } | null {
  const pageParam = searchParams.get("page");
  if (!pageParam) return null;

  const pageSize = Math.min(
    Math.max(parseInt(searchParams.get("pageSize") || "") || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const filtered = q && matches ? items.filter((i) => matches(i, q)) : items;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(parseInt(pageParam) || 1, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    data: filtered.slice(start, start + pageSize),
    meta: { page, pageSize, total: filtered.length, totalPages },
  };
}
