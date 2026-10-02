/* Theme-safe colours and Retina canvases for the labs. Canvas can't read CSS variables, so we resolve them to RGBA
 * once per template/theme/accent change (a MutationObserver on <html> attributes, which `applyPrefsToDocument` sets). */
import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../lib/store";

export type RGBA = [number, number, number, number];

export interface LabTheme {
  text: RGBA; text2: RGBA; text3: RGBA; accent: RGBA; hairline: RGBA; fill: RGBA; fill2: RGBA;
  success: RGBA; danger: RGBA; warning: RGBA;
  /** bumps whenever the theme changes — use as an effect dependency */
  version: number;
}

let probe: CanvasRenderingContext2D | null = null;
/** Resolve any CSS colour string (hex, rgb(), hsl(), color-mix()…) to RGBA via a 1×1 canvas. */
export function toRGBA(css: string, fallback: RGBA = [128, 128, 128, 1]): RGBA {
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe || !css) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = `rgba(${fallback[0]}, ${fallback[1]}, ${fallback[2]}, ${fallback[3]})`;
  probe.fillStyle = css.trim();
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}

export const rgba = (c: RGBA, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${+(c[3] * a).toFixed(3)})`;
export const mix = (a: RGBA, b: RGBA, t: number): RGBA => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];

let themeVersion = 0;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
let mq: MediaQueryList | null = null;
const bump = () => { themeVersion++; listeners.forEach((f) => f()); };

function subscribe(f: () => void) {
  listeners.add(f);
  if (!observer) {
    observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true }); // data-theme / data-template / style (accent)
    mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
  }
  return () => {
    listeners.delete(f);
    if (!listeners.size) {
      observer?.disconnect();
      observer = null;
      mq?.removeEventListener("change", bump);
      mq = null;
    }
  };
}

/** Resolved theme colours for canvas drawing; re-renders the caller when the template, theme or accent changes. */
export function useLabTheme(): LabTheme {
  const [v, setV] = useState(themeVersion);
  useEffect(() => subscribe(() => setV(themeVersion)), []);
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fb: RGBA) => toRGBA(cs.getPropertyValue(name), fb);
    return {
      text: get("--text", [29, 29, 31, 1]),
      text2: get("--text-2", [29, 29, 31, 0.68]),
      text3: get("--text-3", [29, 29, 31, 0.45]),
      accent: get("--accent", [10, 132, 255, 1]),
      hairline: get("--hairline", [60, 60, 67, 0.14]),
      fill: get("--fill", [120, 120, 128, 0.12]),
      fill2: get("--fill-2", [120, 120, 128, 0.2]),
      success: get("--success", [48, 209, 88, 1]),
      danger: get("--danger", [255, 69, 58, 1]),
      warning: get("--warning", [255, 159, 10, 1]),
      version: v,
    };
  }, [v]);
}

/** true when the user wants full motion (tweens, looping sketches); false = jump straight to the end state. */
export const useMotionFull = () => useUI((s) => s.prefs.motion) === "full";

/** Size a canvas for its CSS box at the device pixel ratio and return a context drawing in CSS pixels. */
export function prepCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
