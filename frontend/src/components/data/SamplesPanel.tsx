import { motion } from "framer-motion";
import { useState } from "react";
import { spring, stagger } from "../../design/motion";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { Catalog, DatasetSummary, Task } from "../../lib/types";
import { Glass, Spinner } from "../glass";
import { SectionTitle } from "./ui";

/** Gallery of ready-made sample datasets, matching problem type first. */
export function SamplesPanel({ catalog, task, onLoaded }: { catalog: Catalog; task: Task | null; onLoaded: (d: DatasetSummary) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const entries = Object.entries(catalog.samples).sort(([, a], [, b]) => Number(b.task === task) - Number(a.task === task));
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
      <SectionTitle icon="📚" title="Sample datasets" sub="Classic, well-understood data — perfect for a first experiment." />
      <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
        {entries.map(([name, s]) => {
          const other = !!task && s.task !== task;
          return (
            <motion.button
              key={name}
              variants={{ hidden: { opacity: 0, y: 12, scale: 0.96 }, show: { opacity: other ? 0.55 : 1, y: 0, scale: 1, transition: spring.gentle } }}
              whileHover={{ y: -3, opacity: 1 }}
              whileTap={{ scale: 0.97 }}
              disabled={!!busy}
              onClick={() => pick(name)}
              className="inset col"
              style={{ padding: 16, gap: 8, textAlign: "left", cursor: busy ? "wait" : "pointer", alignItems: "flex-start", border: "1px solid var(--hairline)" }}
            >
              <div className="row between" style={{ width: "100%" }}>
                <span style={{ fontSize: 30, lineHeight: 1 }}>{s.emoji}</span>
                {busy === name ? <Spinner size={16} color="var(--accent)" /> : (
                  <span className={`badge ${s.task === "classification" ? "accent" : "success"}`}>{s.task === "classification" ? "Classify" : "Regress"}</span>
                )}
              </div>
              <b style={{ fontSize: 14 }}>{s.label}</b>
              <span className="small muted" style={{ lineHeight: 1.45 }}>{s.blurb}</span>
              {other && <span className="tiny faint">Different problem type</span>}
            </motion.button>
          );
        })}
      </motion.div>
    </Glass>
  );
}
