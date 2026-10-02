import { fullPipeline, isUnsupervised, useProject } from "../../lib/store";
import { droppedSources, estimateOutputs } from "./features/featureOps";
import type { ColumnSummary, DatasetSummary, PipelineSpec, PrepareReport, Project } from "../../lib/types";

/** Partial patch for one top-level pipeline section (objects merge, scalars/arrays replace). */
export type SectionPatch<K extends keyof PipelineSpec> =
  PipelineSpec[K] extends any[] ? PipelineSpec[K] : PipelineSpec[K] extends object ? Partial<PipelineSpec[K]> : PipelineSpec[K];

/** Write a change to one pipeline section and invalidate the prepared data. */
export function patchPipeline<K extends keyof PipelineSpec>(key: K, value: SectionPatch<K>) {
  const st = useProject.getState();
  const p = st.project;
  if (!p) return;
  const cur = (p.pipeline || {}) as Record<string, any>;
  const prev = cur[key as string];
  const next = value && typeof value === "object" && !Array.isArray(value) ? { ...(prev || {}), ...(value as object) } : value;
  st.update({ pipeline: { ...cur, [key]: next } as Partial<PipelineSpec>, prepared_id: null });
}

export interface PrepCtx {
  project: Project;
  spec: PipelineSpec;
  dataset: DatasetSummary | null;
  report: PrepareReport | null;
  /** feature columns (not target), whether ignored or not */
  columns: ColumnSummary[];
  /** columns the pipeline will actually use */
  used: ColumnSummary[];
  targetCol: ColumnSummary | undefined;
  isClf: boolean;
  /** clustering / reduction / anomaly: no target; `truth` (if any) is hidden from the models */
  unsup: boolean;
}

export const AUTO_IGNORED = new Set<ColumnSummary["role"]>(["id", "text", "datetime"]);

/** Everything the stage cards need, derived from the stores. Returns null until the project has a target. */
export function usePrepCtx(): PrepCtx | null {
  const project = useProject((s) => s.project);
  const dataset = useProject((s) => s.dataset);
  const report = useProject((s) => s.report);
  if (!project) return null;
  const spec = fullPipeline(project);
  if (!spec) return null;
  const ds = dataset && dataset.id === project.dataset_id ? dataset : null;
  const columns = (ds?.columns || []).filter((c) => c.name !== spec.target && c.name !== spec.truth);
  const drop = new Set(spec.drop_columns);
  // engineered features may drop their source; a group split hides the group column from the models
  for (const st of spec.features || []) droppedSources(st).forEach((c) => drop.add(c));
  if (spec.split.method === "group" && spec.split.group_column) drop.add(spec.split.group_column);
  const used = columns.filter((c) => !drop.has(c.name) && !AUTO_IGNORED.has(c.role));
  return {
    project, spec, dataset: ds, report, columns, used,
    targetCol: ds?.columns.find((c) => c.name === spec.target),
    isClf: spec.task === "classification",
    unsup: isUnsupervised(spec.task),
  };
}

/** Rough count of model inputs after encoding (before feature selection). */
export function estimateFeatures(ctx: PrepCtx): number {
  let n = 0;
  for (const c of ctx.used) {
    if (c.role === "numeric") n += 1;
    else n += ctx.spec.encode.method === "ordinal" ? 1 : Math.max(1, Math.min(c.unique, Math.max(2, ctx.spec.encode.max_categories)));
  }
  for (const st of ctx.spec.features || []) n += estimateOutputs(st, ctx.spec.encode.method === "onehot");
  return Math.max(1, n);
}

/** Class counts in the training split: from the last report, else estimated from the dataset summary. */
export function trainClassCounts(ctx: PrepCtx): Record<string, number> | null {
  if (ctx.report?.class_counts_before && ctx.report.task === "classification") return ctx.report.class_counts_before;
  const top = ctx.targetCol?.top;
  if (!top) return null;
  const frac = Math.max(0.05, 1 - ctx.spec.split.test_size - ctx.spec.split.val_size);
  const out: Record<string, number> = {};
  top.labels.forEach((l, i) => (out[String(l)] = Math.round(top.counts[i] * frac)));
  return out;
}

export const MODELS_NEED_SCALING = new Set([
  "svm", "svr", "knn", "logistic_regression", "ridge", "lasso", "elastic_net", "mlp", "cnn1d", "cnn2d", "ft_transformer", "gcn",
  // unsupervised models that measure distances or spread
  "kmeans", "gmm", "dbscan", "agglomerative", "pca", "tsne", "one_class_svm", "lof",
]);

export const fmtInt = (n: number) => Math.round(n).toLocaleString();
