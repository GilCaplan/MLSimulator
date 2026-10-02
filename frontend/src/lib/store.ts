import { create } from "zustand";
import { api } from "./api";
import { navigate } from "./router";
import type {
  Catalog, CurvePoint, DatasetProfile, DatasetSummary, JobEvent, ModelConfig, ModelSpec, PipelineSpec, PrepareReport,
  Project, RunResult, StepId, SuggestionAction, Task, TrainOptions, TuneResult,
} from "./types";

/* ------------------------------------------------------------------ defaults */

export const STEPS: { id: StepId; label: string; icon: string; blurb: string }[] = [
  { id: "problem", label: "Problem", icon: "🎯", blurb: "What are we predicting?" },
  { id: "models", label: "Models", icon: "🧩", blurb: "Pick the algorithms" },
  { id: "data", label: "Data", icon: "📊", blurb: "Upload or generate" },
  { id: "prepare", label: "Prepare", icon: "🧪", blurb: "Clean, split, balance" },
  { id: "train", label: "Train", icon: "🚀", blurb: "Watch them learn" },
  { id: "improve", label: "Improve", icon: "✨", blurb: "Tune and compare" },
];

export const DEFAULT_OPTIONS: TrainOptions = { cv_folds: 0, seed: 42 };

export const UNSUPERVISED = new Set(["clustering", "reduction", "anomaly"]);
export const isUnsupervised = (task?: string | null) => !!task && UNSUPERVISED.has(task);

export function defaultPipeline(target: string, task: PipelineSpec["task"]): PipelineSpec {
  return {
    target,
    task,
    drop_columns: [],
    impute: { numeric: "median", categorical: "most_frequent" },
    encode: { method: "onehot", max_categories: 20 },
    outliers: { enabled: false, method: "iqr", factor: 1.5 },
    split: { test_size: 0.2, val_size: 0.1, stratify: true, seed: 42, method: "random", group_column: null, time_column: null },
    scale: { method: "standard" },
    feature_select: { method: "none", k: 10 },
    resample: { mode: "none", over: "smote", under: "random", clean: "none", k_neighbors: 5 },
    target_transform: "none",
    dedupe: { enabled: false },
    features: [],
    image: { size: 32, grayscale: false, augment: {} },
    target_filter: { enabled: false, min: null, max: null },
    reduce: { method: "none", n_components: 5 },
    unsupervised: { holdout: 0 },
  };
}

/** Merge a (possibly partial) saved pipeline over the defaults. */
export function fullPipeline(p: Project): PipelineSpec | null {
  if (!p.task || (!p.target && !isUnsupervised(p.task))) return null;
  const base = defaultPipeline(p.target ?? "", p.task);
  const saved = (p.pipeline || {}) as any;
  const out: any = { ...base };
  for (const k of Object.keys(base) as (keyof PipelineSpec)[]) {
    const bv = (base as any)[k];
    const sv = saved[k];
    if (sv === undefined || sv === null) continue;
    out[k] = typeof bv === "object" && !Array.isArray(bv) ? { ...bv, ...sv } : sv;
  }
  out.target = p.target ?? null;
  out.task = p.task;
  if (isUnsupervised(p.task)) out.truth = p.truth ?? null;
  if (p.modality && p.modality !== "tabular") out.modality = p.modality;
  if (p.modality === "text") out.text = { text_column: null, ngram_max: 1, max_features: 3000, min_df: 2, max_len: 40, ...(saved.text || {}) };
  return out;
}

export function stepDone(p: Project | null, step: StepId): boolean {
  if (!p) return false;
  switch (step) {
    case "problem": return !!p.task;
    case "models": return p.models.length > 0;
    case "data": return !!p.dataset_id && (!!p.target || isUnsupervised(p.task));
    case "prepare": return !!p.prepared_id;
    case "train": return !!p.last_job_id;
    case "improve": return false;
  }
}

export function stepAvailable(p: Project | null, step: StepId): boolean {
  const idx = STEPS.findIndex((s) => s.id === step);
  return STEPS.slice(0, idx).every((s) => stepDone(p, s.id));
}

let keyCounter = 0;
export const newKey = () => `m${Date.now().toString(36)}${(keyCounter++).toString(36)}`;

export function modelConfigFor(spec: ModelSpec): ModelConfig {
  const params: Record<string, any> = {};
  for (const hp of spec.params) params[hp.name] = hp.default;
  return { key: newKey(), model_id: spec.id, params, nn_arch: spec.default_arch ? structuredClone(spec.default_arch) : null };
}

/* ------------------------------------------------------------------ toasts */

