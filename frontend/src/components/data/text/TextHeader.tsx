import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { DatasetProfile, DatasetSummary, Project } from "../../../lib/types";
import { AnimatedNumber, Glass, InfoTip, Select } from "../../glass";
import { labelCandidates, lengthStats, textCandidates } from "./textData";
import { textClassColor } from "./TextInsights";

/** Text dataset card: name and size, and the two choices that matter — which column is the text, which is the answer. */
export function TextHeader({ dataset, project, profile, textCol, pickerOpen, onTogglePicker, onTextCol, onLabel, highlight }: {
  dataset: DatasetSummary;
  project: Project;
  profile: DatasetProfile | null;
  textCol: string | null;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onTextCol: (c: string) => void;
  onLabel: (c: string) => void;
  /** pulse the pickers (right after an upload) */
  highlight: boolean;
}) {
  const texts = textCandidates(dataset, project.target);
  const labels = labelCandidates(dataset, textCol);
  if (project.target && !labels.includes(project.target)) labels.unshift(project.target);
  const stats = lengthStats(profile?.length_hist);
  const cb = profile?.class_balance;
  const classes = cb?.labels ?? [];
  const sample = profile?.examples && classes.length ? profile.examples[classes[0]]?.[0] : null;
  return (
    <Glass animate_in variant="strong">
      <div className="row between wrap" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14, minWidth: 0 }}>
          <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ width: 52, height: 52, borderRadius: 16, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, boxShadow: "0 8px 22px rgba(94,92,230,.3)" }}>
            {dataset.source === "upload" ? "📁" : "💬"}
          </motion.div>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <h2 className="truncate" style={{ fontSize: 21 }}>{dataset.name}</h2>
              <span className={`badge ${dataset.source === "upload" ? "" : "success"}`}>{dataset.source === "upload" ? "Uploaded" : "Text set"}</span>
            </div>
            <span className="muted num row wrap" style={{ fontSize: 13.5, gap: 8 }}>
              <span><b style={{ color: "var(--text)" }}><AnimatedNumber value={dataset.n_rows} format={(v) => Math.round(v).toLocaleString()} /></b> texts</span>
              {stats && <span className="badge">📏 ~{Math.round(stats.mean)} words each</span>}
              {cb && <span className="badge">🏷️ {classes.length + (cb.other ? 1 : 0)} labels</span>}
            </span>
          </div>
        </div>
        <button className={`btn ${pickerOpen ? "primary" : ""}`} onClick={onTogglePicker}>{pickerOpen ? "✕ Close" : "🔄 Change texts"}</button>
      </div>

      <div className="divider" style={{ margin: "16px 0" }} />

      <div className="row wrap" style={{ gap: 16, alignItems: "flex-end" }}>
        <Picker icon="💬" label="Text column" highlight={highlight}
          help="The column with the sentences or messages the model will read. Picked automatically: the column with the longest text.">
          <Select value={textCol ?? ""} onChange={onTextCol} style={{ minWidth: 180 }}
            options={[...(textCol ? [] : [{ value: "", label: "Choose…" }]), ...texts.map((c) => ({ value: c, label: c }))]} />
        </Picker>
        <motion.span className="faint" animate={{ x: [0, 4, 0] }} transition={{ duration: 1.8, repeat: Infinity }} style={{ fontSize: 18, paddingBottom: 6 }}>→</motion.span>
        <Picker icon="🎯" label="Label to predict" highlight={highlight}
          help="The answer the model learns to give for each text — like positive/negative, or which team should handle a ticket.">
          <Select value={project.target ?? ""} onChange={onLabel} style={{ minWidth: 160 }}
            options={[...(project.target ? [] : [{ value: "", label: "Choose…" }]), ...labels.map((c) => ({ value: c, label: c }))]} />
        </Picker>
        <div className="grow" />
        <AnimatePresence mode="wait">
          {sample && (
            <motion.div key={sample} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.gentle}
              className="row" style={{ gap: 8, maxWidth: 420, minWidth: 0 }}>
              <span className="small truncate" style={{ padding: "7px 12px", borderRadius: "14px 14px 14px 4px", background: "var(--fill)", border: "1px solid var(--hairline)", minWidth: 0 }}>“{sample}”</span>
              <span className="faint">→</span>
              <span className="badge" style={{ background: textClassColor(classes[0], classes), color: "white", flexShrink: 0 }}>{classes[0]}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!texts.length && (
        <p className="small" style={{ color: "var(--warning)", marginTop: 12 }}>⚠️ This table has no column with words in it — a text project needs a column of sentences or messages.</p>
      )}
      {(dataset.warnings ?? []).length > 0 && (
        <div className="col small" style={{ gap: 4, marginTop: 12 }}>
          {dataset.warnings!.map((w) => <span key={w} style={{ color: "var(--warning)" }}>⚠️ {w}</span>)}
        </div>
      )}
    </Glass>
  );
}

function Picker({ icon, label, help, highlight, children }: { icon: string; label: string; help: string; highlight: boolean; children: React.ReactNode }) {
  return (
    <motion.div className="col" style={{ gap: 6, padding: 8, margin: -8, borderRadius: 14 }}
      animate={highlight ? { boxShadow: ["0 0 0 0px var(--accent-soft)", "0 0 0 6px var(--accent-soft)", "0 0 0 0px var(--accent-soft)"] } : { boxShadow: "0 0 0 0px rgba(0,0,0,0)" }}
      transition={highlight ? { duration: 1.4, repeat: 2 } : { duration: 0.2 }}>
      <span className="row small" style={{ gap: 6, fontWeight: 650 }}>{icon} {label} <InfoTip text={help} /></span>
      {children}
    </motion.div>
  );
}
