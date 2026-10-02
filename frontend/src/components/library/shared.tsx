import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { spring, stagger } from "../../design/motion";
import { LOWER_IS_BETTER, METRIC_HELP, METRIC_LABELS, fmt, pct } from "../../lib/format";
import { useProject } from "../../lib/store";
import type { ModelSpec, SavedModel } from "../../lib/types";
import { metricHelp, metricLabel, primaryMetric } from "../train/util";
import { AnimatedNumber, InfoTip } from "../glass";

/* ---------------------------------------------------------------- page frame (non-wizard pages) */

/** Full-height scrolling page with side padding and a centred max width. Children stagger in. */
export function PageFrame({ children, maxWidth = 1200, scrollRef }: { children: ReactNode; maxWidth?: number; scrollRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={scrollRef} style={{ height: "100%", overflow: "auto", padding: "18px 22px 64px" }}>
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 18, maxWidth, margin: "0 auto" }}>
        {children}
      </motion.div>
    </div>
  );
}

export const rise = {
  hidden: { opacity: 0, y: 12, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" }, transition: spring.gentle },
};

export function PageHeader({ title, subtitle, eyebrow, right }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; right?: ReactNode }) {
  return (
    <motion.div variants={rise} className="row between wrap" style={{ gap: 16, padding: "6px 4px 2px", alignItems: "flex-end" }}>
      <div className="col" style={{ gap: 6, minWidth: 0 }}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 style={{ fontSize: 32 }}>{title}</h1>
        {subtitle && <p className="muted" style={{ fontSize: 15, maxWidth: 680 }}>{subtitle}</p>}
      </div>
      {right}
    </motion.div>
  );
}

