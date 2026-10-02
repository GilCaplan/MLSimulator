import { create } from "zustand";
import { useMemo } from "react";
import { api } from "../../lib/api";
import { LOWER_IS_BETTER, METRIC_HELP, METRIC_LABELS, fmt, pct } from "../../lib/format";
import { isUnsupervised, toast, useJob, useProject } from "../../lib/store";
import type { ModelConfig, ModelResult, NNArch, RunResult, Suggestion, Task, UnsupervisedTask } from "../../lib/types";
import { appliesTo, customsFor, describeCustom, evalCustom, findCustom, fmtCustom, isCustomKey } from "../metrics/custom";

/* ------------------------------------------------------------------ metrics */

export const CLS_METRICS = ["accuracy", "balanced_accuracy", "f1", "roc_auc", "precision", "recall", "f1_weighted", "mcc", "log_loss", "avg_precision"];
export const REG_METRICS = ["r2", "rmse", "mae", "mse", "median_ae", "max_error", "mape", "explained_variance"];

/** Labels / help for metrics the shared tables don't cover yet. */
const EXTRA_LABELS: Record<string, string> = { mse: "MSE", median_ae: "Median miss", max_error: "Worst miss", fit_time: "Fit time", n_params: "Parameters" };
const EXTRA_HELP: Record<string, string> = {
  mse: "Average squared miss — RMSE before the square root. Huge misses dominate it (lower is better).",
  median_ae: "The typical miss: half the guesses are closer than this, half further away. A few wild rows can't move it (lower is better).",
  max_error: "The single biggest miss on the test rows — for when one disaster matters more than the average (lower is better).",
  explained_variance: "Like R², but ignores a constant offset in the guesses (1 = perfect).",
  f1_weighted: "F1 where common classes count more than rare ones.",
  avg_precision: "How clean the most confident “yes” answers are (yes/no problems).",
};
const EXTRA_LOWER = new Set(["mse", "median_ae", "max_error", "fit_time", "n_params"]);

/** Ranking metric per task (mirrors mlp/core/problems.py primary_metric). */
export const primaryMetric = (task: string | null | undefined) =>
  task === "regression" ? "r2" : task === "forecasting" ? "mae" : task === "recommendation" ? "ndcg_at_10" : task === "clustering" ? "silhouette" : task === "reduction" ? "trustworthiness" : task === "anomaly" ? "roc_auc" : "accuracy";

/** Recommendation runs (mlp/core/recsys.py): ranked top-10 lists instead of answers. */
export const isRecsys = (task: string | null | undefined) => task === "recommendation";

/** Forecasting runs (mlp/core/forecast.py): a time series, scored on a multi-step forecast of its last stretch. */
export const isForecast = (task: string | null | undefined) => task === "forecasting";

/* ---- unsupervised metrics (mlp/core/unsupervised.py) */

/** Metrics a learner can rank unsupervised models by, per task (in menu order). */
export const UNSUP_METRICS: Record<UnsupervisedTask, string[]> = {
  clustering: ["silhouette", "davies_bouldin", "calinski_harabasz", "ari", "nmi", "purity"],
  reduction: ["trustworthiness", "explained_2d", "explained_all"],
  anomaly: ["roc_auc", "avg_precision", "precision", "recall", "flagged_share"],
  recommendation: ["ndcg_at_10", "recall_at_10", "precision_at_10", "hit_rate", "coverage", "novelty", "rmse", "mae"],
  // bias (signed) is shown on the cards, never ranked by
  forecasting: ["mae", "rmse", "mase", "smape", "one_step_mae"],
};

/** Metrics that need the hidden "truth" column (absent when the project has none). */
export const TRUTH_METRICS = new Set(["ari", "nmi", "purity", "roc_auc", "avg_precision", "precision", "recall"]);

