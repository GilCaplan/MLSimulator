import { colorAt } from "../../../lib/colors";
import { useProject } from "../../../lib/store";
import type { DatasetProfile, DatasetSummary, PipelineSpec, Project, TsPoint } from "../../../lib/types";

export type TsRoleId = "time" | "value" | "series";
/** series = null means "one single series" (sent to the backend as "none") */
export type TsRoles = { time: string | null; value: string | null; series: string | null };
export type ForecastSpec = NonNullable<PipelineSpec["forecast"]>;

export const TS_ROLES: { id: TsRoleId; icon: string; label: string; help: string; optional?: boolean }[] = [
  { id: "time", icon: "🕒", label: "Time", help: "When each value was measured — dates, timestamps or plain step numbers (1, 2, 3…). The steps should be evenly spaced: every hour, day, week or month." },
  { id: "value", icon: "📈", label: "Value to forecast", help: "The number you want to predict into the future — sales, visitors, demand, passengers…" },
  { id: "series", icon: "🏪", label: "Series", help: "Optional: a column that splits the data into several side-by-side series (one per shop, product or sensor). One model learns from all of them at once.", optional: true },
];


const isNone = (v?: string | null) => !v || v === "none";

/** The roles saved in the project (if they still fit the dataset), else the profile's guess. */
export function tsRolesOf(project: Project, dataset: DatasetSummary | null, profile: DatasetProfile | null): TsRoles {
  const names = new Set(dataset?.columns.map((c) => c.name) ?? []);
  const ok = (v?: string | null) => !!v && (!dataset || names.has(v));
  const saved = project.pipeline?.columns;
  if (saved && ok(saved.time) && ok(saved.value)) {
    return { time: saved.time!, value: saved.value!, series: !isNone(saved.series) && ok(saved.series) ? saved.series! : null };
  }
  const g = profile?.modality === "timeseries" ? (profile.columns_roles as Partial<TsRoles> | undefined) : undefined;
  if (g && ok(g.time) && ok(g.value)) return { time: g.time!, value: g.value!, series: !isNone(g.series) && ok(g.series) ? g.series! : null };
  return { time: null, value: null, series: null };
}

export const tsRolesReady = (r: TsRoles) => !!r.time && !!r.value && r.time !== r.value && r.series !== r.time && r.series !== r.value;

/** Does this profile describe these roles? */
export function tsProfileFits(p: DatasetProfile | null, r: TsRoles): p is DatasetProfile {
  const c = p?.columns_roles as Partial<TsRoles> | undefined;
  if (!p || p.modality !== "timeseries" || !c) return false;
  return c.time === r.time && c.value === r.value && (isNone(c.series) ? null : c.series) === r.series;
}

/** Profile query for these roles (series "none" so the dataset's built-in series column isn't used behind our back). */
export const tsProfileQuery = (r: TsRoles) => ({ modality: "timeseries", time_col: r.time, value_col: r.value, series_col: r.series ?? "none" });

/** Columns as the backend expects them (series "none" = a single series). */
export const tsColumns = (r: TsRoles): NonNullable<PipelineSpec["columns"]> => ({ time: r.time, value: r.value, series: r.series ?? "none" });

/** Make a freshly loaded dataset the project's series: reset everything downstream, seed roles / horizon / extra columns. */
export function adoptTsDataset(d: DatasetSummary, preset?: { columns?: { time: string; value: string; series?: string }; horizon?: number; exog?: string[] }) {
  const s = useProject.getState();
  s.setDataset(d);
  s.setProfile(null);
  s.setReport(null);
  const keep = (s.project?.pipeline ?? {}) as Partial<PipelineSpec>;
  const horizon = preset?.horizon ?? d.horizon;
  const exog = preset?.exog ?? d.exog ?? [];
  const pipeline: Partial<PipelineSpec> = {
    modality: "timeseries",
    ...(keep.split ? { split: keep.split } : {}),
    forecast: { ...(keep.forecast ?? {}), horizon: horizon ?? 14, exog, lags: null, windows: null } as ForecastSpec,
  };
  if (preset?.columns) pipeline.columns = { time: preset.columns.time, value: preset.columns.value, series: preset.columns.series ?? "none" };
  s.update({ dataset_id: d.id, target: null, truth: null, pipeline, prepared_id: null });
}

