import { fullPipeline, isUnsupervised, modelConfigFor, useProject } from "../../lib/store";
import type { Modality, ModelConfig, ModelSpec, Task } from "../../lib/types";

/** Display order + one-line plain-language explanation for each model family. */
export const FAMILIES: { id: string; icon: string; blurb: string }[] = [
  { id: "Linear", icon: "📏", blurb: "Weighted sums of your features — fast, transparent, a great baseline." },
  { id: "Kernel", icon: "🌀", blurb: "Bend the space so a simple boundary can separate tricky shapes." },
  { id: "Instance", icon: "👥", blurb: "No formula at all — they look up the most similar past examples." },
  { id: "Probabilistic", icon: "🎲", blurb: "Use probability rules to weigh up the evidence for each answer." },
  { id: "Tree", icon: "🌳", blurb: "A flowchart of yes/no questions you can actually read." },
  { id: "Ensemble", icon: "🌲", blurb: "Many trees vote together — sturdier than any single one." },
  { id: "Boosting", icon: "🚀", blurb: "Trees built one after another, each fixing the last one's mistakes." },
  { id: "Neural", icon: "🧠", blurb: "Layers of neurons you design yourself — flexible, data-hungry, fun to watch." },
  // unsupervised families (no answer column)
  { id: "Clustering", icon: "🫧", blurb: "Sort rows into groups of look-alikes — nobody tells them what the groups should be." },
  { id: "Reduction", icon: "🗺️", blurb: "Squash many columns down to a 2-D map you can actually look at." },
  { id: "Anomaly", icon: "🚨", blurb: "Learn what 'normal' looks like, then flag the rows that don't fit." },
];

/** Plain-language "when to use it" line for the unsupervised models. */
export const UNSUP_HINTS: Record<string, string> = {
  kmeans: "Best for round, similar-sized groups. You choose how many (k).",
  gmm: "Like K-Means with soft, stretchy blobs — rows can half-belong to two groups.",
  dbscan: "Finds odd-shaped groups and leaves loners out as noise. No k needed.",
  agglomerative: "Builds a family tree of rows, then cuts it into k branches.",
  pca: "Fast and faithful: keeps the straight-line directions with the most spread.",
  tsne: "Beautiful maps of local neighbourhoods — far-apart distances mean little.",
  isolation_forest: "Quick, robust all-rounder. Odd rows are easy to cut off from the rest.",
  lof: "Spots rows sitting in emptier places than their neighbours.",
  one_class_svm: "Wraps a smooth fence around normal data; works best on smaller tables.",
};

/** One-click starter line-ups for the unsupervised problems. */
export const UNSUP_STARTER: Record<string, string[]> = {
  clustering: ["kmeans", "gmm", "dbscan"],
  reduction: ["pca", "tsne"],
  anomaly: ["isolation_forest", "lof", "one_class_svm"],
};

export const familyOf = (id: string) => FAMILIES.find((f) => f.id === id);

export const FIRST_TRY = new Set(["logistic_regression", "linear_regression", "random_forest", "kmeans", "pca", "isolation_forest"]);

/** Models designed for pictures (shown first, as "Vision", in image projects). */
export const VISION_IDS = new Set(["cnn2d", "tiny_resnet"]);

export const modalityOf = (m?: Modality | null): Modality => m ?? "tabular";
export const specModalities = (s: ModelSpec): Modality[] => s.modalities ?? ["tabular"];

export function badgesFor(spec: ModelSpec, modality: Modality = "tabular"): { text: string; tone: "success" | "warning" | "accent" | "" }[] {
  const out: { text: string; tone: "success" | "warning" | "accent" | "" }[] = [];
  const image = modality === "image";
  if (image ? VISION_IDS.has(spec.id) && spec.id === "cnn2d" : FIRST_TRY.has(spec.id)) out.push({ text: "Great first try", tone: "success" });
  if (spec.id === "dbscan") out.push({ text: "Finds k itself", tone: "accent" });
  if (spec.id === "tsne") out.push({ text: "Slow on big data", tone: "warning" });
  if (image && VISION_IDS.has(spec.id)) out.push({ text: "Built for pictures", tone: "accent" });
  if (!image && spec.requires === "image") out.push({ text: "Needs image data", tone: "warning" });
  if (spec.nn && !(image && VISION_IDS.has(spec.id))) out.push({ text: "Neural network", tone: "accent" });
  return out;
}

