import { motion } from "framer-motion";
import { fadeUp, spring, stagger } from "../../design/motion";
import { navigate } from "../../lib/router";
import { useProject } from "../../lib/store";
import type { PipelineSpec, RunResult, StepId, SuggestionAction } from "../../lib/types";
import { AnimatedNumber, Tooltip } from "../glass";
import { BASELINE_ID, fmtV, lastSeason, masePhrase, seasonalRef, stepsText } from "../train/forecast/fcKit";
import { fmtMetric, metricLabel, useRankMetric } from "../train/util";

/** Forecast metrics the race can show (all "lower is better" error measures). */
const RACE_METRICS = new Set(["mae", "rmse", "mase", "smape", "one_step_mae"]);

interface Idea { icon: string; title: string; text: string; cta: string; go?: StepId; action?: SuggestionAction; hot?: boolean }

const TREES = ["fc_random_forest", "fc_gbm"];

/** "What to try next" for forecasting, built from the coach's rules and the current setup. Cards apply a fix or jump to a step. */
function ideasFor(result: RunResult | null, models: { key: string; model_id: string; params: Record<string, any> }[]): Idea[] {
  const { project, report } = useProject.getState();
  const cfg = { calendar: true, trend: false, diff: false, log: false, exog: [] as string[], horizon: 14, ...(project?.pipeline?.forecast ?? {}), ...(report?.forecast_config ?? {}) };
  const unit = report?.unit ?? (result ? Object.values(result.models).find((m) => m.forecast)?.forecast?.unit : undefined) ?? "day";
  const season = report?.season ?? 7;
  const horizon = report?.horizon ?? cfg.horizon;
  const split = Object.values(result?.models ?? {}).find((m) => m.forecast)?.forecast?.split ?? project?.pipeline?.split?.method;
  const ids = models.map((m) => m.model_id);
  const out: Idea[] = [];
  if (split === "random") {
    out.push({ icon: "⏳", title: "Use a time split", hot: true, cta: "Switch to a time split",
      text: "Right now the test days sit between training days and are guessed one step ahead with the true values. Test on the last stretch of time so the score is a real forecast.",
      action: { kind: "pipeline", label: "", patch: { split: { method: "time" } } as Partial<PipelineSpec> } });
  }
  const trees = result ? Object.values(result.models).filter((m) => TREES.includes(m.model_id) && !m.baseline) : [];
  const biased = trees.find((m) => Math.abs(m.metrics.test.bias ?? 0) > 0.6 * (m.metrics.test.mae ?? Infinity));
  if (!cfg.diff && (biased || ids.some((id) => TREES.includes(id)))) {
    out.push({ icon: "📐", title: "Predict the change, not the level", hot: !!biased, cta: "Turn on differencing",
      text: biased
        ? `${biased.label} runs consistently too ${(biased.metrics.test.bias ?? 0) < 0 ? "low" : "high"}: trees can't predict values beyond what they trained on, so a trend gets cut off. Differencing lets them follow it.`
        : "Tree models can't extrapolate a trend past the values they've seen. Predicting the day-to-day change (differencing) lets them follow growth.",
      action: { kind: "pipeline", label: "", patch: { forecast: { diff: true } } as Partial<PipelineSpec> } });
  }
  if (!cfg.calendar && season > 1) {
    out.push({ icon: "📅", title: "Add calendar features", hot: true, cta: "Turn on calendar flags",
      text: "Day-of-week, hour or month flags let a model learn the rhythm directly instead of reconstructing it from lags.",
      action: { kind: "pipeline", label: "", patch: { forecast: { calendar: true } } as Partial<PipelineSpec> } });
  }
  out.push({ icon: "🔁", title: `A lag at the season (${season})`, cta: "Edit the clues", go: "prepare",
    text: `“${lastSeason(unit)[0].toUpperCase()}${lastSeason(unit).slice(1)}” is a strong clue. Make sure lag ${season} (and ${2 * season}) are in the list — they lean less on the model's own recent guesses.` });
  out.push({ icon: "🔭", title: "Longer or shorter horizon", cta: "Change the horizon", go: "prepare",
    text: `You're forecasting ${stepsText(horizon, unit)} ahead. Errors snowball the further you go — a shorter horizon is easier, a longer one shows how far you can really trust the model.` });
  if (!cfg.log) {
    out.push({ icon: "📈", title: "Tame growing swings", cta: "Try the log transform", go: "prepare",
      text: "If the ups and downs grow as the series grows (multiplicative seasonality), forecasting log(1 + value) turns them into steady swings." });
  }
  if (!ids.includes("fc_holt_winters")) {
    out.push({ icon: "🌊", title: "Try exponential smoothing", cta: "Add Holt-Winters",
      text: "A classic that keeps a running level, trend and seasonal pattern. Fast, robust, and often hard to beat on a single clean series.",
      action: { kind: "add_models", label: "", model_ids: ["fc_holt_winters"] } });
  } else if (!ids.includes("fc_gbm")) {
    out.push({ icon: "🚀", title: "Try gradient boosting", cta: "Add gradient boosting",
      text: "Trees built one after another on the lag and calendar clues — the go-to model in forecasting competitions.",
      action: { kind: "add_models", label: "", model_ids: ["fc_gbm"] } });
  }
  if (!ids.includes(BASELINE_ID) && !(result && Object.values(result.models).some((m) => m.baseline))) {
    out.push({ icon: "🎯", title: "Keep a baseline", cta: "Add “same as last season”", text: "Always race against the simplest forecast. If nothing beats it, the models haven't learned anything the calendar didn't already know.",
      action: { kind: "add_models", label: "", model_ids: [BASELINE_ID] } });
  }
  const gru = models.find((m) => m.model_id === "fc_gru");
  if (gru) {
    const w = Number(gru.params.window ?? 28);
    const next = Math.max(4, Math.round(w / 2));
    out.push({ icon: "🧠", title: "A shorter look-back", cta: `Window ${w} → ${next}`,
      text: "With a few hundred time steps, networks overfit easily. A shorter window and a smaller memory often forecast better.",
      action: { kind: "model_params", label: "", key: gru.key, patch: { window: next } } });
  }
  out.push({ icon: "🧩", title: "Columns known in advance", cta: "Pick extra columns", go: "prepare",
    text: cfg.exog.length
      ? `You're using ${cfg.exog.join(", ")}. Only keep columns you'll really know on forecast day (planned promotions, holidays) — never ones recorded afterwards.`
      : "Planned promotions, holidays or a weather forecast can explain jumps the past can't. Only use columns you'll know before the day." });
  return out;
}

