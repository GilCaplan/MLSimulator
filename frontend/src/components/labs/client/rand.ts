/* Seeded randomness + small maths helpers shared by the client-side labs (pure functions, no React). */

/** Tiny seeded PRNG (mulberry32): same seed → same casino / maze run on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rand = () => number;

/** Standard normal sample (Box–Muller). */
export function gauss(r: Rand) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const mean = (xs: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return xs.length ? s / xs.length : 0;
};

/** Index of the largest value; ties broken at random so no arm/action is favoured by its position. */
export function argmaxRandom(vals: ArrayLike<number>, r: Rand) {
  let best = -Infinity, pick = 0, ties = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v > best + 1e-12) { best = v; pick = i; ties = 1; }
    else if (Math.abs(v - best) <= 1e-12) { ties++; if (r() * ties < 1) pick = i; }
  }
  return pick;
}

/** Trailing moving average (window w) — for smoothing noisy reward curves. */
export function smooth(xs: number[], w: number) {
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    if (i >= w) s -= xs[i - w];
    out.push(s / Math.min(i + 1, w));
  }
  return out;
}
