import { useProject } from "../../../lib/store";
import type { DatasetSummary, PipelineSpec } from "../../../lib/types";

export type TextSpec = NonNullable<PipelineSpec["text"]>;
export const DEFAULT_TEXT: TextSpec = { text_column: null, ngram_max: 1, max_features: 3000, min_df: 2, max_len: 40 };

/** Same rule as the backend tokenizer (mlp/core/text.py): lower-case runs of letters, digits and apostrophes. */
export function tokenize(text: string): string[] {
  return String(text ?? "").toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

const LABEL_NAMES = /^(label|labels|class|category|target|sentiment|y|tag|topic|team|intent|spam)$/i;

/** Average words per value of each string column, from the dataset's preview rows. */
function previewWordCounts(d: DatasetSummary): Record<string, number> {
  const out: Record<string, number> = {};
  const { columns, rows } = d.preview ?? { columns: [], rows: [] };
  columns.forEach((c, k) => {
    const vals = rows.map((r) => r[k]).filter((v) => typeof v === "string") as string[];
    if (vals.length) out[c] = vals.reduce((a, v) => a + tokenize(v).length, 0) / vals.length;
  });
  return out;
}

/** Columns that could hold text (strings), longest first. */
export function textCandidates(d: DatasetSummary, exclude?: string | null): string[] {
  const words = previewWordCounts(d);
  return d.columns
    .filter((c) => c.name !== exclude && (c.role === "text" || c.role === "categorical" || c.role === "id") && !c.dtype.startsWith("int") && !c.dtype.startsWith("float"))
    .map((c) => c.name)
    .sort((a, b) => (words[b] ?? 0) - (words[a] ?? 0));
}

/** The dataset's own text column, else the string column with the longest values. */
export function guessTextColumn(d: DatasetSummary, exclude?: string | null): string | null {
  if (d.text_column && d.columns.some((c) => c.name === d.text_column) && d.text_column !== exclude) return d.text_column;
  return textCandidates(d, exclude)[0] ?? null;
}

/** Columns that could be the label: few distinct values, not the text itself. */
export function labelCandidates(d: DatasetSummary, textCol: string | null): string[] {
  return d.columns.filter((c) => c.name !== textCol && c.role !== "text" && c.unique >= 2 && c.unique <= Math.max(50, d.n_rows * 0.05)).map((c) => c.name);
}

export function guessLabel(d: DatasetSummary, textCol: string | null, keep?: string | null): string | null {
  const names = d.columns.map((c) => c.name);
  if (keep && names.includes(keep) && keep !== textCol) return keep;
  if (d.target_hint && names.includes(d.target_hint) && d.target_hint !== textCol) return d.target_hint;
  const cands = labelCandidates(d, textCol);
  return cands.find((c) => LABEL_NAMES.test(c)) ?? cands.sort((a, b) => (d.columns.find((c) => c.name === a)!.unique - d.columns.find((c) => c.name === b)!.unique))[0]
    ?? names.filter((n) => n !== textCol).pop() ?? null;
}

/** The text settings currently saved in the project (merged over the defaults). */
export function textSpecOf(pipeline: Partial<PipelineSpec> | null | undefined): TextSpec {
  return { ...DEFAULT_TEXT, ...(pipeline?.text ?? {}) };
}

/** Make a freshly loaded dataset the project's texts: pick the text + label columns, reset everything downstream. */
export function adoptTextDataset(d: DatasetSummary) {
  const s = useProject.getState();
  s.setDataset(d);
  s.setProfile(null);
  s.setReport(null);
  const textCol = guessTextColumn(d);
  const target = guessLabel(d, textCol);
  s.update({ dataset_id: d.id, target, pipeline: { text: { ...DEFAULT_TEXT, text_column: textCol } }, prepared_id: null });
}

/** Change the text column (keeps the other text settings, invalidates preparation). */
export function setTextColumn(col: string) {
  const s = useProject.getState();
  const p = s.project;
  if (!p) return;
  const cur = (p.pipeline ?? {}) as Partial<PipelineSpec>;
  s.update({ pipeline: { ...cur, text: { ...textSpecOf(cur), text_column: col } }, prepared_id: null });
  s.setReport(null);
}

/** Change the label column; text settings survive, everything else in the recipe is reset. */
export function setTextLabel(col: string) {
  const s = useProject.getState();
  const p = s.project;
  if (!p || col === p.target) return;
  s.update({ target: col, pipeline: { text: textSpecOf(p.pipeline) }, prepared_id: null });
  s.setReport(null);
}

/** Share of the texts with at most `n` words, read off a length histogram. */
export function shareWithin(hist: { edges: number[]; counts: number[] } | undefined | null, n: number): number {
  if (!hist || !hist.counts.length) return 1;
  const total = hist.counts.reduce((a, b) => a + b, 0) || 1;
  let inside = 0;
  hist.counts.forEach((c, k) => {
    const lo = hist.edges[k], hi = hist.edges[k + 1];
    if (hi <= n) inside += c;
    else if (lo < n) inside += c * ((n - lo) / (hi - lo || 1));
  });
  return Math.min(1, inside / total);
}

/** Mean and max text length from a histogram. */
export function lengthStats(hist: { edges: number[]; counts: number[] } | undefined | null) {
  if (!hist || !hist.counts.length) return null;
  const total = hist.counts.reduce((a, b) => a + b, 0) || 1;
  const mean = hist.counts.reduce((a, c, k) => a + c * (hist.edges[k] + hist.edges[k + 1]) / 2, 0) / total;
  return { mean, max: hist.edges[hist.edges.length - 1], min: hist.edges[0], total };
}
