import { motion } from "framer-motion";
import { useState } from "react";
import { spring, stagger } from "../../design/motion";
import { api } from "../../lib/api";
import { isUnsupervised, toast } from "../../lib/store";
import type { Catalog, DatasetSummary } from "../../lib/types";
import { Glass, Spinner } from "../glass";
import { SectionTitle } from "./ui";

const TASK_BADGE: Record<string, { text: string; cls: string }> = {
  classification: { text: "Classify", cls: "accent" },
  regression: { text: "Regress", cls: "success" },
  clustering: { text: "Groups", cls: "warning" },
  reduction: { text: "Map", cls: "warning" },
  anomaly: { text: "Anomalies", cls: "danger" },
};

/** How well a sample fits the project's problem: 2 = made for it, 1 = works, 0 = different problem type. */
function fit(sampleTask: string, task: string | null): number {
  if (!task || sampleTask === task) return 2;
  if (isUnsupervised(task)) {
    // groups-in-a-table samples also make great maps; anything tabular works for discovery
    if (task === "reduction" && sampleTask === "clustering") return 2;
    return isUnsupervised(sampleTask) || sampleTask === "classification" ? 1 : 0.5;
  }
  return 0;
}

/** Gallery of ready-made sample datasets, matching problem type first. */
export function SamplesPanel({ catalog, task, onLoaded }: { catalog: Catalog; task: string | null; onLoaded: (d: DatasetSummary) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const unsup = isUnsupervised(task);
  const entries = Object.entries(catalog.samples).sort(([, a], [, b]) => fit(b.task, task) - fit(a.task, task));
  const pick = async (name: string) => {
    setBusy(name);
    try {
      const d = await api.sample(name);
      toast.success(`Loaded “${d.name}”.`);
      onLoaded(d);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Glass>
      <SectionTitle icon="📚" title="Sample datasets" sub={unsup
        ? "Made-for-discovery samples come first — but any table works. Samples with an answer column keep it hidden, as an answer key."
        : "Classic, well-understood data — perfect for a first experiment."} />
      <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
        {entries.map(([name, s]) => {
          const f = fit(s.task, task);
          const other = !unsup && f === 0;
          const badge = TASK_BADGE[s.task] ?? TASK_BADGE.classification;
          const best = unsup && f === 2;
          return (
            <motion.button
              key={name}
              variants={{ hidden: { opacity: 0, y: 12, scale: 0.96 }, show: { opacity: other ? 0.55 : 1, y: 0, scale: 1, transition: spring.gentle } }}
              whileHover={{ y: -3, opacity: 1 }}
              whileTap={{ scale: 0.97 }}
              disabled={!!busy}
              onClick={() => pick(name)}
              className="inset col"
              style={{ padding: 16, gap: 8, textAlign: "left", cursor: busy ? "wait" : "pointer", alignItems: "flex-start", border: "1px solid var(--hairline)", ...(best ? { borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" } : {}) }}
            >
              <div className="row between" style={{ width: "100%" }}>
                <span style={{ fontSize: 30, lineHeight: 1 }}>{s.emoji}</span>
                {busy === name ? <Spinner size={16} color="var(--accent)" /> : (
                  <span className={`badge ${badge.cls}`}>{badge.text}</span>
                )}
              </div>
              <b style={{ fontSize: 14 }}>{s.label}</b>
              <span className="small muted" style={{ lineHeight: 1.45 }}>{s.blurb}</span>
              {other && <span className="tiny faint">Different problem type</span>}
              {best && <span className="tiny" style={{ color: "var(--accent)", fontWeight: 650 }}>✨ Made for this — with a hidden answer key</span>}
              {unsup && f < 2 && s.task === "classification" && <span className="tiny faint">Its answer column becomes the hidden truth</span>}
            </motion.button>
          );
        })}
      </motion.div>
    </Glass>
  );
}
