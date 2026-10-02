/* Shapes mirrored from the Python backend (mlp/). Keep in sync. */

export type Task = "classification" | "regression";
export type StepId = "problem" | "models" | "data" | "prepare" | "train" | "improve";

export interface HyperParam {
  name: string;
  label: string;
  type: "int" | "float" | "choice" | "bool";
  default: number | string | boolean;
  help: string;
  min?: number;
  max?: number;
  step?: number;
  log?: boolean;
  options?: string[];
}

export interface DenseLayer { type: "dense"; units: number; activation: string; dropout?: number; batchnorm?: boolean }
export interface ConvLayer { type: "conv"; filters: number; kernel: number; activation: string; pool?: number; batchnorm?: boolean }
export type Layer = DenseLayer | ConvLayer;
export interface NNArch {
  kind: "mlp" | "cnn1d" | "cnn2d" | "ft_transformer" | "gcn";
  layers?: Layer[];
  // ft_transformer
  d_token?: number; n_blocks?: number; n_heads?: number; ffn_mult?: number; dropout?: number;
  // gcn
  k?: number; hidden?: number[]; activation?: string;
}

export interface ModelSpec {
  id: string;
  label: string;
  family: string;
  tasks: Task[];
  emoji: string;
  description: string;
  params: HyperParam[];
  nn?: boolean;
  arch_kind?: NNArch["kind"];
  default_arch?: NNArch;
  requires?: "image";
  /** reference models (the baseline) that aren't offered in the Models gallery */
  hidden?: boolean;
}

export interface ModelConfig {
  key: string;
  model_id: string;
  params: Record<string, any>;
  nn_arch?: NNArch | null;
}

export interface Histogram { edges: number[]; counts: number[] }
export interface TopValues { labels: string[]; counts: number[]; other: number }

export interface ColumnSummary {
  name: string;
  dtype: string;
  role: "numeric" | "categorical" | "id" | "text" | "datetime";
  /** average rows per distinct value, for ID-like columns that repeat (e.g. patient visits) */
  repeats?: number;
  missing: number;
  unique: number;
  stats?: { mean: number; std: number; min: number; max: number; median: number; q1: number; q3: number; skew: number };
  histogram?: Histogram;
  top?: TopValues;
  is_integer?: boolean;
}

export interface DatasetSummary {
  id: string;
  name: string;
  source: "upload" | "synthetic" | "preset" | "sample" | "composed";
  n_rows: number;
  n_cols: number;
  columns: ColumnSummary[];
  preview: { columns: string[]; rows: any[][] };
  n_duplicates?: number;
  task_hint?: Task;
  target_hint?: string;
  image_shape?: [number, number];
  spec?: SyntheticSpec;
  created_at: number;
}

export interface Point { x: number; y: number; label?: string | number | null; i?: number; id?: string; synthetic?: boolean; c?: number | null }

export interface Suggestion {
  id: string;
  severity: "info" | "warn" | "high";
  title: string;
  why: string;
  action?: SuggestionAction;
}
export type SuggestionAction =
  | { kind: "pipeline"; label: string; patch: Partial<PipelineSpec> & { drop_columns_add?: string[] } }
  | { kind: "model_params"; label: string; key: string; patch: Record<string, any>; arch_dropout?: number; arch_scale?: number }
  | { kind: "add_models"; label: string; model_ids: string[] }
  | { kind: "options"; label: string; patch: Partial<TrainOptions> }
  | { kind: "goto"; label: string; step: StepId }
  | { kind: "tune"; label: string; key: string }
  | { kind: "project"; label: string; patch: Partial<Project> };

export interface DatasetProfile {
  n_rows: number;
  task_guess?: Task;
  class_balance?: TopValues;
  target_hist?: Histogram;
  target_correlations?: { feature: string; r: number }[];
  correlation_matrix?: { columns: string[]; matrix: number[][] };
  projection: Point[];
  coach: Suggestion[];
}

