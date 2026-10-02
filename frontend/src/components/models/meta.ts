import { modelConfigFor, useProject } from "../../lib/store";
import type { ModelConfig, ModelSpec, Task } from "../../lib/types";

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

export function badgesFor(spec: ModelSpec): { text: string; tone: "success" | "warning" | "accent" | "" }[] {
  const out: { text: string; tone: "success" | "warning" | "accent" | "" }[] = [];
  if (FIRST_TRY.has(spec.id)) out.push({ text: "Great first try", tone: "success" });
  if (spec.requires === "image") out.push({ text: "Needs image data", tone: "warning" });
  if (spec.nn) out.push({ text: "Neural network", tone: "accent" });
  return out;
}

export const BEGINNER: Record<Task, string[]> = {
  classification: ["logistic_regression", "decision_tree", "random_forest"],
  regression: ["linear_regression", "decision_tree", "random_forest"],
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
  const target = useProject((s) => s.project?.target);
  let nFeatures = 8;
  let known = false;
  if (report?.n_features) {
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
  const imageShape = report?.image_shape ?? dataset?.image_shape ?? null;
  return { nFeatures, nOut, known, imageShape };
}

export const ACTIVATIONS = ["relu", "gelu", "tanh", "sigmoid", "leaky_relu", "elu", "silu"].map((a) => ({ value: a, label: a }));
