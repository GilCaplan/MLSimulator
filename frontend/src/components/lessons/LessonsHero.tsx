import { motion } from "framer-motion";
import { spring } from "../../design/motion";
import type { LessonSummary } from "../../lib/types";
import { AnimatedNumber, Glass } from "../glass";
import { LESSON_STEPS, stepFlags } from "./shared";

const FORMAT = [
  { icon: "📖", label: "Learn", text: "the idea in 4 cards" },
  { icon: "🕹️", label: "Try it", text: "play with a live demo" },
  { icon: "✅", label: "Quiz", text: "two quick questions" },
  { icon: "🎯", label: "Practice", text: "fix a real-looking dataset" },
];

/** Headline, the four-part lesson format, and an animated overall-progress ring. */
export function LessonsHero({ lessons, next, onContinue }: { lessons: LessonSummary[]; next: LessonSummary | null; onContinue: () => void }) {
  const total = lessons.length || 8;
  const done = lessons.filter((l) => l.progress.completed_at).length;
  const steps = lessons.reduce((n, l) => n + Object.values(stepFlags(l.progress)).filter(Boolean).length, 0);
  const allDone = lessons.length > 0 && done === total;
  const started = steps > 0;

  return (
    <Glass pad="lg" animate_in style={{ overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", background: "radial-gradient(ellipse at 85% 20%, color-mix(in srgb, var(--accent-2) 14%, transparent), transparent 50%), radial-gradient(ellipse at 10% 100%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 55%)" }} />
      <div className="row wrap" style={{ gap: 28, alignItems: "center" }}>
        <div className="col" style={{ gap: 16, flex: "1 1 520px", minWidth: 0 }}>
          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="badge accent" style={{ alignSelf: "flex-start" }}>
            🎓 Lessons · {total} classic pitfalls
          </motion.span>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.15 }}
            style={{ fontSize: "clamp(32px, 4.4vw, 48px)", lineHeight: 1.05, letterSpacing: "-0.035em" }}>
            Learn to think like a <span className="gradient-text">data scientist</span>.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.22 }} className="muted" style={{ fontSize: 16, maxWidth: 520, lineHeight: 1.5 }}>
            Great models are mostly great judgement. Each lesson takes one classic trap, lets you feel it, then hands you a dataset with the trap baked in — and grades your model on the <b style={{ color: "var(--text)" }}>real world</b>, not just your own test.
          </motion.p>
          <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } } }} className="row wrap" style={{ gap: 6 }}>
            {FORMAT.map((f, i) => (
              <motion.span key={f.label} variants={{ hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1, transition: spring.pop } }} className="row" style={{ gap: 6 }}>
                <span className="inset row" style={{ gap: 7, padding: "6px 11px 6px 8px", borderRadius: 999 }}>
                  <span style={{ fontSize: 15 }}>{f.icon}</span>
                  <span className="col" style={{ gap: 0 }}>
                    <b style={{ fontSize: 12.5, lineHeight: 1.2 }}>{f.label}</b>
                    <span className="tiny faint" style={{ lineHeight: 1.2 }}>{f.text}</span>
                  </span>
                </span>
                {i < FORMAT.length - 1 && <span className="faint">→</span>}
              </motion.span>
            ))}
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.soft, delay: 0.2 }} className="col center" style={{ gap: 16, flex: "0 1 340px", margin: "0 auto" }}>
          <BigRing value={done / total} steps={steps / (total * 4)}>
            <span style={{ fontSize: 40, fontWeight: 750, letterSpacing: "-0.04em", lineHeight: 1 }}>
              <AnimatedNumber value={done} /><span className="faint" style={{ fontSize: 22 }}>/{total}</span>
            </span>
            <span className="small muted">lessons complete</span>
          </BigRing>
          <div className="row" style={{ gap: 14 }}>
            {LESSON_STEPS.map((s) => {
              const n = lessons.filter((l) => stepFlags(l.progress)[s.id]).length;
              return (
                <span key={s.id} className="col center" style={{ gap: 0 }}>
                  <span style={{ fontSize: 15 }}>{s.icon}</span>
                  <b className="num small">{n}/{total}</b>
                  <span className="tiny faint">{s.label}</span>
                </span>
              );
            })}
          </div>
          {next && (
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn gradient lg" onClick={onContinue}>
              {started ? "Continue" : "Start"}: {next.emoji} {next.title.length > 28 ? next.title.slice(0, 26) + "…" : next.title}
            </motion.button>
          )}
          {allDone && <span className="badge success" style={{ height: 28, fontSize: 13 }}>🏆 Every lesson complete — you think like a data scientist!</span>}
        </motion.div>
      </div>
    </Glass>
  );
}

function BigRing({ value, steps, children }: { value: number; steps: number; children: React.ReactNode }) {
  const size = 184, stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const r2 = r - stroke - 4, c2 = 2 * Math.PI * r2;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <defs>
          <linearGradient id="lessons-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--accent)" }} />
            <stop offset="55%" style={{ stopColor: "color-mix(in srgb, var(--accent) 50%, var(--accent-2))" }} />
            <stop offset="100%" style={{ stopColor: "var(--accent-2)" }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#lessons-ring)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0.0001, value)) }} transition={{ ...spring.soft, delay: 0.4 }}
          style={{ filter: "drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 45%, transparent))" }} />
        <circle cx={size / 2} cy={size / 2} r={r2} fill="none" stroke="var(--fill)" strokeWidth={5} />
        <motion.circle cx={size / 2} cy={size / 2} r={r2} fill="none" stroke="var(--success)" strokeWidth={5} strokeLinecap="round" strokeDasharray={c2}
          initial={{ strokeDashoffset: c2 }} animate={{ strokeDashoffset: c2 * (1 - Math.max(0.0001, steps)) }} transition={{ ...spring.soft, delay: 0.6 }} />
      </svg>
      <div className="col center" style={{ position: "absolute", inset: 0, gap: 2, textAlign: "center" }}>{children}</div>
    </div>
  );
}
