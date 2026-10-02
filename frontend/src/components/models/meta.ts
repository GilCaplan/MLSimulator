import { fullPipeline, modelConfigFor, useProject } from "../../lib/store";
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
];

export const familyOf = (id: string) => FAMILIES.find((f) => f.id === id);

export const FIRST_TRY = new Set(["logistic_regression", "linear_regression", "random_forest"]);

/** Models designed for pictures (shown first, as "Vision", in image projects). */
export const VISION_IDS = new Set(["cnn2d", "tiny_resnet"]);

export const modalityOf = (m?: Modality | null): Modality => m ?? "tabular";
export const specModalities = (s: ModelSpec): Modality[] => s.modalities ?? ["tabular"];

export function badgesFor(spec: ModelSpec, modality: Modality = "tabular"): { text: string; tone: "success" | "warning" | "accent" | "" }[] {
  const out: { text: string; tone: "success" | "warning" | "accent" | "" }[] = [];
  const image = modality === "image";
  if (image ? VISION_IDS.has(spec.id) && spec.id === "cnn2d" : FIRST_TRY.has(spec.id)) out.push({ text: "Great first try", tone: "success" });
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
