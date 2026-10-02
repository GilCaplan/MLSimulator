import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { ForecastResult, ModelResult } from "../../../lib/types";
import { LineChart, useSize, type Series } from "../../charts";
import { AnimatedNumber, InfoTip, Segmented, Toggle, Tooltip } from "../../glass";
import { fmtMetric, metricHelp, metricLabel, vsBaseline } from "../util";
import { FC_COLORS, ForecastChart, ForecastLegend } from "./ForecastChart";
import { HOW_IT_WORKS, IGNORES_EXOG, featureGroup, fmtV, lastSeason, masePhrase, plainFeature, seasonName, stepsText } from "./fcKit";

export type FcTab = "forecast" | "growth" | "uses" | "curve" | "settings";

/* ------------------------------------------------------------------ headline tiles */

/** MAE in the value's units, MASE vs "same as last season", the one-step contrast, bias — optionally vs the baseline. */
export function ForecastTiles({ metrics, fc, reference, refLabel }: { metrics: Record<string, number>; fc?: ForecastResult | null; reference?: Record<string, number> | null; refLabel?: string }) {
  const unit = fc?.unit ?? "day";
  const random = fc?.split === "random";
  const vn = fc?.value_name ?? "units";
  const mp = masePhrase(metrics.mase, unit);
  const tiles: { k: string; label: string; value: number; format: (v: number) => string; says: ReactNode; tone?: string }[] = [];
  if (metrics.mae !== undefined) tiles.push({ k: "mae", label: random ? "Average miss (one step)" : "Average miss", value: metrics.mae, format: (v) => fmtV(v),
    says: <>{vn} off per {unit}, {random ? "guessing one step at a time" : <>over a {stepsText(metrics.horizon ?? fc?.horizon ?? 0, unit)} forecast</>}</> });
  if (metrics.mase !== undefined) tiles.push({ k: "mase", label: "vs " + lastSeason(unit), value: metrics.mase, format: (v) => v.toFixed(2),
    says: mp ? mp.text : "", tone: mp?.good ? "var(--success)" : "var(--warning)" });
  if (!random && metrics.one_step_mae !== undefined) tiles.push({ k: "one_step_mae", label: "If it always knew yesterday", value: metrics.one_step_mae, format: (v) => fmtV(v),
    says: metrics.mae ? <>one step ahead it misses by {fmtV(metrics.one_step_mae)} — {metrics.mae > metrics.one_step_mae * 1.05 ? `errors grow ${(metrics.mae / metrics.one_step_mae).toFixed(1)}× over the forecast` : "barely worse further out"}</> : "" });
  if (metrics.bias !== undefined) tiles.push({ k: "bias", label: "Bias", value: metrics.bias, format: (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtV(Math.abs(v))}`,
    says: Math.abs(metrics.bias) < 0.15 * (metrics.mae || 1) ? "no consistent lean — good" : metrics.bias > 0 ? "forecasts run too high on average" : "forecasts run too low on average" });
  if (metrics.smape !== undefined) tiles.push({ k: "smape", label: "Typical % error", value: metrics.smape, format: (v) => `${(v * 100).toFixed(1)}%`, says: "average miss as a share of the value" });
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
      {tiles.map((t, i) => {
        const ref = reference?.[t.k];
        const vs = ref !== undefined && t.k !== "bias" && t.k !== "mase" ? vsBaseline(t.k, t.value, ref) : null;
        return (
          <motion.div key={t.k} className="inset col" initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.gentle, delay: i * 0.04 }} style={{ padding: 12, gap: 3 }}>
            <span className="row small muted" style={{ gap: 5 }}><span className="truncate">{t.label}</span>{metricHelp(t.k, "forecasting") && <InfoTip text={metricHelp(t.k, "forecasting")} />}</span>
            <b style={{ fontSize: 24, letterSpacing: "-0.02em", color: t.tone }} className="num"><AnimatedNumber value={t.value} format={t.format} /></b>
            <span className="tiny" style={{ color: "var(--text-2)", lineHeight: 1.35 }}>{t.says}</span>
            {vs && (
              <span className="tiny num" style={{ color: vs.delta > 0 ? "var(--success)" : vs.delta < 0 ? "var(--danger)" : "var(--text-3)" }}>
                🎯 {refLabel ?? lastSeason(unit)} {fmtMetric(t.k, ref)} · {vs.text}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ tabs */

export function forecastTabs(d: Partial<ModelResult>, opts: { settings: boolean; baseline?: boolean }): { value: FcTab; label: string; disabled?: boolean }[] {
  const fc = d.forecast;
  const tabs: { value: FcTab; label: string; disabled?: boolean }[] = [
    { value: "forecast", label: "📈 Forecast", disabled: !fc?.series?.length },
    { value: "growth", label: "📏 Error growth", disabled: !fc || fc.split === "random" || !fc.mase_by_step?.length },
  ];
  if (opts.baseline) return tabs;
  tabs.push({ value: "uses", label: "🧩 What it uses", disabled: !fc });
  if (d.curve?.points?.length) tabs.push({ value: "curve", label: "Learning curve" });
  if (opts.settings) tabs.push({ value: "settings", label: "Settings" });
  return tabs;
}

/** The forecasting tabs (train detail and library performance). */
export function ForecastViews({ detail, metrics, settings, baseline, height = 300 }: { detail: Partial<ModelResult>; metrics: Record<string, number>; settings?: ReactNode; baseline?: boolean; height?: number }) {
  const tabs = forecastTabs(detail, { settings: !!settings, baseline });
  const first = tabs.find((t) => !t.disabled)?.value ?? "forecast";
  const [tab, setTab] = useState<FcTab>(first);
  useEffect(() => {
    const t = tabs.find((x) => x.value === tab);
    if (!t || t.disabled) setTab(first);
  }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps
  const fc = detail.forecast;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div style={{ overflowX: "auto" }}>
        <Segmented value={tab} onChange={setTab} options={tabs} size="sm" />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "forecast" && fc && <ForecastTab fc={fc} metrics={metrics} height={height} />}
          {tab === "growth" && fc && <ErrorGrowth fc={fc} metrics={metrics} />}
          {tab === "uses" && fc && <WhatItUses fc={fc} />}
          {tab === "curve" && detail.curve && <FcCurve curve={detail.curve} />}
          {tab === "settings" && settings}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ forecast tab */

export function ForecastTab({ fc, metrics, height = 300 }: { fc: ForecastResult; metrics: Record<string, number>; height?: number }) {
  const names = fc.series.map((s) => s.series);
  const [series, setSeries] = useState(names[0]);
  const [oneStep, setOneStep] = useState(false);
  useEffect(() => { if (!names.includes(series)) setSeries(names[0]); }, [fc]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = fc.series.find((x) => x.series === series) ?? fc.series[0];
  const random = fc.split === "random";
  const unit = fc.unit;
  const errs = useMemo(() => {
    if (random || !s) return null;
    const act = new Map(s.actual.map((p) => [String(p.t), p.y]));
    const fe = s.forecast.map((p) => Math.abs(p.y - (act.get(String(p.t)) ?? p.y)));
    const oe = s.one_step.map((p) => Math.abs(p.y - (act.get(String(p.t)) ?? p.y)));
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const inside = s.actual.filter((p) => { const f = s.forecast.find((q) => String(q.t) === String(p.t)); return f && p.y >= f.lo && p.y <= f.hi; }).length;
    return { forecast: mean(fe), one: mean(oe), inside, n: s.actual.length };
  }, [s, random]);
  if (!s) return null;

  return (
    <div className="col" style={{ gap: 12 }}>
      {random && (
        <div className="inset row" style={{ gap: 10, padding: "10px 12px", alignItems: "flex-start", background: "rgba(255,69,58,.08)", borderColor: "rgba(255,69,58,.3)" }}>
          <span style={{ fontSize: 18 }}>🙈</span>
          <span className="small" style={{ lineHeight: 1.55 }}>
            <b>This view is misleading — on purpose.</b>{" "}
            <span className="muted">With a random split the test days (orange dots) are scattered <i>between</i> training days, and each one is guessed just one step ahead from the true values right before it. That's why the dots hug the line. Nobody knows tomorrow's real value when forecasting next month — the purple forecast past the end is the only honest part, and nothing here tells you how good it is. Switch to a <b>time split</b> in Prepare.</span>
          </span>
        </div>
      )}
      <div className="row between wrap" style={{ gap: 10 }}>
        {names.length > 1 ? (
          <Segmented value={s.series} onChange={setSeries} size="sm" options={names.map((n) => ({ value: n, label: n }))} />
        ) : <span className="small muted">{s.series === "all" ? fc.value_name : s.series}</span>}
        {!random && (
          <Toggle checked={oneStep} onChange={setOneStep}
            label={<span className="small">One-step guesses</span>}
            help="What it would score if it always knew yesterday: each orange dot is a guess for one day made with the true values up to the day before. In real forecasting those true values don't exist yet — so the purple line has to build on its own guesses." />
        )}
      </div>
      <ForecastChart history={s.history} actual={s.actual} forecast={s.forecast} oneStep={s.one_step} showOneStep={oneStep} scattered={random}
        unit={unit} valueName={fc.value_name} height={height} startLabel={random ? "past the end of the data" : "test: the model forecasts from here"} />
      <ForecastLegend items={[
        { color: FC_COLORS.history, label: random ? "the whole series (thinned)" : "history it learned from" },
        ...(!random ? [{ color: "var(--text)", label: "what really happened" }] : []),
        { color: FC_COLORS.forecast, label: "forecast" },
        { color: FC_COLORS.forecast, label: "~80% band", band: true },
        ...(random || oneStep ? [{ color: FC_COLORS.oneStep, label: random ? "one-step guesses on scattered test days" : "one-step guesses", dot: true }] : []),
      ]} />
      {!random && errs && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.3 }} className="small muted" style={{ lineHeight: 1.6 }}>
          We hid the last <b>{stepsText(s.forecast.length, unit)}</b> and asked the model to forecast them in one go — <b>one guess feeding the next</b>, just like real life.
          {" "}For {s.series === "all" ? "this series" : <b>{s.series}</b>} it's off by <b style={{ color: "var(--text)" }}>{fmtV(errs.forecast)}</b> {fc.value_name} per {unit} on average
          {errs.one > 0 && <> (one step ahead with the true values it would be {fmtV(errs.one)})</>}.
          {" "}{errs.inside} of {errs.n} real values landed inside the shaded band{errs.inside / Math.max(1, errs.n) < 0.6 ? " — fewer than the ~80% it promises, so the band is too optimistic" : ""}.
        </motion.div>
      )}
      {random && metrics.mae !== undefined && (
        <span className="small muted" style={{ lineHeight: 1.55 }}>
          The scattered guesses miss by just <b>{fmtV(metrics.mae)}</b> on average — a score for <i>filling in gaps</i>, not for forecasting.
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ error growth */

export function ErrorGrowth({ fc, metrics }: { fc: ForecastResult; metrics: Record<string, number> }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const vals = fc.mase_by_step;
  const H = vals.length;
  const height = 230;
  const m = { l: 40, r: 10, t: 18, b: 30 };
  const max = Math.max(1.3, ...vals) * 1.08;
  const iw = Math.max(1, width - m.l - m.r);
  const bw = iw / Math.max(1, H);
  const y = (v: number) => m.t + (1 - v / max) * (height - m.t - m.b);
  const ticks = [0, 0.5, 1, 1.5, 2, 3, 4].filter((t) => t <= max);
  const firstWorse = vals.findIndex((v) => v > 1);
  const early = vals.slice(0, Math.max(1, Math.round(H / 4)));
  const late = vals.slice(-Math.max(1, Math.round(H / 4)));
  const avg = (a: number[]) => a.reduce((x, z) => x + z, 0) / Math.max(1, a.length);
  const [hover, setHover] = useState<number | null>(null);
  const unit = fc.unit;
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ lineHeight: 1.55 }}>
        Step 1 is the first {unit} of the forecast, step {H} the last. Each bar is the error at that step compared with “{lastSeason(unit)}” (MASE): below the
        dashed line it beats the simple rule. Further out, every guess is built on earlier guesses — so errors usually grow.
      </p>
      <div ref={ref} style={{ width: "100%", height, position: "relative" }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} style={{ display: "block" }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
                <text x={m.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{t}</text>
              </g>
            ))}
            {vals.map((v, i) => (
              <motion.rect key={i} x={m.l + i * bw + bw * 0.14} width={Math.max(1, bw * 0.72)} rx={Math.min(4, bw * 0.3)}
                initial={{ y: y(0), height: 0 }} animate={{ y: y(v), height: Math.max(0, y(0) - y(v)) }} transition={{ ...spring.gentle, delay: i * 0.012 }}
                fill={v <= 1 ? "#5E5CE6" : "#FF9F0A"} opacity={hover === null || hover === i ? 0.85 : 0.4}
                onMouseEnter={() => setHover(i)} />
            ))}
            <line x1={m.l} x2={width - m.r} y1={y(1)} y2={y(1)} stroke="var(--text)" strokeDasharray="5 4" strokeWidth={1.5} opacity={0.7} />
            <text x={width - m.r} y={y(1) - 5} textAnchor="end" fontSize={10.5} fontWeight={600} fill="var(--text-2)">1.0 = “{lastSeason(unit)}”</text>
            {[1, Math.ceil(H / 2), H].filter((v, i, a) => a.indexOf(v) === i).map((s) => (
              <text key={s} x={m.l + (s - 0.5) * bw} y={height - 12} textAnchor="middle" fontSize={10} fill="var(--text-3)">{s}</text>
            ))}
            <text x={(m.l + width - m.r) / 2} y={height - 1} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">{unit === "step" ? "steps" : `${unit}s`} ahead</text>
          </svg>
        )}
        {hover !== null && width > 0 && (
          <div className="glass strong tiny" style={{ position: "absolute", top: 0, left: Math.min(width - 170, Math.max(0, m.l + hover * bw - 60)), width: 170, padding: "6px 9px", borderRadius: 10, pointerEvents: "none" }}>
            <b>{hover + 1} {unit}{hover ? "s" : ""} ahead</b> · MASE {vals[hover].toFixed(2)}
            <div className="faint">{masePhrase(vals[hover], unit)?.text}</div>
          </div>
        )}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="badge">first quarter: MASE {avg(early).toFixed(2)}</span>
        <span className="badge">last quarter: MASE {avg(late).toFixed(2)}</span>
        {metrics.one_step_mae !== undefined && metrics.mae !== undefined && (
          <Tooltip content={metricHelp("one_step_mae", "forecasting")} width={260}>
            <span className="badge accent">one-step MAE {fmtV(metrics.one_step_mae)} → full forecast {fmtV(metrics.mae)}</span>
          </Tooltip>
        )}
        {firstWorse >= 0 && <span className="badge warning">first step worse than “{lastSeason(unit)}”: {firstWorse + 1}</span>}
        <span className="tiny faint">averaged over {fc.series.length} series · bars are noisy: each one averages just a few days</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ what it uses */

export function WhatItUses({ fc }: { fc: ForecastResult }) {
  const imp = fc.importance ?? [];
  const unit = fc.unit;
  if (!imp.length) {
    return (
      <div className="inset row" style={{ gap: 12, padding: "14px 16px", alignItems: "flex-start" }}>
        <span style={{ fontSize: 26 }}>{fc.kind === "gru" ? "🧠" : fc.kind === "holt_winters" ? "🌊" : "🔁"}</span>
        <div className="col" style={{ gap: 4 }}>
          <b>How it works</b>
          <span className="small muted" style={{ lineHeight: 1.6 }}>{HOW_IT_WORKS[fc.kind] ?? "This model doesn't report which inputs it relies on."}</span>
          {IGNORES_EXOG.has(fc.kind) && <span className="small muted" style={{ lineHeight: 1.6 }}>Because it only reads the series itself, planned promotions or other extra columns can't change its forecast.</span>}
        </div>
      </div>
    );
  }
  const groups = new Map<string, { label: string; color: string; v: number }>();
  imp.forEach((f) => {
    const g = featureGroup(f.feature);
    const cur = groups.get(g.key) ?? { label: g.label, color: g.color, v: 0 };
    cur.v += f.importance;
    groups.set(g.key, cur);
  });
  const top = imp.slice(0, 12);
  const max = Math.max(...top.map((f) => f.importance), 1e-9);
  return (
    <div className="col" style={{ gap: 14 }}>
      <p className="small muted" style={{ lineHeight: 1.55 }}>
        Which clues the model leans on to guess the next {unit}.{" "}
        {fc.kind === "linear" ? "Measured by the size of each weight (inputs are on a common scale)." : fc.kind === "random_forest" ? "Measured by how much each clue improves the trees' splits." : "Measured by shuffling each clue and watching how much worse the guesses get."}
      </p>
      <div className="row wrap" style={{ gap: 6 }}>
        {[...groups.values()].sort((a, b) => b.v - a.v).map((g) => (
          <span key={g.label} className="badge" style={{ background: `${g.color}22`, color: "var(--text)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: g.color }} />{g.label} · {Math.round(g.v * 100)}%
          </span>
        ))}
      </div>
      <div className="col" style={{ gap: 7 }}>
        {top.map((f, i) => {
          const g = featureGroup(f.feature);
          return (
            <motion.div key={f.feature} className="row" style={{ gap: 10 }} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: i * 0.03 }}>
              <span className="col" style={{ width: 200, flexShrink: 0, gap: 0, minWidth: 0 }}>
                <span className="small truncate" style={{ fontWeight: 600 }}>{plainFeature(f.feature, unit, fc.season)}</span>
                <span className="mono faint truncate" style={{ fontSize: 10.5 }}>{f.feature}</span>
              </span>
              <div className="grow" style={{ height: 14, borderRadius: 7, background: "var(--fill)", overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${(f.importance / max) * 100}%` }} transition={{ ...spring.gentle, delay: 0.1 + i * 0.03 }}
                  style={{ height: "100%", borderRadius: 7, background: g.color, opacity: 0.85 }} />
              </div>
              <b className="num small" style={{ width: 44, textAlign: "right" }}>{Math.round(f.importance * 100)}%</b>
            </motion.div>
          );
        })}
      </div>
      <span className="tiny faint" style={{ lineHeight: 1.5 }}>
        “{plainFeature(`lag_${fc.season}`, unit, fc.season)}” is the strongest clue in most {seasonName(unit)}ly rhythms. Calendar flags let a model learn the rhythm directly; extra columns like promotions only help if you'll know them in advance.
      </span>
    </div>
  );
}

function FcCurve({ curve }: { curve: NonNullable<ModelResult["curve"]> }) {
  const pts = curve.points;
  const loss: Series[] = [
    { name: "Training loss", color: "#0A84FF", points: pts.map((p) => ({ x: p.step, y: p.train_loss })) },
    { name: "Validation loss", color: "#FF375F", points: pts.map((p) => ({ x: p.step, y: p.val_loss })) },
  ];
  const best = pts.reduce((b, p) => ((p.val_loss ?? Infinity) < (b.val_loss ?? Infinity) ? p : b), pts[0]);
  return (
    <div className="col" style={{ gap: 10 }}>
      <p className="small muted" style={{ lineHeight: 1.55 }}>
        How the network's one-step guesses improved, epoch by epoch (error in scaled units, so the numbers aren't in {"“"}real{"”"} units). Training stops when the
        validation line stops improving and the best epoch is kept.
      </p>
      <LineChart series={loss} height={230} xLabel={curve.x_label ?? "Epoch"} marker={best ? { x: best.step, label: `best · ${best.step}` } : undefined} />
      <span className="tiny faint">{metricLabel("mae")} on the real test forecast is what counts — a low loss here is only a one-step score.</span>
    </div>
  );
}
