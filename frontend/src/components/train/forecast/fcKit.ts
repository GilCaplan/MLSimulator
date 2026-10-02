/* Shared helpers for forecasting views (train results, library playground, improve). */
import type { ModelResult, RunResult } from "../../../lib/types";
import { fmt } from "../../../lib/format";
import { baselineOf } from "../util";

/** The reference every forecast should beat (mlp/core/trainer.py run_forecast_baseline, or the learner's own copy). */
export const BASELINE_ID = "fc_seasonal_naive";

/** The "same as last season" result of a run: the automatic baseline row, or the learner's own seasonal-naive model. */
export function seasonalRef(result: RunResult): ModelResult | undefined {
  return baselineOf(result) ?? Object.values(result.models).find((m) => m.model_id === BASELINE_ID);
}

/** What one season is called for each step unit (day → week: next Monday looks like last Monday). */
export const SEASON_OF: Record<string, string> = { hour: "day", day: "week", week: "year", month: "year", quarter: "year" };
export const seasonName = (unit?: string | null) => SEASON_OF[unit ?? ""] ?? "season";

/** "same as last week" — the plain name of the seasonal-naive rule for this unit. */
export const lastSeason = (unit?: string | null) => `same as last ${seasonName(unit)}`;

const DOW: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const MON: Record<string, string> = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
const PREV: Record<string, string> = { hour: "the hour before", day: "yesterday", week: "last week", month: "last month", quarter: "last quarter", year: "last year", step: "the step before" };
const SAME: Record<string, string> = { hour: "same hour yesterday", day: "same day last week", week: "same week last year", month: "same month last year", quarter: "same quarter last year" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Known-in-advance extra columns in plain words. */
export function exogName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("promo")) return "promotion planned";
  if (n.includes("holiday")) return "holiday planned";
  if (n.includes("temp")) return "temperature (forecast)";
  if (n.includes("price")) return "planned price";
  return `${name} (known in advance)`;
}

/** lag_7 → "same day last week", dow_Sat → "is it Saturday?", promo → "promotion planned", series_Store A → "which shop: Store A". */
export function plainFeature(name: string, unit = "day", season = 7): string {
  const u = unit === "step" ? "step" : unit;
  let m = /^lag_(\d+)$/.exec(name);
  if (m) {
    const k = Number(m[1]);
    if (k === 1) return PREV[u] ?? "the step before";
    if (k === season && SAME[u]) return SAME[u];
    if (k === 2 * season && SAME[u]) return SAME[u].replace(/last (\w+)/, "two $1s ago");
    return `${plural(k, u)} earlier`;
  }
  m = /^mean_(\d+)$/.exec(name);
  if (m) return `average of the last ${plural(Number(m[1]), u)}`;
  m = /^dow_(\w+)$/.exec(name);
  if (m) return `is it ${DOW[m[1]] ?? m[1]}?`;
  m = /^hour_(\d+)$/.exec(name);
  if (m) return `is it ${m[1]}:00?`;
  m = /^month_(\w+)$/.exec(name);
  if (m) return `is it ${MON[m[1]] ?? m[1]}?`;
  m = /^Q(\d)$/.exec(name);
  if (m) return `is it quarter ${m[1]}?`;
  if (name === "trend") return "steady time counter (trend)";
  m = /^series_(.+)$/.exec(name);
  if (m) return /store|shop/i.test(m[1]) ? `which shop: ${m[1]}` : `which series: ${m[1]}`;
  return exogName(name);
}

/** Group a feature into the family it belongs to (for colours and the summary chips). */
export function featureGroup(name: string): { key: string; label: string; color: string } {
  if (name.startsWith("lag_")) return { key: "lag", label: "past values", color: "#0A84FF" };
  if (name.startsWith("mean_")) return { key: "mean", label: "rolling averages", color: "#64D2FF" };
  if (/^(dow_|hour_|month_|Q\d$)/.test(name)) return { key: "cal", label: "calendar", color: "#BF5AF2" };
  if (name === "trend") return { key: "trend", label: "trend", color: "#30D158" };
  if (name.startsWith("series_")) return { key: "series", label: "which series", color: "#8E8E93" };
  return { key: "exog", label: "known in advance", color: "#FF9F0A" };
}

/** MASE in words: "28% better than same as last week". */
export function masePhrase(mase: number | null | undefined, unit?: string | null): { text: string; good: boolean } | null {
  if (mase === null || mase === undefined || !Number.isFinite(mase)) return null;
  const d = Math.round((1 - mase) * 100);
  if (Math.abs(d) < 2) return { text: `about the same as “${lastSeason(unit)}”`, good: false };
  return d > 0 ? { text: `${d}% better than “${lastSeason(unit)}”`, good: true } : { text: `${-d}% worse than “${lastSeason(unit)}”`, good: false };
}

/** How each kind of forecaster works, for models without feature importance. */
export const HOW_IT_WORKS: Record<string, string> = {
  naive: "It simply repeats the last value it saw for every future step. No features at all — that's why it's a baseline.",
  seasonal_naive: "It copies the last full cycle: next Monday is forecast to be exactly like last Monday. It uses no features — just the calendar rhythm of the data. Every real model should beat it.",
  moving_average: "It averages the most recent values and draws a flat line at that level. It ignores rhythms and trends entirely.",
  holt_winters: "It keeps three running numbers — the current level, the trend and a repeating seasonal pattern — and nudges each one a little after every new value. It reads only the series itself, not your extra columns or calendar flags.",
  gru: "A recurrent neural network reads the recent window step by step, keeping a small memory of what came before, then combines that memory with calendar flags and extra columns to guess the next value. Its reasoning is spread across thousands of weights, so there's no simple importance list.",
};

/** Kinds whose forecast can't use extra columns (promotions, temperature…). */
export const IGNORES_EXOG = new Set(["naive", "seasonal_naive", "moving_average", "holt_winters"]);

/* ------------------------------------------------------------------ time axis */

/** Time value (ISO date / "YYYY-MM-DD HH:MM" / step number) → a number for the x axis. */
export function tNum(t: string | number): number {
  if (typeof t === "number") return t;
  const v = Date.parse(t.length <= 10 ? `${t}T00:00:00` : t.replace(" ", "T"));
  return Number.isFinite(v) ? v : Number(t);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short label for a time point, suited to the series' rhythm. */
export function fmtT(t: string | number, unit?: string | null, long = false): string {
  if (typeof t === "number" && (unit === "step" || t < 1e9)) return `step ${fmt(t, 0)}`;
  const d = new Date(tNum(t));
  if (Number.isNaN(d.getTime())) return String(t);
  if (unit === "hour") return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2, "0")}:00`;
  if (unit === "month" || unit === "quarter") return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (unit === "year") return String(d.getFullYear());
  return long ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Axis tick label (shorter than fmtT). */
export function tickT(t: number, unit?: string | null): string {
  if (unit === "step" || t < 1e9) return fmt(t, 0);
  const d = new Date(t);
  if (unit === "hour") return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, "0")}h`;
  if (unit === "month" || unit === "quarter" || unit === "year") return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "28 days", "48 hours". */
export const stepsText = (n: number, unit?: string | null) => plural(n, unit && unit !== "step" ? unit : "step");

/** Value in the series' own units ("1,234" / "45.6"). */
export const fmtV = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : fmt(v, 1);
