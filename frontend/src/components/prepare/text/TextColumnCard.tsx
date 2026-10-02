import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { DatasetSummary, PipelineSpec } from "../../../lib/types";
import { Select } from "../../glass";
import { setTextColumn, textCandidates, tokenize } from "../../data/text/textData";
import { Note, StageCard } from "../StageCard";

/** Which column holds the text, with a peek at a few of its values. */
export function TextColumnCard({ spec, dataset, textCol, open, onToggle, flash }: {
  spec: PipelineSpec;
  dataset: DatasetSummary | null;
  textCol: string | null;
  open: boolean;
  onToggle: () => void;
  flash: boolean;
}) {
  const options = dataset ? textCandidates(dataset, spec.target) : textCol ? [textCol] : [];
  const k = dataset?.preview.columns.indexOf(textCol ?? "") ?? -1;
  const samples = k >= 0 ? dataset!.preview.rows.map((r) => r[k]).filter((v) => typeof v === "string" && v.trim()).slice(0, 3) as string[] : [];
  return (
    <StageCard id="textcol" icon="💬" title="Text column" open={open} onToggle={onToggle} flash={flash} summary={textCol ?? "choose"}
      why="Which column holds the sentences the model should read."
      info="Only this column is used as input — the model reads its words and learns which ones point to each label. Other columns are ignored in a text project.">
      <div className="row wrap" style={{ gap: 14, alignItems: "center" }}>
        <span className="small" style={{ fontWeight: 600 }}>Read the text in</span>
        <Select value={textCol ?? ""} onChange={(c) => c && c !== textCol && setTextColumn(c)} style={{ minWidth: 200 }}
          options={[...(textCol ? [] : [{ value: "", label: "Choose…" }]), ...options.map((c) => ({ value: c, label: c }))]} />
        <span className="small muted">to predict</span>
        <span className="badge accent" style={{ height: 26, fontSize: 12.5 }}>🎯 {spec.target}</span>
      </div>
      <AnimatePresence mode="wait">
        {samples.length > 0 && (
          <motion.div key={textCol} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.gentle}
            className="inset col" style={{ padding: 12, gap: 8 }}>
            <span className="eyebrow">A few values from ‘{textCol}’</span>
            {samples.map((t, i) => (
              <div key={i} className="row small" style={{ gap: 10, justifyContent: "space-between" }}>
                <span style={{ padding: "6px 12px", borderRadius: "14px 14px 14px 4px", background: "var(--glass-strong)", border: "1px solid var(--hairline)", lineHeight: 1.45, minWidth: 0 }}>{t}</span>
                <span className="tiny faint num" style={{ flexShrink: 0 }}>{tokenize(t).length} words</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {!options.length && <Note icon="⚠️" tone="warn">No column with text found — go back to the Texts step and choose a dataset with a column of sentences.</Note>}
    </StageCard>
  );
}
