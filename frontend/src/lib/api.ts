import type { UIPrefs } from "../design/prefs";
import type {
  ArchSummary, BatchPredictResponse, Catalog, DatasetProfile, DatasetSummary, Health, ModelSpec, NNArch, PipelineSpec,
  PortsInfo, PredictResponse, PrepareReport, Project, RunResult, SavedModel, SyntheticPreview, SyntheticSpec, SystemInfo,
  Task, TuneResult, ModelConfig, TrainOptions, FeatureStep, ColumnSummary, ProblemType, ImageSetInfo, ImagePredictResponse, Modality, SweepResult, AssignResponse, TextSetInfo, TextPredictResponse, RatingsSetInfo, RecommendResponse, RecItem, TimeseriesSetInfo, ForecastResponse, LabsCatalog, TryExample, TryResult, TryInputs, ModelArchitecture, LessonSummary, Lesson, LessonProgress, ChallengeCheck,
} from "./types";

export class ApiError extends Error {
  status: number;
  /** the parsed JSON error body, when there was one (e.g. ImportNeedsTrust for a 409 from /library/import) */
  data?: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function req<T>(method: string, path: string, body?: unknown, base = ""): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(`${base}/api${path}`, init);
  if (!res.ok) {
    let msg = res.statusText;
    let data: unknown;
    try {
      const j = await res.json();
      data = j;
      msg = j.error || j.detail || msg;
      if (typeof msg !== "string") msg = JSON.stringify(msg);
    } catch { /* not JSON */ }
    throw new ApiError(msg, res.status, data);
  }
  return res.json() as Promise<T>;
}

const get = <T>(p: string) => req<T>("GET", p);
const post = <T>(p: string, b?: unknown) => req<T>("POST", p, b ?? {});

