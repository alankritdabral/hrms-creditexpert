"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

interface Props {
  label: string;
  anyLabel: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}

/** A filter dropdown where several options can be ticked at once. Empty selection means "all". */
export function MultiSelect({ label, anyLabel, options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (opt: string) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  const active = value.length > 0;
  const summary = !active ? anyLabel : value.length <= 2 ? value.join(", ") : `${value.length} selected`;

  return (
    <div ref={ref} className="relative flex flex-col gap-1 min-w-[9rem] flex-1 sm:flex-none">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between gap-2 w-full py-1.5 px-2.5 text-xs rounded-xl border text-left cursor-pointer focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
          active ? "border-blue-300 bg-blue-50/60 text-blue-900 font-semibold" : "border-slate-200 bg-slate-50/50 text-slate-700"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 top-full mt-1 z-30 w-56 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg p-1.5">
          {options.map((opt) => {
            const checked = value.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(opt)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-slate-800 hover:bg-slate-50 cursor-pointer text-left"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"}`}>
                  {checked && <Check className="w-3 h-3" />}
                </span>
                <span className="truncate">{opt}</span>
              </button>
            );
          })}
          {active && (
            <button type="button" onClick={() => onChange([])} className="w-full mt-1 pt-1.5 border-t border-slate-100 text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer">
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
