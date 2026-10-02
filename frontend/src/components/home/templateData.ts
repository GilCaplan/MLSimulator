import { api } from "../../lib/api";
import { modelConfigFor, useProject } from "../../lib/store";
import type { Modality, ModelConfig, Project, Task } from "../../lib/types";

export interface Template {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  task: Task;
  sample?: string;
  preset?: string;
  /** synthetic image set (POST /datasets/image-set) — makes this an image project */
  imageSet?: string;
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
    models: ["logistic_regression", "xgboost", "random_forest"], tint: "rgba(255,159,10,.18)" },
  { id: "housing", emoji: "🏡", title: "House prices", blurb: "Predict a home's price from its size, rooms, area and age.", task: "regression", sample: "housing",
    models: ["linear_regression", "random_forest", "xgboost"], tint: "rgba(48,209,88,.16)" },
  { id: "digits", emoji: "✍️", title: "Handwritten digits with a CNN", blurb: "Teach an image network to read tiny 8×8 handwritten numbers.", task: "classification", sample: "digits",
    models: ["cnn2d", "mlp", "random_forest"], tint: "rgba(10,132,255,.16)" },
  { id: "shapes", emoji: "🔺", title: "Shapes with a CNN", blurb: "Circles, squares, triangles and stars anywhere in the picture. Watch a CNN beat pixel-counting models.", task: "classification",
    imageSet: "shapes", modality: "image", target: "label", models: ["cnn2d", "tiny_resnet", "logistic_regression"], tint: "rgba(255,159,10,.18)" },
  { id: "count_dots", emoji: "🎲", title: "Count the dots", blurb: "Predict how many dots are in a picture — regression straight from pixels.", task: "regression",
    imageSet: "count_dots", modality: "image", target: "value", models: ["cnn2d", "random_forest"], tint: "rgba(100,210,255,.18)" },
  { id: "moons", emoji: "🌙", title: "Two moons playground", blurb: "Two interlocking crescents — watch each model draw its own boundary.", task: "classification", preset: "moons",
    models: ["svm", "mlp", "decision_tree"], tint: "rgba(191,90,242,.16)" },
];

/** Create a ready-to-train project: dataset loaded, target set, models picked. Returns the saved project. */
export async function createFromTemplate(t: Template): Promise<Project> {
  const st = useProject.getState();
  const registry = await st.ensureRegistry();
  let dataset;
  if (t.imageSet) dataset = await api.createImageSet(t.imageSet);
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
  return api.saveProject({
    ...created,
    task: t.task,
    emoji: t.emoji,
    modality,
    dataset_id: dataset.id,
    target: t.target ?? dataset.target_hint ?? null,
    models,
    step: "models",
  });
}
