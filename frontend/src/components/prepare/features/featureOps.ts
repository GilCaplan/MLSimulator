import type { ColumnSummary, FeatureOp, FeatureStep } from "../../../lib/types";

export type DatePart = NonNullable<FeatureStep["parts"]>[number];

export interface OpMeta {
  op: FeatureOp;
  icon: string;
  label: string;
  /** short formula-ish description, e.g. "A ÷ B" */
  sign: string;
  /** tiny worked example shown on the gallery tile */
  example: [string, string];
  blurb: string;
  /** which kinds of input the op needs */
  needs: "date" | "two" | "one" | "none";
}

export const OPS: OpMeta[] = [
  { op: "date_parts", icon: "📅", label: "Date parts", sign: "date → parts", example: ["timestamp", "hour, weekday, month"], blurb: "Rush hours, weekends and seasons become numbers a model can use.", needs: "date" },
  { op: "ratio", icon: "🍕", label: "Ratio", sign: "A ÷ B", example: ["price ÷ size", "price per m²"], blurb: "Compare two numbers fairly — per person, per room, per hour.", needs: "two" },
  { op: "product", icon: "🔗", label: "Product", sign: "A × B", example: ["fare × paid_by_card", "tip base"], blurb: "An interaction: the effect of one column depends on another.", needs: "two" },
  { op: "difference", icon: "🆚", label: "Difference", sign: "A − B", example: ["sell − buy price", "profit"], blurb: "The gap between two readings often matters more than either one.", needs: "two" },
  { op: "log", icon: "🪵", label: "Log", sign: "log(1 + x)", example: ["income", "log income"], blurb: "Tames long tails, so a few huge values stop dominating.", needs: "one" },
  { op: "power", icon: "⚡", label: "Power", sign: "xᵖ", example: ["speed", "speed²  (≈ energy)"], blurb: "Curves: squares, square roots (p = 0.5) or 1/x (p = −1).", needs: "one" },
  { op: "bin", icon: "🪣", label: "Buckets", sign: "x → groups", example: ["age", "young · mid · senior"], blurb: "Cut a number into equal-sized groups — handy when only the range matters.", needs: "one" },
  { op: "formula", icon: "🧮", label: "Formula", sign: "anything", example: ["weight / height**2", "BMI"], blurb: "Write your own recipe with + − × ÷, powers and functions.", needs: "none" },
];

export const OP_META = Object.fromEntries(OPS.map((o) => [o.op, o])) as Record<FeatureOp, OpMeta>;

export const DATE_PARTS: { value: DatePart; label: string; hint: string }[] = [
  { value: "year", label: "Year", hint: "2024" },
  { value: "month", label: "Month", hint: "1–12" },
  { value: "day", label: "Day", hint: "1–31" },
  { value: "weekday", label: "Weekday", hint: "Mon = 0 … Sun = 6" },
  { value: "hour", label: "Hour", hint: "0–23" },
  { value: "dayofyear", label: "Day of year", hint: "1–366" },
  { value: "is_weekend", label: "Weekend?", hint: "0 / 1" },
];
export const DEFAULT_PARTS: DatePart[] = ["month", "weekday", "hour"];

/** Mirrors `default_name` in mlp/core/features.py. */
export function defaultName(s: FeatureStep): string {
  switch (s.op) {
    case "ratio": return `${s.a}_per_${s.b}`;
    case "product": return `${s.a}_x_${s.b}`;
    case "difference": return `${s.a}_minus_${s.b}`;
    case "log": return `log_${s.column}`;
    case "power": return `${s.column}_pow${s.p ?? 2}`;
    case "bin": return `${s.column}_bucket`;
    case "formula": return "custom_feature";
    default: return `${s.column}_${s.op}`;
  }
}

/** Names of the columns a step will create (same rules as the backend). */
export function outputNames(s: FeatureStep): string[] {
  if (s.op === "date_parts") return (s.parts?.length ? s.parts : DEFAULT_PARTS).map((p) => `${s.column}_${p}`);
  return [String(s.name || defaultName(s)).trim()];
}