export const UNSUP_LABELS: Record<string, string> = {
  silhouette: "Silhouette",
  davies_bouldin: "Davies–Bouldin",
  calinski_harabasz: "Calinski–Harabasz",
  ari: "ARI · agreement",
  nmi: "NMI · shared info",
  purity: "Purity",
  inertia: "Inertia",
  bic: "BIC",
  n_clusters: "Groups found",
  noise_share: "Noise points",
  trustworthiness: "Trustworthiness",
  explained_2d: "Variation kept in 2-D",
  explained_all: "Variation kept (all)",
  n_components: "Components",
  flagged_share: "Rows flagged",
  threshold: "Score threshold",
  kl_divergence: "KL divergence",
  ndcg_at_10: "NDCG@10",
  recall_at_10: "Recall@10",
  precision_at_10: "Precision@10",
  hit_rate: "Hit rate",
  coverage: "Coverage",
  novelty: "Novelty",
  users_evaluated: "Viewers tested",
  mase: "MASE",
  smape: "sMAPE",
  bias: "Bias",
  one_step_mae: "One-step MAE",
};

export const UNSUP_HELP: Record<string, string> = {
  silhouette: "How much closer each point is to its own group than to the next-nearest group (−1…1). Above 0.5 = crisp, well-separated groups; near 0 = groups that blur into each other. Needs no answers — that's why it's the go-to clustering score.",
  davies_bouldin: "How much each group overlaps with its most similar neighbour, compared with how tight it is. Lower is better — 0 would be perfectly separated groups.",
  calinski_harabasz: "Spread between groups divided by spread inside groups. Higher = tighter, further-apart groups. Only compare it between runs on the same data.",
  ari: "Agreement with the hidden truth: how well the groups match the real categories you hid from the models (1 = perfect match, 0 = no better than random grouping). Group names don't matter, only who ends up together.",
  nmi: "Agreement with the hidden truth, measured as shared information: how much knowing a row's cluster tells you about its real category (0…1).",
  purity: "Agreement with the hidden truth: if every cluster were labelled with its most common real category, what share of rows would be right? Easy to read, but more clusters always look purer.",
  inertia: "Total squared distance from every point to its cluster centre — the thing k-means minimises. Lower = tighter groups, but it always drops as you add more clusters.",
  bic: "A Gaussian Mixture's fit score that penalises extra complexity. Lower is better; useful for comparing different numbers of groups.",
  n_clusters: "How many groups the model ended up with.",
  noise_share: "Share of rows DBSCAN refused to put in any group because they sit in sparse regions.",
  trustworthiness: "Do points that are neighbours on the 2-D map really sit close together in the full data? 1 = every neighbourhood on the map is genuine; lower = the map invents neighbours that aren't real.",
  explained_2d: "Share of the data's total variation the first two directions capture — how much of the full picture survives on a flat map.",
  explained_all: "Share of total variation kept by all the components this PCA keeps.",
  flagged_share: "Share of rows the detector flags as unusual (set by the expected share of anomalies).",
  threshold: "Anomaly scores above this line are flagged.",
  kl_divergence: "How far t-SNE's map is from the real neighbourhood structure (lower is better). Only comparable between runs on the same data.",
  ndcg_at_10: "Like recall@10, but a hit at the top of the list counts more than one at number 10 — people mostly look at the first few picks. 1 = their favourites always come first.",
  recall_at_10: "Of the films they later liked, how many were in their top 10? We hid each viewer's most recent ratings, asked for 10 picks, and counted how many of their real favourites made the list.",
  precision_at_10: "Of the 10 picks, how many did the viewer really go on to like? Low by nature: we only hid a few ratings per viewer, so even a perfect list can't score 100%.",
  hit_rate: "Share of viewers who got at least one real favourite in their top 10 — “did the list work at all for this person?”",
  coverage: "Share of the whole catalogue that ends up in anyone's top 10. Low coverage = everyone sees the same few blockbusters and most films are never shown.",
  novelty: "How niche the recommendations are, on average: 0% = only the biggest blockbusters, 100% = only the most obscure titles. Neither extreme is the goal — a bit of discovery is.",
  users_evaluated: "How many viewers had a held-out favourite to test the top-10 list against.",
};

