/* Theme-safe colour helpers for charts and the pages that use them.
 * - `textOn(colour)` picks dark or light text for a label sitting on a series/category-coloured fill (the fill is the
 *   background there, so the answer doesn't depend on the theme).
 * - `tint(colour, pct)` is a translucent wash of any colour (hex, rgb() or a CSS variable) for glows and soft fills. */

const DARK_TEXT = "#1d1d1f";
const LIGHT_TEXT = "#fff";

/** Parse #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() into [r, g, b]; null for anything else (e.g. var()). */
export function parseRGB(c: string): [number, number, number] | null {
  const s = c.trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((x) => x + x).join("");
    if (h.length < 6) return null;
    const n = parseInt(h.slice(0, 6), 16);
    return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(c: string): number {
  const rgb = parseRGB(c);
  if (!rgb) return 0.3;
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text colour on a solid fill of `bg`. Saturated mid-tones (Apple blue, red, green) keep white text;
 *  light fills (yellow, cyan, pastels) get near-black. */
export const textOn = (bg: string) => (luminance(bg) > 0.5 ? DARK_TEXT : LIGHT_TEXT);

/** Translucent wash of a colour, e.g. `tint(c, 14)` for a soft background or glow. */
export const tint = (c: string, pct = 14) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
