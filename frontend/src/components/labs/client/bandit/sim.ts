/* Multi-armed bandit maths: the seeded casino, the four strategies, Beta sampling for Thompson and an
 * instant all-strategies simulation for the regret comparison. Pure functions — no React. */
import { argmaxRandom, rng, type Rand } from "../rand";

export const N_ARMS = 5;
export const RUN_PULLS = 500;
export const ARM_NAMES = ["A", "B", "C", "D", "E"];

export type Strategy = "egreedy" | "ucb" | "thompson" | "random";
export const STRATEGIES: Strategy[] = ["egreedy", "ucb", "thompson", "random"];
export const STRATEGY_LABEL: Record<Strategy, string> = { egreedy: "ε-greedy", ucb: "UCB", thompson: "Thompson", random: "Random" };

export interface Params { eps: number; c: number }
/** What a player has seen so far: pulls and wins per machine. */
export interface Counts { n: number[]; s: number[] }

/** Five machines with hidden payout chances: one clear-ish winner, one tempting runner-up, the rest meh. */
export function makeCasino(seed: number): number[] {
  const r = rng(seed * 7919 + 13);
  const best = 0.58 + 0.17 * r();
  const second = best - (0.07 + 0.08 * r());
  const rest = [0, 1, 2].map(() => 0.1 + (second - 0.18) * r());
  const ps = [best, second, ...rest].map((p) => Math.round(p * 100) / 100);
  for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
  return ps;
}

export const emptyCounts = (): Counts => ({ n: Array(N_ARMS).fill(0), s: Array(N_ARMS).fill(0) });

/** The player's current belief of each machine's payout (wins / pulls; 0 before the first pull). */
export const estimates = (c: Counts) => c.n.map((n, i) => (n ? c.s[i] / n : 0));

/* ---------------------------------------------------------------- Beta distribution */

/** Gamma(k, 1) sample (Marsaglia–Tsang), k > 0. */
function sampleGamma(k: number, r: Rand): number {
  if (k < 1) return sampleGamma(k + 1, r) * Math.pow(Math.max(1e-12, r()), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = Math.max(1e-12, r()), u2 = r();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(Math.max(1e-300, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, r: Rand) {
  const x = sampleGamma(a, r), y = sampleGamma(b, r);
  return x / (x + y);
}

/** log Γ(z) (Lanczos). */
function lgamma(z: number): number {
  const g = 7, coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function betaPdf(x: number, a: number, b: number) {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + lgamma(a + b) - lgamma(a) - lgamma(b));
}

/* ---------------------------------------------------------------- strategies */

/** Pick the next machine. `t` = pulls made so far. */
export function choose(strategy: Strategy, c: Counts, p: Params, r: Rand): number {
  const t = c.n.reduce((a, b) => a + b, 0);
  switch (strategy) {
    case "random":
      return Math.floor(r() * N_ARMS);
    case "egreedy":
      if (r() < p.eps) return Math.floor(r() * N_ARMS);
      return argmaxRandom(estimates(c), r);
    case "ucb": {
      const untried = c.n.findIndex((n) => n === 0);
      if (untried >= 0) return untried;
      const lt = Math.log(Math.max(1, t));
      return argmaxRandom(c.n.map((n, i) => c.s[i] / n + p.c * Math.sqrt(lt / n)), r);
    }
    case "thompson":
      return argmaxRandom(c.n.map((n, i) => sampleBeta(1 + c.s[i], 1 + n - c.s[i], r)), r);
  }
}

/* ---------------------------------------------------------------- instant comparison */

export interface SimResult {
  /** average cumulative regret after each pull (length = pulls) */
  regret: Record<Strategy, Float64Array>;
  /** share of pulls on the best machine, averaged over runs */
  optimal: Record<Strategy, number>;
}

/** Run every strategy `runs` times on the same casino. Runs share the same coin flips across strategies
 * (common random numbers), so differences come from the strategies, not luck. */
export function simulateAll(probs: number[], p: Params, seed: number, pulls = RUN_PULLS, runs = 40): SimResult {
  const pmax = Math.max(...probs), best = probs.indexOf(pmax);
  const regret = {} as Record<Strategy, Float64Array>, optimal = {} as Record<Strategy, number>;
  for (const st of STRATEGIES) {
    const acc = new Float64Array(pulls);
    let opt = 0;
    for (let run = 0; run < runs; run++) {
      const flips = rng(seed * 1009 + run * 31 + 7), choices = rng(seed * 2003 + run * 17 + STRATEGIES.indexOf(st) * 101 + 3);
      const c = emptyCounts();
      let reg = 0;
      for (let t = 0; t < pulls; t++) {
        const a = choose(st, c, p, choices);
        const win = flips() < probs[a];
        c.n[a]++;
        if (win) c.s[a]++;
        reg += pmax - probs[a];
        if (a === best) opt++;
        acc[t] += reg;
      }
    }
    for (let t = 0; t < pulls; t++) acc[t] /= runs;
    regret[st] = acc;
    optimal[st] = opt / (runs * pulls);
  }
  return { regret, optimal };
}