/** Forecast errors are in the series' own units (sales, visits, kWh…). */
const FORECAST_HELP: Record<string, string> = {
  mae: "We hid the last stretch of the series and asked the model to forecast it, one step after another — each guess feeding the next. MAE is how far off those forecasts were on average, in the series' own units. Lower is better.",
  rmse: "Like MAE, but big misses count extra (errors are squared before averaging). Lower is better.",
  mase: "The forecast's error divided by the typical error of “same as last season” (e.g. next Monday = last Monday). Below 1 = it beats that simple rule; 0.7 means 30% smaller errors. Above 1 = the simple rule does better.",
  smape: "Average error as a share of the values (symmetric percentage error). Handy for comparing series of different sizes. Lower is better.",
  bias: "Average signed error: positive = forecasts run too high, negative = too low. Close to 0 is best — a consistent bias usually means a trend the model can't follow.",
  one_step_mae: "The error if the model always knew yesterday's real value and only had to guess one step ahead. It's always easier than a real multi-step forecast — the gap shows how much errors snowball.",
};

/** Rating-prediction errors read differently for recommenders (stars, not target units). */
const RECSYS_HELP: Record<string, string> = {
  rmse: "Rating prediction: how many stars off the model's guessed rating is, on the held-out ratings (big misses count extra). Lower is better — but a great star-guesser can still make a dull top-10 list.",
  mae: "Rating prediction: the average number of stars the guessed rating is off by. Lower is better.",
};

const ANOMALY_HELP: Record<string, string> = {
  roc_auc: "Agreement with the hidden truth: pick one real anomaly and one normal row at random — how often does the real anomaly get the higher score? 0.5 = random, 1 = perfect ranking.",
  avg_precision: "Agreement with the hidden truth: how clean the top of the ranking is — high when the most suspicious rows really are the anomalies. Stricter than ROC-AUC when anomalies are rare.",
  precision: "Of the rows it flagged, how many really were anomalies? Low precision = lots of false alarms.",
  recall: "Of the real anomalies, how many did it flag? Low recall = faults slipping through.",
};

const UNSUP_LOWER = new Set(["davies_bouldin", "inertia", "bic", "kl_divergence", "mase", "smape", "one_step_mae"]);
/** Unsupervised metrics shown as plain decimals rather than percentages. */
const DECIMAL = new Set(["bias", "ndcg_at_10", "users_evaluated", "silhouette", "davies_bouldin", "calinski_harabasz", "ari", "nmi", "inertia", "bic", "n_clusters", "threshold", "n_components", "kl_divergence"]);

/** Is lower better? Works for built-in keys and the project's own metrics ("custom:<id>"). */
export const lowerBetter = (metric: string) =>
  isCustomKey(metric) ? findCustom(metric)?.better === "lower" : LOWER_IS_BETTER.has(metric) || UNSUP_LOWER.has(metric) || EXTRA_LOWER.has(metric);

/** Metrics that live in 0…1 are shown as percentages; error metrics in target units. */
export const isUnit = (metric: string) => !isCustomKey(metric) && !lowerBetter(metric) && metric !== "r2" && metric !== "mcc" && metric !== "explained_variance" && !DECIMAL.has(metric);

export const fmtMetric = (metric: string, v: number | null | undefined) =>
  v === null || v === undefined ? "—" : isCustomKey(metric) ? fmtCustom(v) : metric === "smape" ? pct(v, 1) : metric === "mase" ? v.toFixed(2) : metric === "n_clusters" || metric === "n_components" || metric === "users_evaluated" ? String(Math.round(v)) : isUnit(metric) ? pct(v, 1) : fmt(v, 3);

