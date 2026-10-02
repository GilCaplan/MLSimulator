import type { FeatureSpec, SyntheticSpec, Task, TargetRule } from "../../../lib/types";
import { uid } from "../shared";

/** A feature card in the designer: the backend FeatureSpec plus a stable local id (for keys / weights). */
export type DesignFeature = FeatureSpec & { _id: string };

export type RuleKind = TargetRule["type"];

export interface DesignTarget {
  name: string;
  rule: RuleKind;
  weights: Record<string, number>; // keyed by feature _id
  noise: number;
  nonlinear: boolean;
  expr: string;
  on: string[]; // feature _ids forming clusters
  separation: number;
  n_classes: number;
  class_names: string[];
  class_probs: number[];
  scale: number;
  offset: number;
}

export interface DesignState {
  name: string;
  n_samples: number;
  seed: number;
  features: DesignFeature[];
  target: DesignTarget;
}

/* ---------------------------------------------------------------- distribution parameter controls */

export interface ParamMeta {
  label: string;
  kind: "slider" | "number";
  min?: number;
  max?: number;
  step?: number;
  log?: boolean;
  integer?: boolean;
  help?: string;
}

export const PARAM_META: Record<string, Record<string, ParamMeta>> = {
  normal: {
    mean: { label: "Average", kind: "number", help: "Where the bell curve is centred." },
    std: { label: "Spread (std)", kind: "slider", min: 0.01, max: 10000, log: true, help: "How wide the bell is: ~68% of values fall within one spread of the average." },
  },
  uniform: {
    low: { label: "From", kind: "number" },
    high: { label: "To", kind: "number" },
  },
  lognormal: {
    mean: { label: "Log-centre", kind: "slider", min: -3, max: 14, step: 0.1, help: "The typical value is about e^centre (e.g. 10.5 ≈ 36,000)." },
    sigma: { label: "Skew", kind: "slider", min: 0.05, max: 2, step: 0.01, help: "Bigger = longer tail of very large values." },
  },
  exponential: {
    scale: { label: "Average", kind: "slider", min: 0.01, max: 10000, log: true, help: "Mean waiting time." },
  },
  gamma: {
    shape: { label: "Shape", kind: "slider", min: 0.2, max: 30, log: true, help: "Small = very skewed; large = more bell-like." },
    scale: { label: "Scale", kind: "slider", min: 0.01, max: 1000, log: true },
  },
  beta: {
    a: { label: "a", kind: "slider", min: 0.1, max: 20, log: true, help: "Pulls values towards 1." },
    b: { label: "b", kind: "slider", min: 0.1, max: 20, log: true, help: "Pulls values towards 0." },
  },
  student_t: {
    df: { label: "Tail weight (df)", kind: "slider", min: 0.5, max: 50, log: true, help: "Small = frequent extreme values; large = almost normal." },
  },
  poisson: {
    lam: { label: "Average count", kind: "slider", min: 0.1, max: 100, log: true },
  },
  binomial: {
    n: { label: "Tries", kind: "slider", min: 1, max: 100, integer: true },
    p: { label: "Chance of success", kind: "slider", min: 0, max: 1, step: 0.01 },
  },
  int_uniform: {
    low: { label: "From", kind: "number" },
    high: { label: "To", kind: "number" },
  },
  bernoulli: {
    p: { label: "Chance of 1 (yes)", kind: "slider", min: 0, max: 1, step: 0.01 },
  },
};

export const DIST_EMOJI: Record<string, string> = {
  normal: "🔔", uniform: "▬", lognormal: "📈", exponential: "⏳", gamma: "⛰️", beta: "🎚️", student_t: "🦖",
  poisson: "🔢", binomial: "🪙", int_uniform: "🎲", bernoulli: "✅", categorical: "🏷️",
};

/* ---------------------------------------------------------------- defaults */

export function newFeature(name: string, dist = "normal", params?: Record<string, any>, extra?: Partial<FeatureSpec>): DesignFeature {
  return { _id: uid(), name, dist, params: params ?? { mean: 0, std: 1 }, missing_rate: 0, clip: null, round: null, ...extra };
}

export function defaultDesign(task: Task): DesignState {
  const features = [
    newFeature("age", "normal", { mean: 40, std: 12 }, { clip: [18, 90], round: 0 }),
    newFeature("income", "lognormal", { mean: 10.6, sigma: 0.45 }, { round: 0 }),
    newFeature("plan", "categorical", { categories: ["basic", "plus", "pro"], probs: [0.5, 0.3, 0.2] }),
  ];
  const [age, income, plan] = features.map((f) => f._id);
  return {
    name: task === "classification" ? "Customer churn (synthetic)" : "Customer spend (synthetic)",
    n_samples: 1000,
    seed: 42,
    features,
    target: {
      name: task === "classification" ? "churned" : "spend",
      rule: "linear",
      weights: task === "classification" ? { [age]: -1.2, [income]: -0.6, [plan]: 0.9 } : { [age]: 0.8, [income]: 1.5, [plan]: 0.7 },
      noise: 0.5,
      nonlinear: false,
      expr: "",
      on: [age, income],
      separation: 2,
      n_classes: 2,
      class_names: ["no", "yes"],
      class_probs: [0.7, 0.3],
      scale: task === "classification" ? 1 : 200,
      offset: task === "classification" ? 0 : 1000,
    },
  };
}

