/* Apply UI prefs to the document: data-* attributes (read by templates.css / backgrounds.css / modifiers.css) and a few
 * inline CSS variables computed in JS (accent colours, chart palette). The same helpers give scoped attributes for
 * previews (a <div data-template=…> renders with the same CSS). */
import { useEffect, useLayoutEffect } from "react";
import { PALETTES, setPalette } from "../lib/colors";
import { accentOf, hexToRgb, type UIPrefs } from "./prefs";

export type ResolvedTheme = "light" | "dark";

export const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
export const resolveTheme = (t: UIPrefs["theme"]): ResolvedTheme => (t === "dark" || (t === "auto" && systemDark()) ? "dark" : "light");

/** data-* attributes for these prefs. Omits shape/font when "auto" (= the template's own choice). */
export function prefAttrs(p: UIPrefs, theme: ResolvedTheme = resolveTheme(p.theme)): Record<string, string> {
  const a: Record<string, string> = {
    "data-theme": theme, "data-template": p.template, "data-background": p.background, "data-density": p.density,
    "data-motion": p.motion, "data-accent": p.accent, "data-palette": p.chartPalette,
  };
  if (p.shape !== "auto") a["data-shape"] = p.shape;
  if (p.font !== "auto") a["data-font"] = p.font;
  return a;
}

/** Inline CSS variables for these prefs (accent family + chart palette mirror). */
export function prefVars(p: UIPrefs): Record<string, string> {
  const ac = accentOf(p);
  const v: Record<string, string> = {
    "--accent": ac.c, "--accent-rgb": hexToRgb(ac.c).join(", "), "--accent-2": ac.c2, "--accent-light": ac.light,
    "--accent-contrast": ac.contrast,
  };
  (PALETTES[p.chartPalette] ?? PALETTES.apple).forEach((c, i) => { v[`--chart-${i + 1}`] = c; });
  return v;
}

const ATTRS = ["data-theme", "data-template", "data-background", "data-density", "data-motion", "data-accent", "data-palette", "data-shape", "data-font"];

export function applyPrefsToDocument(p: UIPrefs) {
  const el = document.documentElement;
  const attrs = prefAttrs(p);
  for (const k of ATTRS) {
    if (k in attrs) el.setAttribute(k, attrs[k]);
    else el.removeAttribute(k);
  }
  for (const [k, v] of Object.entries(prefVars(p))) el.style.setProperty(k, v);
  el.style.colorScheme = attrs["data-theme"];
  setPalette(p.chartPalette);
}

/** Keep the document in sync with the prefs (and with the OS theme when theme = auto). Call once, in AppShell. */
export function useApplyPrefs(prefs: UIPrefs) {
  useLayoutEffect(() => { applyPrefsToDocument(prefs); }, [prefs]);
  useEffect(() => {
    if (prefs.theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyPrefsToDocument(prefs);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [prefs]);
}