export const metricLabel = (m: string) => (isCustomKey(m) ? findCustom(m)?.name ?? "Your score" : METRIC_LABELS[m] ?? UNSUP_LABELS[m] ?? EXTRA_LABELS[m] ?? m);

/** Plain-language help for a metric (anomaly metrics are phrased for flagged rows; custom metrics show their recipe). */
export const metricHelp = (m: string, task?: string | null): string | undefined => {
  if (isCustomKey(m)) {
    const cm = findCustom(m);
    if (!cm) return undefined;
    const recipe = describeCustom(cm, task, useProject.getState().result?.classes);
    return `Your own score${cm.kind === "formula" ? `: ${recipe}` : ` — ${recipe}`}. ${cm.better === "lower" ? "Lower" : "Higher"} is better.${cm.description ? ` ${cm.description}` : ""}`;
  }
  return (task === "anomaly" ? ANOMALY_HELP[m] : task === "recommendation" ? RECSYS_HELP[m] : task === "forecasting" ? FORECAST_HELP[m] : undefined) ?? UNSUP_HELP[m] ?? METRIC_HELP[m] ?? EXTRA_HELP[m];
};

/** Is `a` a better score than `b` for this metric? */
export const better = (metric: string, a: number, b: number) => (lowerBetter(metric) ? a < b : a > b);

/** Metrics offered in the leaderboard's "Rank by" menu for this run (only those some model actually has). */
export function rankMetrics(result: RunResult): string[] {
  const task = result.task as string;
  const pool = isUnsupervised(task) || isRecsys(task) ? UNSUP_METRICS[task as UnsupervisedTask] : task === "regression" ? REG_METRICS : CLS_METRICS;
  return pool.filter((m) => Object.values(result.models).some((r) => !r.baseline && r.metrics.test?.[m] !== undefined && r.metrics.test?.[m] !== null));
}

/** Is a ranking choice (built-in key or "custom:<id>") usable for this run? */
export function metricUsable(result: RunResult, metric: string | null | undefined): metric is string {
  if (!metric) return false;
  if (isCustomKey(metric)) {
    const cm = findCustom(metric);
    return !!cm && appliesTo(cm, result.task);
  }
  return rankMetrics(result).includes(metric);
}

/**
 * Ranking metric for a run: the learner's choice saved on the project (`rank_metric`, built-in or custom) when this run
 * can be scored with it; otherwise the problem's primary metric, or the first one available (e.g. anomaly without truth).
 */
export function defaultMetric(result: RunResult): string {
  const choice = useProject.getState().project?.rank_metric;
  if (metricUsable(result, choice)) return choice;
  const p = primaryMetric(result.task);
  const avail = rankMetrics(result);
  return avail.includes(p) || !avail.length ? p : avail[0];
}

/** React hook: the ranking metric for a run, re-computed when the project's choice or its custom metrics change. */
export function useRankMetric(result: RunResult | null | undefined): string {
  const choice = useProject((s) => s.project?.rank_metric);
  const customs = useProject((s) => s.project?.custom_metrics);
  return useMemo(() => (result ? defaultMetric(result) : ""), [result, choice, customs]);
}

/** Remember the learner's ranking metric on the project (used everywhere models are ranked or compared). */
export function setRankMetric(metric: string | null) {
  useProject.getState().update(() => ({ rank_metric: metric }));
}

/** The project's custom metrics that can rank this run. */
export const customRankMetrics = (result: RunResult) => customsFor(useProject.getState().project, result.task);

