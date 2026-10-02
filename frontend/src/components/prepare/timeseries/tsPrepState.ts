import type { DatasetProfile, PipelineSpec } from "../../../lib/types";
import { autoLags, autoWindows, minSeriesLen, type ForecastSpec } from "../../data/timeseries/tsData";
import { patchPipeline } from "../state";

export const DEFAULT_FORECAST: ForecastSpec = { horizon: 14, lags: null, windows: null, calendar: true, trend: false, diff: false, log: false, exog: [] };

export type TsStageId = "horizon" | "split" | "features";

export const TS_STAGES: { id: TsStageId; icon: string; name: string }[] = [
  { id: "horizon", icon: "🔭", name: "Horizon" },
  { id: "split", icon: "✂️", name: "Split" },
  { id: "features", icon: "🧩", name: "Clues" },
];

export const fcOf = (spec: PipelineSpec | null | undefined): ForecastSpec => ({ ...DEFAULT_FORECAST, ...(spec?.forecast ?? {}) });
export const splitOf = (spec: PipelineSpec | null | undefined): "time" | "random" => (spec?.split?.method === "random" ? "random" : "time");

/** Write part of the forecasting settings (invalidates the prepared data). */
export function patchForecast(spec: PipelineSpec, patch: Partial<ForecastSpec>) {
  patchPipeline("forecast", { ...fcOf(spec), ...patch });
}

export function setSplitMethod(method: "time" | "random") {
  patchPipeline("split", { method });
}

/** What the timeline allows: the shortest series, the season, the unit and the biggest sensible horizon / lag. */
export interface TsLimits { n: number; season: number; unit: string; seasonName: string | null; maxHorizon: number; maxLag: number; freq: string }
export function limitsOf(profile: DatasetProfile | null): TsLimits {
  const n = minSeriesLen(profile) || 200;
  return {
    n,
    season: profile?.season ?? 1,
    unit: profile?.unit ?? "step",
    seasonName: profile?.season_name ?? null,
    freq: profile?.freq ?? "step",
    maxHorizon: Math.max(1, Math.floor(n / 5)),
    // the backend ignores lags / windows of n/3 and more
    maxLag: Math.max(1, Math.ceil(n / 3) - 1),
  };
}

/** The lags / windows that will actually be used (automatic → the backend's rule). */
export const effLags = (fc: ForecastSpec, lim: TsLimits) => (fc.lags ?? autoLags(lim.season, lim.n)).filter((k) => k > 0 && k <= lim.maxLag);
export const effWindows = (fc: ForecastSpec, lim: TsLimits) => (fc.windows ?? autoWindows(lim.season, lim.n)).filter((w) => w > 1 && w <= lim.maxLag);

export function tsStageState(id: TsStageId, spec: PipelineSpec, lim: TsLimits): { state: string; active: boolean } {
  const fc = fcOf(spec);
  switch (id) {
    case "horizon": return { state: `${Math.min(fc.horizon, lim.maxHorizon)} ${lim.unit}${fc.horizon === 1 ? "" : "s"} ahead`, active: true };
    case "split": return { state: splitOf(spec) === "time" ? "last stretch" : "random rows ⚠️", active: true };
    case "features": {
      const n = effLags(fc, lim).length + effWindows(fc, lim).length + (fc.calendar ? 1 : 0) + (fc.trend ? 1 : 0) + fc.exog.length;
      return { state: `${n} clue${n === 1 ? "" : "s"}${fc.diff ? " · Δ" : ""}${fc.log ? " · log" : ""}`, active: true };
    }
  }
}
