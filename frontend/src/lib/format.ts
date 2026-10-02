export const fmt = (v: number | null | undefined, digits = 3) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2);
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return Number(v.toFixed(digits)).toString();
};

export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;

export const secs = (s: number | null | undefined) => {
  if (s === null || s === undefined) return "—";
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
};

export const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);

export const timeAgo = (t: number) => {
  const d = Date.now() / 1000 - t;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(t * 1000).toLocaleDateString();
};

export const METRIC_LABELS: Record<string, string> = {
  accuracy: "Accuracy",
  balanced_accuracy: "Balanced accuracy",
  precision: "Precision",
  recall: "Recall",
  f1: "F1 (macro)",
  f1_weighted: "F1 (weighted)",
  roc_auc: "ROC-AUC",
  avg_precision: "Avg precision",
  log_loss: "Log loss",
  mcc: "MCC",
  r2: "R²",
  mae: "MAE",
  rmse: "RMSE",
  mape: "MAPE",
  explained_variance: "Explained var.",
};

export const METRIC_HELP: Record<string, string> = {
  accuracy: "Share of predictions that were right.",
  balanced_accuracy: "Average accuracy per class — fair when classes are imbalanced.",
  precision: "When it says 'yes', how often is it right?",
  recall: "Of all real 'yes' cases, how many did it catch?",
  f1: "Balance of precision and recall (higher is better).",
  roc_auc: "How well it ranks positives above negatives (0.5 = random, 1 = perfect).",
  log_loss: "Penalty for confident wrong answers (lower is better).",
  mcc: "Correlation between predictions and truth (−1…1).",
  r2: "Share of the target's variation explained (1 = perfect, 0 = no better than the average).",
  mae: "Average size of the error, in target units (lower is better).",
  rmse: "Like MAE but punishes big errors more (lower is better).",
  mape: "Average error as a percentage of the true value.",
};

export const LOWER_IS_BETTER = new Set(["log_loss", "mae", "rmse", "mape"]);
