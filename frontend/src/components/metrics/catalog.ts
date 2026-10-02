/* The built-in metrics a custom score can be made from, with one-line plain-language meanings, plus ready-made templates. */

export type SupervisedTask = "classification" | "regression";

export interface MetricInfo {
  key: string;
  label: string;
  /** one line, plain language */
  short: string;
  lower: boolean;
  /** extra metrics (fit time, size) aren't about the answers themselves */
  extra?: boolean;
}

const REG: MetricInfo[] = [
  { key: "mae", label: "MAE", short: "Average miss, in your target's units.", lower: true },
  { key: "rmse", label: "RMSE", short: "Like MAE, but big misses count extra.", lower: true },
  { key: "mse", label: "MSE", short: "Average squared miss — RMSE before the square root. Huge misses dominate.", lower: true },
  { key: "median_ae", label: "Median miss", short: "The typical miss: half the guesses are closer than this.", lower: true },
  { key: "max_error", label: "Worst miss", short: "The single biggest miss on the test rows.", lower: true },
  { key: "mape", label: "MAPE", short: "Average miss as a share of the true value (0.1 = 10% off).", lower: true },
  { key: "r2", label: "R²", short: "Share of the ups and downs explained (1 = perfect, 0 = guessing the average).", lower: false },
  { key: "explained_variance", label: "Explained var.", short: "Like R², but ignores a constant offset in the guesses.", lower: false },
];

const CLS: MetricInfo[] = [
  { key: "accuracy", label: "Accuracy", short: "Share of answers that were right.", lower: false },
  { key: "balanced_accuracy", label: "Balanced accuracy", short: "Accuracy averaged per class — fair when one answer is rare.", lower: false },
  { key: "precision", label: "Precision", short: "When it names a class, how often is it right? (averaged over classes)", lower: false },
  { key: "recall", label: "Recall", short: "Of the real cases of each class, how many did it catch?", lower: false },
  { key: "f1", label: "F1", short: "Precision and recall rolled into one (macro average).", lower: false },
  { key: "f1_weighted", label: "F1 (weighted)", short: "F1 where common classes count more.", lower: false },
  { key: "mcc", label: "MCC", short: "Correlation between answers and truth (−1…1); honest with rare classes.", lower: false },
  { key: "roc_auc", label: "ROC-AUC", short: "How well it ranks the right answer above the wrong ones (needs probabilities).", lower: false },
  { key: "avg_precision", label: "Avg precision", short: "How clean the most confident “yes” answers are (yes/no problems, needs probabilities).", lower: false },
  { key: "log_loss", label: "Log loss", short: "Penalty for confident wrong answers (needs probabilities).", lower: true },
];

const EXTRA: MetricInfo[] = [
  { key: "fit_time", label: "Fit time", short: "Seconds the model took to learn.", lower: true, extra: true },
  { key: "n_params", label: "Parameters", short: "How many numbers the model learned (neural networks only).", lower: true, extra: true },
];

export const catalogFor = (task: string | null | undefined): MetricInfo[] =>
  task === "regression" ? [...REG, ...EXTRA] : task === "classification" ? [...CLS, ...EXTRA] : [];

export const infoOf = (task: string | null | undefined, key: string): MetricInfo | undefined => catalogFor(task).find((m) => m.key === key);

/** Custom metrics only make sense for problems with answers to compare against (classification / regression). */
export const supportsCustom = (task: string | null | undefined): task is SupervisedTask => task === "classification" || task === "regression";

/** Why a metric can be missing for a model, in plain words. */
export function whyMissing(name: string, scope: "test" | "train", label: string): string {
  if (scope === "train" && name !== "fit_time" && name !== "n_params") return `No training-row ${label} was recorded for this model.`;
  if (name === "roc_auc" || name === "log_loss") return `${label} needs probabilities, and this model only gives answers.`;
  if (name === "avg_precision") return `${label} is only measured for yes/no problems with probabilities.`;
  if (name === "mape") return "MAPE is skipped when many true values are zero (dividing by zero).";
  if (name === "n_params") return "Only neural networks report how many parameters they learned.";
  return `${label} isn't available for this model.`;
}

export interface Template { name: string; formula: string; better: "lower" | "higher"; task: SupervisedTask | "any"; why: string }

export const TEMPLATES: Template[] = [
  { name: "2×MAE + MSE", formula: "2*mae + mse", better: "lower", task: "regression", why: "Typical misses matter, and big misses matter even more." },
  { name: "Worst miss matters", formula: "0.5*rmse + 0.5*max_error", better: "lower", task: "regression", why: "Half the everyday error, half the single worst miss — for when one disaster is unacceptable." },
  { name: "Typical miss, robust", formula: "median_ae + 0.1*max_error", better: "lower", task: "regression", why: "Ignores a few odd rows, but still keeps an eye on the worst one." },
  { name: "Balanced precision & recall", formula: "(precision + recall) / 2", better: "higher", task: "classification", why: "False alarms and misses weigh the same." },
  { name: "Accuracy with a speed penalty", formula: "accuracy - 0.01*fit_time", better: "higher", task: "classification", why: "Each second of training costs one point of accuracy per hundred." },
  { name: "Overfit gap", formula: "train.accuracy - test.accuracy", better: "lower", task: "classification", why: "How much better it does on rows it practised on — smaller means it learned, not memorised." },
  { name: "R² with a speed penalty", formula: "r2 - 0.01*fit_time", better: "higher", task: "regression", why: "Each second of training costs 0.01 of R²." },
  { name: "Overfit gap (R²)", formula: "train.r2 - test.r2", better: "lower", task: "regression", why: "How much better it explains the practice rows than new ones." },
];

export const templatesFor = (task: SupervisedTask) => TEMPLATES.filter((t) => t.task === task || t.task === "any");
