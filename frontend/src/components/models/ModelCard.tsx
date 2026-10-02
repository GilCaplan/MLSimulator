import { AnimatePresence, motion } from "framer-motion";
import { fadeUp, spring } from "../../design/motion";
import { useProject } from "../../lib/store";
import type { ModelSpec } from "../../lib/types";
import { badgesFor, modalityOf } from "./meta";

/** Selectable glass card for one algorithm. */
export function ModelCard({ spec, count, onToggle, onSettings }: { spec: ModelSpec; count: number; onToggle: () => void; onSettings?: () => void }) {
  const selected = count > 0;
  const modality = useProject((s) => modalityOf(s.project?.modality));
  return (
    <motion.div
      variants={fadeUp}
      layout="position"
      whileTap={{ scale: 0.98 }}
      onClick={onToggle}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), onToggle())}
      className={`glass tile${selected ? " selected" : ""}`}
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, minHeight: 148 }}
    >
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <motion.span
          animate={selected ? { scale: [1, 1.25, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }}
          transition={{ duration: 0.45 }}
          style={{ width: 42, height: 42, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 23, background: selected ? "var(--accent-soft)" : "var(--fill)", transition: "background .2s" }}
        >
          {spec.emoji}
        </motion.span>
        <span className="row" style={{ gap: 6 }}>
          <AnimatePresence>
            {count > 1 && (
              <motion.span key="n" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="badge accent num">×{count}</motion.span>
            )}
          </AnimatePresence>
          <CheckDot checked={selected} />
        </span>
      </div>
      <div className="col" style={{ gap: 4 }}>
        <b style={{ fontSize: 14.5, letterSpacing: "-0.01em" }}>{spec.label}</b>
        <span className="small muted" style={{ lineHeight: 1.45 }}>{spec.description}</span>
      </div>
      <div className="grow" />
      <div className="row between" style={{ gap: 6, minHeight: 22 }}>
        <span className="row wrap" style={{ gap: 5 }}>
          {badgesFor(spec, modality).map((b) => <span key={b.text} className={`badge ${b.tone}`}>{b.text}</span>)}
        </span>
        <AnimatePresence>
          {selected && onSettings && (
            <motion.button key="cfg" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring.snappy}
              className="btn ghost sm" style={{ padding: "0 8px" }} title="Settings"
              onClick={(e) => { e.stopPropagation(); onSettings(); }}>
              ⚙︎ {spec.nn ? "Design" : "Tune"}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function CheckDot({ checked, size = 24 }: { checked: boolean; size?: number }) {
  return (
    <motion.span
      animate={{ background: checked ? "var(--accent)" : "rgba(0,0,0,0)", borderColor: checked ? "var(--accent)" : "var(--hairline)" }}
      transition={{ duration: 0.18 }}
      style={{ width: size, height: size, borderRadius: size / 2, border: "1.5px solid", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 14 14">
        <motion.path d="M2.5 7.5 L5.8 10.5 L11.5 3.8" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
          initial={false} animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 28 }} />
      </svg>
    </motion.span>
  );
}
