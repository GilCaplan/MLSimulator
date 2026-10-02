/** Categorical palette (Apple system colours) used for classes and model series. */
export const PALETTE = [
  "#0A84FF", "#FF375F", "#30D158", "#FF9F0A", "#BF5AF2", "#64D2FF", "#FFD60A", "#5E5CE6", "#FF6482", "#66D4CF",
  "#AC8E68", "#32ADE6",
];

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
