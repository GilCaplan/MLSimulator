import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../design/motion";
import { useProject } from "../../lib/store";
import { Modal, Tooltip } from "../glass";
import { appliesTo, customKey, describeCustom } from "./custom";
import { MetricBuilderHost } from "./MetricBuilder";
import { deleteMetric, duplicateMetric, rankBy, useMetricBuilder } from "./store";

/** The learner's own metrics: rank by, edit, duplicate, delete — plus the button that starts a new one. */
export function ManageMetrics({ emptyText }: { emptyText?: string }) {
  const project = useProject((s) => s.project);
  const result = useProject((s) => s.result);
  const classes = result?.classes ?? useProject.getState().report?.classes;
  const task = project?.task;
  const list = project?.custom_metrics ?? [];
  const rank = project?.rank_metric;
  const [confirm, setConfirm] = useState<string | null>(null);
  const openNew = useMetricBuilder((s) => s.openNew);
  const openEdit = useMetricBuilder((s) => s.openEdit);

  return (
    <div className="col" style={{ gap: 8 }}>
      {list.length === 0 && (
        <div className="inset row" style={{ gap: 12, padding: "12px 14px", alignItems: "flex-start" }}>
          <span style={{ fontSize: 22 }}>🧪</span>
          <span className="small muted" style={{ lineHeight: 1.55 }}>
            {emptyText ?? <>No scores of your own yet. Make one when the built-in ones don't match what matters — say, <b>a missed fraud costs £500 but a false alarm only £5</b>, or <b>big misses hurt twice as much</b>.</>}
          </span>
        </div>
      )}
      <AnimatePresence initial={false}>
        {list.map((cm) => {
          const key = customKey(cm.id);
          const active = rank === key;
          const ok = appliesTo(cm, task);
          return (
            <motion.div key={cm.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: -8 }} transition={spring.gentle}
              className="inset row" data-metric-row={cm.name}
              style={{ gap: 10, rowGap: 6, flexWrap: "wrap", padding: "10px 12px", alignItems: "center", borderColor: active ? "var(--accent)" : undefined, background: active ? "var(--accent-soft)" : undefined }}>
              <span style={{ fontSize: 20 }}>{cm.kind === "formula" ? "🧮" : "💸"}</span>
              <span className="col" style={{ gap: 2, minWidth: 0, flex: "1 1 220px" }}>
                <span className="row wrap" style={{ gap: 6 }}>
                  <b style={{ fontSize: 13.5, overflowWrap: "anywhere" }}>{cm.name}</b>
                  <span className="badge" style={{ whiteSpace: "nowrap" }} title={cm.better === "lower" ? "Lower values are better" : "Higher values are better"}>{cm.better === "lower" ? "↓ lower is better" : "↑ higher is better"}</span>
                  {active && <span className="badge accent" style={{ whiteSpace: "nowrap" }}>ranking by this</span>}
                  {!ok && <span className="badge warning" title="This metric doesn't fit the current problem (different metrics or classes).">doesn't fit this problem</span>}
                </span>
                <span className={`tiny muted ${cm.kind === "formula" ? "mono" : ""}`} style={{ lineHeight: 1.4, fontSize: cm.kind === "formula" ? 11 : undefined }}>
                  {cm.kind === "formula" ? cm.formula : describeCustom(cm, task, classes)}
                </span>
              </span>
              <AnimatePresence mode="wait" initial={false}>
                {confirm === cm.id ? (
                  <motion.span key="confirm" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="row" style={{ gap: 6, marginLeft: "auto" }}>
                    <span className="small">Delete?</span>
                    <button type="button" className="btn sm danger" onClick={() => { setConfirm(null); deleteMetric(cm); }}>Delete</button>
                    <button type="button" className="btn sm" onClick={() => setConfirm(null)}>Keep</button>
                  </motion.span>
                ) : (
                  <motion.span key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="row" style={{ gap: 4, flexShrink: 0, marginLeft: "auto" }}>
                    {!active && ok && <button type="button" className="btn sm" onClick={() => rankBy(key)}>Rank by this</button>}
                    {active && <button type="button" className="btn sm ghost" onClick={() => rankBy(null)} title="Go back to the problem's default score">Use default</button>}
                    <Tooltip content="Edit" width={70}><button type="button" className="btn sm icon ghost" aria-label={`Edit ${cm.name}`} onClick={() => openEdit(cm)}>✏️</button></Tooltip>
                    <Tooltip content="Duplicate" width={90}><button type="button" className="btn sm icon ghost" aria-label={`Duplicate ${cm.name}`} onClick={() => duplicateMetric(cm)}>⧉</button></Tooltip>
                    <Tooltip content="Delete" width={70}><button type="button" className="btn sm icon ghost" aria-label={`Delete ${cm.name}`} onClick={() => setConfirm(cm.id)}>🗑</button></Tooltip>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div className="row wrap" style={{ gap: 8 }}>
        <motion.button type="button" className="btn sm primary" whileTap={{ scale: 0.96 }} onClick={() => openNew("formula")}>🧮 Combine metrics…</motion.button>
        <motion.button type="button" className="btn sm" whileTap={{ scale: 0.96 }} onClick={() => openNew("costs")}>💸 Cost of mistakes…</motion.button>
      </div>
    </div>
  );
}

/** "Manage your metrics" as a modal (opened from the leaderboard's Rank by menu). */
export function ManageMetricsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const editing = useMetricBuilder((s) => s.open);
  return (
    <Modal open={open && !editing} onClose={onClose} width={640} title={<span className="row" style={{ gap: 10 }}><span>📐</span>Your metrics</span>}
      footer={<button type="button" className="btn" onClick={onClose}>Done</button>}>
      <ManageMetrics />
    </Modal>
  );
}

/**
 * A self-contained "Your metrics" section (list + builder) for pages that want one, e.g. the Improve page:
 * `<MetricsPanel />` inside a Section. Renders nothing for problems without custom metrics.
 */
export function MetricsPanel() {
  const task = useProject((s) => s.project?.task);
  if (task !== "classification" && task !== "regression") return null;
  return (
    <>
      <ManageMetrics />
      <MetricBuilderHost />
    </>
  );
}

