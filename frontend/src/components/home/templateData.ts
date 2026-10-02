import { api } from "../../lib/api";
import { isUnsupervised, modelConfigFor, useProject } from "../../lib/store";
import type { CSSProperties } from "react";
import type { Modality, ModelConfig, PipelineSpec, Project, Task, UnsupervisedTask } from "../../lib/types";

export interface Template {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  task: Task | UnsupervisedTask;
  sample?: string;
  /** unsupervised: hidden comparison column (defaults to the dataset's truth hint) */
  truth?: string;
  preset?: string;
  /** synthetic image set (POST /datasets/image-set) — makes this an image project */
  imageSet?: string;
  /** synthetic text set (POST /datasets/text-set) — makes this a text project */
  textSet?: string;
  /** synthetic ratings set (POST /datasets/ratings-set) — makes this a recommendation project */
  ratingsSet?: string;
  /** synthetic time-series set (POST /datasets/timeseries-set) — makes this a forecasting project */
  timeseriesSet?: string;
  /** preset preparation (column roles, forecast settings…) */
  pipeline?: Partial<PipelineSpec>;
  modality?: Modality;
  /** target column (defaults to the dataset's hint) */
  target?: string;
  models: string[];
  tint: string;
}

export const TEMPLATES: Template[] = [
  { id: "iris", emoji: "🌸", title: "Iris flowers", blurb: "Tell three species apart from petal and sepal sizes. The classic first project.", task: "classification", sample: "iris",
    models: ["logistic_regression", "random_forest", "knn"], tint: "rgba(255,55,95,.16)" },
  { id: "fraud", emoji: "💳", title: "Card fraud — imbalanced", blurb: "Catch the rare fraudulent payments hiding among thousands of normal ones.", task: "classification", sample: "fraud",
    models: ["logistic_regression", "xgboost", "random_forest"], tint: "color-mix(in srgb, var(--warning) 18%, transparent)" },
  { id: "housing", emoji: "🏡", title: "House prices", blurb: "Predict a home's price from its size, rooms, area and age.", task: "regression", sample: "housing",
    models: ["linear_regression", "random_forest", "xgboost"], tint: "color-mix(in srgb, var(--success) 16%, transparent)" },
  { id: "digits", emoji: "✍️", title: "Handwritten digits with a CNN", blurb: "Teach an image network to read tiny 8×8 handwritten numbers.", task: "classification", sample: "digits",
    models: ["cnn2d", "mlp", "random_forest"], tint: "rgba(10,132,255,.16)" },
  { id: "shapes", emoji: "🔺", title: "Shapes with a CNN", blurb: "Circles, squares, triangles and stars anywhere in the picture. Watch a CNN beat pixel-counting models.", task: "classification",
    imageSet: "shapes", modality: "image", target: "label", models: ["cnn2d", "tiny_resnet", "logistic_regression"], tint: "color-mix(in srgb, var(--warning) 18%, transparent)" },
  { id: "count_dots", emoji: "🎲", title: "Count the dots", blurb: "Predict how many dots are in a picture — regression straight from pixels.", task: "regression",
    imageSet: "count_dots", modality: "image", target: "value", models: ["cnn2d", "random_forest"], tint: "rgba(100,210,255,.18)" },
  { id: "reviews", emoji: "💬", title: "Review sentiment (text)", blurb: "Read product reviews and tell happy from unhappy. Can a model learn that “not bad” is good?", task: "classification",
    textSet: "reviews", modality: "text", target: "sentiment", models: ["logistic_regression", "multinomial_nb", "gru"], tint: "color-mix(in srgb, var(--success) 16%, transparent)" },
  { id: "tickets", emoji: "🎫", title: "Support ticket routing", blurb: "Send each customer message to the right team — billing, technical, shipping or account — from its words alone.", task: "classification",
    textSet: "tickets", modality: "text", target: "team", models: ["logistic_regression", "multinomial_nb", "text_transformer"], tint: "rgba(94,92,230,.16)" },
  { id: "segments", emoji: "🛍️", title: "Shopping segments", blurb: "No labels at all: let the models discover the natural groups of shoppers — then peek at the real segments.", task: "clustering",
    sample: "customers", truth: "segment", models: ["kmeans", "gmm", "dbscan"], tint: "rgba(255,214,10,.2)" },
  { id: "faults", emoji: "🏭", title: "Factory faults", blurb: "Learn what a healthy machine looks like and flag the sensor readings that don't fit.", task: "anomaly",
    sample: "sensors", truth: "status", models: ["isolation_forest", "lof", "one_class_svm"], tint: "color-mix(in srgb, var(--danger) 14%, transparent)" },
  { id: "movies", emoji: "🎬", title: "Movie night (recommendations)", blurb: "800 viewers, 400 films, thousands of star ratings. Build a recommender that knows what you'll want to watch next.", task: "recommendation",
    ratingsSet: "movies", modality: "ratings", models: ["popularity", "item_knn", "mf_als"], tint: "rgba(94,92,230,.18)" },
  { id: "shop_sales", emoji: "🛒", title: "Shop sales forecast", blurb: "Two years of daily sales for 3 shops. Forecast the next 4 weeks — and see what a promotion would do.", task: "forecasting",
    timeseriesSet: "store_sales", modality: "timeseries", models: ["fc_holt_winters", "fc_gbm", "fc_linear"], tint: "rgba(100,210,255,.2)",
    pipeline: { modality: "timeseries", columns: { time: "date", value: "sales", series: "store" },
      forecast: { horizon: 28, lags: null, windows: null, calendar: true, trend: false, diff: false, log: false, exog: ["promo"] } } },
  { id: "moons", emoji: "🌙", title: "Two moons playground", blurb: "Two interlocking crescents — watch each model draw its own boundary.", task: "classification", preset: "moons",
    models: ["svm", "mlp", "decision_tree"], tint: "rgba(191,90,242,.16)" },
];

