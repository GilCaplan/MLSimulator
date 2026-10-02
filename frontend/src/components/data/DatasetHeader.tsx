import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "../../design/motion";
import { navigate } from "../../lib/router";
import type { DatasetProfile, DatasetSummary, Project } from "../../lib/types";
import { AnimatedNumber, Glass, InfoTip, Select, Tooltip } from "../glass";

const SOURCE: Record<DatasetSummary["source"], { label: string; icon: string; cls: string }> = {
  upload: { label: "Uploaded", icon: "📁", cls: "" },
  synthetic: { label: "Designed", icon: "🧪", cls: "accent" },
  preset: { label: "Toy shape", icon: "🧩", cls: "accent" },
  sample: { label: "Sample", icon: "📚", cls: "success" },
  composed: { label: "Mixed with synthetic", icon: "🧬", cls: "warning" },
  image_set: { label: "Image set", icon: "🖼️", cls: "success" },
  text_set: { label: "Text set", icon: "💬", cls: "success" },
  ratings_set: { label: "Ratings set", icon: "🎬", cls: "success" },
  timeseries_set: { label: "Time series", icon: "⏱️", cls: "success" },
  lesson: { label: "Lesson data", icon: "🎓", cls: "accent" },
};

const ROLE_ICON: Record<string, string> = { numeric: "🔢", categorical: "🏷️", id: "🆔", text: "📝", datetime: "📅" };

/** Dataset name/size card + the "What do you want to predict?" picker. */
export function DatasetHeader({ dataset, project, profile, pickerOpen, onTogglePicker, onEditDesign, onTarget, picker }: {
  dataset: DatasetSummary;
  project: Project;
  profile: DatasetProfile | null;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onEditDesign?: () => void;
  onTarget: (t: string) => void;
  /** replaces the "what do you want to predict?" row (unsupervised projects pick a hidden truth instead) */
  picker?: ReactNode;
}) {
  const src = SOURCE[dataset.source] ?? SOURCE.upload;
  const target = project.target ?? "";
  const mismatch = !picker && profile?.task_guess && project.task && profile.task_guess !== project.task;
  const options = [
    ...(target ? [] : [{ value: "", label: "Choose a column…" }]),
    ...dataset.columns.map((c) => ({ value: c.name, label: `${ROLE_ICON[c.role] ?? ""} ${c.name}` })),
  ];
  return (
    <Glass animate_in variant="strong">
      <div className="row between wrap" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14, minWidth: 0 }}>
          <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ width: 52, height: 52, borderRadius: 16, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, boxShadow: "0 8px 22px rgba(94,92,230,.3)" }}>
            {src.icon}
          </motion.div>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <h2 className="truncate" style={{ fontSize: 21 }}>{dataset.name}</h2>
              <span className={`badge ${src.cls}`}>{src.label}</span>
            </div>
            <span className="muted num" style={{ fontSize: 13.5 }}>
              <b style={{ color: "var(--text)" }}><AnimatedNumber value={dataset.n_rows} format={(v) => Math.round(v).toLocaleString()} /></b> rows ×{" "}
              <b style={{ color: "var(--text)" }}><AnimatedNumber value={dataset.n_cols} /></b> columns
              {dataset.image_shape && <span className="badge" style={{ marginLeft: 8 }}>🖼️ {dataset.image_shape[0]}×{dataset.image_shape[1]} images</span>}
              {(dataset.n_duplicates ?? 0) > 0 && (
                <Tooltip content="Rows that are exact copies of another row. Copies can land in both train and test, so the model gets tested on answers it memorised. You can remove them in Prepare → Clean.">
                  <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop} className="badge warning" style={{ marginLeft: 8, cursor: "help" }}>
                    👯 {dataset.n_duplicates!.toLocaleString()} duplicate row{dataset.n_duplicates === 1 ? "" : "s"}
                  </motion.span>
                </Tooltip>
              )}
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {onEditDesign && <button className="btn" onClick={onEditDesign}>🧪 Edit design</button>}
          <button className={`btn ${pickerOpen ? "primary" : ""}`} onClick={onTogglePicker}>{pickerOpen ? "✕ Close" : "🔄 Change data"}</button>
        </div>
      </div>

      <div className="divider" style={{ margin: "16px 0" }} />

      {picker ?? (
        <div className="row wrap" style={{ gap: 14 }}>
          <span className="row" style={{ gap: 6, fontWeight: 650, fontSize: 15 }}>
            🎯 What do you want to predict?
            <InfoTip text="Pick the column that holds the answer. Every other column becomes a clue (a 'feature') the models can use." />
          </span>
          <Select value={target} options={options} onChange={onTarget} style={{ minWidth: 220, fontWeight: 600 }} />
        </div>
      )}
      <AnimatePresence>
        {mismatch && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="row small" style={{ gap: 10, marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--warning) 12%, transparent)" }}>
              <span>💡</span>
              <span className="grow">
                “{target}” looks like a <b>{profile!.task_guess}</b> target ({profile!.task_guess === "regression" ? "lots of different numbers" : "a handful of categories"}),
                but this project is set up for <b>{project.task}</b>.
              </span>
              <button className="btn sm" onClick={() => navigate(`/p/${project.id}/problem`)}>Change problem type</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Glass>
  );
}
