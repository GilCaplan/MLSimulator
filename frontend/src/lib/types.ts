/* Shapes mirrored from the Python backend (mlp/). Keep in sync. */

export type Task = "classification" | "regression";
export type UnsupervisedTask = "clustering" | "reduction" | "anomaly" | "recommendation" | "forecasting";
export type Modality = "tabular" | "image" | "text" | "ratings" | "timeseries";

/** A problem type from GET /api/problems (task × modality), mirrored from mlp/core/problems.py */
export interface ProblemType {
  id: string;
  task: string;
  modality: Modality;
  group: string;
  emoji: string;
  label: string;
  question: string;
  primary_metric: string;
  lower_is_better: boolean;
  enabled: boolean;
  steps: [StepId, string][];
  /** clustering / reduction / anomaly: no target column (an optional hidden "truth" column is used only for comparison) */
  unsupervised?: boolean;
}

/** Unsupervised results (mlp/core/unsupervised.py: evaluate_unsupervised) */
export interface ClusterResult {
  /** 2-D projection (PCA of the prepared features) coloured by cluster `c` (-1 = noise); `truth` if a truth column exists */
  points: { x: number; y: number; c: number; truth?: string }[];
  sizes: Record<string, number>;
  /** k-means / GMM iterations for replaying the animation; `labels` index into `sample_points` */
  steps: { iter: number; inertia: number; centroids_2d: number[][]; labels: number[] }[];
  sample_points?: number[][] | null;
  centroids_2d?: number[][];
  center_ids?: number[];
  contingency?: { rows: string[]; cols: number[]; matrix: number[][] };
  /** what makes each cluster different: top features by z-score vs the overall mean (raw units) */
  profiles?: { cluster: number; size: number; top: { feature: string; z: number; mean: number; overall: number }[] }[];
}
export interface ReductionResult {
  points: { x: number; y: number; truth?: string }[];
  explained?: number[];
  cumulative?: number[];
  loadings?: { component: number; top: { feature: string; w: number }[] }[];
  /** share of variation kept vs number of components (PCA) */
  kept_curve?: { k: number; kept: number }[];
  kl_divergence?: number;
}
export interface AnomalyResult {
  threshold: number;
  hist: Histogram;
  /** counts of truly anomalous rows per histogram bin (when a truth column exists) */
  hist_true?: number[];
  positive_label?: string;
  top?: { columns: string[]; rows: { score: number; values: any[]; truth?: string }[] };
  points: { x: number; y: number; score: number; flag: boolean; truth?: string }[];
  surface?: { nx: number; ny: number; x: [number, number]; y: [number, number]; grid: number[] };
}
/** Text-model outputs (mlp/core/text_eval.py) */
export interface TextResult {
  text_column: string;
  /** most confident wrong answers with the raw text */
  mistakes?: { text: string; true: string; pred: string; confidence: number }[];
  /** per-word influence on the predicted class (occlusion: remove the word, see the probability move) */
  examples?: { text: string; true: string; pred: string; probability: number; tokens: { t: string; w: number }[] }[];
  /** linear / naive Bayes models: most indicative words (or phrases) per class */
  top_words?: { class: string; words: { t: string; w: number }[] }[];
  note?: string;
}
export interface TextSetInfo { label: string; task: Task; emoji: string; blurb: string; params: Record<string, number> }
export interface TextPredictResponse extends PredictResponse {
  /** influence of each word of the first text on the predicted class */
  tokens: { t: string; w: number }[];
}

/** Recommenders (mlp/core/recsys.py) */
export interface RecItem { item: string; title?: string; genre?: string; popularity: number; score?: number; hit?: boolean; because?: string | null; rating?: number }
export interface RecsysResult {
  /** sample users: what they liked (training) and their top-10 (hit = it was in their held-out favourites) */
  examples: { user: string; liked: RecItem[]; recs: RecItem[] }[];
  /** factor models: 2-D map of item taste vectors (most popular 300 items) */
  item_map?: (RecItem & { x: number; y: number })[];
  /** items sorted by popularity: how often each was liked vs how often it got recommended (first 400 users) */
  long_tail: { popularity: number[]; recommended: number[] };
}
export interface RecommendResponse { user_kind: "known" | "new"; n_rated: number; fallback_used: boolean; items: RecItem[]; history: RecItem[] }
export interface RatingsSetInfo { label: string; emoji: string; blurb: string; params: Record<string, number> }