/** Create a ready-to-train project: dataset loaded, target set, models picked. Returns the saved project. */
export async function createFromTemplate(t: Template): Promise<Project> {
  const st = useProject.getState();
  const registry = await st.ensureRegistry();
  let dataset;
  if (t.timeseriesSet) dataset = await api.createTimeseriesSet(t.timeseriesSet);
  else if (t.ratingsSet) dataset = await api.createRatingsSet(t.ratingsSet);
  else if (t.imageSet) dataset = await api.createImageSet(t.imageSet);
  else if (t.textSet) dataset = await api.createTextSet(t.textSet);
  else if (t.sample) dataset = await api.sample(t.sample);
  else {
    const catalog = await st.ensureCatalog();
    dataset = await api.preset(t.preset!, catalog.presets[t.preset!]?.params ?? {});
  }
  const models: ModelConfig[] = t.models
    .map((id) => registry.find((s) => s.id === id))
    .filter((s) => !!s)
    .map((s) => modelConfigFor(s!));
  const modality: Modality = t.modality ?? "tabular";
  const created = await api.createProject({ name: t.title, task: t.task, emoji: t.emoji, modality });
  const unsup = isUnsupervised(t.task);
  const noTarget = unsup || t.task === "recommendation" || t.task === "forecasting";
  return api.saveProject({
    ...created,
    task: t.task,
    emoji: t.emoji,
    modality,
    dataset_id: dataset.id,
    target: noTarget ? null : t.target ?? dataset.target_hint ?? null,
    ...(unsup ? { truth: t.truth ?? dataset.truth_hint ?? null } : {}),
    // the synthetic ratings set always has these roles; the Data step can still change them
    ...(t.pipeline ? { pipeline: t.pipeline } : {}),
    ...(t.ratingsSet ? { pipeline: { modality: "ratings" as const, columns: { user: "user", item: "item", rating: "rating", time: "day" } } } : {}),
    models,
    step: "models",
  });
}

/** Badge text + colours for a project's task (cards and templates). */
export const TASK_BADGE: Record<string, { label: string; icon: string; cls?: string; style?: CSSProperties }> = {
  classification: { label: "Classification", icon: "🏷️", cls: "accent" },
  regression: { label: "Regression", icon: "📈", style: { background: "color-mix(in srgb, var(--accent-2) 16%, transparent)", color: "var(--accent-2)" } },
  clustering: { label: "Clustering", icon: "🫧", cls: "warning" },
  reduction: { label: "Data map", icon: "🗺️", cls: "success" },
  anomaly: { label: "Anomaly", icon: "🚨", cls: "danger" },
  recommendation: { label: "Recommender", icon: "🎬", style: { background: "rgba(94,92,230,.16)", color: "color-mix(in srgb, #5E5CE6 72%, var(--text))" } },
  forecasting: { label: "Forecasting", icon: "⏱️", style: { background: "color-mix(in srgb, #64D2FF 22%, transparent)", color: "var(--text)" } },
};