/** Built-in metric → the matching cross-validation scorer (what automatic tuning can optimise). */
export function cvScoringFor(metric: string, task: Task): string {
  if (task === "regression") {
    return metric === "r2" || metric === "explained_variance" ? "r2" : metric === "mae" || metric === "median_ae" || metric === "mape" ? "neg_mae" : metric === "rmse" || metric === "mse" || metric === "max_error" ? "neg_rmse" : "r2";
  }
  return metric === "f1" || metric === "f1_weighted" || metric === "precision" || metric === "recall" ? "f1" : metric === "balanced_accuracy" || metric === "mcc" ? "balanced_accuracy" : metric === "roc_auc" || metric === "avg_precision" || metric === "log_loss" ? "roc_auc" : "accuracy";
}

/**
 * The run's coach tips with "fine-tune the best model" pointed at the best model under the learner's ranking metric
 * (the server's coach ranks by the problem's default metric).
 */
export function rankedCoach(result: RunResult | null | undefined): Suggestion[] {
  if (!result) return [];
  const coach = result.coach ?? [];
  const metric = defaultMetric(result);
  if (metric === primaryMetric(result.task) || !coach.some((s) => s.id === "tune_best")) return coach;
  const best = boardRows(result, metric).find((r) => !r.baseline && r.score !== null);
  if (!best) return coach;
  return coach.flatMap((s): Suggestion[] => {
    if (s.id !== "tune_best" || s.action?.kind !== "tune") return [s];
    if (best.model.family !== "classic" || useProject.getState().spec(best.model_id)?.nn) return [];
    return [{ ...s, title: `Fine-tune ${best.label}`, why: `${best.label} leads on ${metricLabel(metric)}. ${s.why}`, action: { ...s.action, key: best.key } }];
  });
}

/** React hook version of `rankedCoach` (re-renders when the ranking metric changes). */
export function useRankedCoach(result: RunResult | null | undefined): Suggestion[] {
  const metric = useRankMetric(result);
  return useMemo(() => rankedCoach(result), [result, metric]);
}

export const CV_SCORING: Record<Task, { value: string; label: string }[]> = {
  classification: [
    { value: "accuracy", label: "Accuracy" },
    { value: "f1", label: "F1 (macro)" },
    { value: "balanced_accuracy", label: "Balanced accuracy" },
    { value: "roc_auc", label: "ROC-AUC" },
  ],
  regression: [
    { value: "r2", label: "R²" },
    { value: "neg_rmse", label: "RMSE (negated)" },
    { value: "neg_mae", label: "MAE (negated)" },
  ],
};

/* ------------------------------------------------------------------ models */

export function archFor(cfg: Pick<ModelConfig, "model_id" | "nn_arch"> | ModelResult | undefined): NNArch | null {
  if (!cfg) return null;
  return cfg.nn_arch ?? useProject.getState().spec(cfg.model_id)?.default_arch ?? null;
}

/** Number of network outputs for the current task. */
export function nOutputs(): number {
  const { project, report, result } = useProject.getState();
  if (project?.task === "regression") return 1;
  return result?.classes?.length ?? report?.classes?.length ?? 2;
}

export function nFeatures(): number {
  const { report, result } = useProject.getState();
  return result?.feature_names?.length || report?.n_features || 8;
}

/** Short human summary of a model's most important settings. */
export function keySettings(cfg: ModelConfig): string[] {
  const spec = useProject.getState().spec(cfg.model_id);
  if (!spec) return [];
  const out: string[] = [];
  if (spec.nn) {
    const a = cfg.nn_arch ?? spec.default_arch;
    if (a?.layers?.length) out.push(`${a.layers.length} layers · ${a.layers.map((l) => (l.type === "dense" ? l.units : l.filters)).join("→")}`);
    else if (a?.kind === "ft_transformer") out.push(`${a.n_blocks ?? 2} attention blocks`);
    else if (a?.kind === "gcn") out.push(`graph · ${(a.hidden ?? []).join("→")}`);
    out.push(`${cfg.params.epochs ?? spec.params.find((p) => p.name === "epochs")?.default} epochs`);
    return out;
  }
  for (const hp of spec.params.slice(0, 2)) {
    let v = cfg.params[hp.name] ?? hp.default;
    if (hp.name === "max_depth" && Number(v) === 0) v = "∞";
    if (typeof v === "number") v = fmt(v, 4);
    if (typeof v === "boolean") v = v ? "on" : "off";
    out.push(`${hp.label}: ${v}`);
  }
  return out;
}