/** Give a column a role; if another role had that column, the two swap. */
export function setTsRole(roles: TsRoles, role: TsRoleId, col: string | null) {
  const s = useProject.getState();
  const p = s.project;
  if (!p) return;
  const next: TsRoles = { ...roles, [role]: col };
  if (col) for (const r of Object.keys(roles) as TsRoleId[]) if (r !== role && roles[r] === col) next[r] = r === "series" ? null : roles[role];
  const cur = (p.pipeline ?? {}) as Partial<PipelineSpec>;
  // a column can't be both a role and an extra input; lags/windows depend on the series length → back to automatic
  const fc = cur.forecast ? { ...cur.forecast, exog: (cur.forecast.exog ?? []).filter((c) => c !== next.time && c !== next.value && c !== next.series), lags: null, windows: null } : undefined;
  s.update({ pipeline: { ...cur, modality: "timeseries", columns: tsColumns(next), ...(fc ? { forecast: fc as ForecastSpec } : {}) }, prepared_id: null });
  s.setReport(null);
}

/* ------------------------------------------------------------------ time & wording helpers */

/** Milliseconds (dates) or the raw step number. */
export function tNum(t: string | number): number {
  if (typeof t === "number") return t;
  const s = t.length <= 10 ? `${t}T00:00` : t.replace(" ", "T");
  const v = Date.parse(s);
  return Number.isNaN(v) ? Number(t) : v;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Tick formatter suited to the visible span (ms timestamps, or step numbers when `isDate` is false). */
export function timeFmt(span: number, isDate: boolean): (v: number) => string {
  if (!isDate) return (v) => String(Math.round(v));
  const day = 86400000;
  if (span > 3 * 365 * day) return (v) => String(new Date(v).getFullYear());
  if (span > 75 * day) return (v) => { const d = new Date(v); return `${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; };
  if (span > 4 * day) return (v) => { const d = new Date(v); return `${d.getDate()} ${MON[d.getMonth()]}`; };
  return (v) => { const d = new Date(v); return `${DOW[d.getDay()]} ${String(d.getHours()).padStart(2, "0")}h`; };
}

/** A friendly label for one time value. */
export function fmtTime(t: string | number, freq?: string): string {
  if (typeof t === "number") return `step ${t}`;
  const v = tNum(t);
  return Number.isNaN(v) ? String(t) : fmtMs(v, freq);
}

/** A friendly label for a timestamp in ms. */
export function fmtMs(v: number, freq?: string): string {
  const d = new Date(v);
  if (freq === "hour") return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:00`;
  if (freq === "month" || freq === "quarter") return `${MON[d.getMonth()]} ${d.getFullYear()}`;
  if (freq === "year") return String(d.getFullYear());
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

export const isDateSeries = (pts: TsPoint[]) => pts.length > 0 && typeof pts[0].t === "string";

export const plural = (n: number, unit: string) => `${n.toLocaleString()} ${unit}${n === 1 ? "" : "s"}`;

const FREQ_WORD: Record<string, string> = { hour: "Hourly", day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly", step: "Evenly spaced steps" };
export const freqWord = (f?: string) => (f ? FREQ_WORD[f] ?? f : "—");

/** "same day last week", "yesterday", "5 days ago" … for a lag of k steps. */
export function lagWords(k: number, unit = "step", season = 1, seasonName?: string | null): string {
  const sn = seasonName ?? "season";
  if (season > 1 && k === season) return `same ${unit} last ${sn}`;
  if (season > 1 && k === 2 * season) return `same ${unit}, 2 ${sn}s ago`;
  if (season > 1 && k % season === 0) return `same ${unit}, ${k / season} ${sn}s ago`;
  if (k === 1) return unit === "day" ? "yesterday" : unit === "hour" ? "an hour ago" : unit === "step" ? "the step before" : `last ${unit}`;
  return `${k} ${unit}s ago`;
}

/** The backend's automatic lags (mlp/core/forecast.py `_auto_lags`). */
export function autoLags(season: number, n: number): number[] {
  const lags = [1, 2, 3, ...(season > 3 ? [season] : []), ...(season > 1 && 2 * season < n / 4 ? [2 * season] : [])];
  return [...new Set(lags.filter((k) => k < n / 4))].sort((a, b) => a - b);
}

/** The backend's automatic rolling-mean windows. */
export function autoWindows(season: number, n: number): number[] {
  return (season > 2 ? [season] : [3]).filter((w) => w > 1 && w < n / 3);
}

/** The shortest series' length (lags, windows and the horizon are limited by it). */
export const minSeriesLen = (p: DatasetProfile | null | undefined) => (p?.series?.length ? Math.min(...p.series.map((s) => s.n)) : 0);

export const fmtVal = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
  if (a >= 100) return Math.round(v).toLocaleString();
  return Number(v.toPrecision(3)).toString();
};

/** Series colours (also used for small multiples). */
export const seriesColor = (i: number) => colorAt(i);
/** Split part colours, shared by the Prepare timeline, the split illustration and the results. */
export const partColor = (part: "train" | "val" | "test") => colorAt(part === "train" ? 0 : part === "val" ? 4 : 3);
