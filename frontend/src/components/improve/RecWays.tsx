import { motion } from "framer-motion";
import { fadeUp, spring, stagger } from "../../design/motion";
import { navigate } from "../../lib/router";
import { useProject } from "../../lib/store";
import type { RunResult, StepId, SuggestionAction } from "../../lib/types";
import { AnimatedNumber } from "../glass";

interface Idea { icon: string; title: string; text: string; cta: string; go?: StepId; action?: SuggestionAction }

const PERSONAL = ["item_knn", "user_knn", "svd", "mf_als"];
const NAMES: Record<string, string> = { item_knn: "similar items", user_knn: "similar people", svd: "SVD", mf_als: "matrix factorisation" };

/** Recommendation projects: classic moves for better top-10 lists. Cards jump to the right step or apply a quick fix. */
function ideasFor(ids: string[], models: { key: string; model_id: string; params: Record<string, any> }[]): Idea[] {
  const out: Idea[] = [];
  const personal = PERSONAL.filter((id) => !ids.includes(id));
  if (!ids.some((id) => PERSONAL.includes(id))) {
    out.push({ icon: "🎯", title: "Personalise", text: "Most popular gives everyone the same list. Similar items (item-kNN) learns from what each person liked — usually a big jump.", cta: "Add item-kNN", action: { kind: "add_models", label: "", model_ids: ["item_knn"] } });
  } else if (personal.length) {
    out.push({ icon: "🎯", title: "Personalise another way", text: "Neighbour models and taste-factor models make different mistakes. Racing both tells you which idea of “taste” fits your data.", cta: `Add ${NAMES[personal.includes("mf_als") ? "mf_als" : personal[0]]}`, action: { kind: "add_models", label: "", model_ids: [personal.includes("mf_als") ? "mf_als" : personal[0]] } });
  }
  const mf = models.find((m) => m.model_id === "mf_als" || m.model_id === "svd");
  if (mf) {
    const f = Number(mf.params.factors ?? 16), reg = Number(mf.params.reg ?? 0.1);
    const patch: Record<string, number> = { factors: Math.min(100, Math.max(f + 8, Math.round(f * 1.5))) };
    if (mf.model_id === "mf_als") patch.reg = Math.max(0.001, Number((reg / 2).toPrecision(2)));
    out.push({ icon: "🎛️", title: "More factors, less regularisation", text: `More taste dials (${f} → ${patch.factors}) can capture subtler tastes${mf.model_id === "mf_als" ? `; less regularisation (${reg} → ${patch.reg}) lets them grow` : ""}. Too far and the model memorises — watch the test score.`, cta: "Apply and retrain", action: { kind: "model_params", label: "", key: mf.key, patch } });
  } else {
    out.push({ icon: "🎛️", title: "Learn hidden taste dials", text: "Matrix factorisation describes every person and item with a few numbers (factors). Start at 16, then try more factors and less regularisation.", cta: "Add matrix factorisation", action: { kind: "add_models", label: "", model_ids: ["mf_als"] } });
  }
  const noFallback = models.find((m) => PERSONAL.includes(m.model_id) && (m.params.cold_start ?? "none") === "none");
  out.push(noFallback
    ? { icon: "🧊", title: "Cold-start fallback", text: "Brand-new people have no history, so personal models guess blindly. Fall back to popular items until someone has rated a few things.", cta: "Turn it on", action: { kind: "model_params", label: "", key: noFallback.key, patch: { cold_start: "popularity", cold_start_min: 5 } } }
    : { icon: "🧊", title: "Tune the cold-start line", text: "Your fallback is on. Try the library playground as a new user: rate 2 films, then 8 — when do the suggestions start feeling personal?", cta: "Open the library", go: undefined });
  out.push({ icon: "📜", title: "Longer histories", text: "Hide fewer ratings per person (or none from short histories) so the models keep more to learn from — or gather more ratings per person.", cta: "Adjust held-out", go: "prepare" });
  out.push({ icon: "🧹", title: "Filter noisy users", text: "People with just one or two ratings, and items nobody watched, add noise. Raise the minimum ratings per person and per item in Filters.", cta: "Open Filters", go: "prepare" });
  return out;
}