export interface Distribution { label: string; params: Record<string, any> }
export interface Catalog {
  distributions: Record<string, Distribution>;
  presets: Record<string, { label: string; task: Task; params: Record<string, number> }>;
  samples: Record<string, { label: string; task: Task; blurb: string; emoji: string }>;
  functions: Record<string, string>;
}

export interface FeatureSpec {
  name: string;
  dist: string;
  params: Record<string, any>;
  clip?: [number | null, number | null] | null;
  round?: number | null;
  missing_rate?: number;
}
export interface TargetRule {
  type: "linear" | "expression" | "clusters" | "random";
  weights?: Record<string, number>;
  bias?: number;
  noise?: number;
  nonlinear?: boolean;
  expr?: string;
  on?: string[];
  separation?: number;
  class_probs?: number[];
}
export interface SyntheticSpec {
  name?: string;
  n_samples: number;
  seed?: number;
  features: FeatureSpec[];
  target: {
    name: string;
    task: Task;
    n_classes?: number;
    class_names?: string[];
    classify?: "sigmoid" | "threshold" | "quantile";
    class_probs?: number[];
    balance_shift?: number;
    /** regression only: target = signal × scale + offset */
    scale?: number;
    offset?: number;
    rule: TargetRule;
  };
}
export interface SyntheticPreview {
  columns: ({ name: string; kind: "numeric"; histogram: Histogram; mean: number; std: number } | { name: string; kind: "categorical"; top: TopValues })[];
  target: { kind: "classes"; balance: TopValues } | { kind: "numeric"; histogram: Histogram };
  scatter: Point[];
}

export interface PipelineSpec {
  target: string;
  task: Task;
  drop_columns: string[];
  impute: { numeric: "median" | "mean" | "most_frequent" | "zero" | "drop_rows"; categorical: "most_frequent" | "constant" };
  encode: { method: "onehot" | "ordinal"; max_categories: number };
  outliers: { enabled: boolean; method: "iqr" | "zscore"; factor: number };
  split: {
    test_size: number; val_size: number; stratify: boolean; seed: number;
    /** random rows · whole groups (e.g. patients) on one side · past→train, future→test */
    method?: "random" | "group" | "time";
    group_column?: string | null;
    time_column?: string | null;
  };
  dedupe?: { enabled: boolean };
  features?: FeatureStep[];
  scale: { method: "none" | "standard" | "minmax" | "robust" };
  feature_select: { method: "none" | "kbest" | "mutual_info" | "variance" | "model"; k: number; threshold?: number };
  resample: {
    mode: "none" | "oversample" | "undersample" | "middle" | "custom";
    over: "random" | "smote" | "borderline_smote" | "adasyn" | "svm_smote";
    under: "random" | "nearmiss" | "cluster_centroids";
    clean: "none" | "tomek" | "enn";
    target_counts?: Record<string, number>;
    k_neighbors: number;
  };
  target_transform: "none" | "log1p";
  /** regression: drop rows whose target is outside [min, max] (data-entry errors) before splitting */
  target_filter?: { enabled: boolean; min: number | null; max: number | null };
}

export type FeatureOp = "date_parts" | "ratio" | "product" | "difference" | "log" | "power" | "bin" | "formula";
export interface FeatureStep {
  op: FeatureOp;
  name?: string;
  column?: string;
  a?: string;
  b?: string;
  p?: number;
  bins?: number;
  expr?: string;
  parts?: ("year" | "month" | "day" | "weekday" | "hour" | "dayofyear" | "is_weekend")[];
  drop_source?: boolean;
}

export interface SplitInfo {
  method: "random" | "group" | "time";
  group_column?: string;
  groups?: { train: number; val: number; test: number };
  /** groups appearing in both train and test (random split with a known group column) */
  shared_groups?: number;
  time_column?: string;
  train_range?: [string, string] | null;
  val_range?: [string, string] | null;
  test_range?: [string, string] | null;
}

