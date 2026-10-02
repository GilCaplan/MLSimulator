import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../design/motion";
import { navigate } from "../../lib/router";
import { LESSON_STEPS, type LessonStepId } from "./shared";

/** Sticky glass rail: Learn · Try it · Quiz · Practice. Highlights the section in view and jumps on click. */
export function ProgressRail({ active, flags, onJump, title, emoji, compact }: {
  active: LessonStepId | null;
  flags: Record<LessonStepId, boolean>;
  onJump: (id: LessonStepId) => void;
  title: string;
  emoji: string;
  /** show the lesson title (once the header has scrolled away) */
  compact: boolean;
}) {
  const done = Object.values(flags).filter(Boolean).length;
  return (
    <div style={{ position: "sticky", top: 6, zIndex: 30 }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}
        className="glass strong row" style={{ gap: 8, padding: 6, borderRadius: 999, overflow: "hidden" }}>
        <button className="btn ghost sm icon" aria-label="All lessons" title="All lessons" onClick={() => navigate("/lessons")} style={{ flexShrink: 0 }}>←</button>
        <AnimatePresence initial={false}>
          {compact && (
            <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} transition={spring.snappy}
              className="row" style={{ gap: 6, overflow: "hidden", flexShrink: 1, minWidth: 0, maxWidth: 260 }}>
              <span style={{ fontSize: 16 }}>{emoji}</span>
              <b className="truncate small">{title}</b>
            </motion.span>
          )}
        </AnimatePresence>
        <div className="grow" />
        <nav className="row" style={{ gap: 2 }}>
          {LESSON_STEPS.map((s, i) => {
            const on = active === s.id;
            return (
              <button key={s.id} onClick={() => onJump(s.id)}
                style={{ position: "relative", height: 32, padding: "0 12px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 999, fontSize: 13, fontWeight: on ? 650 : 520, color: on ? "var(--text)" : "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}>
                {on && <motion.span layoutId="lesson-rail-pill" transition={spring.snappy} style={{ position: "absolute", inset: 0, borderRadius: 999, background: "var(--accent-soft)", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)" }} />}
                <span style={{ position: "relative", width: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 750,
                  background: flags[s.id] ? "var(--success)" : on ? "var(--accent)" : "var(--fill-2)", color: flags[s.id] ? "var(--on-accent)" : on ? "var(--accent-contrast)" : "var(--text-2)", transition: "background .25s" }}>
                  {flags[s.id] ? "✓" : i + 1}
                </span>
                <span style={{ position: "relative" }}>{s.label}</span>
              </button>
            );
          })}
        </nav>
        <span className="tiny faint num" style={{ padding: "0 10px 0 4px", flexShrink: 0 }}>{done}/4</span>
      </motion.div>
    </div>
  );
}