export const api = {
  // system
  health: (base = "") => req<Health>("GET", "/health", undefined, base),
  info: () => get<SystemInfo>("/system/info"),
  ports: (start?: number, end?: number) => get<PortsInfo>(`/system/ports${start ? `?start=${start}&end=${end}` : ""}`),
  switchPort: (port: number) => post<{ status: string; port: number }>("/system/switch-port", { port }),
  goodbye: () => post("/system/goodbye"),
  shutdown: () => post("/system/shutdown"),
  revealData: () => post("/system/reveal-data"),

  // projects
  projects: () => get<Project[]>("/projects"),
  createProject: (doc: Partial<Project>) => post<Project>("/projects", doc),
  project: (id: string) => get<Project>(`/projects/${id}`),
  saveProject: (p: Project) => req<Project>("PUT", `/projects/${p.id}`, p),
  deleteProject: (id: string) => req("DELETE", `/projects/${id}`),

  // datasets
  catalog: () => get<Catalog>("/datasets/catalog"),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<DatasetSummary>("POST", "/datasets/upload", fd);
  },
  synthetic: (spec: SyntheticSpec) => post<DatasetSummary>("/datasets/synthetic", spec),
  syntheticPreview: (spec: SyntheticSpec) => post<SyntheticPreview>("/datasets/synthetic/preview", spec),
  preset: (preset: string, params: Record<string, number>, seed = 42) => post<DatasetSummary>("/datasets/preset", { preset, params, seed }),
  presetPreview: (preset: string, params: Record<string, number>) =>
    post<{ task: Task; points: { x: number; y: number; label: string | number }[] }>("/datasets/preset/preview", { preset, params }),
  sample: (name: string) => post<DatasetSummary>("/datasets/sample", { name }),
  compose: (id: string, body: { add_features?: any[]; add_rows?: number; jitter?: number; target?: string | null }) =>
    post<DatasetSummary>(`/datasets/${id}/compose`, body),
  datasets: () => get<DatasetSummary[]>("/datasets"),
  dataset: (id: string) => get<DatasetSummary>(`/datasets/${id}`),
  rows: (id: string, offset = 0, limit = 100) =>
    get<{ columns: string[]; rows: any[][]; total: number; offset: number }>(`/datasets/${id}/rows?offset=${offset}&limit=${limit}`),
  profile: (id: string, target?: string | null, task?: string | null,
    extra: { modality?: string; text_column?: string | null; user_col?: string | null; item_col?: string | null; rating_col?: string | null;
      time_col?: string | null; value_col?: string | null; series_col?: string | null } = {}) =>
    get<DatasetProfile>(`/datasets/${id}/profile?${new URLSearchParams({
      ...(target ? { target } : {}), ...(task ? { task } : {}), ...(extra.modality ? { modality: extra.modality } : {}),
      ...(extra.text_column ? { text_column: extra.text_column } : {}),
      ...(extra.user_col ? { user_col: extra.user_col } : {}), ...(extra.item_col ? { item_col: extra.item_col } : {}),
      ...(extra.rating_col ? { rating_col: extra.rating_col } : {}),
      ...(extra.time_col ? { time_col: extra.time_col } : {}), ...(extra.value_col ? { value_col: extra.value_col } : {}),
      ...(extra.series_col ? { series_col: extra.series_col } : {}),
    })}`),
  previewFeatures: (id: string, steps: FeatureStep[]) =>
    post<{ ok: boolean; error?: string; columns: ColumnSummary[] }>(`/datasets/${id}/features/preview`, { steps }),
  prepare: (id: string, pipeline: Partial<PipelineSpec>, model_ids: string[]) =>
    post<PrepareReport>(`/datasets/${id}/prepare`, { pipeline, model_ids }),

  // models + training
  registry: (task?: Task | null, modality?: Modality | null) =>
    get<ModelSpec[]>(`/models/registry?${new URLSearchParams({ ...(task ? { task } : {}), ...(modality ? { modality } : {}) })}`),
  problems: () => get<ProblemType[]>("/problems"),
  imageSets: () => get<Record<string, ImageSetInfo>>("/datasets/image-sets"),
  createImageSet: (name: string, params: Record<string, number> = {}, seed = 42) => post<DatasetSummary>("/datasets/image-set", { name, params, seed }),
  uploadImages: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<DatasetSummary>("POST", "/datasets/upload-images", fd);
  },
  ratingsSets: () => get<Record<string, RatingsSetInfo>>("/datasets/ratings-sets"),
  createRatingsSet: (name = "movies", params: Record<string, number> = {}, seed = 42) => post<DatasetSummary>("/datasets/ratings-set", { name, params, seed }),
  timeseriesSets: () => get<Record<string, TimeseriesSetInfo>>("/datasets/timeseries-sets"),
  createTimeseriesSet: (name = "store_sales", params: Record<string, number> = {}, seed = 42) => post<DatasetSummary>("/datasets/timeseries-set", { name, params, seed }),
  textSets: () => get<Record<string, TextSetInfo>>("/datasets/text-sets"),
  createTextSet: (name: string, params: Record<string, number> = {}, seed = 42) => post<DatasetSummary>("/datasets/text-set", { name, params, seed }),
  /** thumbnail URL for one image of an image dataset (use in <img src>) */
  imageUrl: (datasetId: string, i: number, size = 64, aug = 0) => `/api/datasets/${datasetId}/image/${i}?size=${size}${aug ? `&aug=${aug}` : ""}`,
  validateArch: (arch: NNArch, n_features: number, n_out: number, image_shape?: number[] | null) =>
    post<ArchSummary>("/nn/validate", { arch, n_features, n_out, image_shape }),
  train: (body: { project_id: string; prepared_id: string; models: ModelConfig[]; options: TrainOptions }) =>
    post<{ job_id: string }>("/jobs/train", body),
  tune: (body: { prepared_id: string; model_id: string; params: Record<string, any>; space: Record<string, any>; search: "random" | "grid"; n_iter: number; cv: number; scoring?: string; project_id?: string }) =>
    post<{ job_id: string }>("/jobs/tune", body),
  jobs: () => get<{ id: string; kind: string; status: string; project_id?: string; created_at: number }[]>("/jobs"),
  /** k sweep for clustering → job with `sweep.k` events, result via sweepResult */
  sweep: (body: { prepared_id: string; model_id: "kmeans" | "gmm" | "agglomerative"; k_min: number; k_max: number; project_id?: string }) =>
    post<{ job_id: string }>("/jobs/sweep", body),
  sweepResult: (id: string) => get<SweepResult>(`/jobs/${id}/result`),
  job: (id: string) => get<{ id: string; status: string; kind: string; error?: string; progress: Record<string, any> }>(`/jobs/${id}`),
  cancelJob: (id: string) => post(`/jobs/${id}/cancel`),
  result: (id: string) => get<RunResult>(`/jobs/${id}/result`),
  tuneResult: (id: string) => get<TuneResult>(`/jobs/${id}/result`),

  // appearance prefs (shared across ports — localStorage is per port)
  getPrefs: () => get<{ prefs: UIPrefs | null }>("/system/prefs"),
  putPrefs: (prefs: UIPrefs) => req<{ ok: boolean }>("PUT", "/system/prefs", { prefs }),

  // labs
  labs: () => get<LabsCatalog>("/labs"),
  /** start a server lab (gan | vae | transfer) → job streaming `lab.frame` events; result via api.result-like GET /jobs/{id}/result */
  runLab: (lab: string, params: Record<string, any> = {}) => post<{ job_id: string }>(`/labs/${lab}/run`, { params }),
  labResult: <T,>(jobId: string) => get<T>(`/jobs/${jobId}/result`),
  /** decode map points of a finished autoencoder-map run → 8×8 images (64 values 0–1) */
  vaeDecode: (run_id: string, z: [number, number][]) => post<{ images: number[][] }>("/labs/vae/decode", { run_id, z }),

  // try a trained (not yet saved) model
  tryExample: (jobId: string, key: string, opts: { label?: string | null; seed?: number } = {}) =>
    get<TryExample>(`/jobs/${jobId}/models/${key}/example?${new URLSearchParams({ ...(opts.label ? { label: opts.label } : {}), ...(opts.seed !== undefined ? { seed: String(opts.seed) } : {}) })}`),
  tryInput: (jobId: string, key: string, input: { image?: string; text?: string; row?: Record<string, any> }) =>
    post<TryResult>(`/jobs/${jobId}/models/${key}/try`, input),
  tryInputs: (jobId: string, key: string) => get<TryInputs>(`/jobs/${jobId}/models/${key}/inputs`),

  // library
  /** import an exported bundle; unsigned bundles reject with an ApiError (status 409) until re-sent with trust = true */
  importModel: (file: File, trust = false) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<SavedModel>("POST", `/library/import${trust ? "?trust=true" : ""}`, fd);
  },
  modelArchitecture: (id: string) => get<ModelArchitecture>(`/library/${id}/architecture`),
  saveModel: (body: { job_id: string; key: string; name: string; notes?: string; project_id?: string }) => post<SavedModel>("/library/save", body),
  library: () => get<SavedModel[]>("/library"),
  savedModel: (id: string) => get<SavedModel>(`/library/${id}`),
  renameModel: (id: string, patch: { name?: string; notes?: string }) => req<SavedModel>("PATCH", `/library/${id}`, patch),
  deleteModel: (id: string) => req("DELETE", `/library/${id}`),
  warm: (family: "torch" | "classic") => post("/library/warm", { family }),
  predict: (id: string, rows: Record<string, any>[]) => post<PredictResponse>(`/library/${id}/predict`, { rows }),
  /** recommenders: top-k for a known user, or for a new user described by item → stars */
  recommend: (id: string, body: { user?: string; ratings?: Record<string, number>; k?: number }) => post<RecommendResponse>(`/library/${id}/recommend`, body),
  libraryCatalog: (id: string, q = "", limit = 60) => get<{ items: RecItem[]; users: string[] }>(`/library/${id}/catalog?q=${encodeURIComponent(q)}&limit=${limit}`),
  /** forecasters: the next `horizon` steps of one series, with optional planned values for extra columns */
  forecast: (id: string, body: { series?: string; horizon?: number; exog?: Record<string, number[]> }) => post<ForecastResponse>(`/library/${id}/forecast`, body),
  predictText: (id: string, texts: string[]) => post<TextPredictResponse>(`/library/${id}/predict-text`, { texts }),
  assign: (id: string, rows: Record<string, any>[]) => post<AssignResponse>(`/library/${id}/assign`, { rows }),
  predictImage: (id: string, images: string[]) => post<ImagePredictResponse>(`/library/${id}/predict-image`, { images }),
  sensitivity: (id: string, row: Record<string, any>, class_index?: number | null) =>
    post<{ curves: { name: string; x: number[]; y: number[] }[] }>(`/library/${id}/sensitivity`, { row, class_index }),
  predictFile: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<BatchPredictResponse>("POST", `/library/${id}/predict-file`, fd);
  },
  // lessons
  lessons: () => get<LessonSummary[]>("/lessons"),
  lesson: (id: string) => get<Lesson>(`/lessons/${id}`),
  lessonProgress: (id: string, patch: Partial<Pick<LessonProgress, "learn_done" | "demo_done" | "quiz_passed">>) =>
    post<LessonProgress>(`/lessons/${id}/progress`, patch),
  startChallenge: (id: string) => post<Project>(`/lessons/${id}/start`),
  checkChallenge: (id: string, job_id: string, key: string) => post<ChallengeCheck>(`/lessons/${id}/check`, { job_id, key }),

  exportUrl: (id: string) => `/api/library/${id}/export`,
  downloadUrl: (id: string) => `/api/downloads/${id}`,
};
