import { motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../../design/motion";
import { secs } from "../../../lib/format";
import { navigate } from "../../../lib/router";
import { useProject } from "../../../lib/store";
import type { ModelResult, RunResult } from "../../../lib/types";
import { Glass } from "../../glass";
import { ModelSettings } from "../ModelSettings";
import { SaveModal } from "../SaveModal";
import { useSaved } from "../util";
import { BASELINE_ID, IGNORES_EXOG, lastSeason, seasonalRef, stepsText } from "./fcKit";
import { ForecastTiles, ForecastViews } from "./ForecastViews";

/** Report for one forecaster: headline numbers (vs "same as last season") and the forecasting tabs. */
export function ForecastDetail({ result, model }: { result: RunResult; model: ModelResult }) {
  const [saving, setSaving] = useState(false);
  const spec = useProject((s) => s.registry.find((r) => r.id === model.model_id));
  const savedId = useSaved((s) => s.saved[`${result.job_id}:${model.key}`]);
  const exog = useProject((s) => s.report?.forecast_config?.exog ?? s.project?.pipeline?.forecast?.exog ?? []);
  const metrics = model.metrics.test ?? {};
  const fc = model.forecast;
  const isBase = !!model.baseline;
  const isRef = isBase || model.model_id === BASELINE_ID;
  const ref = isRef ? null : seasonalRef(result);
  const unit = fc?.unit ?? "day";

  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <motion.span key={model.key} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ fontSize: 26, width: 46, height: 46, borderRadius: 14, background: "var(--glass-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isBase ? "🎯" : spec?.emoji ?? "⏱️"}
          </motion.span>
          <div className="col" style={{ gap: 2 }}>
            <h3 className="row wrap" style={{ gap: 8 }}>
              {isBase ? `Baseline — “${lastSeason(unit)}”` : model.label}
              {isRef && <span className="badge">🎯 the baseline to beat</span>}
            </h3>
            <span className="small muted">
              {isBase ? `Repeats the last full ${unit === "day" ? "week" : "cycle"}: no learning at all. A real forecaster has to beat it to be worth using.` : spec?.description}
            </span>
          </div>
        </div>
        {isBase ? (
          <span className="badge">🎯 Reference only</span>
        ) : savedId ? (
          <div className="row" style={{ gap: 8 }}>
            <span className="badge success">✓ Saved</span>
            <button className="btn sm" onClick={() => navigate(`/library/${savedId}`)}>View in library →</button>
          </div>
        ) : (
          <button className="btn primary" onClick={() => setSaving(true)}>💾 Save to library</button>
        )}
      </div>
      <div className="col" style={{ gap: 16 }}>
        <ForecastTiles metrics={metrics} fc={fc} reference={ref?.metrics.test} />
        <span className="tiny faint">
          ⏱ learned in {secs(model.fit_time_s)}
          {fc && fc.split === "time" ? ` · tested on a ${stepsText(fc.horizon, unit)} forecast of ${fc.series.length === 1 ? "the series" : `each of ${fc.series.length} series`}` : ""}
          {fc && fc.split === "random" ? " · tested on scattered single days (random split)" : ""}
          {fc && exog.length > 0 && IGNORES_EXOG.has(fc.kind) ? ` · ignores ${exog.join(", ")}` : ""}
        </span>
        <ForecastViews detail={model} metrics={metrics} baseline={isBase} settings={isBase ? undefined : <ModelSettings model={model} />} />
      </div>
      {!isBase && <SaveModal open={saving} onClose={() => setSaving(false)} jobId={result.job_id} model={model} />}
    </Glass>
  );
}