/** Forecasting (mlp/core/forecast.py). Times are ISO strings ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM") or step numbers. */
export interface TsPoint { t: string | number; y: number }
export interface TsBandPoint extends TsPoint { lo: number; hi: number }
export interface TimeseriesSetInfo {
  label: string; emoji: string; blurb: string; horizon: number;
  columns: { time: string; value: string; series?: string }; exog: string[];
}
export interface ForecastSeriesResult {
  series: string;
  /** MASE denominator for this series (mean error of 'same as last season' in the history) */
  scale: number;
  /** time split: the steps just before the test block; random split: the whole series (downsampled) */
  history: TsPoint[];
  /** time split: what really happened in the test block (empty for a random split) */
  actual: TsPoint[];
  /** time split: the recursive multi-step forecast over the test block; random split: a forecast past the end of the data.
   *  lo/hi = an ~80% band that widens with the horizon */
  forecast: TsBandPoint[];
  /** one-step-ahead predictions at the test steps (random split: also `actual`) */
  one_step: (TsPoint & { actual?: number })[];
}
export interface ForecastResult {
  split: "time" | "random";
  horizon: number;
  /** "day" | "hour" | "month" | "week" | "quarter" | "year" | "step" */
  unit: string;
  season: number;
  series: ForecastSeriesResult[];
  /** time split: MASE at forecast step 1…horizon (errors grow as guesses feed into later guesses) */
  mase_by_step: number[];
  /** linear / tree models: share of importance per feature (lag_7, dow_Sat, promo, series_Store A…) */
  importance: { feature: string; importance: number }[];
  /** naive | seasonal_naive | moving_average | holt_winters | linear | random_forest | gbm | gru */
  kind: string;
  value_name: string;
}
export interface ForecastResponse {
  series: string; series_names: string[]; freq: string; unit: string; season: number; horizon: number; value_name: string;
  history: TsPoint[];
  forecast: TsBandPoint[];
  /** extra (known-in-advance) columns: planned values over the forecast (editable what-ifs) and recent history */
  exog: { name: string; binary: boolean; values: number[]; recent: number[] }[];
}

export interface SweepResult {
  model_id: string;
  rows: { k: number; silhouette?: number | null; davies_bouldin?: number | null; ari?: number | null; nmi?: number | null; inertia?: number; bic?: number }[];
  best_k: number;
  metric: string;
  has_truth: boolean;
}
export interface AssignResponse {
  cluster?: number[];
  distances?: number[][];
  center_ids?: number[];
  score?: number[];
  anomaly?: number[];
  threshold?: number;
  coords?: number[][];
}

export interface ImageSetInfo { label: string; task: Task; emoji: string; blurb: string; params: Record<string, number> }

/** Per-model vision outputs (image datasets): galleries reference dataset image indices (GET /api/datasets/{dataset_id}/image/{i}) */
export interface VisionResult {
  image_shape: [number, number, number];
  dataset_id: string;
  mistakes: { i: number; true: string | number; pred: string | number; confidence?: number; error?: number }[];
  correct: { i: number; true: string | number; pred: string | number; confidence?: number; error?: number }[];
  /** torch models: |gradient| heat maps (H×W, 0..1) for a few test images */
  saliency?: { i: number; heat: number[][] }[];
  /** torch models: first conv layer kernels (k×k, 0..1), rgb when the input has 3 channels */
  filters?: { gray: number[][]; rgb?: number[][][] }[];
  /** torch models: first conv layer activations for one image (≤8 maps, 0..1) */
  feature_maps?: { i: number; maps: number[][][] };
  /** classic models: where in the picture the model looks (H×W, 0..1) */
  pixel_importance?: number[][];
  note?: string;
}
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
  /** only shown for these tasks (e.g. a regression-only loss) */
  tasks?: string[];
}

