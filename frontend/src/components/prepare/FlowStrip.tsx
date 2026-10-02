import { AnimatePresence, motion } from "framer-motion";
import { Fragment, type ReactNode } from "react";
import { spring } from "../../design/motion";
import { useUI } from "../../lib/store";
import type { PipelineSpec } from "../../lib/types";
import type { StageId } from "./StageCard";

export const STAGE_ICONS: Record<StageId, string> = {
  clean: "🧹", features: "🛠️", encode: "🔤", outliers: "🎯", split: "✂️", scale: "📏", select: "🔍", balance: "⚖️", target: "📈",
};
export const STAGE_NAMES: Record<StageId, string> = {
  clean: "Clean", features: "Features", encode: "Encode", outliers: "Outliers", split: "Split", scale: "Scale", select: "Select", balance: "Balance", target: "Target",
};

const IMPUTE_SHORT: Record<PipelineSpec["impute"]["numeric"], string> = { median: "median", mean: "mean", most_frequent: "most common", zero: "zero", drop_rows: "drop rows" };
const SCALE_SHORT: Record<PipelineSpec["scale"]["method"], string> = { none: "off", standard: "standard", minmax: "min-max", robust: "robust" };
const OVER_SHORT: Record<PipelineSpec["resample"]["over"], string> = { random: "copies", smote: "SMOTE", borderline_smote: "B-SMOTE", adasyn: "ADASYN", svm_smote: "SVM-SMOTE" };
const UNDER_SHORT: Record<PipelineSpec["resample"]["under"], string> = { random: "trim", nearmiss: "NearMiss", cluster_centroids: "centroids" };

/** One-word state shown on each chip of the strip. */
export function stageState(id: StageId, spec: PipelineSpec, hasCategorical: boolean): string {
  switch (id) {
    case "clean": return `${IMPUTE_SHORT[spec.impute.numeric]}${spec.dedupe?.enabled ? " · dedupe" : ""}`;
    case "features": {
      const n = (spec.features || []).length;
      return n ? `${n} new` : "none";
    }
    case "encode": return hasCategorical ? (spec.encode.method === "onehot" ? "one-hot" : "ordinal") : "n/a";
    case "outliers": return spec.outliers.enabled ? (spec.outliers.method === "iqr" ? "IQR" : "z-score") : "off";
    case "split": {
      const te = Math.round(spec.split.test_size * 100), va = Math.round(spec.split.val_size * 100);
      const m = spec.split.method ?? "random";
      return `${m === "group" ? "👥 " : m === "time" ? "🕒 " : ""}${100 - te - va}/${va}/${te}`;
    }
    case "scale": return SCALE_SHORT[spec.scale.method];
    case "select": {
      const f = spec.feature_select;
      return f.method === "none" ? "all" : f.method === "variance" ? "variance" : `top ${f.k}`;
    }
    case "target": return [spec.target_filter?.enabled ? "range" : "", spec.target_transform === "log1p" ? "log(1+y)" : ""].filter(Boolean).join(" + ") || "as is";
    case "balance": {
      const r = spec.resample;
      const base = r.mode === "none" ? "off" : r.mode === "oversample" ? OVER_SHORT[r.over] : r.mode === "undersample" ? UNDER_SHORT[r.under] : r.mode === "middle" ? "middle" : "custom";
      return r.clean !== "none" ? (r.mode === "none" ? (r.clean === "tomek" ? "Tomek" : "ENN") : `${base}+${r.clean === "tomek" ? "T" : "E"}`) : base;
    }
  }
}

/** Is the stage actively changing the data (vs. switched off)? */
function stageActive(id: StageId, spec: PipelineSpec, hasCategorical: boolean) {
  switch (id) {
    case "features": return (spec.features || []).length > 0;
    case "encode": return hasCategorical;
    case "outliers": return spec.outliers.enabled;
    case "scale": return spec.scale.method !== "none";
    case "select": return spec.feature_select.method !== "none";
    case "target": return spec.target_transform !== "none" || !!spec.target_filter?.enabled;
    case "balance": return spec.resample.mode !== "none" || spec.resample.clean !== "none";
    default: return true;
  }
}

