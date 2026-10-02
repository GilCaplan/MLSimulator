import { useEffect, useId, useRef } from "react";
import type { RunResult, TryResult } from "../../../lib/types";

/* Small helpers shared by the "Try it" panel (random test examples and your own inputs). */

/** Can this run be tried by hand before saving? (mirrors SUPPORTED in mlp/api/trymodel.py; the backend has the final say) */
export function tryable(result: Pick<RunResult, "task">, modality: string | null | undefined): boolean {
  const m = modality ?? "tabular";
  if (result.task === "classification") return m === "tabular" || m === "image" || m === "text";
  if (result.task === "regression") return m === "tabular" || m === "image";
  return false;
}

/** What one input is called, by modality. */
export const nounFor = (modality: string | null | undefined, plural = false) =>
  modality === "image" ? (plural ? "pictures" : "picture") : modality === "text" ? (plural ? "messages" : "message") : plural ? "rows" : "row";

/** Naive English plural for a class name ("star" → "stars", "glass" → "glass examples"). */
export function pluralClass(label: string): string {
  if (/[sxz]$|ch$|sh$/i.test(label)) return `“${label}” examples`;
  if (/^[a-z]+$/i.test(label)) return `${label}s`;
  return `“${label}” examples`;
}

export const readFile = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error("Couldn't read that file."));
  r.readAsDataURL(f);
});

/** Probability rows for a classification answer, sorted from most to least likely. */
export function probRows(r: TryResult): { label: string; p: number }[] {
  const classes = (r.classes ?? []).map(String);
  if (!r.probabilities?.length || !classes.length) return [];
  return classes.map((label, i) => ({ label, p: r.probabilities![i] ?? 0 })).sort((a, b) => b.p - a.p);
}

/** Probability of the predicted class (null when the model gives no probabilities). */
export function confidence(r: TryResult): number | null {
  const classes = (r.classes ?? []).map(String);
  const i = classes.indexOf(String(r.prediction));
  return i >= 0 && r.probabilities ? r.probabilities[i] ?? null : null;
}

const typingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/* Only the most recently mounted Try panel answers keyboard shortcuts (e.g. the one inside the save dialog wins
 * over the one in the page behind it). */
const stack: string[] = [];

/** Single-key shortcut ("n") for the top-most Try panel, ignored while typing or with modifier keys. */
export function useKey(key: string, handler: () => void, enabled = true) {
  const id = useId();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || typingTarget(e.target)) return;
      if (e.key.toLowerCase() === key) { e.preventDefault(); ref.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [id, key, enabled]);
}

/** Format a regression value compactly but precisely enough to compare. */
export function fmtValue(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return Math.round(v).toLocaleString();
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toPrecision(3);
}
