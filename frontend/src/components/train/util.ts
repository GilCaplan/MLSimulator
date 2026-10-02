import { create } from "zustand";
import { api } from "../../lib/api";
import { LOWER_IS_BETTER, METRIC_HELP, METRIC_LABELS, fmt, pct } from "../../lib/format";
import { isUnsupervised, toast, useJob, useProject } from "../../lib/store";
import type { ModelConfig, ModelResult, NNArch, RunResult, Task, UnsupervisedTask } from "../../lib/types";

/* ------------------------------------------------------------------ metrics */

export const CLS_METRICS = ["accuracy", "balanced_accuracy", "f1", "roc_auc", "precision", "recall"];
export const REG_METRICS = ["r2", "rmse", "mae"];

/** Ranking metric per task (mirrors mlp/core/problems.py primary_metric). */
export const primaryMetric = (task: string | null | undefined) =>
  task === "regression" ? "r2" : task === "clustering" ? "silhouette" : task === "reduction" ? "trustworthiness" : task === "anomaly" ? "roc_auc" : "accuracy";

/* ---- unsupervised metrics (mlp/core/unsupervised.py) */

/** Metrics a learner can rank unsupervised models by, per task (in menu order). */
export const UNSUP_METRICS: Record<UnsupervisedTask, string[]> = {
  clustering: ["silhouette", "davies_bouldin", "calinski_harabasz", "ari", "nmi", "purity"],
  reduction: ["trustworthiness", "explained_2d", "explained_all"],
  anomaly: ["roc_auc", "avg_precision", "precision", "recall", "flagged_share"],
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
};

const ANOMALY_HELP: Record<string, string> = {
  roc_auc: "Agreement with the hidden truth: pick one real anomaly and one normal row at random — how often does the real anomaly get the higher score? 0.5 = random, 1 = perfect ranking.",
  avg_precision: "Agreement with the hidden truth: how clean the top of the ranking is — high when the most suspicious rows really are the anomalies. Stricter than ROC-AUC when anomalies are rare.",
  precision: "Of the rows it flagged, how many really were anomalies? Low precision = lots of false alarms.",
  recall: "Of the real anomalies, how many did it flag? Low recall = faults slipping through.",
};

const UNSUP_LOWER = new Set(["davies_bouldin", "inertia", "bic", "kl_divergence"]);
/** Unsupervised metrics shown as plain decimals rather than percentages. */
const DECIMAL = new Set(["silhouette", "davies_bouldin", "calinski_harabasz", "ari", "nmi", "inertia", "bic", "n_clusters", "threshold", "n_components", "kl_divergence"]);

export const lowerBetter = (metric: string) => LOWER_IS_BETTER.has(metric) || UNSUP_LOWER.has(metric);

/** Metrics that live in 0…1 are shown as percentages; error metrics in target units. */
export const isUnit = (metric: string) => !lowerBetter(metric) && metric !== "r2" && metric !== "mcc" && !DECIMAL.has(metric);

export const fmtMetric = (metric: string, v: number | null | undefined) =>
  v === null || v === undefined ? "—" : metric === "n_clusters" || metric === "n_components" ? String(Math.round(v)) : isUnit(metric) ? pct(v, 1) : fmt(v, 3);

export const metricLabel = (m: string) => METRIC_LABELS[m] ?? UNSUP_LABELS[m] ?? m;

/** Plain-language help for a metric (anomaly metrics are phrased for flagged rows). */
export const metricHelp = (m: string, task?: string | null): string | undefined =>
  (task === "anomaly" ? ANOMALY_HELP[m] : undefined) ?? UNSUP_HELP[m] ?? METRIC_HELP[m];

/** Is `a` a better score than `b` for this metric? */
export const better = (metric: string, a: number, b: number) => (lowerBetter(metric) ? a < b : a > b);

/** Metrics offered in the leaderboard's "Rank by" menu for this run (only those some model actually has). */
export function rankMetrics(result: RunResult): string[] {
  const task = result.task as string;
  const pool = isUnsupervised(task) ? UNSUP_METRICS[task as UnsupervisedTask] : task === "regression" ? REG_METRICS : CLS_METRICS;
  return pool.filter((m) => Object.values(result.models).some((r) => !r.baseline && r.metrics.test?.[m] !== undefined && r.metrics.test?.[m] !== null));
}

/** Default ranking metric for a run: the problem's primary metric, or the first one available (e.g. anomaly without truth). */
export function defaultMetric(result: RunResult): string {
  const p = primaryMetric(result.task);
  const avail = rankMetrics(result);
  return avail.includes(p) || !avail.length ? p : avail[0];
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
        const best = result.leaderboard.find((r) => !r.baseline);
        const base = result.leaderboard.find((r) => r.baseline);
        const beat = best && base && best.score !== null && base.score !== null ? best.score > base.score : true;
        toast.success(best ? (beat ? `Training done — ${best.label} came out on top!` : `Training done — but none of the models beat the baseline. Take a look!`) : "Training finished.");
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

export interface BoardRow { key: string; label: string; model_id: string; score: number | null; train: number | null; fit: number; model: ModelResult; baseline: boolean }

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
  const rows = Object.values(result.models).map((m) => ({
    key: m.key, label: m.label, model_id: m.model_id, model: m, fit: m.fit_time_s, baseline: !!m.baseline,
    score: m.metrics.test?.[metric] ?? null, train: m.metrics.train?.[metric] ?? null,
  }));
  const lower = lowerBetter(metric);
  return rows.sort((a, b) => {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return lower ? a.score - b.score : b.score - a.score;
  });
}