export interface DenseLayer { type: "dense"; units: number; activation: string; dropout?: number; batchnorm?: boolean }
export interface ConvLayer { type: "conv"; filters: number; kernel: number; activation: string; pool?: number; batchnorm?: boolean }
export type Layer = DenseLayer | ConvLayer;
export interface NNArch {
  kind: "mlp" | "cnn1d" | "cnn2d" | "ft_transformer" | "gcn" | "tiny_resnet" | "embedding_bag" | "gru" | "text_transformer";
  /** cnn2d: average each feature map over the image instead of flattening (position-independent) */
  global_pool?: boolean;
  /** tiny_resnet */
  width?: number; stages?: number; blocks?: number;
  layers?: Layer[];
  // ft_transformer
  d_token?: number; n_blocks?: number; n_heads?: number; ffn_mult?: number; dropout?: number;
  // gcn: hidden = layer sizes (text architectures store their head width as a number under the same key at runtime)
  k?: number; hidden?: number[]; activation?: string;
  /** text models */
  embed_dim?: number; heads?: number; vocab_size?: number; max_len?: number;  // (text "layers" count is stored under `layers` at runtime)
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
  /** data modalities this model supports (default tabular) */
  modalities?: Modality[];
}

export interface ModelConfig {
  key: string;
  model_id: string;
  params: Record<string, any>;
  nn_arch?: NNArch | null;
  /** binary classification: probability cut-off for the second class (default 0.5), applied when predicting */
  threshold?: number | null;
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
  source: "upload" | "synthetic" | "preset" | "sample" | "composed" | "image_set" | "text_set" | "ratings_set" | "timeseries_set" | "lesson";
  n_rows: number;
  n_cols: number;
  columns: ColumnSummary[];
  preview: { columns: string[]; rows: any[][] };
  n_duplicates?: number;
  modality?: Modality;
  n_images?: number;
  image_set?: string;
  warnings?: string[];
  task_hint?: Task;
  target_hint?: string;
  /** samples for unsupervised problems: the hidden comparison column */
  truth_hint?: string;
  /** text datasets: the column holding the text */
  text_column?: string;
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
  modality?: Modality;
  /** image datasets: dataset image indices per class (or lowest/middle/highest for regression) */
  samples?: Record<string, number[]>;
  /** image regression: target value per sample index */
  sample_values?: Record<string, number>;
  /** text datasets */
  text_column?: string;
  length_hist?: Histogram;
  top_words?: { class: string; words: { t: string; w: number }[] }[];
  examples?: Record<string, string[]>;
  /** ratings datasets */
  columns_roles?: { user?: string; item?: string; rating?: string; time?: string };
  n_users?: number;
  n_items?: number;
  sparsity?: number;
  rating_hist?: TopValues;
  per_user?: number[];
  per_user_edges?: number[];
  long_tail?: number[];
  top_items?: { item: string; ratings: number; title?: string; genre?: string }[];
  /** time-series datasets (modality=timeseries). columns_roles then holds { time, value, series } */
  columns?: { name: string; numeric: boolean; n_unique: number }[];
  /** numeric columns that could be used as known-in-advance extra inputs; `exog` = the dataset's suggestion */
  exog_candidates?: string[];
  exog?: string[];
  horizon_default?: number;
  freq?: string;
  unit?: string;
  season?: number;
  season_name?: string | null;
  n_series?: number;
  series_names?: string[];
  filled?: number;
  /** autocorrelation of the (first) series with itself k steps earlier */
  acf?: { lag: number; r: number }[];
  /** average (scaled) value at each position of the season, e.g. Mon…Sun */
  seasonal_profile?: { labels: string[]; values: number[]; name: string } | null;
  timeline?: { series: string; points: TsPoint[] }[];
  series?: { name: string; n: number; start: string; end: string; mean: number; min: number; max: number }[];
  value_stats?: { min: number; max: number; mean: number; missing: number };
  /** set when the chosen columns can't be prepared (e.g. series too short) */
  error?: string;
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
  /** null for unsupervised problems */
  target: string;
  task: Task | UnsupervisedTask;
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
  /** data modality (the backend dispatches image/text/ratings preparation on it) */
  modality?: Modality;
  /** ratings datasets: which columns hold user / item / rating / time; time series: time / value / series */
  columns?: { user?: string | null; item?: string | null; rating?: string | null; time?: string | null; value?: string | null; series?: string | null };
  /** forecasting: horizon (steps ahead), lag steps, rolling-mean windows, calendar flags, trend counter, differencing,
   *  log transform, known-in-advance extra columns. lags/windows null = automatic (1,2,3,season,2×season / season).
   *  The split uses split.method "time" (last stretch = test) or "random" (the leak). */
  forecast?: { horizon: number; lags: number[] | null; windows: number[] | null; calendar: boolean; trend: boolean; diff: boolean; log: boolean; exog: string[] };
  /** recommenders: filters, what counts as "liked", and how many recent ratings per user are held out */
  recsys?: { min_user: number; min_item: number; positive: number; test_k: number; split: "leave_last_out" | "random" };
  /** text datasets: which column holds the text, bag-of-words settings (ngram_max 1 = words, 2 = words + pairs),
   *  and the token sequence length used by neural text models */
  text?: { text_column: string | null; ngram_max: 1 | 2; max_features: number; min_df: number; max_len: number };
  /** unsupervised: hidden comparison column, and an optional held-out share */
  truth?: string | null;
  unsupervised?: { holdout: number };
  /** dimensionality reduction step after scaling/selection (fitted on training rows) */
  reduce?: { method: "none" | "pca"; n_components: number };
  /** image datasets: training resolution, colour, and on-the-fly augmentation (torch models only) */
  image?: { size: 16 | 24 | 32 | 48 | 64; grayscale: boolean; augment: { flip_h?: boolean; flip_v?: boolean; rotate?: number; shift?: number; brightness?: number; cutout?: boolean } };
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
  class_counts_val?: Record<string, number> | null;
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
  /** [h, w] for the legacy digits sample, [channels, height, width] for image datasets */
  image_shape: number[] | null;
  coach: Suggestion[];
  target_hist_train?: { values: number[] };
  duplicates_found?: number;
  features_created?: string[];
  split_info?: SplitInfo;
  modality?: Modality;
  /** image datasets: original + augmented variants (data URIs) for a few training images */
  augment_preview?: { i: number; original: string; variants: string[] }[];
  sample_images?: number[];
  /** time series (forecasting) */
  freq?: string;
  unit?: string;
  season?: number;
  season_name?: string | null;
  horizon?: number;
  lags_needed?: number;
  n_series?: number;
  series_names?: string[];
  n_steps?: number;
  filled?: number;
  forecast_config?: { lags: number[]; windows: number[]; calendar: boolean; trend: boolean; diff: boolean; log: boolean; exog: string[] };
  /** each series with every point tagged train / val / test (train part downsampled) */
  timeline?: { series: string; points: (TsPoint & { part: "train" | "val" | "test" })[] }[];
  acf?: { lag: number; r: number }[];
  seasonal_profile?: { labels: string[]; values: number[]; name: string } | null;
  /** plain-language meaning of each feature (calendar flags summarised in one row) */
  features_explained?: { name: string; explain: string }[];
  /** ratings datasets */
  n_users?: number;
  n_items?: number;
  sparsity?: number;
  rating_hist?: TopValues;
  long_tail?: number[];
  per_user_hist?: number[];
  positive?: number;
  test_k?: number;
  /** text datasets */
  text_column?: string;
  vocab_size?: number;
  length_hist?: Histogram;
  examples?: { text: string; label: string; tokens: string[] }[];
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
  /** custom decision threshold the model was trained with (binary classification) */
  threshold?: number | null;
  vision?: VisionResult | null;
  clusters?: ClusterResult | null;
  reduction?: ReductionResult | null;
  anomaly?: AnomalyResult | null;
  text?: TextResult | null;
  recsys?: RecsysResult | null;
  forecast?: ForecastResult | null;
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
  task: Task | UnsupervisedTask | null;
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
  /** data modality; absent = tabular */
  modality?: Modality;
  /** unsupervised projects: optional hidden column used only to judge the result (never shown to models) */
  truth?: string | null;
  /** set when the project was started from a lesson's practice challenge */
  challenge?: { lesson_id: string } | null;
  created_at: number;
  updated_at: number;
}

