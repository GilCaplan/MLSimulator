/** Readable text colour for a solid coloured fill (series / class colours from lib/colors.ts).
 * Same rule as the custom-accent contrast in design/prefs.ts: dark ink on light fills, white on dark ones.
 * Anything that isn't a hex / rgb() literal (e.g. a CSS variable) falls back to var(--on-accent). */
export function textOn(bg: string): string {
  let r: number, g: number, b: number;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg.trim());
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(bg.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    const n = parseInt(h, 16);
    [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else if (rgb) {
    [r, g, b] = [+rgb[1], +rgb[2], +rgb[3]];
  } else return "var(--on-accent)";
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62 ? "#1d1d1f" : "#fff";
}