export interface Toast { id: number; kind: "info" | "success" | "error"; text: string }
interface ToastState { toasts: Toast[]; push: (kind: Toast["kind"], text: string) => void; dismiss: (id: number) => void }
let toastId = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === "error" ? 7000 : 3800);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
export const toast = {
  info: (t: string) => useToasts.getState().push("info", t),
  success: (t: string) => useToasts.getState().push("success", t),
  error: (t: unknown) => useToasts.getState().push("error", t instanceof Error ? t.message : String(t)),
};

/* ------------------------------------------------------------------ UI prefs */

type Theme = "auto" | "light" | "dark";
interface UIState { theme: Theme; reduceMotion: boolean; setTheme: (t: Theme) => void; setReduceMotion: (v: boolean) => void }
const readPref = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const writePref = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
};
export const useUI = create<UIState>((set) => ({
  theme: readPref<Theme>("mlp.theme", "auto"),
  reduceMotion: readPref("mlp.reduceMotion", false),
  setTheme: (theme) => { writePref("mlp.theme", theme); set({ theme }); },
  setReduceMotion: (reduceMotion) => { writePref("mlp.reduceMotion", reduceMotion); set({ reduceMotion }); },
}));

/* ------------------------------------------------------------------ project + caches */

interface ProjectState {
  project: Project | null;
  saving: boolean;
  registry: ModelSpec[];
  catalog: Catalog | null;
  dataset: DatasetSummary | null;
  profile: DatasetProfile | null;
  report: PrepareReport | null;
  result: RunResult | null;
  /** UI hand-off: model key the Improve page should open in the tuner. */
  tuneKey: string | null;
  /** Set when coach actions changed settings since the last training run. */
  dirtySinceTrain: boolean;

  load: (id: string) => Promise<void>;
  update: (patch: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  flush: () => Promise<void>;
  ensureRegistry: () => Promise<ModelSpec[]>;
  ensureCatalog: () => Promise<Catalog>;
  setDataset: (d: DatasetSummary | null) => void;
  setProfile: (p: DatasetProfile | null) => void;
  setReport: (r: PrepareReport | null) => void;
  setResult: (r: RunResult | null) => void;
  spec: (modelId: string) => ModelSpec | undefined;
  applyAction: (a: SuggestionAction) => void;
  setTuneKey: (k: string | null) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useProject = create<ProjectState>((set, get) => ({
  project: null,
  saving: false,
  registry: [],
  catalog: null,
  dataset: null,
  profile: null,
  report: null,
  result: null,
  tuneKey: null,
  dirtySinceTrain: false,

  load: async (id) => {
    if (get().project?.id === id) return;
    await get().flush();
    const project = await api.project(id);
    project.options = { ...DEFAULT_OPTIONS, ...(project.options || {}) };
    set({ project, dataset: null, profile: null, report: null, result: null, dirtySinceTrain: false });
    get().ensureRegistry();
    if (project.dataset_id) api.dataset(project.dataset_id).then((d) => get().project?.id === id && set({ dataset: d })).catch(() => {});
    if (project.last_job_id) api.result(project.last_job_id).then((r) => get().project?.id === id && set({ result: r })).catch(() => {});
  },

  update: (patch) => {
    const cur = get().project;
    if (!cur) return;
    const p = typeof patch === "function" ? patch(cur) : patch;
    set({ project: { ...cur, ...p } });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => get().flush(), 600);
  },

  flush: async () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const p = get().project;
    if (!p) return;
    set({ saving: true });
    try {
      await api.saveProject(p);
    } catch (e) {
      toast.error(e);
    } finally {
      set({ saving: false });
    }
  },

  ensureRegistry: async () => {
    if (get().registry.length) return get().registry;
    const registry = await api.registry();
    set({ registry });
    return registry;
  },
  ensureCatalog: async () => {
    if (get().catalog) return get().catalog!;
    const catalog = await api.catalog();
    set({ catalog });
    return catalog;
  },
  setDataset: (dataset) => set({ dataset }),
  setProfile: (profile) => set({ profile }),
  setReport: (report) => set({ report }),
  setResult: (result) => set({ result, dirtySinceTrain: false }),
  spec: (id) => get().registry.find((m) => m.id === id),
  setTuneKey: (tuneKey) => set({ tuneKey }),

  applyAction: (a) => {
    const p = get().project;
    if (!p) return;
    const go = (step: StepId) => navigate(`/p/${p.id}/${step}`);
    switch (a.kind) {
      case "pipeline": {
        const { drop_columns_add, features_add, ...rest } = a.patch as any;
        const cur = (p.pipeline || {}) as any;
        const next: any = { ...cur };
        for (const [k, v] of Object.entries(rest)) {
          next[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...(cur[k] || {}), ...(v as object) } : v;
        }
        if (drop_columns_add) next.drop_columns = Array.from(new Set([...(cur.drop_columns || []), ...drop_columns_add]));
        if (features_add) next.features = [...(cur.features || []), ...features_add];
        get().update({ pipeline: next, prepared_id: null });
        set({ report: null, dirtySinceTrain: true });
        toast.success("Preparation updated — review it and continue.");
        go("prepare");
        break;
      }
      case "model_params": {
        get().update({
          models: p.models.map((m) => {
            if (m.key !== a.key) return m;
            let arch = m.nn_arch ? structuredClone(m.nn_arch) : m.nn_arch;
            if (arch && a.arch_dropout !== undefined) {
              if (arch.layers) arch.layers = arch.layers.map((l) => (l.type === "dense" ? { ...l, dropout: Math.max(l.dropout || 0, a.arch_dropout!) } : l));
              if (arch.kind === "gcn" || arch.kind === "ft_transformer") arch.dropout = Math.max(arch.dropout || 0, a.arch_dropout);
            }
            if (arch && a.arch_scale) {
              if (arch.layers) arch.layers = arch.layers.map((l) => (l.type === "dense" ? { ...l, units: Math.min(1024, Math.round(l.units * a.arch_scale!)) } : { ...l, filters: Math.min(256, Math.round(l.filters * a.arch_scale!)) }));
              if (arch.hidden) arch.hidden = arch.hidden.map((h) => Math.min(1024, Math.round(h * a.arch_scale!)));
              if (arch.d_token) arch.d_token = Math.min(256, Math.round(arch.d_token * a.arch_scale));
            }
            return { ...m, params: { ...m.params, ...a.patch }, nn_arch: arch };
          }),
        });
        set({ dirtySinceTrain: true });
        toast.success("Settings changed — train again to compare.");
        go("train");
        break;
      }
      case "add_models": {
        const reg = get().registry;
        const add = a.model_ids.map((id) => reg.find((s) => s.id === id)).filter(Boolean).map((s) => modelConfigFor(s!));
        get().update({ models: [...p.models, ...add] });
        set({ dirtySinceTrain: true });
        toast.success(`Added ${add.length} model${add.length === 1 ? "" : "s"}.`);
        go("train");
        break;
      }
      case "options":
        get().update({ options: { ...DEFAULT_OPTIONS, ...(p.options || {}), ...a.patch } });
        set({ dirtySinceTrain: true });
        toast.success("Training options updated.");
        go("train");
        break;
      case "goto":
        go(a.step);
        break;
      case "tune":
        set({ tuneKey: a.key });
        go("improve");
        break;
      case "project":
        get().update({ ...a.patch, prepared_id: null, pipeline: null, models: a.patch.task && a.patch.task !== p.task ? [] : p.models });
        set({ report: null });
        toast.success("Project updated.");
        go(a.patch.task ? "models" : "problem");
        break;
    }
  },
}));

