import { motion } from "framer-motion";
import { fadeUp, spring, stagger } from "../../design/motion";
import { navigate } from "../../lib/router";
import type { StepId } from "../../lib/types";

const IDEAS: { icon: string; title: string; text: string; step: StepId | "tune"; cta: string }[] = [
  { icon: "📚", title: "More data", text: "More examples is the most reliable way to help a model — especially for rare cases it keeps missing.", step: "data", cta: "Add data" },
  { icon: "🔧", title: "Better features", text: "Drop columns that are just noise or IDs, or keep only the most informative ones with feature selection.", step: "prepare", cta: "Open Prepare" },
  { icon: "⚖️", title: "Balance the classes", text: "If one answer is rare, oversampling (e.g. SMOTE) helps the model take it seriously.", step: "prepare", cta: "Rebalance" },
  { icon: "🪢", title: "Regularize", text: "If train scores beat test scores by a lot, make the model simpler: shallower trees, stronger penalty, dropout.", step: "models", cta: "Adjust settings" },
  { icon: "🎛️", title: "Tune it", text: "Let the automatic search above try dozens of settings with cross-validation and keep the best.", step: "tune", cta: "Jump to tuning" },
  { icon: "🔀", title: "Try another family", text: "Different algorithms see data differently — a tree ensemble may find patterns a linear model can't, and vice versa.", step: "models", cta: "Add models" },
  { icon: "🤝", title: "Ensembles", text: "Many weak models voting together beat one strong one surprisingly often. Random Forest and boosting do exactly that.", step: "models", cta: "Try an ensemble" },
];

/** Friendly static cards with general ways to get better results. */
export function WaysToImprove({ projectId, onTune }: { projectId: string; onTune: () => void }) {
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
      {IDEAS.map((idea) => (
        <motion.button key={idea.title} variants={fadeUp} whileHover={{ y: -3 }} transition={spring.snappy}
          onClick={() => (idea.step === "tune" ? onTune() : navigate(`/p/${projectId}/${idea.step}`))}
          className="inset col" style={{ padding: 14, gap: 6, textAlign: "left", cursor: "pointer", alignItems: "flex-start" }}>
          <span style={{ fontSize: 24 }}>{idea.icon}</span>
          <b style={{ fontSize: 13.5 }}>{idea.title}</b>
          <span className="small muted" style={{ lineHeight: 1.5, flex: 1 }}>{idea.text}</span>
          <span className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>{idea.cta} →</span>
        </motion.button>
      ))}
    </motion.div>
  );
}