/** Heading for a section inside a page: icon, title, one-line explanation. */
export function SectionTitle({ icon, title, subtitle, right, id }: { icon: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div id={id} className="row between wrap" style={{ gap: 12, marginBottom: 14, scrollMarginTop: 66 }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{icon}</span>
        <div className="col" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 21 }}>{title}</h2>
          {subtitle && <span className="small muted" style={{ maxWidth: 640, lineHeight: 1.5 }}>{subtitle}</span>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------------- registry lookups */

/** The model registry (cached in the project store), loaded on first use. */
export function useRegistry(): ModelSpec[] {
  const registry = useProject((s) => s.registry);
  useEffect(() => {
    useProject.getState().ensureRegistry().catch(() => { /* emoji fallback is fine */ });
  }, []);
  return registry;
}

export const specFor = (registry: ModelSpec[], modelId: string) => registry.find((s) => s.id === modelId);
export const emojiFor = (registry: ModelSpec[], m: Pick<SavedModel, "model_id" | "family">) =>
  specFor(registry, m.model_id)?.emoji ?? (m.family === "torch" ? "🧠" : "🌳");

export const TASK_META: Record<string, { label: string; icon: string; badge: string }> = {
  classification: { label: "Classification", icon: "🏷️", badge: "accent" },
  regression: { label: "Regression", icon: "📈", badge: "success" },
  clustering: { label: "Clustering", icon: "🫧", badge: "warning" },
  reduction: { label: "Data map", icon: "🗺️", badge: "accent" },
  anomaly: { label: "Anomaly detection", icon: "🚨", badge: "danger" },
  recommendation: { label: "Recommender", icon: "🎬", badge: "accent" },
};
export const taskMeta = (task: string) => TASK_META[task] ?? { label: task, icon: "🤖", badge: "" };

/** Saved models of the clustering / map / anomaly kind (SavedModel.task is typed for supervised tasks only). */
export const isUnsupModel = (m: Pick<SavedModel, "task">) => ["clustering", "reduction", "anomaly"].includes(m.task as string);

/** Saved recommenders (user–item ratings in, top-k lists out). */
export const isRecsysModel = (m: Pick<SavedModel, "task" | "modality">) => (m.task as string) === "recommendation" || m.modality === "ratings";

/** Saved models that read free text (one text input). */
export const isTextModel = (m: Pick<SavedModel, "modality" | "input_schema">) => m.modality === "text" || m.input_schema?.[0]?.type === "text";

/* ---------------------------------------------------------------- metrics */

const RATIO = new Set(["accuracy", "balanced_accuracy", "precision", "recall", "f1", "f1_weighted", "roc_auc", "avg_precision", "r2", "explained_variance", "mape",
  "purity", "trustworthiness", "explained_2d", "explained_all", "flagged_share", "noise_share",
  "recall_at_10", "precision_at_10", "hit_rate", "coverage", "novelty"]);

export const isRatioMetric = (k: string) => RATIO.has(k);
export const formatMetric = (k: string, v: number | null | undefined) => (v === null || v === undefined ? "—" : RATIO.has(k) ? pct(v, 1) : fmt(v, 3));

/**
 * The single number we lead with for a model: accuracy for classifiers, R² for regressors, the problem's primary metric
 * for unsupervised models. `text` is display-ready, `ring` in 0…1 and `tone` a colour for the progress ring.
 */
export function headline(m: Pick<SavedModel, "task" | "metrics">): { key: string; label: string; value: number | null; text: string; ring: number; tone: string } {
  const test = m.metrics?.test ?? {};
  const task = m.task as string;
  let key = primaryMetric(task);
  if (task === "anomaly" && test[key] === undefined) key = "flagged_share";
  // recommenders lead with the plainest number: share of liked films found in the top 10
  if (task === "recommendation" && test.recall_at_10 !== undefined) key = "recall_at_10";
  const value = test[key] ?? null;
  const ring = value === null ? 0 : Math.max(0, Math.min(1, value));
  const [good, ok] = key === "silhouette" ? [0.5, 0.25] : key === "flagged_share" ? [2, 2] : key === "recall_at_10" ? [0.3, 0.15] : [0.85, 0.6];
  const tone = ring >= good ? "var(--success)" : ring >= ok ? "var(--accent)" : key === "flagged_share" ? "var(--accent-2)" : "var(--warning)";
  return { key, label: METRIC_LABELS[key] ?? metricLabel(key), value, text: formatMetric(key, value), ring, tone };
}

const ORDER = ["accuracy", "balanced_accuracy", "f1", "roc_auc", "precision", "recall", "mcc", "log_loss", "r2", "mae", "rmse", "mape",
  "silhouette", "davies_bouldin", "ari", "nmi", "purity", "trustworthiness", "explained_2d", "avg_precision", "flagged_share"];

/** Animated metric tiles with plain-language help and the training score for comparison. */
export function MetricTiles({ metrics, train, limit = 6, minWidth = 140 }: { metrics: Record<string, number>; train?: Record<string, number>; limit?: number; minWidth?: number }) {
  const keys = ORDER.filter((k) => metrics[k] !== undefined && metrics[k] !== null).slice(0, limit);
  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: 10 }}>
      {keys.map((k) => {
        const v = metrics[k];
        const ratio = RATIO.has(k);
        return (
          <motion.div key={k} variants={rise} className="inset" style={{ padding: "12px 14px" }}>
            <div className="row small muted" style={{ gap: 6 }}>
              <span className="truncate">{METRIC_LABELS[k] ?? metricLabel(k)}</span>
              {(METRIC_HELP[k] ?? metricHelp(k)) && <InfoTip text={METRIC_HELP[k] ?? metricHelp(k)} />}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>
              <AnimatedNumber value={v} format={(x) => (ratio ? pct(x, 1) : fmt(x, 3))} />
            </div>
            {train?.[k] !== undefined && (
              <div className="tiny faint num">training: {formatMetric(k, train[k])}{LOWER_IS_BETTER.has(k) ? " · lower is better" : ""}</div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ---------------------------------------------------------------- inline editable text */

/** Text that turns into an input on click (or when `editing` is forced). Commits on Enter/blur, Escape cancels. */
export function EditableText({ value, onSave, placeholder, style, multiline, editing: forced, onDone }: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  editing?: boolean;
  onDone?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const active = editing || !!forced;
  useEffect(() => {
    if (active) {
      setDraft(value);
      requestAnimationFrame(() => { ref.current?.focus(); ref.current?.select(); });
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = (save: boolean) => {
    if (save && draft.trim() !== value.trim() && (multiline || draft.trim())) onSave(multiline ? draft : draft.trim());
    setEditing(false);
    onDone?.();
  };
  const common = {
    ref,
    value: draft,
    placeholder,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: () => finish(true),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      if (e.key === "Enter" && (!multiline || e.metaKey)) { e.preventDefault(); finish(true); }
    },
    className: "input",
    style: { ...style, width: "100%", font: "inherit", letterSpacing: "inherit", padding: "2px 8px", marginLeft: -9, height: "auto" },
  };
  if (active) return multiline ? <textarea rows={2} {...common} /> : <input {...common} />;
  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      style={{ ...style, cursor: "text", borderRadius: 8, display: "block", color: value ? undefined : "var(--text-3)" }}
    >
      {value || placeholder}
    </span>
  );
}

/** Cross-fading content keyed by `k` (used for big changing labels). */
export function Swap({ k, children, style }: { k: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: "relative", display: "grid", ...style }}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div key={k} initial={{ opacity: 0, y: 14, filter: "blur(8px)", scale: 0.96 }} animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" }, scale: 1 }}
          exit={{ opacity: 0, y: -14, filter: "blur(8px)", scale: 0.96 }} transition={spring.snappy} style={{ gridArea: "1 / 1" }}>
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