export const BEGINNER: Record<Task, string[]> = {
  classification: ["logistic_regression", "decision_tree", "random_forest"],
  regression: ["linear_regression", "decision_tree", "random_forest"],
};

/** Image projects: two real vision networks plus a classic "pixels as a table" baseline to beat. */
export const BEGINNER_IMAGE: Record<Task, string[]> = {
  classification: ["cnn2d", "tiny_resnet", "logistic_regression"],
  regression: ["cnn2d", "tiny_resnet", "ridge"],
};

/** Starter line-up for any problem: beginner trio, vision starter or the unsupervised quick pick. */
export function starterFor(task: string, image: boolean): string[] {
  if (isUnsupervised(task)) return UNSUP_STARTER[task] ?? [];
  const t = task as Task;
  return (image ? BEGINNER_IMAGE : BEGINNER)[t] ?? [];
}

/** Does this model solve the given problem? (registry tasks may include unsupervised ones) */
export const specFits = (s: ModelSpec, task: string) => (s.tasks as string[]).includes(task);

/** "Random Forest", "Random Forest #2", … — copies numbered by their order in the line-up. */
export function lineupLabels(models: ModelConfig[], spec: (id: string) => ModelSpec | undefined): Record<string, string> {
  const seen: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const m of models) total[m.model_id] = (total[m.model_id] || 0) + 1;
  const out: Record<string, string> = {};
  for (const m of models) {
    const n = (seen[m.model_id] = (seen[m.model_id] || 0) + 1);
    const base = spec(m.model_id)?.label ?? m.model_id;
    out[m.key] = total[m.model_id] > 1 && n > 1 ? `${base} #${n}` : base;
  }
  return out;
}

export function configsFor(ids: string[], registry: ModelSpec[], keep: ModelConfig[] = []): ModelConfig[] {
  return ids
    .map((id) => keep.find((m) => m.model_id === id) ?? (registry.find((s) => s.id === id) ? modelConfigFor(registry.find((s) => s.id === id)!) : null))
    .filter((m): m is ModelConfig => !!m);
}

/** Best guess of the network's input/output sizes given what we know about the data so far. */
export function useIoShape(task: Task | null | undefined) {
  const report = useProject((s) => s.report);
  const dataset = useProject((s) => s.dataset);
  const profile = useProject((s) => s.profile);
  const project = useProject((s) => s.project);
  const target = project?.target;
  const image = modalityOf(project?.modality) === "image";
  let nFeatures = 8;
  let known = false;
  let imageShape: number[] | null = report?.image_shape ?? dataset?.image_shape ?? null;
  if (image) {
    // what the model will see: the Prepare step's resolution and colour (C×H×W)
    const img = (project && fullPipeline(project)?.image) || project?.pipeline?.image || { size: 32, grayscale: false };
    const rs = report?.image_shape as number[] | null | undefined;
    const fromReport = rs && rs.length === 3 ? rs : null;
    imageShape = fromReport ?? [img.grayscale ? 1 : 3, img.size, img.size];
    nFeatures = imageShape.reduce((a, b) => a * b, 1);
    known = !!fromReport;
  } else if (report?.n_features) {
    nFeatures = report.n_features;
    known = true;
  } else if (dataset) {
    nFeatures = Math.max(1, dataset.columns.filter((c) => c.name !== target && c.role !== "id" && c.role !== "text").length);
  }
  let nOut = task === "regression" ? 1 : 2;
  if (task !== "regression") {
    const targetCol = dataset?.columns.find((c) => c.name === target);
    if (report?.classes?.length) nOut = report.classes.length;
    else if (profile?.class_balance?.labels.length) nOut = profile.class_balance.labels.length + (profile.class_balance.other > 0 ? 1 : 0);
    else if (targetCol && targetCol.unique > 1 && targetCol.unique <= 50) nOut = targetCol.unique;
  }
  return { nFeatures, nOut, known, imageShape, image };
}

export const ACTIVATIONS = ["relu", "gelu", "tanh", "sigmoid", "leaky_relu", "elu", "silu"].map((a) => ({ value: a, label: a }));
