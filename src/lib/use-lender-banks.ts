"use client";

import { useCallback, useEffect, useState } from "react";
import { PRESET_LENDER_BANKS, bankKey, cleanBankName, mergeBankLists } from "./lender-banks";

/**
 * The lender banks to offer, loaded from the server (built-in list plus names saved before).
 * `save` remembers a typed name; `refresh` re-reads the list, e.g. after an Excel import that saved new names.
 */
export function useLenderBanks() {
  const [banks, setBanks] = useState<string[]>(PRESET_LENDER_BANKS);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/lender-banks");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setBanks(mergeBankLists(PRESET_LENDER_BANKS, json.data));
    } catch {
      /* keep the list we have */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isKnown = useCallback((name: string) => banks.some((b) => bankKey(b) === bankKey(name)), [banks]);

  const save = useCallback(
    async (name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> => {
      const clean = cleanBankName(name);
      if (!clean) return { ok: false, error: "Enter a bank name of up to 80 characters." };
      try {
        const res = await fetch("/api/lender-banks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clean }),
        });
        const json = await res.json();
        if (!json.success) return { ok: false, error: json.error || "Could not save the bank." };
        setBanks(mergeBankLists(PRESET_LENDER_BANKS, json.data));
        return { ok: true, name: clean };
      } catch {
        return { ok: false, error: "Could not save the bank." };
      }
    },
    []
  );

  return { banks, isKnown, save, refresh };
}
