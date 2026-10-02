import { create } from "zustand";
import { api } from "../../lib/api";
import { LOWER_IS_BETTER, METRIC_LABELS, fmt, pct } from "../../lib/format";
import { toast, useJob, useProject } from "../../lib/store";
import type { ModelConfig, ModelResult, NNArch, RunResult, Task } from "../../lib/types";

/* ------------------------------------------------------------------ metrics */

export const CLS_METRICS = ["accuracy", "balanced_accuracy", "f1", "roc_auc", "precision", "recall"];
export const REG_METRICS = ["r2", "rmse", "mae"];

export const primaryMetric = (task: Task | null | undefined) => (task === "regression" ? "r2" : "accuracy");

/** Metrics that live in 0…1 are shown as percentages; error metrics in target units. */
export const isUnit = (metric: string) => !LOWER_IS_BETTER.has(metric) && metric !== "r2" && metric !== "mcc";

export const fmtMetric = (metric: string, v: number | null | undefined) =>
  v === null || v === undefined ? "—" : isUnit(metric) ? pct(v, 1) : fmt(v, 3);

export const metricLabel = (m: string) => METRIC_LABELS[m] ?? m;

/** Is `a` a better score than `b` for this metric? */
export const better = (metric: string, a: number, b: number) => (LOWER_IS_BETTER.has(metric) ? a < b : a > b);

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

/** Follow a train job's live events and, when it finishes, store its result on the project. */
export function attachTrainJob(job_id: string, projectId: string, models: { key: string; model_id: string; label: string; nn: boolean }[]) {
  liveProject = projectId;
  useJob.getState().start(job_id, "train", models, async (status) => {
    if (status === "finished") {
      try {
        const [result] = await Promise.all([api.result(job_id), sleep(900)]);
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
  if (LOWER_IS_BETTER.has(metric)) {
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
  const lower = LOWER_IS_BETTER.has(metric);
  return rows.sort((a, b) => {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return lower ? a.score - b.score : b.score - a.score;
  });
}
