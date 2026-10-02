import type { ChartPaletteId } from "../design/prefs";

/** Chart palettes the user can pick in Settings → Appearance (12 colours each; series and class colours). */
export const PALETTES: Record<ChartPaletteId, string[]> = {
  apple: ["#0A84FF", "#FF375F", "#30D158", "#FF9F0A", "#BF5AF2", "#64D2FF", "#FFD60A", "#5E5CE6", "#FF6482", "#66D4CF", "#AC8E68", "#32ADE6"],
  vivid: ["#E6194B", "#3CB44B", "#4363D8", "#F58231", "#911EB4", "#42D4F4", "#F032E6", "#BFEF45", "#469990", "#9A6324", "#800000", "#000075"],
  pastel: ["#7FB3F5", "#F59EB0", "#8FD9A8", "#F7C58A", "#C9A7F2", "#9EDCEB", "#F2DE85", "#A5A3F0", "#F5A6BC", "#9BDBD6", "#C9B293", "#8CC8EB"],
  colorblind: ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#000000", "#999999", "#882255", "#44AA99", "#117733"],
  mono: ["#1F3B73", "#3A5A9C", "#5A7BC0", "#7E9BD6", "#A3BAE6", "#2B4F5C", "#4E7787", "#79A0AE", "#3D3D3D", "#6B6B6B", "#999999", "#C2C2C2"],
};

/** Categorical palette used for classes and model series — the live one (changed in place by `setPalette`). */
export const PALETTE = [...PALETTES.apple];

/** Switch the live palette (callers re-render the page so non-reactive readers pick it up). */
export function setPalette(id: ChartPaletteId) {
  PALETTE.splice(0, PALETTE.length, ...(PALETTES[id] ?? PALETTES.apple));
}

export const colorAt = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

/** Stable colour for a class label given the ordered class list. */
export function classColor(label: string | number | null | undefined, classes?: (string | number)[] | null) {
  if (label === null || label === undefined) return "#8e8e93";
  if (classes) {
    const idx = classes.map(String).indexOf(String(label));
    if (idx >= 0) return colorAt(idx);
  }
  let h = 0;
  for (const ch of String(label)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colorAt(h);
}

/** Continuous blue→purple→pink ramp for regression values, t in [0, 1]. */
export function ramp(t: number) {
  const stops = [
    [10, 132, 255],
    [94, 92, 230],
    [191, 90, 242],
    [255, 55, 95],
  ];
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function withAlpha(hex: string, a: number) {
  if (hex.startsWith("rgb(")) return hex.replace("rgb(", "rgba(").replace(")", `, ${a})`);
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
