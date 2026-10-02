import { api } from "../../lib/api";
import { modelConfigFor, useProject } from "../../lib/store";
import type { ModelConfig, Project, Task } from "../../lib/types";

export interface Template {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  task: Task;
  sample?: string;
  preset?: string;
  models: string[];
  tint: string;
}

export const TEMPLATES: Template[] = [
  { id: "iris", emoji: "🌸", title: "Iris flowers", blurb: "Tell three species apart from petal and sepal sizes. The classic first project.", task: "classification", sample: "iris",
    models: ["logistic_regression", "random_forest", "knn"], tint: "rgba(255,55,95,.16)" },
  { id: "fraud", emoji: "💳", title: "Card fraud — imbalanced", blurb: "Catch the rare fraudulent payments hiding among thousands of normal ones.", task: "classification", sample: "fraud",
    models: ["logistic_regression", "xgboost", "random_forest"], tint: "rgba(255,159,10,.18)" },
  { id: "housing", emoji: "🏡", title: "House prices", blurb: "Predict a home's price from its size, rooms, area and age.", task: "regression", sample: "housing",
    models: ["linear_regression", "random_forest", "xgboost"], tint: "rgba(48,209,88,.16)" },
  { id: "digits", emoji: "✍️", title: "Handwritten digits with a CNN", blurb: "Teach an image network to read tiny 8×8 handwritten numbers.", task: "classification", sample: "digits",
    models: ["cnn2d", "mlp", "random_forest"], tint: "rgba(10,132,255,.16)" },
  { id: "moons", emoji: "🌙", title: "Two moons playground", blurb: "Two interlocking crescents — watch each model draw its own boundary.", task: "classification", preset: "moons",
    models: ["svm", "mlp", "decision_tree"], tint: "rgba(191,90,242,.16)" },
];

/** Create a ready-to-train project: dataset loaded, target set, models picked. Returns the saved project. */
export async function createFromTemplate(t: Template): Promise<Project> {
  const st = useProject.getState();
  const registry = await st.ensureRegistry();
  let dataset;
  if (t.sample) dataset = await api.sample(t.sample);
  else {
    const catalog = await st.ensureCatalog();
    dataset = await api.preset(t.preset!, catalog.presets[t.preset!]?.params ?? {});
  }
  const models: ModelConfig[] = t.models
    .map((id) => registry.find((s) => s.id === id))
    .filter((s) => !!s)
    .map((s) => modelConfigFor(s!));
  const created = await api.createProject({ name: t.title, task: t.task, emoji: t.emoji });
  return api.saveProject({
    ...created,
    task: t.task,
    emoji: t.emoji,
    dataset_id: dataset.id,
    target: dataset.target_hint ?? null,
    models,
    step: "models",
  });
}
