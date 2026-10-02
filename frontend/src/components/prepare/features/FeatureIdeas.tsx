import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../../design/motion";
import { PALETTE } from "../../../lib/colors";
import { useUI } from "../../../lib/store";

const IDEAS = [
  {
    raw: [{ k: "pickup_time", v: "Fri 2024-03-08 17:45" }],
    out: [{ k: "hour", v: "17" }, { k: "weekday", v: "Fri (4)" }, { k: "month", v: "3" }],
    lesson: "A model can't read a timestamp — but “5 pm on a Friday” instantly says rush hour.",
  },
  {
    raw: [{ k: "price", v: "€320,000" }, { k: "size_m2", v: "80" }],
    out: [{ k: "price_per_m2", v: "€4,000" }],
    lesson: "A big flat costs more — the ratio removes size, so the model can spot a bargain.",
  },
  {
    raw: [{ k: "weight_kg", v: "92" }, { k: "height_m", v: "1.75" }],
    out: [{ k: "bmi", v: "30.0" }],
    lesson: "Neither weight nor height alone predicts health risk well — weight ÷ height² does.",
  },
];

/** Rotating mini-story: raw columns on the left morph into an engineered feature on the right. */
export function FeatureIdeas() {
  const reduce = useUI((s) => s.reduceMotion);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((x) => (x + 1) % IDEAS.length), 4200);
    return () => clearInterval(t);
  }, [reduce]);
  const idea = IDEAS[i];
  return (
    <div className="inset col" style={{ padding: "14px 16px", gap: 10 }}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="eyebrow">Example</span>
        <div className="row" style={{ gap: 5 }}>
          {IDEAS.map((_, j) => (
            <button key={j} onClick={() => setI(j)} aria-label={`Example ${j + 1}`}
              style={{ width: j === i ? 18 : 7, height: 7, borderRadius: 4, border: "none", padding: 0, cursor: "pointer", background: j === i ? "var(--accent)" : "var(--fill-2)", transition: "width .3s, background .3s" }} />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="col" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {idea.raw.map((r, j) => (
                <motion.span key={r.k} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.pop, delay: j * 0.08 }} className="col"
                  style={{ padding: "5px 10px", borderRadius: 10, background: "var(--fill)", border: "1px solid var(--hairline)", gap: 0 }}>
                  <span className="tiny faint mono">{r.k}</span>
                  <b className="small num">{r.v}</b>
                </motion.span>
              ))}
            </div>
            <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, 5, 0] }} transition={{ x: { repeat: Infinity, duration: 1.4, delay: 0.4 }, opacity: { delay: 0.25 } }}
              style={{ fontSize: 18, color: "var(--accent)" }}>→</motion.span>
            <div className="row wrap" style={{ gap: 6 }}>
              {idea.out.map((r, j) => (
                <motion.span key={r.k} initial={{ opacity: 0, scale: 0.5, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ...spring.pop, delay: 0.45 + j * 0.12 }} className="col"
                  style={{ padding: "5px 10px", borderRadius: 10, gap: 0, background: `${PALETTE[(j + 1) % PALETTE.length]}22`, border: `1px solid ${PALETTE[(j + 1) % PALETTE.length]}66` }}>
                  <span className="tiny mono" style={{ color: PALETTE[(j + 1) % PALETTE.length], fontWeight: 650 }}>✨ {r.k}</span>
                  <b className="small num">{r.v}</b>
                </motion.span>
              ))}
            </div>
          </div>
          <span className="small muted" style={{ lineHeight: 1.5 }}>{idea.lesson}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