/** Columns this step removes from the model inputs. */
export function droppedSources(s: FeatureStep): string[] {
  if (s.op === "date_parts") return s.drop_source !== false && s.column ? [s.column] : [];
  if ((s.op === "log" || s.op === "power" || s.op === "bin") && s.drop_source && s.column) return [s.column];
  return [];
}

export const supportsDrop = (op: FeatureOp) => op === "date_parts" || op === "log" || op === "power" || op === "bin";

/** Client-side completeness check — a step that isn't filled in yet isn't sent to the preview. */
export function incomplete(s: FeatureStep): string | null {
  switch (s.op) {
    case "date_parts": return !s.column ? "Pick a date column." : !(s.parts?.length) ? "Pick at least one part." : null;
    case "ratio": case "product": case "difference": return !s.a || !s.b ? "Pick two columns." : null;
    case "log": case "power": case "bin": return !s.column ? "Pick a column." : null;
    case "formula": return !(s.expr || "").trim() ? "Write a formula." : !(s.name || "").trim() ? "Give the feature a name." : null;
  }
}

/** Number of model inputs a step adds after encoding (one-hot buckets count once per bucket). */
export function estimateOutputs(s: FeatureStep, onehot: boolean): number {
  if (s.op === "date_parts") return (s.parts?.length ? s.parts : DEFAULT_PARTS).length;
  if (s.op === "bin") return onehot ? Math.max(2, s.bins ?? 4) : 1;
  return 1;
}

export const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The functions allowed in formulas (mlp/util/safe_expr.py, minus noise()). */
export const FUNCTIONS: { sig: string; insert: string; help: string }[] = [
  { sig: "log(x)", insert: "log()", help: "natural log (of |x|)" },
  { sig: "sqrt(x)", insert: "sqrt()", help: "square root (of |x|)" },
  { sig: "abs(x)", insert: "abs()", help: "absolute value" },
  { sig: "exp(x)", insert: "exp()", help: "exponential" },
  { sig: "min(a, b)", insert: "min(, )", help: "the smaller one" },
  { sig: "max(a, b)", insert: "max(, )", help: "the larger one" },
  { sig: "clip(x, lo, hi)", insert: "clip(, 0, 1)", help: "limit to a range" },
  { sig: "where(cond, a, b)", insert: "where(, 1, 0)", help: "a if cond else b" },
  { sig: "step(x, t)", insert: "step(, 0)", help: "1 if x > t else 0" },
  { sig: "sigmoid(x)", insert: "sigmoid()", help: "squash to 0…1" },
  { sig: "tanh(x)", insert: "tanh()", help: "squash to −1…1" },
  { sig: "sin(x)", insert: "sin()", help: "sine (cycles)" },
  { sig: "cos(x)", insert: "cos()", help: "cosine (cycles)" },
];

/** A fresh step for an op, pre-filled with the most plausible columns. */
export function newStep(op: FeatureOp, numeric: string[], dates: string[]): FeatureStep {
  const [a, b] = numeric;
  switch (op) {
    case "date_parts": return { op, column: dates[0] ?? "", parts: [...DEFAULT_PARTS], drop_source: true };
    case "ratio": case "product": case "difference": return { op, a: a ?? "", b: b ?? a ?? "" };
    case "log": return { op, column: a ?? "", drop_source: false };
    case "power": return { op, column: a ?? "", p: 2, drop_source: false };
    case "bin": return { op, column: a ?? "", bins: 4, drop_source: false };
    case "formula": return { op, expr: a && b ? `${a} / ${b}` : a ? `${a} * 2` : "", name: "custom_feature" };
  }
}

/** Numeric dataset columns usable as feature inputs. */
export function numericColumns(cols: ColumnSummary[]) {
  return cols.filter((c) => c.role === "numeric").map((c) => c.name);
}
