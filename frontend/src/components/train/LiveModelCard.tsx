import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { spring } from "../../design/motion";
import { colorAt } from "../../lib/colors";
import { useProject, type LiveModel } from "../../lib/store";
import { Glass, ProgressBar, ProgressRing, Tooltip } from "../glass";
import { LineChart, type Series } from "../charts";
import { NetworkDiagram } from "../nn/NetworkDiagram";
import { alignWeights, diagramLayers } from "./archLayers";
import { LiveClusterWalk, WalkExplainer } from "./unsup/LiveClusterWalk";
import { archFor, fmtMetric, metricHelp, metricLabel, nFeatures, nOutputs, primaryMetric } from "./util";
import { isUnsupervised } from "../../lib/store";

const STATE: Record<LiveModel["state"], { label: string; cls: string; color: string }> = {
  queued: { label: "Queued", cls: "", color: "var(--text-3)" },
  running: { label: "Training", cls: "accent", color: "var(--accent)" },
  evaluating: { label: "Evaluating", cls: "warning", color: "var(--warning)" },
  done: { label: "Done", cls: "success", color: "var(--success)" },
  failed: { label: "Failed", cls: "danger", color: "var(--danger)" },
};

export function curveSeries(points: LiveModel["points"]): { series: Series[]; kind: "loss" | "score" | null } {
  const has = (k: keyof LiveModel["points"][number]) => points.some((p) => p[k] !== null && p[k] !== undefined);
  if (has("train_loss") || has("val_loss")) {
    const s: Series[] = [];
    if (has("train_loss")) s.push({ name: "Training loss", color: "#0A84FF", points: points.map((p) => ({ x: p.step, y: p.train_loss })) });
    if (has("val_loss")) s.push({ name: "Validation loss", color: "#FF375F", points: points.map((p) => ({ x: p.step, y: p.val_loss })) });
    return { series: s, kind: "loss" };
  }
  if (has("train_score") || has("val_score")) {
    const s: Series[] = [];
    if (has("train_score")) s.push({ name: "Training score", color: "#0A84FF", points: points.map((p) => ({ x: p.step, y: p.train_score })) });
    if (has("val_score")) s.push({ name: "Validation score", color: "#30D158", points: points.map((p) => ({ x: p.step, y: p.val_score })) });
    return { series: s, kind: "score" };
  }
  return { series: [], kind: null };
}

