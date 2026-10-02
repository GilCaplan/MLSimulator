import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../../design/motion";
import { navigate } from "../../../lib/router";
import type { DatasetProfile, DatasetSummary, Project } from "../../../lib/types";
import { AnimatedNumber, Glass, InfoTip } from "../../glass";
import { storedSize, Thumb } from "./Thumb";

/** Image dataset card: name, picture count and size, what's being predicted, and a peek at a few pictures. */
export function ImageHeader({ dataset, project, profile, pickerOpen, onTogglePicker }: {
  dataset: DatasetSummary;
  project: Project;
  profile: DatasetProfile | null;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}) {
  const size = storedSize(dataset.image_shape);
  const shape = dataset.image_shape as number[] | undefined;
  const channels = shape?.length === 3 ? shape[0] : 3;
  const n = dataset.n_images ?? dataset.n_rows;
  const isClf = project.task === "classification";
  const nClasses = profile?.class_balance ? profile.class_balance.labels.length + (profile.class_balance.other ? 1 : 0) : null;
  const mismatch = profile?.task_guess && project.task && profile.task_guess !== project.task;
  const peek = profile?.samples ? Object.values(profile.samples).flatMap((v) => v.slice(0, 2)).slice(0, 6) : [];
  return (
    <Glass animate_in variant="strong">
      <div className="row between wrap" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14, minWidth: 0 }}>
          <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ width: 52, height: 52, borderRadius: 16, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, boxShadow: "0 8px 22px rgba(94,92,230,.3)" }}>
            {dataset.source === "upload" ? "📦" : "🖼️"}
          </motion.div>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <h2 className="truncate" style={{ fontSize: 21 }}>{dataset.name}</h2>
              <span className={`badge ${dataset.source === "upload" ? "" : "success"}`}>{dataset.source === "upload" ? "Uploaded" : "Image set"}</span>
            </div>
            <span className="muted num row wrap" style={{ fontSize: 13.5, gap: 8 }}>
              <span><b style={{ color: "var(--text)" }}><AnimatedNumber value={n} format={(v) => Math.round(v).toLocaleString()} /></b> pictures</span>
              <span className="badge">📐 {size}×{size} px</span>
              <span className="badge">{channels === 1 ? "⚫ greyscale" : "🎨 colour"}</span>
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 4 }}>
            {peek.map((i, k) => <Thumb key={i} datasetId={dataset.id} i={i} size={size} box={34} delay={0.1 + k * 0.05} />)}
          </div>
          <button className={`btn ${pickerOpen ? "primary" : ""}`} onClick={onTogglePicker}>{pickerOpen ? "✕ Close" : "🔄 Change pictures"}</button>
        </div>
      </div>

      <div className="divider" style={{ margin: "16px 0" }} />

      <div className="row wrap" style={{ gap: 10 }}>
        <span className="row" style={{ gap: 6, fontWeight: 650, fontSize: 15 }}>
          🎯 The model will learn to answer
          <InfoTip text="Every picture comes with its answer — a class name (from its folder or the labels file) or a number. The model sees the picture and has to guess that answer." />
        </span>
        <span className="badge accent" style={{ height: 28, fontSize: 13 }}>
          {isClf ? <>“What is in this picture?”{nClasses ? ` · ${nClasses} classes` : ""}</> : <>“What number does this picture show?”</>}
        </span>
      </div>
      {(dataset.warnings ?? []).length > 0 && (
        <div className="col small" style={{ gap: 4, marginTop: 12 }}>
          {dataset.warnings!.map((w) => <span key={w} style={{ color: "var(--warning)" }}>⚠️ {w}</span>)}
        </div>
      )}
      <AnimatePresence>
        {mismatch && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="row small" style={{ gap: 10, marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(255,159,10,.12)" }}>
              <span>💡</span>
              <span className="grow">
                These pictures are labelled with {profile!.task_guess === "regression" ? <b>numbers</b> : <b>categories</b>}, but this project is set up for <b>image {project.task}</b>.
              </span>
              <button className="btn sm" onClick={() => navigate(`/p/${project.id}/problem`)}>Change problem type</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Glass>
  );
}
