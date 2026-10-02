/* Learner-made metrics: compiling formulas, scoring a model with a formula or a cost of mistakes, guessing direction,
 * names and the closest built-in metric. Pure helpers (plus a couple of store lookups at the bottom). */
import { useProject } from "../../lib/store";
import type { CustomMetric, ModelResult, Project, RunResult } from "../../lib/types";
import { catalogFor, infoOf, supportsCustom, whyMissing } from "./catalog";
import { FormulaError, evaluate, influences, parse, pretty, variables, type Node, type Scope } from "./expr";

export const CUSTOM_PREFIX = "custom:";
export const isCustomKey = (k: string | null | undefined): k is string => !!k && k.startsWith(CUSTOM_PREFIX);
export const customKey = (id: string) => CUSTOM_PREFIX + id;
export const customId = (k: string) => k.slice(CUSTOM_PREFIX.length);
export const newMetricId = () => Math.random().toString(36).slice(2, 9);

export const namesFor = (task: string | null | undefined) => catalogFor(task).map((m) => m.key);
export const labelOf = (task: string | null | undefined, key: string) => infoOf(task, key)?.label ?? key;

/* ------------------------------------------------------------------ compiling */

const cache = new Map<string, { node?: Node; error?: FormulaError }>();

/** Parses (and caches) a formula for a task. */
export function compile(formula: string, task: string | null | undefined): { node?: Node; error?: FormulaError } {
  const k = `${task}|${formula}`;
  let hit = cache.get(k);
  if (!hit) {
    try {
      hit = { node: parse(formula, namesFor(task)) };
    } catch (e) {
      hit = { error: e instanceof FormulaError ? e : new FormulaError(String(e), 0) };
    }
    if (cache.size > 300) cache.clear();
    cache.set(k, hit);
  }
  return hit;
}

/** Which task a cost-of-mistakes metric was made for. */
export const costTask = (cm: CustomMetric): "classification" | "regression" => (cm.costs?.matrix ? "classification" : "regression");

/** Can this custom metric score models of this task? */
export function appliesTo(cm: CustomMetric, task: string | null | undefined): boolean {
  if (!supportsCustom(task)) return false;
  if (cm.kind === "costs") return costTask(cm) === task;
  return !!cm.formula && !compile(cm.formula, task).error;
}

/* ------------------------------------------------------------------ scoring */

export interface MetricValue {
  value: number | null;
  /** why there's no value (shown as a tooltip on "—") */
  why?: string;
  /** a caveat about how it was measured */
  note?: string;
}

function lookupFor(model: ModelResult) {
  return (name: string, scope: Scope): number | null | undefined => {
    if (name === "fit_time") return model.fit_time_s;
    if (name === "n_params") return model.n_params ?? null;
    return model.metrics[scope]?.[name];
  };
}

/** Average cost per prediction from a confusion matrix (rows = true class, columns = predicted). */
export function confusionCost(matrix: number[][], costs: number[][]): { value: number; n: number } | null {
  let total = 0, n = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      const c = matrix[i][j];
      n += c;
      total += c * (costs[i]?.[j] ?? 0);
    }
  }
  return n ? { value: total / n, n } : null;
}

/** Average cost per prediction for regression: `under` per unit guessed too low, `over` per unit guessed too high. */
export function asymmetricCost(points: { t: number; p: number }[], under: number, over: number): number | null {
  if (!points.length) return null;
  let s = 0;
  for (const { t, p } of points) s += t > p ? under * (t - p) : over * (p - t);
  return s / points.length;
}

