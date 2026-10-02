import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { ForecastResponse, SavedModel, TsBandPoint } from "../../lib/types";
import { AnimatedNumber, Glass, InfoTip, Segmented, Slider, Spinner } from "../glass";
import { FC_COLORS, ForecastChart, ForecastLegend } from "../train/forecast/ForecastChart";
import { IGNORES_EXOG, exogName, fmtT, fmtV, stepsText, tNum } from "../train/forecast/fcKit";
import { useDebounced } from "./inputs";
import { SectionTitle, rise } from "./shared";

type ExogPlan = Record<string, number[]>;

/** Report an API error once (not on every slider tick). */
function useOnceError() {
  const last = useRef<string | null>(null);
  return {
    fail: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== last.current) toast.error(msg);
      last.current = msg;
    },
    ok: () => { last.current = null; },
  };
}

const sum = (pts: TsBandPoint[]) => pts.reduce((a, p) => a + p.y, 0);

/** "Try it live" for forecasters: pick a series and a horizon, plan the known-in-advance columns, watch the forecast respond. */
export function ForecastPlayground({ model }: { model: SavedModel }) {
  const fcDetail = model.detail?.forecast;
  const baseH = fcDetail?.horizon ?? model.pipeline?.forecast?.horizon ?? 14;
  const [series, setSeries] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(baseH);
  const [plan, setPlan] = useState<ExogPlan>({});
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [res, setRes] = useState<ForecastResponse | null>(null);
  const [plain, setPlain] = useState<ForecastResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const err = useOnceError();
  const seq = useRef(0);
  const kind = fcDetail?.kind ?? "";
  const ignores = IGNORES_EXOG.has(kind);

  // the planned values actually sent: binary plans as edited, numeric = the model's default plan + an offset
  const exogSent = useMemo(() => {
    const out: ExogPlan = {};
    for (const e of plain?.exog ?? []) {
      if (e.binary) { if (plan[e.name]) out[e.name] = plan[e.name].slice(0, horizon); }
      else if (offsets[e.name]) out[e.name] = e.values.slice(0, horizon).map((v) => v + offsets[e.name]);
    }
    return out;
  }, [plan, offsets, plain, horizon]);
  const edited = Object.keys(exogSent).length > 0;
  const req = useDebounced(JSON.stringify({ series, horizon, exog: exogSent }), 220);

  // the untouched forecast (defaults for every extra column) — the "before" for any what-if
  useEffect(() => {
    let alive = true;
    api.forecast(model.id, { series: series ?? undefined, horizon })
      .then((r) => {
        if (!alive) return;
        setPlain(r);
        if (series === null) setSeries(r.series);
        err.ok();
      })
      .catch((e) => alive && err.fail(e));
    return () => { alive = false; };
  }, [model.id, series, horizon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const body = JSON.parse(req) as { series: string | null; horizon: number; exog: ExogPlan };
    if (body.series === null) return;
    if (!Object.keys(body.exog).length) { setRes(null); return; }
    const id = ++seq.current;
    setBusy(true);
    api.forecast(model.id, { series: body.series, horizon: body.horizon, exog: body.exog })
      .then((r) => { if (id === seq.current) { setRes(r); err.ok(); } })
      .catch((e) => id === seq.current && err.fail(e))
      .finally(() => id === seq.current && setBusy(false));
  }, [req, model.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = res && edited ? res : plain;
  const names = plain?.series_names ?? [];
  const unit = plain?.unit ?? fcDetail?.unit ?? "day";
  const vn = plain?.value_name ?? fcDetail?.value_name ?? "value";
  const binaries = (plain?.exog ?? []).filter((e) => e.binary);
  const numerics = (plain?.exog ?? []).filter((e) => !e.binary);
  const marks = useMemo(() => {
    if (!shown || !binaries.length) return [];
    const e0 = binaries[0];
    const fut = shown.forecast.map((p, i) => ((exogSent[e0.name] ?? e0.values)[i] ? p.t : null)).filter((t): t is string | number => t !== null);
    const hist = shown.history.map((p, i) => (e0.recent[e0.recent.length - shown.history.length + i] ? p.t : null)).filter((t): t is string | number => t !== null);
    return [...hist, ...fut];
  }, [shown, binaries, exogSent]);
  const total = shown ? sum(shown.forecast) : 0;
  const before = plain ? sum(plain.forecast.slice(0, shown?.forecast.length ?? 0)) : 0;
  const delta = edited && res ? total - before : 0;
  const peak = shown?.forecast.reduce((b, p) => (p.y > b.y ? p : b), shown.forecast[0]);

  const setDay = (name: string, i: number, on: boolean) => {
    const base = plan[name] ?? (plain?.exog.find((e) => e.name === name)?.values ?? []).slice();
    const next = Array.from({ length: horizon }, (_, k) => base[k] ?? 0);
    next[i] = on ? 1 : 0;
    setPlan({ ...plan, [name]: next });
  };
  const preset = (name: string, fn: (i: number, t: string | number) => number) => {
    if (!shown) return;
    setPlan({ ...plan, [name]: shown.forecast.map((p, i) => fn(i, p.t)) });
  };
  const reset = () => { setPlan({}); setOffsets({}); };

  return (
    <motion.section variants={rise}>
      <SectionTitle id="try" icon="🔮" title="What happens next?"
        subtitle={binaries.length
          ? <>The model's forecast for the next {stepsText(horizon, unit)}. Plan the {binaries.map((e) => exogName(e.name)).join(" / ")} days below — <b>what if we run a promo next week?</b></>
          : <>The model's forecast for the next {stepsText(horizon, unit)}, picking up right where your data ends. Drag the horizon to look further ahead — and watch the band widen.</>}
        right={names.length > 1 ? <Segmented value={series ?? names[0]} onChange={(v) => { setSeries(v); reset(); }} options={names.map((n) => ({ value: n, label: n }))} /> : undefined} />
      <Glass>
        {!shown ? (
          <div className="col center" style={{ height: 340, gap: 10 }}><Spinner size={22} color="var(--accent)" /><span className="small muted">Forecasting…</span></div>
        ) : (
          <div className="col" style={{ gap: 16 }}>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <Stat label={`Total ${vn}, next ${stepsText(shown.forecast.length, unit)}`} value={total} format={fmtV}
                sub={edited && res ? <span style={{ color: delta >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 650 }}>{delta >= 0 ? "▲ +" : "▼ −"}{fmtV(Math.abs(delta))} ({before ? `${delta >= 0 ? "+" : "−"}${Math.abs((delta / before) * 100).toFixed(1)}%` : "—"}) from your plan</span> : "with the default plan"} />
              <Stat label={`Average per ${unit}`} value={total / Math.max(1, shown.forecast.length)} format={fmtV} sub={`history: ${fmtV(shown.history.slice(-shown.forecast.length).reduce((a, p) => a + p.y, 0) / Math.max(1, Math.min(shown.history.length, shown.forecast.length)))} over the same stretch before`} />
              {peak && <Stat label="Busiest step" value={peak.y} format={fmtV} sub={fmtT(peak.t, unit, true)} />}
              <Stat label="Band at the far end" value={(shown.forecast[shown.forecast.length - 1]?.hi ?? 0) - (shown.forecast[shown.forecast.length - 1]?.lo ?? 0)} format={(v) => `± ${fmtV(v / 2)}`}
                sub="uncertainty grows with every step ahead" />
            </div>

            <div style={{ position: "relative" }}>
              <ForecastChart history={shown.history} forecast={shown.forecast} unit={unit} valueName={vn} height={320} startLabel="today"
                marks={marks} markLabel={binaries[0] ? exogName(binaries[0].name) : undefined} ghost={edited && res ? plain?.forecast.slice(0, shown.forecast.length) : null} />
              <AnimatePresence>{busy && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", right: 8, top: 22 }}><Spinner size={14} color="var(--accent)" /></motion.span>}</AnimatePresence>
            </div>
            <ForecastLegend items={[
              { color: FC_COLORS.history, label: "recent history" },
              { color: FC_COLORS.forecast, label: "forecast" },
              { color: FC_COLORS.forecast, label: "~80% band", band: true },
              ...(edited && res ? [{ color: "var(--text-3)", label: "before your plan", dashed: true }] : []),
              ...(binaries.length ? [{ color: FC_COLORS.mark, label: `${exogName(binaries[0].name)} days`, band: true }] : []),
            ]} />

            <div className="inset col" style={{ padding: "12px 14px", gap: 6 }}>
              <Slider label={<span className="row" style={{ gap: 6 }}>How far ahead<InfoTip text={`The model was tested on ${stepsText(baseH, unit)} ahead. Beyond that it keeps building on its own guesses, so trust it less (the band shows how much less).`} /></span>}
                value={horizon} min={1} max={Math.max(2, 4 * baseH)} integer onChange={(v) => setHorizon(Math.round(v))} format={(v) => stepsText(Math.round(v), unit)} fixedRenderer="slider" />
              {horizon > baseH && <span className="tiny" style={{ color: "var(--warning)" }}>Past the {stepsText(baseH, unit)} it was tested on — each extra step leans on more of its own guesses.</span>}
            </div>

            {binaries.map((e) => {
              const vals = (exogSent[e.name] ?? e.values).slice(0, shown.forecast.length);
              const on = vals.filter((v) => v).length;
              return (
                <div key={e.name} className="col" style={{ gap: 8 }}>
                  <div className="row between wrap" style={{ gap: 8 }}>
                    <span className="row" style={{ gap: 8 }}>
                      <b className="small">🏷️ Plan: {exogName(e.name)}</b>
                      <span className="badge">{on} of {vals.length} {unit}s</span>
                    </span>
                    <span className="row wrap" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => preset(e.name, (i) => (i < 7 ? 1 : 0))}>Promo next {unit === "day" ? "week" : "7 steps"}</button>
                      {unit === "day" && <button className="btn sm" onClick={() => preset(e.name, (_, t) => ([0, 6].includes(new Date(tNum(t)).getDay()) ? 1 : 0))}>Every weekend</button>}
                      <button className="btn sm ghost" onClick={() => preset(e.name, () => 0)}>Clear</button>
                    </span>
                  </div>
                  <div className="row" style={{ gap: 3, overflowX: "auto", paddingBottom: 4 }}>
                    {vals.map((v, i) => {
                      const t = shown.forecast[i]?.t ?? i;
                      const d = new Date(tNum(t));
                      const weekend = unit === "day" && [0, 6].includes(d.getDay());
                      return (
                        <motion.button key={i} whileTap={{ scale: 0.88 }} onClick={() => setDay(e.name, i, !v)} title={`${fmtT(t, unit, true)} — ${v ? "on" : "off"}`}
                          className="col center" aria-pressed={!!v}
                          style={{ flex: "0 0 auto", width: 30, height: 42, gap: 1, borderRadius: "var(--r-sm, 8px)", cursor: "pointer", fontSize: 10, lineHeight: 1.1,
                            border: `1px solid ${v ? FC_COLORS.mark : "var(--hairline)"}`, background: v ? `color-mix(in srgb, ${FC_COLORS.mark} 28%, transparent)` : weekend ? "var(--fill-2)" : "var(--fill)", color: "var(--text)" }}>
                          <span className="faint">{unit === "day" ? "SMTWTFS"[d.getDay()] : i + 1}</span>
                          <b className="num">{unit === "day" ? d.getDate() : ""}</b>
                          <span style={{ fontSize: 9 }}>{v ? "🏷️" : ""}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {numerics.map((e) => {
              const recent = e.recent.length ? e.recent : e.values;
              const lo = Math.min(...recent), hi = Math.max(...recent);
              const span = Math.max(1e-6, hi - lo) / 2;
              const off = offsets[e.name] ?? 0;
              const mean = e.values.slice(0, horizon).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(horizon, e.values.length));
              return (
                <div key={e.name} className="inset col" style={{ padding: "12px 14px", gap: 6 }}>
                  <Slider label={<span className="row" style={{ gap: 6 }}>🌡️ What if {e.name} is different?<InfoTip text={`By default the model assumes ${e.name} repeats its last season. Shift the whole plan up or down to see how the forecast responds.`} /></span>}
                    value={off} min={-Number(span.toPrecision(2))} max={Number(span.toPrecision(2))} step={Number((span / 20).toPrecision(1))}
                    onChange={(v) => setOffsets({ ...offsets, [e.name]: v })} format={(v) => `${v >= 0 ? "+" : "−"}${fmtV(Math.abs(v))}`} fixedRenderer="slider" />
                  <span className="tiny faint">planned average {fmtV(mean + off)} (default {fmtV(mean)}) · recent range {fmtV(lo)} – {fmtV(hi)}</span>
                </div>
              );
            })}

            {(binaries.length > 0 || numerics.length > 0) && (
              <div className="row between wrap" style={{ gap: 10 }}>
                <span className="small muted" style={{ lineHeight: 1.5, maxWidth: 640 }}>
                  {ignores
                    ? <>⚠️ <b>This model can't use extra columns</b> — it only reads the series itself, so your plan won't move its forecast. Try a model that learns from clues (linear, trees, GRU).</>
                    : edited && res
                      ? Math.abs(delta) < 0.005 * Math.max(1, before)
                        ? <>Your plan barely changes the forecast — the model learned that {binaries[0] ? exogName(binaries[0].name) : "this column"} doesn't matter much here.</>
                        : <>Your plan {delta > 0 ? "adds" : "removes"} about <b>{fmtV(Math.abs(delta))} {vn}</b> over the period. The dashed line is the forecast without it.</>
                      : <>These columns are <b>known in advance</b>, so you can plan them and ask “what if?”. By default, 0/1 flags are off and numbers repeat their last season.</>}
                </span>
                {edited && <button className="btn sm ghost" onClick={reset}>↺ Reset plan</button>}
              </div>
            )}
          </div>
        )}
      </Glass>
    </motion.section>
  );
}

function Stat({ label, value, format, sub }: { label: string; value: number; format: (v: number) => string; sub?: React.ReactNode }) {
  return (
    <motion.div layout className="inset col" style={{ padding: "10px 12px", gap: 2 }} transition={spring.gentle}>
      <span className="tiny muted truncate" title={label}>{label}</span>
      <b className="num" style={{ fontSize: 22, letterSpacing: "-0.02em" }}><AnimatedNumber value={value} format={format} /></b>
      {sub && <span className="tiny faint" style={{ lineHeight: 1.35 }}>{sub}</span>}
    </motion.div>
  );
}