/* ------------------------------------------------------------------ run training */

let liveProject: string | null = null;
/** Project id the current train job belongs to (useJob is global). */
export const liveProjectId = () => liveProject;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Live k-means animations report when their replay will finish, so the results don't cut them off mid-walk. */
const replayEnds: Record<string, number> = {};
export const setReplayEnd = (key: string, at: number | null) => {
  if (at === null) delete replayEnds[key];
  else replayEnds[key] = at;
};
const replayWait = () => Math.max(0, Math.min(9000, Math.max(0, ...Object.values(replayEnds)) - Date.now()));

/** Follow a train job's live events and, when it finishes, store its result on the project. */
export function attachTrainJob(job_id: string, projectId: string, models: { key: string; model_id: string; label: string; nn: boolean }[]) {
  liveProject = projectId;
  useJob.getState().start(job_id, "train", models, async (status) => {
    if (status === "finished") {
      try {
        const [result] = await Promise.all([api.result(job_id), sleep(Math.max(900, replayWait() + 600))]);
        const cur = useProject.getState();
        if (cur.project?.id !== projectId) return;
        cur.setResult(result);
        cur.update((p) => ({ last_job_id: job_id, history: [...(p.history || []), { job_id, at: Date.now() / 1000, leaderboard: result.leaderboard }] }));
        // rank by the learner's chosen metric (built-in or their own), not just the server's default
        const metric = defaultMetric(result);
        const rows = boardRows(result, metric);
        const best = rows.find((r) => !r.baseline && r.score !== null) ?? rows.find((r) => !r.baseline);
        const base = rows.find((r) => r.baseline);
        const beat = best && base && best.score !== null && base.score !== null ? better(metric, best.score, base.score) : true;
        const by = metric !== primaryMetric(result.task) ? ` on ${metricLabel(metric)}` : "";
        toast.success(best ? (beat ? `Training done — ${best.label} came out on top${by}!` : `Training done — but none of the models beat the baseline${by}. Take a look!`) : "Training finished.");
      } catch (e) {
        toast.error(e);
      }
    } else if (status === "failed") {
      toast.error(`Training failed: ${useJob.getState().error ?? "unknown error"}`);
    } else if (status === "cancelled") {
      toast.info("Training stopped.");
    }
  });
}

/** After a page reload, re-attach to a training job that is still running for this project. */
export async function resumeRunningJob(projectId: string) {
  if (useJob.getState().status === "running") return;
  try {
    const jobs = await api.jobs();
    const job = jobs.find((j) => j.kind === "train" && j.project_id === projectId && (j.status === "running" || j.status === "queued"));
    if (job) attachTrainJob(job.id, projectId, []);
  } catch { /* server may be restarting */ }
}

export async function startTraining(): Promise<boolean> {
  const ps = useProject.getState();
  const project = ps.project;
  if (!project?.prepared_id) {
    toast.error("Prepare your data first.");
    return false;
  }
  if (!project.models.length) {
    toast.error("Pick at least one model first.");
    return false;
  }
  if (useJob.getState().status === "running") {
    toast.error("Another job is still running — wait for it or stop it first.");
    return false;
  }
  try {
    await ps.ensureRegistry();
    await ps.flush();
    const options = { cv_folds: 0, seed: 42, ...(project.options || {}) };
    if (!options.cv_scoring) delete options.cv_scoring;
    const { job_id } = await api.train({ project_id: project.id, prepared_id: project.prepared_id, models: project.models, options });
    const models = project.models.map((m) => {
      const spec = ps.spec(m.model_id);
      return { key: m.key, model_id: m.model_id, label: spec?.label ?? m.model_id, nn: !!spec?.nn };
    });
    attachTrainJob(job_id, project.id, models);
    return true;
  } catch (e) {
    toast.error(e);
    return false;
  }
}