/** Scores one model with a custom metric. Unprefixed formula names read `scope` (test by default). */
export function evalCustom(cm: CustomMetric, model: ModelResult, task: string | null | undefined, scope: Scope = "test"): MetricValue {
  if (cm.kind === "costs") {
    if (scope === "train") return { value: null, why: "Costs of mistakes are measured on the test rows only." };
    if (costTask(cm) !== task) return { value: null, why: "This cost table was made for a different kind of problem." };
    if (task === "classification") {
      const conf = model.confusion;
      const C = cm.costs?.matrix ?? [];
      if (!conf?.matrix?.length) return { value: null, why: "There's no table of right and wrong answers for this model." };
      if (C.length !== conf.matrix.length) return { value: null, why: `This cost table is for ${C.length} classes, but this run has ${conf.matrix.length}. Edit the metric to match.` };
      const r = confusionCost(conf.matrix, C);
      return r ? { value: r.value, note: `average over ${r.n} test rows` } : { value: null, why: "No test rows to count." };
    }
    const pts = model.residuals?.points ?? [];
    const v = asymmetricCost(pts, cm.costs?.under ?? 1, cm.costs?.over ?? 1);
    if (v === null) return { value: null, why: "There are no test guesses recorded for this model." };
    const total = model.mistakes?.total;
    return { value: v, note: `estimated from ${pts.length} test rows${total && total > pts.length ? ` (a random sample of ${total})` : ""}` };
  }
  const { node, error } = compile(cm.formula ?? "", task);
  if (!node) return { value: null, why: error ? `The formula has a problem: ${error.message}` : "Empty formula." };
  const r = evaluate(node, lookupFor(model), scope);
  if (r.missing) return { value: null, why: whyMissing(r.missing.name, r.missing.scope, labelOf(task, r.missing.name)) };
  if (r.problem) return { value: null, why: r.problem };
  return { value: r.value };
}

/** Does the formula read anything that only exists on test rows (so a "train" column makes no sense)? */
export const hasTrainView = (cm: CustomMetric) => cm.kind === "formula";

/* ------------------------------------------------------------------ guesses */

/** "lower" when the formula mostly grows as models get worse (error metrics with a plus sign, scores with a minus). */
export function suggestDirection(node: Node, task: string | null | undefined): "lower" | "higher" {
  let lower = 0, higher = 0;
  for (const inf of influences(node)) {
    const info = infoOf(task, inf.name);
    if (!info) continue;
    // training-row scores and run costs are side information: they count half
    const w = (inf.scope === "train" || info.extra ? 0.5 : 1) * (inf.weight > 0 ? Math.min(1, 0.4 + inf.weight) : 0.4);
    const worseWhenUp = info.lower ? inf.sign > 0 : inf.sign < 0;
    if (worseWhenUp) lower += w;
    else higher += w;
  }
  return lower > higher ? "lower" : "higher";
}

/** A short name for a formula (its pretty form when it fits). */
export function suggestName(node: Node | undefined, task: string | null | undefined): string {
  if (!node) return "My score";
  const p = pretty(node, (n) => labelOf(task, n));
  return p.length <= 34 ? p : "My score";
}

/** One-line description of a custom metric. */
export function describeCustom(cm: CustomMetric, task: string | null | undefined, classes?: string[] | null): string {
  if (cm.kind === "formula") {
    const { node } = compile(cm.formula ?? "", task);
    return node ? pretty(node, (n) => labelOf(task, n)) : cm.formula ?? "";
  }
  if (costTask(cm) === "regression") {
    const u = cm.costs?.under ?? 1, o = cm.costs?.over ?? 1;
    return `Average cost of a miss: ${fmtCost(u)} per unit too low, ${fmtCost(o)} per unit too high`;
  }
  const M = cm.costs?.matrix ?? [];
  let worst = { v: 0, i: 0, j: 0 };
  M.forEach((row, i) => row.forEach((v, j) => { if (i !== j && v > worst.v) worst = { v, i, j }; }));
  const name = (i: number) => classes?.[i] ?? `class ${i + 1}`;
  return worst.v > 0
    ? `Average cost per prediction — priciest mistake: saying “${name(worst.j)}” when it's really “${name(worst.i)}” (${fmtCost(worst.v)})`
    : "Average cost per prediction";
}

export const fmtCost = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2))));