/** One model's live card on the training dashboard. */
export function LiveModelCard({ m, index }: { m: LiveModel; index: number }) {
  const project = useProject((s) => s.project);
  const spec = useProject((s) => s.registry.find((r) => r.id === m.model_id));
  const st = STATE[m.state];
  const metric = primaryMetric(project?.task);
  const cfg = project?.models.find((c) => c.key === m.key);
  const imageShape = useProject((s) => s.report?.image_shape);
  const layers = useMemo(() => (m.nn ? diagramLayers(archFor(cfg ?? { model_id: m.model_id, nn_arch: null }), nFeatures(), nOutputs(), imageShape) : null), [m.nn, cfg, m.model_id, imageShape]);
  const weights = useMemo(() => (layers ? alignWeights(m.weights, layers) : undefined), [layers, m.weights]);
  const { series, kind } = curveSeries(m.points);
  const active = m.state === "running" || m.state === "evaluating";
  const indeterminate = m.state === "running" && !m.epochs && (!m.iter || m.iter.n === 0 || isUnsupervised(project?.task));
  const unsup = isUnsupervised(project?.task);
  const walk = unsup && (m.model_id === "kmeans" || m.model_id === "gmm" || !!m.clusterSteps?.length);
  const test = m.metrics?.test?.[metric];
  const wide = m.nn || walk;

  const counter = m.epochs
    ? m.state === "done" && (m.epoch ?? 0) < m.epochs ? `Stopped early at epoch ${m.epoch} / ${m.epochs}` : `Epoch ${m.epoch ?? 0} / ${m.epochs}`
    : m.nn && m.state === "running" ? "Warming up the network…"
    : walk && m.clusterSteps?.length && m.state === "running"
      ? `Iteration ${m.clusterSteps.length} · up to ${m.iter?.n ?? "?"}`
    : m.iter && m.iter.n > 0 && !walk
      ? `Step ${m.iter.i} / ${m.iter.n}`
      : m.state === "running" ? (unsup ? "Exploring…" : "Fitting…") : m.state === "evaluating" ? (unsup ? "Scoring the result…" : "Grading on test rows…") : m.state === "queued" ? "Waiting its turn" : "";

  return (
    <motion.div layout initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.gentle, delay: index * 0.05 }}
      style={{ gridColumn: wide ? "span 2" : undefined, minWidth: 0 }}>
      <Glass style={{ height: "100%", padding: 16, opacity: m.state === "queued" ? 0.7 : 1, borderColor: m.state === "done" ? "rgba(48,209,88,.45)" : undefined, transition: "border-color .4s, opacity .4s" }}>
        <div className="row" style={{ gap: 12, marginBottom: 12 }}>
          <ProgressRing value={m.state === "done" ? 1 : m.pct} size={46} color={st.color}>
            <motion.span key={m.state === "done" ? "d" : "e"} initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop} style={{ fontSize: 18 }}>
              {m.state === "done" ? "✓" : m.state === "failed" ? "✕" : spec?.emoji ?? "🤖"}
            </motion.span>
          </ProgressRing>
          <div className="col grow" style={{ gap: 2 }}>
            <b className="truncate" style={{ fontSize: 14 }}>{m.label}</b>
            <span className="tiny faint num">{counter}</span>
          </div>
          <div className="col" style={{ gap: 4, alignItems: "flex-end" }}>
            <span className={`badge ${st.cls}`}>
              {active && <span style={{ width: 6, height: 6, borderRadius: 3, background: "currentColor", animation: "pulse 1.2s infinite" }} />}
              {st.label}
            </span>
            {m.device && (
              <Tooltip content={m.device === "cpu" ? "Training on the processor." : `Training on the graphics chip (${m.device}) — usually faster.`}>
                <span className="badge" style={{ fontSize: 10.5 }}>{m.device === "mps" ? "⚡ GPU (mps)" : m.device === "cpu" ? "🖥️ CPU" : `⚡ ${m.device}`}</span>
              </Tooltip>
            )}
          </div>
        </div>

        <div style={{ display: wide ? "grid" : "block", gridTemplateColumns: wide ? "minmax(0, 1fr) minmax(0, 1fr)" : undefined, gap: 14 }}>
          {walk && <LiveClusterWalk m={m} />}
          {m.nn && layers && (
            <div className="inset" style={{ padding: 6, overflow: "hidden" }}>
              <NetworkDiagram layers={layers} height={170} compact training={m.state === "running"} weights={weights} speed={1.3} />
              <div className="tiny faint" style={{ textAlign: "center", marginTop: -2 }}>
                {m.weights ? "Lines = learned weights · blue positive, pink negative" : "Network warming up…"}
              </div>
            </div>
          )}
          <div className="col" style={{ gap: 8, minWidth: 0 }}>
            <AnimatePresence mode="wait" initial={false}>
              {m.state === "done" ? (
                <motion.div key="done" initial={{ rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={spring.gentle}
                  className="col" style={{ gap: 6, transformPerspective: 600 }}>
                  {series.length > 0 && <LineChart series={series} height={m.nn ? 120 : 100} showLegend={false} />}
                  <div className="row between inset" style={{ padding: "8px 12px" }}>
                    <span className="small muted">{unsup ? metricLabel(metric) : `Test ${metric === "r2" ? "R²" : "accuracy"}`}</span>
                    <b className="num gradient-text" style={{ fontSize: 22 }}>{unsup && test === undefined ? "done" : fmtMetric(metric, test)}</b>
                  </div>
                  {unsup && metricHelp(metric, project?.task) && <span className="tiny faint" style={{ lineHeight: 1.45 }}>{metricHelp(metric, project?.task)!.split(". ")[0]}.</span>}
                </motion.div>
              ) : m.state === "failed" ? (
                <motion.div key="fail" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="small" style={{ color: "var(--danger)", lineHeight: 1.5 }}>
                  {m.error}
                </motion.div>
              ) : walk ? (
                <motion.div key="walk" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <WalkExplainer gmm={m.model_id === "gmm"} />
                </motion.div>
              ) : series.length > 0 ? (
                <motion.div key="chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <LineChart series={series} height={m.nn ? 150 : 120} showLegend={series.length > 1} />
                  <div className="tiny faint" style={{ marginTop: 2 }}>{kind === "loss" ? "Loss = how wrong it is · lower is better" : "Score as it learns · higher is better"}</div>
                </motion.div>
              ) : (
                <motion.div key="fit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col" style={{ gap: 10, padding: "18px 0" }}>
                  {m.state === "queued" ? (
                    <div className="skeleton" style={{ height: 8, opacity: 0.5 }} />
                  ) : (
                    <ProgressBar value={m.pct} indeterminate={indeterminate || m.state === "evaluating"} color={m.state === "evaluating" ? "var(--warning)" : "var(--grad)"} height={8} />
                  )}
                  {(indeterminate || m.state === "evaluating") && (
                    <span className="small" style={{ background: "linear-gradient(90deg, var(--text-3) 0%, var(--text) 50%, var(--text-3) 100%)", backgroundSize: "800px 100%", animation: "shimmer 1.8s infinite linear", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontWeight: 560 }}>
                      {m.state === "evaluating" ? (unsup ? "measuring how good the structure is…" : "grading on unseen rows…") : m.nn ? "warming up the network…" : unsup ? (project?.task === "anomaly" ? "learning what “normal” looks like…" : project?.task === "reduction" ? "folding the data onto a flat map…" : "looking for natural groups…") : "fitting… this model learns in one go"}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {m.cv.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <span className="tiny faint">CV folds</span>
                {m.cv.map((s, i) => (
                  <Tooltip key={i} content={`Fold ${i + 1}: ${fmtMetric(metric, s)}`} width={120}>
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.pop}
                      style={{ width: 10, height: 10, borderRadius: 5, background: colorAt(index), opacity: 0.35 + 0.65 * Math.max(0, Math.min(1, s)), boxShadow: `0 0 0 2px var(--glass-strong)` }} />
                  </Tooltip>
                ))}
                <span className="tiny num muted">{fmtMetric(metric, m.cv.reduce((a, b) => a + b, 0) / m.cv.length)}</span>
              </div>
            )}
          </div>
        </div>
      </Glass>
    </motion.div>
  );
}