/** Horizontal pipeline overview: glass chips joined by flowing connectors. A glow travels along it while running. */
export function FlowStrip({ stages, spec, hasCategorical, running, onPick, header }: {
  stages: StageId[];
  spec: PipelineSpec;
  hasCategorical: boolean;
  running: boolean;
  onPick: (id: StageId) => void;
  header?: ReactNode;
}) {
  const reduce = useUI((s) => s.reduceMotion);
  return (
    <div className="glass strong" style={{ padding: "14px 16px 16px", borderRadius: "var(--r-lg)", overflow: "hidden", background: "linear-gradient(var(--glass-strong), var(--glass-strong)), color-mix(in srgb, var(--bg) 78%, transparent)" }}>
      <style>{`
        @keyframes mlpFlow { from { background-position: 0 0; } to { background-position: 24px 0; } }
        .mlp-flowline { background-image: repeating-linear-gradient(90deg, var(--accent) 0 6px, transparent 6px 12px); background-size: 24px 2px; background-repeat: repeat-x; background-position-y: center; animation: mlpFlow 1.2s linear infinite; }
        .mlp-flowline.off { background-image: repeating-linear-gradient(90deg, var(--text-3) 0 6px, transparent 6px 12px); animation-duration: 2.4s; }
      `}</style>
      {header}
      <div style={{ position: "relative", marginTop: header ? 12 : 0 }}>
        <div className="row" style={{ gap: 0, overflowX: "auto", padding: "4px 2px 6px" }}>
          {stages.map((id, i) => {
            const active = stageActive(id, spec, hasCategorical);
            return (
              <Fragment key={id}>
                {i > 0 && (
                  <div style={{ flex: "1 0 14px", minWidth: 14, maxWidth: 40, height: 10, position: "relative", display: "flex", alignItems: "center" }}>
                    <div className={`mlp-flowline ${active ? "" : "off"}`} style={{ height: 2, width: "100%", opacity: 0.55, animationPlayState: reduce ? "paused" : "running" }} />
                    <span style={{ position: "absolute", right: -2, top: -1, fontSize: 9, color: active ? "var(--accent)" : "var(--text-3)", opacity: 0.8 }}>▶</span>
                  </div>
                )}
                <Chip id={id} label={stageState(id, spec, hasCategorical)} active={active} onClick={() => onPick(id)} index={i} running={running && !reduce} />
              </Fragment>
            );
          })}
        </div>
        <AnimatePresence>
          {running && !reduce && (
            <motion.div
              key="pulse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, left: ["-12%", "100%"] }}
              exit={{ opacity: 0 }}
              transition={{ left: { duration: 1.6, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.3 } }}
              style={{ position: "absolute", top: "50%", width: "12%", height: 46, marginTop: -23, pointerEvents: "none", borderRadius: 30, background: "radial-gradient(ellipse at center, rgba(10,132,255,.55), rgba(191,90,242,.25) 45%, transparent 70%)", filter: "blur(6px)", mixBlendMode: "screen" }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Chip({ id, label, active, onClick, index, running }: { id: StageId; label: string; active: boolean; onClick: () => void; index: number; running: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 8, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: running ? [1, 1.06, 1] : 1 }}
      transition={running ? { scale: { duration: 1.6, repeat: Infinity, delay: index * 0.2 }, default: spring.gentle } : { ...spring.gentle, delay: index * 0.04 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.95 }}
      className="glass thin"
      style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 12px 7px", minWidth: 78, borderRadius: 16, cursor: "pointer", color: "inherit", opacity: active ? 1 : 0.66 }}
      title={`Jump to ${STAGE_NAMES[id]}`}
    >
      <span style={{ fontSize: 18, filter: active ? "none" : "grayscale(0.7)" }}>{STAGE_ICONS[id]}</span>
      <span style={{ fontSize: 12, fontWeight: 650 }}>{STAGE_NAMES[id]}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.16 }}
          className="tiny num"
          style={{ color: active ? "var(--accent)" : "var(--text-3)", fontWeight: 600, whiteSpace: "nowrap" }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