export function ForecastWays({ projectId }: { projectId: string }) {
  const models = useProject((s) => s.project?.models) ?? [];
  const result = useProject((s) => s.result);
  useProject((s) => s.report);
  const apply = useProject((s) => s.applyAction);
  const ideas = ideasFor(result, models);
  const run = (idea: Idea) => {
    if (idea.action) apply(idea.action);
    else navigate(`/p/${projectId}/${idea.go ?? "prepare"}`);
  };
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
      {ideas.map((idea) => (
        <motion.button key={idea.title} variants={fadeUp} whileHover={{ y: -3 }} transition={spring.snappy} onClick={() => run(idea)}
          className="inset col" style={{ padding: 14, gap: 6, textAlign: "left", cursor: "pointer", alignItems: "flex-start", borderColor: idea.hot ? "var(--accent)" : undefined }}>
          <span className="row between" style={{ width: "100%" }}>
            <span style={{ fontSize: 24 }}>{idea.icon}</span>
            {idea.hot && <span className="badge accent">suggested</span>}
          </span>
          <b style={{ fontSize: 13.5 }}>{idea.title}</b>
          <span className="small muted" style={{ lineHeight: 1.5, flex: 1 }}>{idea.text}</span>
          <span className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>{idea.cta} →</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

/** This run's forecasters against "same as last season": error bars (shorter = better) with the baseline as a dashed line.
 * Uses the project's ranking metric when it's a forecast error measure (MAE by default). */
export function ForecastRace({ result }: { result: RunResult }) {
  const chosen = useRankMetric(result);
  const metric = RACE_METRICS.has(chosen) ? chosen : "mae";
  const inUnits = metric === "mae" || metric === "rmse" || metric === "one_step_mae";
  const show = (v: number) => (inUnits ? fmtV(v) : fmtMetric(metric, v));
  const ref = seasonalRef(result);
  const rows = Object.values(result.models).filter((m) => m.metrics.test?.[metric] !== undefined).sort((a, b) => a.metrics.test[metric] - b.metrics.test[metric]);
  if (!rows.length) return null;
  const max = Math.max(1e-9, ...rows.map((r) => r.metrics.test[metric]));
  const unit = rows.find((r) => r.forecast)?.forecast?.unit;
  const vn = rows.find((r) => r.forecast)?.forecast?.value_name ?? "";
  const refMae = ref?.metrics.test[metric];
  const random = rows.some((r) => r.forecast?.split === "random");
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="col" style={{ gap: 8 }}>
        {rows.map((r, i) => {
          const isRef = r === ref;
          const mae = r.metrics.test[metric];
          const lift = refMae && !isRef ? 1 - mae / refMae : null;
          const mp = masePhrase(r.metrics.test.mase, unit);
          return (
            <div key={r.key} className="row" style={{ gap: 10 }}>
              <span className="small truncate" style={{ width: 170, flexShrink: 0, fontWeight: isRef ? 500 : 600, color: isRef ? "var(--text-2)" : "var(--text)" }} title={r.label}>{isRef ? "🎯 " : ""}{r.baseline ? lastSeason(unit) : r.label}</span>
              <div style={{ flex: 1, height: 20, borderRadius: 7, background: "var(--fill)", position: "relative", overflow: "hidden" }}>
                <motion.div style={{ position: "absolute", inset: 0, right: "auto", borderRadius: 7, background: isRef ? "var(--text-3)" : lift !== null && lift < 0 ? "var(--warning)" : "var(--grad)", opacity: isRef ? 0.6 : 0.9 }}
                  initial={{ width: 0 }} animate={{ width: `${(mae / max) * 100}%` }} transition={{ ...spring.gentle, delay: i * 0.06 }} />
                {refMae !== undefined && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(refMae / max) * 100}%`, borderLeft: "2px dashed var(--text-2)", opacity: 0.6 }} />}
              </div>
              <span className="num small" style={{ width: 62, textAlign: "right", fontWeight: 650 }}><AnimatedNumber value={mae} format={show} /></span>
              <Tooltip content={mp?.text ?? "MASE compares with the simple seasonal rule"} width={220}>
                <span className="tiny num" style={{ width: 118, textAlign: "right", whiteSpace: "nowrap", display: "inline-block", color: lift === null ? "var(--text-3)" : lift >= 0 ? "var(--success)" : "var(--warning)", fontWeight: 650 }}>
                  {lift === null ? (isRef ? "baseline" : "") : lift >= 0 ? `${Math.round(lift * 100)}% less error` : `${Math.round(-lift * 100)}% more error`}
                </span>
              </Tooltip>
            </div>
          );
        })}
      </div>
      <span className="tiny muted" style={{ lineHeight: 1.5 }}>
        Bars show {metric === "mae" ? <>the average miss (<b>MAE</b>, in {vn || "the series' units"})</> : <><b>{metricLabel(metric)}</b> (your ranking metric)</>} — <b>shorter is better</b>. The dashed line is <b>{lastSeason(unit)}</b>, the forecast that needs no learning at all.
        {random && " These are one-step scores from a random split, so every bar is flattered."}
        {!ref && " Add “same as last season” to your line-up to see the baseline."}
      </span>
    </div>
  );
}