/* ------------------------------------------------------------------ live jobs */

export interface LiveModel {
  key: string;
  model_id: string;
  label: string;
  nn: boolean;
  state: "queued" | "running" | "evaluating" | "done" | "failed";
  pct: number;
  epoch?: number;
  epochs?: number;
  points: CurvePoint[];
  iter?: { i: number; n: number };
  weights?: number[][][];
  device?: string;
  error?: string;
  metrics?: Record<string, Record<string, number>>;
  cv: number[];
  /** clustering: fixed 2-D sample of points (cluster.points) and the live iterations (cluster.step) */
  clusterPoints?: number[][];
  clusterSteps?: { iter: number; inertia: number; centroids_2d: number[][]; labels: number[] }[];
}

export interface Trial { i: number; n: number; params: Record<string, any>; score: number | null; std?: number; best?: any }

interface JobState {
  jobId: string | null;
  kind: "train" | "tune" | "sweep" | null;
  status: "idle" | "running" | "finished" | "failed" | "cancelled";
  models: Record<string, LiveModel>;
  order: string[];
  logs: { level: string; message: string; t: number }[];
  trials: Trial[];
  /** k sweep rows as they arrive (sweep.k) */
  sweepRows: { k: number; silhouette?: number | null; ari?: number | null; inertia?: number; bic?: number; davies_bouldin?: number | null }[];
  error?: string;
  startedAt?: number;
  onDone?: (status: JobState["status"]) => void;
  start: (jobId: string, kind: "train" | "tune" | "sweep", models?: { key: string; model_id: string; label: string; nn: boolean }[], onDone?: (s: JobState["status"]) => void) => void;
  cancel: () => Promise<void>;
  reset: () => void;
}

let es: EventSource | null = null;

