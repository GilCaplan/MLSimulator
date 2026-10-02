import { motion } from "framer-motion";
import { fadeUp, spring, stagger } from "../../design/motion";
import { navigate } from "../../lib/router";
import { useProject } from "../../lib/store";
import type { StepId, SuggestionAction } from "../../lib/types";

interface Idea { icon: string; title: string; text: string; cta: string; go?: StepId | "sweep"; action?: SuggestionAction }

const SCALE: Idea = { icon: "📏", title: "Check the scaling", text: "Everything here is measured in distances. Make sure Scale is on — Robust is a good choice when a few rows have extreme values.", cta: "Open Prepare", go: "prepare" };
const NOISY: Idea = { icon: "🧹", title: "Fewer noisy columns", text: "Columns that carry no structure blur everything else. Leave them out in Clean, or let Reduce (PCA) keep only the strongest directions.", cta: "Trim columns", go: "prepare" };

function ideasFor(task: string, ids: string[]): Idea[] {
  const missing = (want: string[]) => want.filter((id) => !ids.includes(id));
  if (task === "clustering") {
    const shape = missing(["dbscan", "gmm"]);
    return [
      { icon: "🔎", title: "Pick k with the sweep", text: "Not sure how many groups there are? The k sweep above scores every k so you don't have to guess.", cta: "Jump to the sweep", go: "sweep" },
      SCALE,
      NOISY,
      { icon: "🗜️", title: "Squash with PCA first", text: "With many overlapping columns, reducing to a handful of strong directions often makes the groups crisper.", cta: "Add a Reduce step", go: "prepare" },
      shape.length
        ? { icon: "🧭", title: "Odd-shaped groups?", text: "K-Means assumes round blobs. DBSCAN follows dense regions of any shape; Gaussian Mixture allows stretched ones.", cta: `Add ${shape.map((s) => (s === "dbscan" ? "DBSCAN" : "GMM")).join(" + ")}`, action: { kind: "add_models", label: "", model_ids: shape } }
        : { icon: "🧭", title: "Tune DBSCAN's eps", text: "Too many noise points? Make the neighbourhood (eps) bigger. One giant cluster? Make it smaller.", cta: "Open its settings", go: "models" },
    ];
  }
  if (task === "reduction") {
    const both = missing(["pca", "tsne"]);
    return [
      SCALE,
      NOISY,
      { icon: "🎚️", title: "Play with perplexity", text: "t-SNE's perplexity is how many neighbours each point cares about. Try 5 (local detail), 30 and 50 (global shape) side by side — add copies with different settings.", cta: "Adjust settings", go: "models" },
      both.length
        ? { icon: "🔀", title: "Compare PCA and t-SNE", text: "PCA is faithful but straight-line; t-SNE shows neighbourhoods but can invent gaps. Seeing both keeps you honest.", cta: "Add the other", action: { kind: "add_models", label: "", model_ids: both } }
        : { icon: "🔀", title: "Trust, but verify", text: "If a cluster only shows up in t-SNE and not in PCA, it may be an artefact. Check it against the hidden truth colours.", cta: "Back to the maps", go: "train" },
    ];
  }
  const other = missing(["isolation_forest", "lof", "one_class_svm"]);
  return [
    { icon: "🚦", title: "Set the alarm level", text: "“Expected share of anomalies” decides how many rows get flagged. If you expect about 1% faults, set it near 1% — fewer false alarms.", cta: "Adjust settings", go: "models" },
    other.length
      ? { icon: "🔀", title: "Ask another detector", text: "Different detectors notice different kinds of weirdness. Rows that several detectors flag are the safest bets.", cta: "Add a detector", action: { kind: "add_models", label: "", model_ids: other.slice(0, 1) } }
      : { icon: "🤝", title: "Look for agreement", text: "You have all three detectors. Rows flagged by more than one are the most convincing anomalies.", cta: "Back to results", go: "train" },
    SCALE,
    NOISY,
    { icon: "🫙", title: "Hold out some rows", text: "Keep 10–20% aside in Prepare to check the detector also catches oddities it never saw.", cta: "Open Prepare", go: "prepare" },
  ];
}

/** Ways to improve for clustering / maps / anomaly detection. Cards jump to the right step or apply a quick fix. */
export function UnsupWays({ projectId, task, onSweep }: { projectId: string; task: string; onSweep?: () => void }) {
  const models = useProject((s) => s.project?.models);
  const ids = (models ?? []).map((m) => m.model_id);
  const apply = useProject((s) => s.applyAction);
  const ideas = ideasFor(task, ids);
  const run = (idea: Idea) => {
    if (idea.action) apply(idea.action);
    else if (idea.go === "sweep") onSweep?.();
    else if (idea.go) navigate(`/p/${projectId}/${idea.go}`);
  };
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
      {ideas.map((idea) => (
        <motion.button key={idea.title} variants={fadeUp} whileHover={{ y: -3 }} transition={spring.snappy} onClick={() => run(idea)}
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