export interface PrepareReport {
  prepared_id: string;
  task: Task;
  classes: string[] | null;
  splits: { train: number; train_before_resample: number; val: number; test: number };
  class_counts_before: Record<string, number> | null;
  class_counts_after: Record<string, number> | null;
  class_counts_test: Record<string, number> | null;
  added: number;
  removed: number;
  outliers_removed: number;
  before_points: Point[];
  after_points: Point[];
  feature_names_out: string[];
  n_features: number;
  n_features_before_select?: number;
  numeric_columns: string[];
  categorical_columns: string[];
  warnings: string[];
  image_shape: [number, number] | null;
  coach: Suggestion[];
  target_hist_train?: { values: number[] };
  duplicates_found?: number;
  features_created?: string[];
  split_info?: SplitInfo;
}

export interface TrainOptions { cv_folds: number; seed: number; cv_scoring?: string; calibrate?: "none" | "sigmoid" | "isotonic" }

export interface CurvePoint { step: number; train_loss?: number | null; val_loss?: number | null; train_score?: number | null; val_score?: number | null; lr?: number }
export interface Curve { x_label: string; loss?: string; score?: string; points: CurvePoint[]; best_epoch?: number }

export interface Surface {
  kind: "grid" | "curve";
  nx?: number; ny?: number; x?: [number, number]; y?: [number, number];
  grid?: number[]; confidence?: number[]; exact?: boolean;
  xs?: number[]; pred?: number[];
  points: Point[];
}

export interface ModelResult {
  key: string;
  model_id: string;
  label: string;
  family: "torch" | "classic";
  params: Record<string, any>;
  nn_arch?: NNArch | null;
  metrics: { train?: Record<string, number>; val?: Record<string, number>; test: Record<string, number> };
  confusion?: { labels: string[]; matrix: number[][] };
  roc?: { label: string; fpr: number[]; tpr: number[]; auc: number }[];
  pr?: { recall: number[]; precision: number[] };
  thresholds?: { t: number; precision: number; recall: number; f1: number; accuracy: number; tp: number; fp: number; fn: number; tn: number }[];
  residuals?: { points: { t: number; p: number }[]; hist: Histogram; hetero_r?: number };
  importance?: { names: string[]; values: number[]; method: string } | null;
  surface?: Surface | null;
  curve?: Curve | null;
  cv?: { scores: number[]; mean: number; std: number; metric: string } | null;
  notes?: Record<string, any>;
  /** reliability curve on the test rows (classification) */
  calibration?: { bins: { p: number; freq: number; n: number; lo: number; hi: number }[]; ece: number; brier: number; label: string } | null;
  /** most confident wrong answers (classification) or biggest misses (regression), with the raw input values */
  mistakes?: { columns: string[]; rows: { values: any[]; true: string | number; pred: string | number; confidence?: number; error?: number }[]; wrong?: number; mae?: number; total: number } | null;
  /** per-group performance on the test rows, weakest groups highlighted */
  slices?: { column: string; metric: string; better: "higher" | "lower"; overall: number; spread: number; groups: { label: string; n: number; value: number }[] }[];
  /** true for the automatic 'always guess' reference row */
  baseline?: boolean;
  fit_time_s: number;
  n_params?: number | null;
}

export interface LeaderRow { key: string; model_id: string; label: string; score: number; train_score: number; fit_time_s: number; metric: string; rank: number; baseline?: boolean }

export interface RunResult {
  job_id: string;
  task: Task;
  prepared_id: string;
  models: Record<string, ModelResult>;
  failures: Record<string, string>;
  leaderboard: LeaderRow[];
  coach: Suggestion[];
  classes: string[] | null;
  feature_names: string[];
  options: TrainOptions;
}

export interface TuneResult {
  model_id: string;
  best: { i: number; params: Record<string, any>; score: number; std: number };
  best_params: Record<string, any>;
  trials: { i: number; params: Record<string, any>; score: number | null; std?: number; error?: string }[];
  baseline: { score: number; std: number };
  metric: string;
  improvement: number;
}

export interface JobEvent { seq: number; type: string; data: any; t: number }

export interface RunHistory { job_id: string; at: number; leaderboard: LeaderRow[]; label?: string }