export const useJob = create<JobState>((set, get) => ({
  jobId: null,
  kind: null,
  status: "idle",
  models: {},
  order: [],
  logs: [],
  trials: [],
  sweepRows: [],

  start: (jobId, kind, models = [], onDone) => {
    es?.close();
    const init: Record<string, LiveModel> = {};
    for (const m of models) init[m.key] = { ...m, state: "queued", pct: 0, points: [], cv: [] };
    set({ jobId, kind, status: "running", models: init, order: models.map((m) => m.key), logs: [], trials: [], sweepRows: [], error: undefined, startedAt: Date.now(), onDone });
    es = new EventSource(`/api/jobs/${jobId}/events`);
    es.onmessage = (msg) => {
      const ev: JobEvent = JSON.parse(msg.data);
      apply(ev);
    };
    es.onerror = () => {
      // EventSource reconnects on its own (server honours Last-Event-ID); stop if the job is already over.
      if (get().status !== "running") es?.close();
    };
  },

  cancel: async () => {
    const id = get().jobId;
    if (id) await api.cancelJob(id);
  },

  reset: () => {
    es?.close();
    set({ jobId: null, kind: null, status: "idle", models: {}, order: [], logs: [], trials: [], sweepRows: [], error: undefined });
  },
}));

function patchModel(key: string, fn: (m: LiveModel) => Partial<LiveModel>) {
  const s = useJob.getState();
  const m = s.models[key];
  if (!m) return;
  useJob.setState({ models: { ...s.models, [key]: { ...m, ...fn(m) } } });
}

function finish(status: "finished" | "failed" | "cancelled", error?: string) {
  es?.close();
  es = null;
  useJob.setState({ status, error });
  useJob.getState().onDone?.(status);
}

function apply(ev: JobEvent) {
  const d = ev.data || {};
  switch (ev.type) {
    case "model.started": {
      const s = useJob.getState();
      if (!s.models[d.key]) {
        useJob.setState({
          models: { ...s.models, [d.key]: { key: d.key, model_id: d.model_id, label: d.label, nn: d.nn, state: "running", pct: 0, points: [], cv: [] } },
          order: [...s.order, d.key],
        });
      } else patchModel(d.key, () => ({ state: "running", pct: 0 }));
      break;
    }
    case "nn.start":
      patchModel(d.key, () => ({ device: d.device, epochs: d.epochs, weights: d.weights }));
      break;
    case "epoch":
      patchModel(d.key, (m) => ({
        epoch: d.epoch, epochs: d.epochs, pct: d.epoch / d.epochs,
        points: [...m.points, { step: d.step, train_loss: d.train_loss, val_loss: d.val_loss, train_score: d.train_score, val_score: d.val_score, lr: d.lr }],
        ...(d.weights ? { weights: d.weights } : {}),
      }));
      break;
    case "batch":
      patchModel(d.key, (m) => ({ pct: m.epochs ? ((d.epoch - 1) + d.pct) / m.epochs : m.pct }));
      break;
    case "iteration":
      patchModel(d.key, (m) => {
        const pt: CurvePoint | null = d.train_loss !== undefined || d.val_loss !== undefined || d.val_score !== undefined
          ? { step: d.i, train_loss: d.train_loss, val_loss: d.val_loss, train_score: d.train_score, val_score: d.val_score }
          : null;
        return { iter: { i: d.i, n: d.n }, pct: d.n ? d.i / d.n : m.pct, points: pt ? [...m.points, pt] : m.points };
      });
      break;
    case "cv.fold":
      patchModel(d.key, (m) => ({ cv: [...m.cv, d.score] }));
      break;
    case "model.evaluating":
      patchModel(d.key, () => ({ state: "evaluating", pct: 1 }));
      break;
    case "model.finished":
      patchModel(d.key, () => ({ state: "done", pct: 1, metrics: d.metrics, ...(d.curve?.points?.length ? { points: d.curve.points } : {}) }));
      break;
    case "model.failed":
      patchModel(d.key, () => ({ state: "failed", error: d.error }));
      break;
    case "cluster.points":
      patchModel(d.key, () => ({ clusterPoints: d.points }));
      break;
    case "cluster.step":
      patchModel(d.key, (m) => ({ clusterSteps: [...(m.clusterSteps || []), { iter: d.iter, inertia: d.inertia, centroids_2d: d.centroids_2d, labels: d.labels }] }));
      break;
    case "sweep.k":
      useJob.setState({ sweepRows: [...useJob.getState().sweepRows, d] });
      break;
    case "tune.trial":
      useJob.setState({ trials: [...useJob.getState().trials, d] });
      break;
    case "log":
      useJob.setState({ logs: [...useJob.getState().logs, { level: d.level, message: d.message, t: ev.t }].slice(-200) });
      break;
    case "job.finished":
      finish("finished");
      break;
    case "job.failed":
      finish("failed", d.error);
      break;
    case "job.cancelled":
      finish("cancelled");
      break;
  }
}

export type { TuneResult };