/** Display format for custom-metric values (no units: they're whatever the learner made them). */
export function fmtCustom(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  // big numbers read better as 1.06B than 1.06e+9
  if (a >= 1e15) return v.toExponential(2);
  if (a >= 1e12) return `${Number((v / 1e12).toPrecision(3))}T`;
  if (a >= 1e9) return `${Number((v / 1e9).toPrecision(3))}B`;
  if (a >= 1e6) return `${Number((v / 1e6).toPrecision(3))}M`;
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return Number(v.toFixed(3)).toString();
  if (a === 0) return "0";
  if (a < 0.001) return v.toExponential(1);
  return Number(v.toPrecision(3)).toString();
}

/* ------------------------------------------------------------------ closest built-in */

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length).fill(0);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation (0 when there are fewer than 3 pairs or no spread). */
export function spearman(a: number[], b: number[]): number {
  if (a.length < 3) return 0;
  const ra = ranks(a), rb = ranks(b);
  const ma = ra.reduce((s, v) => s + v, 0) / ra.length, mb = rb.reduce((s, v) => s + v, 0) / rb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Built-in metrics that rank models like another one (used when the exact metric isn't a candidate). */
const NEAREST: Record<string, string> = {
  mse: "rmse", max_error: "rmse", median_ae: "mae", mape: "mae", explained_variance: "r2",
  precision: "f1", recall: "f1", f1_weighted: "f1", mcc: "balanced_accuracy", log_loss: "roc_auc", avg_precision: "roc_auc",
};

/**
 * The built-in metric (among `candidates`) nearest to a custom one: metrics the formula is built from come first,
 * then the one whose ranking of this run's models agrees best with the custom score.
 */
export function closestBuiltin(cm: CustomMetric, task: string | null | undefined, candidates: string[], result?: RunResult | null): string {
  if (!candidates.length) return "";
  const weightOf: Record<string, number> = {};
  if (cm.kind === "formula") {
    const { node } = compile(cm.formula ?? "", task);
    if (node) {
      for (const inf of influences(node)) {
        if (inf.scope !== "test") continue;
        // a component that isn't a candidate counts for its nearest candidate (MSE → RMSE, recall → F1…)
        const name = candidates.includes(inf.name) ? inf.name : NEAREST[inf.name] ?? inf.name;
        weightOf[name] = (weightOf[name] ?? 0) + inf.weight;
      }
    }
  } else if (task === "regression") {
    weightOf.mae = 1;
  } else {
    weightOf.balanced_accuracy = 0.2;
  }
  const maxW = Math.max(0, ...Object.values(weightOf));
  const models = result ? Object.values(result.models).filter((m) => !m.baseline) : [];
  const own = models.map((m) => evalCustom(cm, m, task).value);
  const sign = cm.better === "lower" ? -1 : 1;
  let best = candidates[0], bestScore = -Infinity;
  for (const c of candidates) {
    const info = infoOf(task, c);
    const pairs: [number, number][] = [];
    models.forEach((m, i) => {
      const v = m.metrics.test?.[c];
      if (own[i] !== null && v !== undefined && v !== null) pairs.push([sign * own[i]!, (info?.lower ? -1 : 1) * v]);
    });
    const corr = spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    const score = corr + (weightOf[c] && maxW ? 0.6 + 0.4 * (weightOf[c] / maxW) : 0);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/** The test metrics a formula reads (for "built from" chips). */
export function componentsOf(cm: CustomMetric, task: string | null | undefined): string[] {
  if (cm.kind !== "formula") return [];
  const { node } = compile(cm.formula ?? "", task);
  return node ? variables(node).map((v) => v.name) : [];
}

/* ------------------------------------------------------------------ store lookups */

/** The project's custom metric behind a "custom:<id>" key. */
export function findCustom(key: string, project: Project | null = useProject.getState().project): CustomMetric | undefined {
  if (!isCustomKey(key)) return undefined;
  const id = customId(key);
  return project?.custom_metrics?.find((m) => m.id === id);
}

/** The project's custom metrics that can score this task. */
export function customsFor(project: Project | null | undefined, task: string | null | undefined): CustomMetric[] {
  return (project?.custom_metrics ?? []).filter((m) => appliesTo(m, task));
}
