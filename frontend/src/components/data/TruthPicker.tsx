import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../design/motion";
import { classColor } from "../../lib/colors";
import type { DatasetSummary } from "../../lib/types";
import { InfoTip, Select } from "../glass";

const ROLE_ICON: Record<string, string> = { numeric: "🔢", categorical: "🏷️", id: "🆔", text: "📝", datetime: "📅" };

const PURPOSE: Record<string, string> = {
  clustering: "it's only used afterwards to judge whether the groups make sense",
  reduction: "it's only used afterwards to colour the map, so you can see whether similar rows land together",
  anomaly: "it's only used afterwards to check whether the flagged rows are the real oddities (its rarer value counts as “unusual”)",
};

/** Unsupervised projects: optional "hidden truth" column, kept away from the models and used only to grade the result. */
export function TruthPicker({ dataset, task, truth, onChange }: {
  dataset: DatasetSummary;
  task: string;
  truth: string | null;
  onChange: (t: string | null) => void;
}) {
  const col = truth ? dataset.columns.find((c) => c.name === truth) : undefined;
  const options = [
    { value: "", label: "— None: explore blind" },
    ...dataset.columns.map((c) => ({ value: c.name, label: `${ROLE_ICON[c.role] ?? ""} ${c.name}` })),
  ];
  const groups = col?.top?.labels ?? [];
  const many = !!col && col.unique > 30;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 6, fontWeight: 650, fontSize: 15 }}>
          <motion.span animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3 }}>🙈</motion.span>
          Hidden truth <span className="muted" style={{ fontWeight: 500 }}>(for checking only)</span>
          <InfoTip text="Unsupervised learning has no answer column. But if you happen to know the real groups for some data (like in these samples), we can hide that column from the models and use it afterwards as an answer key." />
        </span>
        <Select value={truth ?? ""} options={options} onChange={(v) => onChange(v || null)} style={{ minWidth: 220, fontWeight: 600 }} />
      </div>
      <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 720 }}>
        The models <b>never see it</b>; {PURPOSE[task] ?? PURPOSE.clustering} — real projects rarely have this.
      </p>
      <AnimatePresence mode="wait" initial={false}>
        {col ? (
          <motion.div key={col.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.gentle}
            className="row wrap" style={{ gap: 8, padding: "10px 12px", borderRadius: 12, background: many ? "rgba(255,159,10,.12)" : "var(--accent-soft)" }}>
            <span className="badge" style={{ background: "var(--glass-strong)" }}>🔒 “{col.name}” is locked away from the models</span>
            {many ? (
              <span className="small" style={{ color: "var(--text-2)" }}>⚠️ It has {col.unique.toLocaleString()} different values — an answer key works best with a handful of categories.</span>
            ) : (
              <>
                <span className="small muted">{col.unique} value{col.unique === 1 ? "" : "s"}:</span>
                {groups.slice(0, 8).map((g, i) => (
                  <motion.span key={g} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.pop, delay: 0.05 * i }} className="row tiny" style={{ gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: classColor(g, groups) }} />{g}
                  </motion.span>
                ))}
                {groups.length > 8 && <span className="tiny faint">+{groups.length - 8} more</span>}
              </>
            )}
          </motion.div>
        ) : (
          <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="tiny faint">
            Exploring blind — exactly like a real project. The results will be judged on how tidy the structure is.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
