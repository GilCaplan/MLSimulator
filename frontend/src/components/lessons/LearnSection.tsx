import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../design/motion";
import type { Lesson } from "../../lib/types";
import { useSize } from "../charts";
import { Glass } from "../glass";
import { Rich } from "./shared";

const slide = {
  enter: (d: number) => ({ opacity: 0, x: d * 60, filter: "blur(6px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } },
  exit: (d: number) => ({ opacity: 0, x: d * -60, filter: "blur(6px)" }),
};

/** Stepped carousel of concept cards. Calls `onFinished` once the learner reaches the last card. */
export function LearnSection({ lesson, onFinished, onContinue }: { lesson: Lesson; onFinished: () => void; onContinue: () => void }) {
  const cards = lesson.learn;
  const [[idx, dir], setIdx] = useState<[number, number]>([0, 1]);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const [ref, size] = useSize<HTMLDivElement>();
  const wide = size.width >= 720;
  const last = idx === cards.length - 1;

  useEffect(() => { setIdx([0, 1]); setSeen(new Set([0])); }, [lesson.id]);
  const go = (i: number) => {
    const n = Math.max(0, Math.min(cards.length - 1, i));
    setIdx([n, n >= idx ? 1 : -1]);
    setSeen((s) => new Set(s).add(n));
    if (n === cards.length - 1) onFinished();
  };
  const card = cards[idx];

  return (
    <div ref={ref} className="grid" style={{ gridTemplateColumns: wide ? "250px 1fr" : "1fr", gap: 14, alignItems: "stretch" }}>
      {wide && (
        <div className="col" style={{ gap: 6 }}>
          {cards.map((c, i) => {
            const on = i === idx;
            return (
              <motion.button key={i} onClick={() => go(i)} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ ...spring.gentle, delay: i * 0.06 }}
                className="row" style={{ position: "relative", gap: 10, padding: "10px 12px", borderRadius: 16, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                {on && <motion.span layoutId={`learn-pill-${lesson.id}`} transition={spring.snappy} className="glass strong" style={{ position: "absolute", inset: 0, borderRadius: 16 }} />}
                <span style={{ position: "relative", width: 30, height: 30, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, background: seen.has(i) ? "var(--accent-soft)" : "var(--fill)" }}>{c.icon}</span>
                <span className="col" style={{ position: "relative", gap: 0, minWidth: 0 }}>
                  <span className="tiny faint">Card {i + 1}{seen.has(i) && !on ? " · ✓" : ""}</span>
                  <span style={{ fontWeight: on ? 650 : 540, fontSize: 13, lineHeight: 1.3, color: on ? "var(--text)" : "var(--text-2)" }}>{c.heading}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      <Glass pad="lg" variant="default" style={{ minHeight: 300, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", background: "radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--accent) 13%, transparent), transparent 55%)" }} />
        <div className="grow" style={{ position: "relative" }}>
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={idx} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={spring.snappy} className="col" style={{ gap: 14 }}>
              <div className="row" style={{ gap: 14 }}>
                <motion.span initial={{ scale: 0.5, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
                  style={{ width: 64, height: 64, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, background: "var(--glass-strong)", border: "1px solid var(--glass-border)", boxShadow: "0 6px 20px rgba(40,50,90,.12)", flexShrink: 0 }}>
                  {card.icon}
                </motion.span>
                <div className="col" style={{ gap: 2 }}>
                  <span className="eyebrow">Card {idx + 1} of {cards.length}</span>
                  <h3 style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{card.heading}</h3>
                </div>
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-2)", maxWidth: 620 }}><Rich text={card.body} /></p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="row between" style={{ marginTop: 22, gap: 10 }}>
          <button className="btn ghost" onClick={() => go(idx - 1)} disabled={idx === 0}>← Back</button>
          <div className="row" style={{ gap: 6 }}>
            {cards.map((_, i) => (
              <button key={i} aria-label={`Card ${i + 1}`} onClick={() => go(i)}
                style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 4, border: "none", padding: 0, cursor: "pointer", transition: "width .3s var(--ease), background .3s",
                  background: i === idx ? "var(--accent)" : seen.has(i) ? "color-mix(in srgb, var(--accent) 40%, transparent)" : "var(--fill-2)" }} />
            ))}
          </div>
          {last ? (
            <motion.button initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={spring.pop} className="btn primary" onClick={onContinue}>Try it yourself →</motion.button>
          ) : (
            <button className="btn primary" onClick={() => go(idx + 1)}>Next →</button>
          )}
        </div>
      </Glass>
    </div>
  );
}
