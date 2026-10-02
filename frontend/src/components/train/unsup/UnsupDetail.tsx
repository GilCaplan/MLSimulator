import { motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../../design/motion";
import { secs } from "../../../lib/format";
import { navigate } from "../../../lib/router";
import { useJob, useProject } from "../../../lib/store";
import type { ModelResult, RunResult } from "../../../lib/types";
import { Glass } from "../../glass";
import { ModelSettings } from "../ModelSettings";
import { SaveModal } from "../SaveModal";
import { useSaved } from "../util";
import { UnsupMetricTiles, UnsupViews } from "./UnsupViews";

/** Report for one clustering / map / anomaly model: headline numbers and task-specific tabs. */
export function UnsupDetail({ result, model }: { result: RunResult; model: ModelResult }) {
  const [saving, setSaving] = useState(false);
  const spec = useProject((s) => s.registry.find((r) => r.id === model.model_id));
  const savedId = useSaved((s) => s.saved[`${result.job_id}:${model.key}`]);
  // the exact 2-D sample the live animation used (only while this job is still the one in memory)
  const liveSample = useJob((s) => (s.jobId === result.job_id ? s.models[model.key]?.clusterPoints : undefined));
  const task = result.task as string;
  const metrics = model.metrics.test ?? {};

  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <motion.span key={model.key} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ fontSize: 26, width: 46, height: 46, borderRadius: 14, background: "var(--glass-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {spec?.emoji ?? "🤖"}
          </motion.span>
          <div className="col" style={{ gap: 2 }}>
            <h3>{model.label}</h3>
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
        <UnsupMetricTiles task={task} metrics={metrics} />
        <span className="tiny faint">
          ⏱ found in {secs(model.fit_time_s)}
          {task === "clustering" ? " · scores use every row — clustering has no separate test set, because there are no answers to test against." : ""}
        </span>
        <UnsupViews task={task} detail={model} metrics={metrics} modelId={model.model_id} liveSample={liveSample} settings={<ModelSettings model={model} />} />
      </div>
      <SaveModal open={saving} onClose={() => setSaving(false)} jobId={result.job_id} model={model} />
    </Glass>
  );
}