export function RecWays({ projectId }: { projectId: string }) {
  const models = useProject((s) => s.project?.models) ?? [];
  const apply = useProject((s) => s.applyAction);
  const ideas = ideasFor(models.map((m) => m.model_id), models);
  const run = (idea: Idea) => {
    if (idea.action) apply(idea.action);
    else navigate(idea.go ? `/p/${projectId}/${idea.go}` : "/library");
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

/** This run's models against the popularity baseline: ranking score bars with the baseline as a dashed line, plus catalogue coverage. */
export function BaselineRace({ result }: { result: RunResult }) {
  const rows = result.leaderboard.filter((r) => r.score !== null && r.score !== undefined);
  if (!rows.length) return null;
  const metric = rows[0].metric;
  const base = rows.find((r) => r.model_id === "popularity");
  const max = Math.max(1e-9, ...rows.map((r) => r.score));
  const label = metric === "ndcg_at_10" ? "NDCG@10" : metric;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="col" style={{ gap: 8, position: "relative" }}>
        {rows.map((r, i) => {
          const isBase = r.model_id === "popularity";
          const lift = base && base.score > 0 && !isBase ? r.score / base.score - 1 : null;
          const cov = result.models[r.key]?.metrics.test.coverage;
          return (
            <div key={r.key} className="row" style={{ gap: 10 }}>
              <span className="small truncate" style={{ width: 170, flexShrink: 0, fontWeight: isBase ? 500 : 600, color: isBase ? "var(--text-2)" : "var(--text)" }} title={r.label}>{isBase ? "🔥 " : ""}{r.label}</span>
              <div style={{ flex: 1, height: 20, borderRadius: 7, background: "var(--fill)", position: "relative", overflow: "hidden" }}>
                <motion.div style={{ position: "absolute", inset: 0, right: "auto", borderRadius: 7, background: isBase ? "#8E8E93" : lift !== null && lift < 0 ? "var(--warning)" : "var(--grad)", opacity: isBase ? 0.6 : 0.9 }}
                  initial={{ width: 0 }} animate={{ width: `${(r.score / max) * 100}%` }} transition={{ ...spring.gentle, delay: i * 0.06 }} />
                {base && (
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(base.score / max) * 100}%`, borderLeft: "2px dashed var(--text-2)", opacity: 0.6 }} />
                )}
              </div>
              <span className="num small" style={{ width: 54, textAlign: "right", fontWeight: 650 }}><AnimatedNumber value={r.score} format={(v) => v.toFixed(3)} /></span>
              <span className="tiny num" style={{ width: 118, textAlign: "right", whiteSpace: "nowrap", color: lift === null ? "var(--text-3)" : lift >= 0 ? "var(--success)" : "var(--warning)", fontWeight: 650 }}>
                {lift === null ? (isBase ? "baseline" : "") : `${lift >= 0 ? "+" : ""}${Math.round(lift * 100)}% vs popular`}
              </span>
              {cov !== undefined && <span className="tiny muted num" style={{ width: 84, textAlign: "right" }} title="Share of the catalogue that appears in anyone's top 10">covers {Math.round(cov * 100)}%</span>}
            </div>
          );
        })}
      </div>
      <span className="tiny muted" style={{ lineHeight: 1.5 }}>
        Bars show <b>{label}</b> on the hidden ratings (higher = liked items sit nearer the top of each top-10 list). The dashed line is <b>Most popular</b> — the bar to clear.
        <b> Covers</b> is how much of the catalogue ever gets recommended: popularity shows everyone the same few hits.
        {!base && " Add Most popular to your line-up to see the baseline."}
      </span>
    </div>
  );
}
