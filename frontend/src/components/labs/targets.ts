/* Client-side copies of the GAN target shapes (mlp/core/labs.py::sample_target) — for the shape picker previews and
 * to draw the real shape while a run is live (the server sends its own sample with the result). */

export type Pt = [number, number];

export function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (sd = 1) => {
    const x = Math.max(1e-12, u());
    return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()) * sd;
  };
  return { u, normal };
}

export function sampleTarget(name: string, n: number, seed = 7): Pt[] {
  const r = rng(seed);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    switch (name) {
      case "moons": {
        const outer = i % 2 === 0;
        const t = r.u() * Math.PI;
        const x = outer ? Math.cos(t) : 1 - Math.cos(t);
        const y = outer ? Math.sin(t) : 1 - Math.sin(t) - 0.5;
        out.push([(x + r.normal(0.06) - 0.5) * 1.6, (y + r.normal(0.06) - 0.25) * 1.6]);
        break;
      }
      case "spiral": {
        const t = Math.sqrt(r.u()) * 3 * Math.PI;
        out.push([(t * Math.cos(t)) / 4.5 + r.normal(0.06), (t * Math.sin(t)) / 4.5 + r.normal(0.06)]);
        break;
      }
      case "circle": {
        const a = r.u() * 2 * Math.PI;
        out.push([1.8 * Math.cos(a) + r.normal(0.05), 1.8 * Math.sin(a) + r.normal(0.05)]);
        break;
      }
      case "grid9": {
        const gx = Math.floor(r.u() * 3) - 1, gy = Math.floor(r.u() * 3) - 1;
        out.push([gx * 1.6 + r.normal(0.1), gy * 1.6 + r.normal(0.1)]);
        break;
      }
      default: { // ring8
        const k = Math.floor(r.u() * 8);
        const a = (2 * Math.PI * k) / 8;
        out.push([2 * Math.cos(a) + r.normal(0.12), 2 * Math.sin(a) + r.normal(0.12)]);
      }
    }
  }
  return out;
}

/** Plot half-width the server uses for a target (max |coordinate| × 1.35). */
export function targetExtent(pts: Pt[]) {
  let m = 0;
  for (const [x, y] of pts) m = Math.max(m, Math.abs(x), Math.abs(y));
  return m * 1.35;
}

export const TARGET_ORDER = ["ring8", "moons", "spiral", "circle", "grid9"];
