/* Control-preference plumbing shared by the pref-aware primitives:
 * - ControlPrefsContext / ControlPrefsProvider: scoped overrides (Settings previews, the dev gallery) read in
 *   preference to the store.
 * - ResolvedReportContext / ReportResolved: lets a preview learn which renderer a control actually used, and why. */
import { createContext, createElement, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { ControlPrefs } from "../../../design/prefs";
import { useUI } from "../../../lib/store";

/** Scoped control prefs. `null` (default) = use the user's prefs from the store. Partial values merge over the store. */
export const ControlPrefsContext = createContext<Partial<ControlPrefs> | null>(null);

export function ControlPrefsProvider({ value, children }: { value: Partial<ControlPrefs> | null; children: ReactNode }) {
  return createElement(ControlPrefsContext.Provider, { value }, children);
}

/** The effective control prefs for this subtree. */
export function useControlPrefs(): ControlPrefs {
  const store = useUI((s) => s.prefs.controls);
  const scoped = useContext(ControlPrefsContext);
  return useMemo(() => (scoped ? { ...store, ...scoped } : store), [store, scoped]);
}

export interface ResolvedInfo {
  control: "numeric" | "choice" | "bool";
  /** the renderer actually drawn ("stacked" = vertical segmented) */
  renderer: string;
  /** the user's preference it was resolved from */
  pref: string;
  /** why it differs from the preference, or why the options were changed (null = drawn exactly as preferred) */
  reason: string | null;
}

export const ResolvedReportContext = createContext<((info: ResolvedInfo) => void) | null>(null);

/** Collect what the controls inside report (the last one to report wins). */
export function ReportResolved({ onReport, children }: { onReport: ((info: ResolvedInfo) => void) | null; children: ReactNode }) {
  return createElement(ResolvedReportContext.Provider, { value: onReport }, children);
}

/** Used by the primitives: report the resolved renderer whenever it changes. */
export function useReportResolved(info: ResolvedInfo) {
  const report = useContext(ResolvedReportContext);
  const ref = useRef(report);
  ref.current = report;
  useEffect(() => {
    ref.current?.(info);
  }, [info.control, info.renderer, info.pref, info.reason]);
}
