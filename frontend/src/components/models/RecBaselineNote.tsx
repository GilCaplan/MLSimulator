import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../design/motion";
import { Glass } from "../glass";

/** Recommendation projects: "Most popular is your baseline — every personal model should beat it", with a tiny bar race. */
export function RecBaselineNote({ has, onAdd }: { has: boolean; onAdd: () => void }) {
  const bars = [
    { label: "🔥 Most popular", w: 0.46, color: "#8E8E93" },
    { label: "🧲 Similar items", w: 0.68, color: "#0A84FF" },
    { label: "🧩 Taste factors", w: 0.78, color: "#BF5AF2" },
  ];
  return (
    <Glass animate_in variant="thin" style={{ padding: "14px 18px" }}>
      <div className="row wrap" style={{ gap: 18, alignItems: "center" }}>
        <div className="col" style={{ gap: 4, flex: "1 1 280px" }}>
          <span className="row" style={{ gap: 8 }}>
            <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.8, repeat: Infinity }} style={{ fontSize: 18 }}>🔥</motion.span>
            <b style={{ fontSize: 14 }}>Most popular is your baseline — every personal model should beat it.</b>
          </span>
          <span className="small muted" style={{ lineHeight: 1.5 }}>
            Recommending the blockbusters to everyone is surprisingly hard to beat. If a clever model can't clear this bar, it hasn't really learned anyone's taste.
          </span>
          <AnimatePresence>
            {!has && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                <button className="btn sm" style={{ marginTop: 6 }} onClick={onAdd}>＋ Add the baseline</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="inset col" style={{ flex: "1 1 240px", padding: "10px 12px", gap: 6, position: "relative" }}>
          {bars.map((b, i) => (
            <div key={b.label} className="row" style={{ gap: 8 }}>
              <span className="tiny truncate" style={{ width: 98, flexShrink: 0, color: "var(--text-2)" }}>{b.label}</span>
              <div style={{ flex: 1, height: 10, borderRadius: 6, background: "var(--fill)", position: "relative", overflow: "hidden" }}>
                <motion.div style={{ position: "absolute", inset: 0, right: "auto", borderRadius: 6, background: b.color, opacity: i === 0 ? 0.7 : 0.9 }}
                  initial={{ width: 0 }} animate={{ width: `${b.w * 100}%` }} transition={{ ...spring.gentle, delay: 0.2 + i * 0.18 }} />
              </div>
            </div>
          ))}
          {/* the bar to clear */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            style={{ position: "absolute", top: 6, bottom: 6, left: "calc(118px + (100% - 130px) * 0.46)", borderLeft: "1.5px dashed var(--text-3)" }} />
        </div>
      </div>
    </Glass>
  );
}