export interface InputSchemaItem {
  name: string;
  type: "numeric" | "categorical" | "datetime" | "text";
  /** datetime inputs: an example value from the training data */
  example?: string;
  min?: number; max?: number; median?: number; mean?: number; std?: number; integer?: boolean; binary?: boolean;
  categories?: string[]; mode?: string;
}

export interface SavedModel {
  id: string;
  threshold?: number | null;
  name: string;
  notes: string;
  task: Task | UnsupervisedTask;
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
  modality?: Modality;
  image_shape?: [number, number, number] | null;
  text_column?: string | null;
}

export interface PredictResponse { predictions: (string | number)[]; probabilities?: number[][]; classes?: string[] }
export interface ImagePredictResponse extends PredictResponse {
  /** what the model actually sees (resized/greyscaled), as a data URI */
  model_input: string;
  /** torch models: H×W heat map (0..1) of which pixels drove the answer */
  saliency?: number[][];
}
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
  /** "Darwin" | "Linux" | "Windows"; gpu = accelerator name or null */
  os?: string; gpu?: string | null;
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

/* ---- Labs (mlp/core/labs.py, mlp/api/labs.py) */
export interface LabInfo { label: string; emoji: string; blurb: string; kind: "server" | "client"; params?: Record<string, any> }
export interface LabsCatalog { labs: Record<string, LabInfo>; gan_targets: Record<string, string> }
/** `lab.frame` event payloads */
export interface GanFrame { step: number; steps: number; g_loss: number; d_loss: number; fake: [number, number][]; d_grid: number[][]; secs: number }
export interface VaeFrame { epoch: number; epochs: number; recon: number; kl: number; points: [number, number, number][]; secs: number }
export interface TransferFrame { run: "scratch" | "frozen" | "finetune"; epoch: number; epochs: number; loss: number; test_acc: number }
export interface GanResult {
  lab: "gan"; run_id: string; target: string; extent: number;
  /** x (= y) coordinates of the 25×25 discriminator grid; d_grid rows go from y = -extent (row 0) upward */
  grid_x: number[];
  real: [number, number][]; frames: GanFrame[];
  /** share of real points with a forged point nearby / forged points near real ones */
  coverage: number; precision: number;
}
export interface VaeResult {
  lab: "vae"; run_id: string; mode: "vae" | "ae"; frames: VaeFrame[];
  extent: { x: [number, number]; y: [number, number] };
  /** n×n decoded images over the map (row 0 = top = high y); each image = 64 values 0–1 (8×8, row-major) */
  grid: { n: number; images: number[][] };
  reconstructions: { digit: number; original: number[]; rebuilt: number[] }[];
}
export interface TransferRun { curve: { epoch: number; loss: number; test_acc: number }[]; final_acc: number; best_acc: number; trainable: number; examples: number[] }
export interface TransferResult {
  lab: "transfer"; run_id: string; per_class: number; n_train: number; n_test: number;
  runs: Record<"scratch" | "frozen" | "finetune", TransferRun>;
  /** test images with true labels; runs[x].examples[i] = that run's prediction for examples[i] */
  examples: { image: string; label: number }[];
}
