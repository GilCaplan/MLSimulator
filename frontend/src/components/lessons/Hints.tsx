import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../design/motion";
import { Rich, useHints } from "./shared";

/** Progressive hints: revealed one at a time; state is shared across the lesson page and the wizard. */
export function Hints({ lessonId, hints, compact }: { lessonId: string; hints: string[]; compact?: boolean }) {
  const shown = useHints((s) => s.shown[lessonId] ?? 0);
  const reveal = useHints((s) => s.reveal);
  return (
    <div className="col" style={{ gap: compact ? 8 : 10 }}>
      <AnimatePresence initial={false}>
        {hints.slice(0, shown).map((h, i) => (
          <motion.div key={i} layout initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.gentle}
            className="inset row" style={{ alignItems: "flex-start", gap: 10, padding: compact ? "8px 10px" : "10px 12px" }}>
            <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,159,10,.18)", color: "#c77700", fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
            <span className={compact ? "small" : ""} style={{ lineHeight: 1.5, color: "var(--text-2)" }}><Rich text={h} /></span>
          </motion.div>
        ))}
      </AnimatePresence>
      {shown < hints.length ? (
        <motion.button layout whileTap={{ scale: 0.97 }} className={`btn ${compact ? "sm" : ""}`} style={{ alignSelf: "flex-start" }} onClick={() => reveal(lessonId, hints.length)}>
          💡 {shown === 0 ? "Need a hint?" : `Another hint (${shown}/${hints.length})`}
        </motion.button>
      ) : (
        <motion.span layout className="tiny faint">That's every hint — you've got this.</motion.span>
      )}
    </div>
  );
}
