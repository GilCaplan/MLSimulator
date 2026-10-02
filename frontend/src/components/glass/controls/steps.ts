/* Step arithmetic for numeric controls: enumerable value lists, "nice" steps, coarsening and default formatting. */

const EPS = 1e-9;
/** Round away float noise (0.1 + 0.2 → 0.3). */
export const clean = (v: number) => +v.toPrecision(12);
/** Equal within a relative tolerance. */
export const near = (a: number, b: number) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Smallest 1 / 2 / 2.5 / 5 × 10^k that is ≥ raw (integer ranges skip 2.5 below 10). */
export function niceStep(raw: number, integer = false): number {
  if (!(raw > 0) || !isFinite(raw)) return integer ? 1 : 0.1;
  const k = Math.floor(Math.log10(raw));
  for (let e = k; e <= k + 1; e++) {
    for (const m of [1, 2, 2.5, 5]) {
      const s = clean(m * 10 ** e);
      if (integer && (s < 1 || !Number.isInteger(s))) continue;
      if (s >= raw - EPS * raw) return s;
    }
  }
  return clean(10 ** (k + 1));
}

const isPow2 = (v: number) => Number.isInteger(v) && v > 0 && (v & (v - 1)) === 0;

/** 1-2-5 series between min and max inclusive (or powers of two for power-of-two integer ends). */
export function logSeries(min: number, max: number, integer?: boolean): number[] {
  if (integer && isPow2(min) && isPow2(max)) {
    const out: number[] = [];
    for (let v = min; v <= max; v *= 2) out.push(v);
    return out;
  }
  const out: number[] = [min];
  for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)) + 1; e++) {
    for (const m of [1, 2, 5]) {
      let v = clean(m * 10 ** e);
      if (integer) v = Math.round(v);
      if (v > min && !near(v, min) && v < max && !near(v, max) && !near(v, out[out.length - 1])) out.push(v);
    }
  }
  if (!near(out[out.length - 1], max)) out.push(max);
  return out;
}

/** Ranges with more enumerable values than this are treated as continuous (only coarsened lists are built). */
const MAX_ENUM = 5000;

/** Every allowed value, or null when the range isn't enumerable (float without step, or a huge range). */
export function enumerateSteps(min: number, max: number, step?: number, integer?: boolean, log?: boolean): number[] | null {
  if (!(max > min)) return [min];
  if (log && min > 0) return logSeries(min, max, integer);
  if (step && step > 0) {
    const n = Math.round((max - min) / step) + 1;
    if (n > MAX_ENUM) return null;
    const out = Array.from({ length: n }, (_, i) => clean(Math.min(max, min + i * step)));
    if (!near(out[out.length - 1], max) && out[out.length - 1] < max) out.push(max);
    return out;
  }
  if (integer) {
    const lo = Math.ceil(min), hi = Math.floor(max);
    if (hi - lo + 1 > MAX_ENUM) return null;
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  return null;
}

/** The step a stepper / number box uses: the given step, else 1 for integers, else a nice twentieth of the range. */
export function defaultStep(min: number, max: number, step?: number, integer?: boolean): number {
  if (step && step > 0) return step;
  if (integer) return 1;
  return niceStep((max - min) / 20);
}

/** A grid of at most `cap` values: min, the multiples of a nice step inside the range, max. Returns the step used. */
export function coarsen(min: number, max: number, cap: number, integer?: boolean, base?: number): { values: number[]; step: number } {
  const span = max - min;
  let s = niceStep(Math.max(span / (cap - 2), base ?? 0), integer);
  if (base && base > 0) {
    // keep the grid on multiples of the original step when possible
    let t = s;
    for (let i = 0; i < 8; i++) {
      const r = t / base;
      if (Math.abs(r - Math.round(r)) < 1e-6) { s = t; break; }
      t = niceStep(t * 1.01, integer);
    }
  }
  for (let guard = 0; guard < 40; guard++) {
    const values = [min];
    const first = Math.ceil((min + EPS * Math.abs(min || 1)) / s);
    for (let k = first; k * s < max - EPS * Math.max(1, Math.abs(max)); k++) {
      const v = clean(k * s);
      if (!near(v, min)) values.push(v);
      if (values.length > cap) break;
    }
    values.push(max);
    if (values.length <= cap) return { values, step: s };
    s = niceStep(s * 1.01, integer);
  }
  return { values: [min, max], step: span };
}

/** The readout used when no `format` is given (today's slider behaviour). */
export function defaultFormat(v: number, integer?: boolean): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "–";
  if (integer) return String(Math.round(v));
  const s = Number(v).toPrecision(3);
  return s.includes("e") || !s.includes(".") ? s : s.replace(/\.?0+$/, "");
}