export function defaultParams(dist: string, catalog?: Record<string, { params: Record<string, any> }>) {
  const p = catalog?.[dist]?.params;
  return p ? structuredClone(p) : {};
}

/** Resize class arrays when the number of classes changes. */
export function resizeClasses(t: DesignTarget, k: number): DesignTarget {
  const names = Array.from({ length: k }, (_, i) => t.class_names[i] ?? (k === 2 ? ["no", "yes"][i] : ""));
  const probs = Array.from({ length: k }, (_, i) => t.class_probs[i] ?? 1 / k);
  return { ...t, n_classes: k, class_names: names, class_probs: probs };
}

/* ---------------------------------------------------------------- spec conversion */

export const stripId = ({ _id, ...f }: DesignFeature): FeatureSpec => {
  const out: FeatureSpec = { ...f };
  if (out.clip && out.clip[0] === null && out.clip[1] === null) out.clip = null;
  return out;
};

/** Class labels the backend will produce for the current design (names, or 0..k-1). */
export function classLabels(t: DesignTarget): string[] {
  const k = t.n_classes;
  const raw = t.class_names.slice(0, k).map((s) => s.trim());
  if (raw.every((s) => !s)) return Array.from({ length: k }, (_, i) => String(i));
  const filled = raw.map((s, i) => s || String(i));
  return new Set(filled).size === filled.length ? filled : Array.from({ length: k }, (_, i) => String(i));
}

export function normProbs(p: number[]) {
  const s = p.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  return p.map((v) => Math.max(0, v) / s);
}

type TargetOut = SyntheticSpec["target"] & { scale?: number; offset?: number };

export function toSpec(d: DesignState, task: Task): SyntheticSpec {
  const t = d.target;
  const byId = new Map(d.features.map((f) => [f._id, f.name.trim()]));
  let rule: TargetRule;
  if (t.rule === "linear") {
    const weights: Record<string, number> = {};
    for (const [id, w] of Object.entries(t.weights)) {
      const n = byId.get(id);
      if (n && w) weights[n] = w;
    }
    rule = { type: "linear", weights, noise: t.noise, nonlinear: t.nonlinear };
  } else if (t.rule === "expression") {
    rule = { type: "expression", expr: t.expr || "0" };
  } else if (t.rule === "clusters") {
    rule = { type: "clusters", on: t.on.map((id) => byId.get(id)).filter((n): n is string => !!n), separation: t.separation, class_probs: normProbs(t.class_probs) };
  } else {
    rule = { type: "random", ...(task === "classification" ? { class_probs: normProbs(t.class_probs) } : {}) };
  }
  const target: TargetOut = { name: t.name.trim() || "target", task, rule };
  if (task === "classification") {
    target.n_classes = t.n_classes;
    const labels = classLabels(t);
    if (labels.some((l, i) => l !== String(i))) target.class_names = labels;
    // Rank rows by the hidden score and cut at the chosen percentages — the balance sliders are then exact.
    target.classify = "quantile";
    target.class_probs = normProbs(t.class_probs);
  } else {
    target.scale = t.scale;
    target.offset = t.offset;
  }
  return { name: d.name.trim() || "Synthetic data", n_samples: d.n_samples, seed: d.seed, features: d.features.map(stripId), target };
}

export function fromSpec(spec: SyntheticSpec, task: Task): DesignState {
  const base = defaultDesign(task);
  const features = spec.features.map((f) => ({ ...f, _id: uid() }));
  const idOf = new Map(features.map((f) => [f.name, f._id]));
  const st = spec.target as TargetOut;
  const r = st.rule || { type: "linear" };
  const k = st.n_classes ?? 2;
  const weights: Record<string, number> = {};
  for (const [n, w] of Object.entries(r.weights || {})) { const id = idOf.get(n); if (id) weights[id] = w; }
  let target: DesignTarget = {
    ...base.target,
    name: st.name,
    rule: r.type,
    weights,
    noise: r.noise ?? base.target.noise,
    nonlinear: !!r.nonlinear,
    expr: r.expr ?? "",
    on: (r.on ?? features.filter((f) => f.dist !== "categorical").map((f) => f.name)).map((n) => idOf.get(n)).filter((x): x is string => !!x),
    separation: r.separation ?? 2,
    n_classes: k,
    class_names: st.class_names ?? Array.from({ length: k }, () => ""),
    class_probs: st.class_probs ?? r.class_probs ?? Array.from({ length: k }, () => 1 / k),
    scale: st.scale ?? 1,
    offset: st.offset ?? 0,
  };
  target = resizeClasses(target, k);
  return { name: spec.name ?? base.name, n_samples: spec.n_samples, seed: spec.seed ?? 42, features, target };
}

/** Build a sensible starting formula from the current features. */
export function suggestFormula(features: DesignFeature[]): string {
  const ok = (n: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n);
  const nums = features.filter((f) => f.dist !== "categorical" && ok(f.name));
  const cats = features.filter((f) => f.dist === "categorical" && ok(f.name));
  const parts: string[] = [];
  if (nums[0]) parts.push(`sin(${nums[0].name} / 10)`);
  if (nums[1]) parts.push(`log(${nums[1].name})`);
  if (cats[0]) {
    const c = (cats[0].params.categories as string[] | undefined)?.slice(-1)[0];
    if (c) parts.push(`2 * (${cats[0].name} == "${c}")`);
  }
  parts.push("noise(0.5)");
  return parts.join(" + ");
}
