import type {
  ArchSummary, BatchPredictResponse, Catalog, DatasetProfile, DatasetSummary, Health, ModelSpec, NNArch, PipelineSpec,
  PortsInfo, PredictResponse, PrepareReport, Project, RunResult, SavedModel, SyntheticPreview, SyntheticSpec, SystemInfo,
  Task, TuneResult, ModelConfig, TrainOptions, FeatureStep, ColumnSummary, LessonSummary, Lesson, LessonProgress, ChallengeCheck,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
    try {
      const j = await res.json();
      msg = j.error || j.detail || msg;
      if (typeof msg !== "string") msg = JSON.stringify(msg);
    } catch { /* not JSON */ }
    throw new ApiError(msg, res.status);
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
  profile: (id: string, target?: string | null, task?: Task | null) =>
    get<DatasetProfile>(`/datasets/${id}/profile?${new URLSearchParams({ ...(target ? { target } : {}), ...(task ? { task } : {}) })}`),
  previewFeatures: (id: string, steps: FeatureStep[]) =>
    post<{ ok: boolean; error?: string; columns: ColumnSummary[] }>(`/datasets/${id}/features/preview`, { steps }),
  prepare: (id: string, pipeline: Partial<PipelineSpec>, model_ids: string[]) =>
    post<PrepareReport>(`/datasets/${id}/prepare`, { pipeline, model_ids }),

  // models + training
  registry: (task?: Task | null) => get<ModelSpec[]>(`/models/registry${task ? `?task=${task}` : ""}`),
  validateArch: (arch: NNArch, n_features: number, n_out: number, image_shape?: number[] | null) =>
    post<ArchSummary>("/nn/validate", { arch, n_features, n_out, image_shape }),
  train: (body: { project_id: string; prepared_id: string; models: ModelConfig[]; options: TrainOptions }) =>
    post<{ job_id: string }>("/jobs/train", body),
  tune: (body: { prepared_id: string; model_id: string; params: Record<string, any>; space: Record<string, any>; search: "random" | "grid"; n_iter: number; cv: number; scoring?: string; project_id?: string }) =>
    post<{ job_id: string }>("/jobs/tune", body),
  jobs: () => get<{ id: string; kind: string; status: string; project_id?: string; created_at: number }[]>("/jobs"),
  job: (id: string) => get<{ id: string; status: string; kind: string; error?: string; progress: Record<string, any> }>(`/jobs/${id}`),
  cancelJob: (id: string) => post(`/jobs/${id}/cancel`),
  result: (id: string) => get<RunResult>(`/jobs/${id}/result`),
  tuneResult: (id: string) => get<TuneResult>(`/jobs/${id}/result`),

  // library
  saveModel: (body: { job_id: string; key: string; name: string; notes?: string; project_id?: string }) => post<SavedModel>("/library/save", body),
  library: () => get<SavedModel[]>("/library"),
  savedModel: (id: string) => get<SavedModel>(`/library/${id}`),
  renameModel: (id: string, patch: { name?: string; notes?: string }) => req<SavedModel>("PATCH", `/library/${id}`, patch),
  deleteModel: (id: string) => req("DELETE", `/library/${id}`),
  warm: (family: "torch" | "classic") => post("/library/warm", { family }),
  predict: (id: string, rows: Record<string, any>[]) => post<PredictResponse>(`/library/${id}/predict`, { rows }),
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
