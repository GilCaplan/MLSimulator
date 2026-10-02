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
import { RecsysTiles, RecsysViews } from "./RecsysViews";

/** Report for one recommender: headline numbers (vs "Most popular") and the recommendation tabs. */
export function RecsysDetail({ result, model }: { result: RunResult; model: ModelResult }) {
  const [saving, setSaving] = useState(false);
  const spec = useProject((s) => s.registry.find((r) => r.id === model.model_id));
  const savedId = useSaved((s) => s.saved[`${result.job_id}:${model.key}`]);
  const metrics = model.metrics.test ?? {};
  const isPop = model.model_id === "popularity";
  const pop = isPop ? null : Object.values(result.models).find((m) => m.model_id === "popularity");
  const fallback = model.params?.cold_start === "popularity";

  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <motion.span key={model.key} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ fontSize: 26, width: 46, height: 46, borderRadius: 14, background: "var(--glass-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {spec?.emoji ?? "🎬"}
          </motion.span>
          <div className="col" style={{ gap: 2 }}>
            <h3 className="row wrap" style={{ gap: 8 }}>
              {model.label}
              {isPop && <span className="badge">🎯 the baseline to beat</span>}
              {fallback && <span className="badge warning" title="Viewers with very few ratings get the popularity list instead">🛟 popularity fallback for new viewers</span>}
            </h3>
            <span className="small muted">{spec?.description}</span>
          </div>
        </div>
        {savedId ? (
          <div className="row" style={{ gap: 8 }}>
            <span className="badge success">✓ Saved</span>
            <button className="btn sm" onClick={() => navigate(`/library/${savedId}`)}>View in library →</button>
          </div>
        ) : (
          <button className="btn primary" onClick={() => setSaving(true)}>💾 Save to library</button>
        )}
      </div>
      <div className="col" style={{ gap: 16 }}>
        <RecsysTiles metrics={metrics} reference={pop?.metrics.test} />
        <span className="tiny faint">
          ⏱ learned in {secs(model.fit_time_s)}
          {metrics.users_evaluated ? ` · tested on ${Math.round(metrics.users_evaluated).toLocaleString()} viewers' most recent ratings` : ""}
          {isPop ? " · everyone gets the same list, minus films they've already rated" : ""}
        </span>
        <RecsysViews detail={model} metrics={metrics} modelId={model.model_id} settings={<ModelSettings model={model} />} />
      </div>
      <SaveModal open={saving} onClose={() => setSaving(false)} jobId={result.job_id} model={model} />
    </Glass>
  );
}
