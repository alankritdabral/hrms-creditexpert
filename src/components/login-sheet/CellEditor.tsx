"use client";

import React, { useEffect, useRef } from "react";
import type { CellEditor as CellEditorKind } from "@/lib/login-sheet-edit";

export type CellMove = "down" | "up" | "right" | "left" | "none";

export interface Choice {
  value: string;
  label: string;
}

interface Props {
  editor: CellEditorKind;
  draft: string;
  onDraft: (value: string) => void;
  /** Enter / Tab: save and move (Shift reverses). */
  onCommit: (move: CellMove) => void;
  /** A value picked from a dropdown saves straight away. */
  onPick: (value: string) => void;
  onCancel: () => void;
  /** Focus left the cell: save what is there. */
  onBlur: () => void;
  choices?: Choice[];
  /** id of a <datalist> with suggestions (suggest editors). */
  listId?: string;
  error: string | null;
  /** Anchor the editor to the right edge of its cell, so it grows leftwards instead of off the page. */
  alignRight: boolean;
  ariaLabel: string;
}

const base =
  "h-full w-full rounded-none border-0 bg-white px-1.5 py-1 text-[11px] text-slate-900 shadow-lg ring-2 ring-blue-500 focus:outline-none";

/** The box that appears over a sheet cell while it is being edited. */
export function CellEditor({ editor, draft, onDraft, onCommit, onPick, onCancel, onBlur, choices = [], listId, error, alignRight, ariaLabel }: Props) {
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);

  // Focus on open; put the caret at the end of the text (like F2 in Excel) or open the dropdown.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (editor === "select") {
      try {
        (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
      } catch {
        /* the dropdown can still be opened by hand */
      }
    } else {
      const n = el.value.length;
      el.setSelectionRange?.(n, n);
    }
  }, [editor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys typed while editing belong to the editor, not to the grid underneath.
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit(e.shiftKey ? "up" : "down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      onCommit(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const shown = editor === "select" && !choices.some((c) => c.value === draft) ? [{ value: draft, label: draft || "—" }, ...choices] : choices;

  return (
    <div className={`absolute top-0 bottom-0 z-20 w-full min-w-[12rem] ${alignRight ? "right-0" : "left-0"}`}>
      {editor === "select" ? (
        <select
          ref={ref}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => onPick(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={`${base} cursor-pointer`}
        >
          {shown.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          ref={ref}
          type="text"
          value={draft}
          aria-label={ariaLabel}
          list={editor === "suggest" ? listId : undefined}
          inputMode={editor === "amount" ? "decimal" : undefined}
          placeholder={editor === "date" ? "dd-mm-yyyy" : editor === "time" ? "HH:mm" : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={base}
        />
      )}
      {error && (
        <div role="alert" className={`absolute top-full mt-1 w-56 rounded-md bg-rose-600 px-2 py-1 text-[10px] font-medium leading-snug text-white shadow-lg ${alignRight ? "right-0" : "left-0"}`}>
          {error}
        </div>
      )}
    </div>
  );
}