export interface Project {
  id: string;
  name: string;
  task: Task | null;
  step: StepId;
  models: ModelConfig[];
  dataset_id?: string | null;
  target?: string | null;
  pipeline?: Partial<PipelineSpec> | null;
  prepared_id?: string | null;
  options?: TrainOptions;
  last_job_id?: string | null;
  history: RunHistory[];
  emoji?: string;
  /** set when the project was started from a lesson's practice challenge */
  challenge?: { lesson_id: string } | null;
  created_at: number;
  updated_at: number;
}

export interface InputSchemaItem {
  name: string;
  type: "numeric" | "categorical" | "datetime";
  /** datetime inputs: an example value from the training data */
  example?: string;
  min?: number; max?: number; median?: number; mean?: number; std?: number; integer?: boolean; binary?: boolean;
  categories?: string[]; mode?: string;
}

export interface SavedModel {
  id: string;
  name: string;
  notes: string;
  task: Task;
  model_id: string;
  label: string;
  family: "torch" | "classic";
  params: Record<string, any>;
  nn_arch?: NNArch | null;
  target: string;
  classes: string[] | null;
  feature_names: string[];
  input_schema: InputSchemaItem[];
  metrics: ModelResult["metrics"];
  pipeline: PipelineSpec;
  dataset: { id: string; name?: string; n_rows?: number };
  project_id?: string;
  created_at: number;
  fit_time_s?: number;
  n_params?: number | null;
  detail?: Partial<ModelResult>;
}

export interface PredictResponse { predictions: (string | number)[]; probabilities?: number[][]; classes?: string[] }
export interface BatchPredictResponse {
  download_id: string;
  n_rows: number;
  preview: { columns: string[]; rows: any[][] };
  metrics?: Record<string, number> | null;
  confusion?: { labels: string[]; matrix: number[][] } | null;
  classes?: string[] | null;
  prediction_counts?: { labels: string[]; counts: number[] };
  prediction_hist?: Histogram;
}

export interface Health { ok: boolean; ready: boolean; port: number; pid: number; version: string; jobs_running: number }
export interface PortsInfo { free: number[]; busy: number[]; range: [number, number]; current: number }
export interface SystemInfo {
  version: string; port: number; pid: number; data_dir: string; log_path: string; python: string; machine: string;
  cpu_count: number; versions: Record<string, string | null>; mps: boolean;
}
export interface ArchSummary { ok: boolean; errors: string[]; layers: { name: string; out_shape: number[]; params: number }[]; total_params: number }

/* ------------------------------------------------------------------ lessons */

export interface LessonProgress {
  started_at?: number;
  project_id?: string;
  learn_done?: boolean;
  demo_done?: boolean;
  quiz_passed?: boolean;
  attempts?: number;
  completed_at?: number;
  last_check?: ChallengeCheck;
}

export interface LessonSummary {
  id: string;
  order: number;
  stage: string;
  emoji: string;
  title: string;
  tagline: string;
  modeled_on: string;
  progress: LessonProgress;
}

export interface ChallengeGoal { metric: string; op: ">=" | "<="; value: number; label: string }

export interface Lesson extends LessonSummary {
  /** body strings support **bold** and `code` */
  learn: { icon: string; heading: string; body: string }[];
  demo: string;
  demo_caption: string;
  quiz: { q: string; options: string[]; answer: number; explain: string }[];
  challenge: {
    title: string;
    dataset_name: string;
    story: string;
    task: string;
    hints: string[];
    solution?: string;
    task_type: Task;
    target: string;
    positive?: string | null;
    group?: string | null;
    goals: ChallengeGoal[];
    allowed_models?: string[] | null;
  };
}

export interface ChallengeCheck {
  passed: boolean;
  goals: { metric: string; label: string; value: number; target: number; op: ">=" | "<="; passed: boolean; per_group?: Record<string, number> }[];
  n_hidden: number;
  model: string;
  model_id: string;
  key: string;
  job_id: string;
  /** the model's metrics on the learner's own test split (compare with hidden results) */
  your_test: Record<string, number>;
  checked_at: number;
  solution?: string;
}
