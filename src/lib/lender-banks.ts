/**
 * Lender banks offered when entering logins. A built-in starter list plus names people have typed
 * (or imported from Excel) before. Pure helpers: no database or framework imports.
 */

export const PRESET_LENDER_BANKS = [
  "Axis Bank",
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India (SBI)",
  "Kotak Mahindra Bank",
  "Bajaj Finserv",
  "Tata Capital",
  "Piramal Finance",
  "IDFC First Bank",
  "IndusInd Bank",
  "Poonawalla Fincorp",
  "Other Bank / NBFC",
];

export const MAX_BANK_NAME_LENGTH = 80;
/** Upper bound on remembered names, so the list cannot be flooded. */
export const MAX_SAVED_BANKS = 500;

/** Trims, collapses spaces and strips control characters. Returns "" for an unusable name. */
export function cleanBankName(input: unknown): string {
  if (typeof input !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const s = input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s.length > MAX_BANK_NAME_LENGTH ? "" : s;
}

/** Case- and punctuation-insensitive identity, so "HDFC BANK" and "Hdfc Bank" are one bank. */
export function bankKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Merges lists, keeping the first spelling seen for each bank and the order given. */
export function mergeBankLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const name = cleanBankName(raw);
      const key = bankKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}
