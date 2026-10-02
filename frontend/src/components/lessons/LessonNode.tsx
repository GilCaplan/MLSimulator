import { motion } from "framer-motion";
import { forwardRef } from "react";
import { fadeUp, spring } from "../../design/motion";
import type { LessonSummary } from "../../lib/types";
import { Tooltip } from "../glass";
import { LESSON_STEPS, StageChip, lessonStatus, stageTint, stepFlags } from "./shared";

/** Round "station" on the curriculum path: emoji, step-progress ring, completion glow, up-next halo. */
export const Station = forwardRef<HTMLButtonElement, { lesson: LessonSummary; upNext: boolean; onOpen: () => void; size?: number }>(function Station(
  { lesson, upNext, onOpen, size = 64 },
  ref,
) {
  const flags = stepFlags(lesson.progress);
  const n = Object.values(flags).filter(Boolean).length;
  const status = lessonStatus(lesson.progress);
  const stroke = 4, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const tint = stageTint(lesson.stage);
  return (
    <motion.button ref={ref} onClick={onOpen} aria-label={lesson.title} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
      initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={spring.pop}
      style={{ position: "relative", width: size, height: size, borderRadius: size, border: "none", padding: 0, cursor: "pointer", flexShrink: 0, background: "transparent", zIndex: 2 }}>
      {upNext && (
        <motion.span aria-hidden animate={{ scale: [1, 1.45], opacity: [0.55, 0] }} transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
          style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--accent)" }} />
      )}
      <span className="glass strong" style={{ position: "absolute", inset: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.42,
        boxShadow: status === "done" ? "0 0 0 3px color-mix(in srgb, var(--success) 35%, transparent), 0 0 26px color-mix(in srgb, var(--success) 55%, transparent)" : upNext ? "0 0 0 3px var(--accent-soft), 0 8px 26px rgba(10,132,255,.35)" : undefined }}>
        {lesson.emoji}
      </span>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", pointerEvents: "none" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} opacity={0.6} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={status === "done" ? "var(--success)" : tint.color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} whileInView={{ strokeDashoffset: c * (1 - n / 4) }} viewport={{ once: true }} transition={{ ...spring.soft, delay: 0.3 }} />
      </svg>
      <span style={{ position: "absolute", top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 750,
        background: status === "done" ? "var(--success)" : "var(--glass-strong)", color: status === "done" ? "var(--on-accent)" : "var(--text-2)", border: "1px solid var(--glass-border)", boxShadow: "0 2px 6px rgba(0,0,0,.12)" }}>
        {status === "done" ? "✓" : lesson.order}
      </span>
    </motion.button>
  );
});

/** The lesson card next to a station. */
export function LessonCard({ lesson, upNext, onOpen, align }: { lesson: LessonSummary; upNext: boolean; onOpen: () => void; align: "left" | "right" }) {
  const flags = stepFlags(lesson.progress);
  const status = lessonStatus(lesson.progress);
  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} onClick={onOpen}
      className="glass tile" whileTap={{ scale: 0.985 }}
      style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", flex: 1, minWidth: 0,
        borderColor: status === "done" ? "color-mix(in srgb, var(--success) 50%, transparent)" : upNext ? "var(--accent)" : undefined,
        boxShadow: status === "done" ? "var(--glass-shadow), 0 0 32px color-mix(in srgb, var(--success) 22%, transparent)" : upNext ? "0 0 0 3px var(--accent-soft), var(--glass-shadow)" : undefined,
        textAlign: align }}>
      <div className="row between" style={{ gap: 8, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        <StageChip stage={lesson.stage} small />
        {status === "done" ? <span className="badge success">✓ Completed</span>
          : upNext ? <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="badge accent">✨ Up next</motion.span>
          : status === "progress" ? <span className="badge warning">In progress</span>
          : <span className="badge">Not started</span>}
      </div>
      <div className="col" style={{ gap: 4 }}>
        <b style={{ fontSize: 17, letterSpacing: "-0.015em", lineHeight: 1.25 }}>{lesson.title}</b>
        <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{lesson.tagline}</span>
      </div>
      <span className="tiny faint" style={{ lineHeight: 1.4 }}>🧬 Modeled on: {lesson.modeled_on}</span>
      <div className="row between" style={{ gap: 8, flexDirection: align === "right" ? "row-reverse" : "row", marginTop: 2 }}>
        <span className="row" style={{ gap: 6 }}>
          {LESSON_STEPS.map((s, i) => (
            <Tooltip key={s.id} content={`${s.icon} ${s.label}${flags[s.id] ? " — done" : ""}`} width={120}>
              <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ ...spring.pop, delay: 0.2 + i * 0.05 }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 7, fontSize: 11,
                  background: flags[s.id] ? "color-mix(in srgb, var(--success) 18%, transparent)" : "var(--fill)", border: `1px solid ${flags[s.id] ? "color-mix(in srgb, var(--success) 45%, transparent)" : "var(--hairline)"}`, filter: flags[s.id] ? "none" : "grayscale(1)", opacity: flags[s.id] ? 1 : 0.7 }}>
                {flags[s.id] ? "✓" : s.icon}
              </motion.span>
            </Tooltip>
          ))}
        </span>
        <span className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>
          {status === "done" ? "Review" : status === "progress" ? "Continue" : "Open"} →
        </span>
      </div>
    </motion.div>
  );
}