/* ------------------------------------------------------------------ saved models (session memory) */

interface SavedState { saved: Record<string, string>; mark: (jobId: string, key: string, id: string) => void }
export const useSaved = create<SavedState>((set, get) => ({
  saved: {},
  mark: (jobId, key, id) => set({ saved: { ...get().saved, [`${jobId}:${key}`]: id } }),
}));

/* ------------------------------------------------------------------ leaderboard */

export interface BoardRow {
  key: string; label: string; model_id: string; score: number | null; train: number | null; fit: number; model: ModelResult; baseline: boolean;
  /** custom metrics: why the score is missing, and how it was measured */
  why?: string; note?: string;
}

/** The 'always guess' reference row is not a real model: keep it out of headlines, pickers and tuners. */
export const isBaseline = (m: { baseline?: boolean; key?: string } | null | undefined) => !!m?.baseline;

/** Trained models only (no baseline). */
export const realModels = (result: RunResult) => Object.values(result.models).filter((m) => !m.baseline);

/** The baseline result of a run, if the backend added one. */
export const baselineOf = (result: RunResult) => Object.values(result.models).find((m) => m.baseline);

/**
 * How much better `score` is than the baseline on `metric` (positive = better, respecting lower-is-better).
 * Error metrics are compared relatively ("34% less error"), others as a plain difference.
 */
export function vsBaseline(metric: string, score: number | null | undefined, base: number | null | undefined): { delta: number; text: string } | null {
  if (score === null || score === undefined || base === null || base === undefined) return null;
  if (isCustomKey(metric)) {
    // the learner's own score: relative when both are positive amounts, else a plain difference
    const lower = lowerBetter(metric);
    if (score >= 0 && base > 0) {
      const rel = lower ? (base - score) / base : (score - base) / base;
      return { delta: rel, text: `${Math.round(Math.abs(rel) * 100)}% ${lower ? (rel >= 0 ? "lower" : "higher") : rel >= 0 ? "higher" : "lower"}` };
    }
    const d = lower ? base - score : score - base;
    return { delta: d, text: `${fmtCustom(Math.abs(d))} ${d >= 0 ? "better" : "worse"}` };
  }
  if (lowerBetter(metric)) {
    if (!base) return null;
    const rel = (base - score) / Math.abs(base);
    return { delta: rel, text: rel >= 0 ? `${Math.round(rel * 100)}% less error` : `${Math.round(-rel * 100)}% more error` };
  }
  const d = score - base;
  const sign = d >= 0 ? "+" : "−";
  return { delta: d, text: isUnit(metric) ? `${sign}${Math.abs(d * 100).toFixed(1)} pts` : `${sign}${fmt(Math.abs(d), 3)}` };
}

export function boardRows(result: RunResult, metric: string): BoardRow[] {
  const cm = isCustomKey(metric) ? findCustom(metric) : undefined;
  const rows: BoardRow[] = Object.values(result.models).map((m) => {
    const row = { key: m.key, label: m.label, model_id: m.model_id, model: m, fit: m.fit_time_s, baseline: !!m.baseline };
    if (isCustomKey(metric)) {
      if (!cm) return { ...row, score: null, train: null, why: "This metric was deleted." };
      const t = evalCustom(cm, m, result.task);
      return { ...row, score: t.value, train: cm.kind === "formula" ? evalCustom(cm, m, result.task, "train").value : null, why: t.why, note: t.note };
    }
    return { ...row, score: m.metrics.test?.[metric] ?? null, train: m.metrics.train?.[metric] ?? null };
  });
  const lower = lowerBetter(metric);
  return rows.sort((a, b) => {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return lower ? a.score - b.score : b.score - a.score;
  });
}
