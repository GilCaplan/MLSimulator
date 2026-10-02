import { motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { PipelineSpec, TopValues } from "../../../lib/types";
import { StarBars } from "../../data/ratings/viz";
import { Slider } from "../../glass";
import { StageCard } from "../StageCard";
import { patchRecsys, recsysOf } from "./ratingsPrepState";

/** Which ratings count as "liked" — the hits a recommender is scored on. */
export function LikedCard({ spec, hist, open, onToggle, flash }: {
  spec: PipelineSpec;
  hist: TopValues | null;
  open: boolean;
  onToggle: () => void;
  flash: boolean;
}) {
  const r = recsysOf(spec);
  const labels = hist?.labels ?? ["1", "2", "3", "4", "5"];
  const counts = hist?.counts ?? [];
  const vals = labels.map(Number).filter((v) => !Number.isNaN(v));
  const lo = vals.length ? Math.min(...vals) : 1, hi = vals.length ? Math.max(...vals) : 5;
  const stars = vals.every((v) => Number.isInteger(v)) && lo >= 0 && hi <= 5;
  const total = counts.reduce((a, b) => a + b, 0);
  const liked = counts.reduce((a, c, i) => a + (Number(labels[i]) >= r.positive ? c : 0), 0);
  const share = total ? liked / total : null;
  const set = (v: number) => patchRecsys(spec, { positive: v });
  return (
    <StageCard id="liked" icon="💚" title="Liked =" open={open} onToggle={onToggle} flash={flash}
      why="Which ratings count as a thumbs-up? A recommendation is a hit only if the person really liked it."
      info="Recommenders are scored on lists: of the top 10 suggestions, how many did the person go on to like? This threshold defines 'liked'. 4★ and up is common for 5-star scales; for purchases or clicks (every rating is 1) use 1."
      summary={`${r.positive}★ and up`}>
      <div className="row wrap" style={{ gap: "18px 28px", alignItems: "stretch" }}>
        <div className="col" style={{ gap: 12, flex: "1 1 260px" }}>
          <span className="small" style={{ fontWeight: 650 }}>A rating counts as “liked” from…</span>
          {stars ? (
            <div className="row" style={{ gap: 6 }}>
              {[1, 2, 3, 4, 5].map((v) => {
                const on = v >= r.positive;
                return (
                  <motion.button key={v} onClick={() => set(v)} whileHover={{ y: -3, scale: 1.08 }} whileTap={{ scale: 0.9 }} transition={spring.snappy}
                    aria-label={`${v} stars and up`}
                    style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, fontSize: 30, lineHeight: 1, color: on ? "#FFB800" : "var(--fill-2)", filter: on ? "drop-shadow(0 2px 6px rgba(255,184,0,.4))" : "none", transition: "color .2s, filter .2s" }}>
                    <motion.span animate={on ? { scale: [1, 1.2, 1] } : { scale: 1 }} transition={{ duration: 0.3, delay: on ? (v - r.positive) * 0.05 : 0 }} style={{ display: "inline-block" }}>★</motion.span>
                  </motion.button>
                );
              })}
              <span className="small muted" style={{ alignSelf: "center", marginLeft: 6 }}><b style={{ color: "var(--text)" }}>{r.positive}★</b> and up</span>
            </div>
          ) : (
            <Slider value={r.positive} min={lo} max={hi} step={hi - lo > 10 ? 1 : 0.5} onChange={set} format={(v) => `≥ ${v}`} />
          )}
          {share !== null && (
            <div className="col" style={{ gap: 6 }}>
              <div style={{ height: 10, borderRadius: 6, background: "var(--fill)", overflow: "hidden" }}>
                <motion.div style={{ height: "100%", borderRadius: 6, background: "linear-gradient(90deg, #9BDB4D, #30D158)" }} animate={{ width: `${share * 100}%` }} transition={spring.gentle} />
              </div>
              <span className="tiny muted" style={{ lineHeight: 1.5 }}>
                <b className="num" style={{ color: "var(--text)" }}>{Math.round(share * 100)}%</b> of all ratings count as liked.
                {share > 0.8 ? " That's nearly everything — the hits get easy and less telling." : share < 0.1 ? " That's very few — most people will have no hits to find, so scores get noisy." : " A healthy balance."}
              </span>
            </div>
          )}
        </div>
        {counts.length > 0 && (
          <div className="inset col" style={{ flex: "1 1 260px", padding: 12, gap: 6 }}>
            <span className="eyebrow">Click a bar to move the line</span>
            <StarBars labels={labels.slice(0, 12)} counts={counts.slice(0, 12)} positive={r.positive} height={130} onPick={set} />
          </div>
        )}
      </div>
    </StageCard>
  );
}
