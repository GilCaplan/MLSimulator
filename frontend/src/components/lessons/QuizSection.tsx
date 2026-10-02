import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../design/motion";
import type { Lesson } from "../../lib/types";
import { Glass, ProgressRing } from "../glass";
import { Rich } from "./shared";

const LETTERS = "ABCDEFG";

/** One question at a time; instant feedback with the explanation; score at the end. */
export function QuizSection({ lesson, passed, onPassed, onContinue }: { lesson: Lesson; passed: boolean; onPassed: () => void; onContinue: () => void }) {
  const qs = lesson.quiz;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => qs.map(() => null));
  const [review, setReview] = useState(passed);
  useEffect(() => { setIdx(0); setAnswers(qs.map(() => null)); setReview(passed); }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const finished = idx >= qs.length;
  const score = answers.filter((a, i) => a === qs[i].answer).length;
  const restart = () => { setIdx(0); setAnswers(qs.map(() => null)); setReview(false); };

  useEffect(() => {
    if (finished && score === qs.length && !passed) onPassed();
  }, [finished, score]); // eslint-disable-line react-hooks/exhaustive-deps

  if (review) {
    return (
      <Glass pad="lg">
        <div className="row between wrap" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 14 }}>
            <span style={{ fontSize: 34 }}>🎉</span>
            <div className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 16 }}>You aced this quiz.</b>
              <span className="small muted">{qs.length} of {qs.length} correct. Want to try it again?</span>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={restart}>↻ Retake quiz</button>
            <button className="btn primary" onClick={onContinue}>On to practice →</button>
          </div>
        </div>
      </Glass>
    );
  }

  return (
    <Glass pad="lg" style={{ overflow: "hidden" }}>
      <div className="row between" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 6 }}>
          {qs.map((q, i) => {
            const a = answers[i];
            const color = a === null ? (i === idx ? "var(--accent)" : "var(--fill-2)") : a === q.answer ? "var(--success)" : "var(--danger)";
            return <motion.span key={i} animate={{ width: i === idx ? 28 : 10, background: color }} transition={spring.snappy} style={{ height: 10, borderRadius: 5, display: "block" }} />;
          })}
        </div>
        <span className="small faint num">{finished ? "Done" : `Question ${idx + 1} of ${qs.length}`}</span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!finished ? (
          <Question key={idx} q={qs[idx]} answer={answers[idx]}
            onAnswer={(a) => setAnswers((cur) => cur.map((x, i) => (i === idx ? a : x)))}
            onNext={() => setIdx(idx + 1)} last={idx === qs.length - 1} />
        ) : (
          <motion.div key="score" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.gentle} className="row wrap" style={{ gap: 20 }}>
            <ProgressRing value={score / qs.length} size={92} stroke={8} color={score === qs.length ? "var(--success)" : "var(--warning)"}>
              <span style={{ fontSize: 22, fontWeight: 750 }}>{score}/{qs.length}</span>
            </ProgressRing>
            <div className="col grow" style={{ gap: 6, minWidth: 220 }}>
              <b style={{ fontSize: 18 }}>{score === qs.length ? "Perfect — you've got the idea! 🎉" : score === 0 ? "Tricky ones! Have another go." : "Nearly there!"}</b>
              <span className="muted" style={{ lineHeight: 1.5 }}>
                {score === qs.length ? "Now prove it on a real-looking dataset in the practice challenge." : "Re-read the explanations, then try again — getting both right marks the quiz as passed."}
              </span>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <button className="btn" onClick={restart}>↻ Try again</button>
                {score === qs.length && <button className="btn primary" onClick={onContinue}>On to practice →</button>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Glass>
  );
}

function Question({ q, answer, onAnswer, onNext, last }: { q: Lesson["quiz"][number]; answer: number | null; onAnswer: (a: number) => void; onNext: () => void; last: boolean }) {
  const answered = answer !== null;
  const right = answer === q.answer;
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={spring.snappy} className="col" style={{ gap: 14 }}>
      <h3 style={{ fontSize: 19, lineHeight: 1.4, letterSpacing: "-0.015em" }}><Rich text={q.q} /></h3>
      <div className="col" style={{ gap: 8 }}>
        {q.options.map((o, i) => {
          const isCorrect = i === q.answer;
          const picked = i === answer;
          const state = !answered ? "idle" : isCorrect ? "correct" : picked ? "wrong" : "dim";
          return (
            <motion.button key={i} disabled={answered} onClick={() => onAnswer(i)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: state === "dim" ? 0.5 : 1, y: 0, scale: picked ? [1, 1.03, 1] : 1, x: state === "wrong" ? [0, -8, 8, -5, 5, 0] : 0 }}
              transition={{ ...spring.gentle, delay: answered ? 0 : i * 0.05, x: { duration: 0.4 }, scale: { duration: 0.35 } }}
              whileHover={answered ? undefined : { x: 4 }}
              className="row"
              style={{ gap: 12, padding: "12px 14px", borderRadius: 16, cursor: answered ? "default" : "pointer", textAlign: "left",
                border: `1px solid ${state === "correct" ? "rgba(48,209,88,.6)" : state === "wrong" ? "rgba(255,69,58,.55)" : "var(--glass-border)"}`,
                background: state === "correct" ? "rgba(48,209,88,.14)" : state === "wrong" ? "rgba(255,69,58,.12)" : "var(--glass-strong)",
                boxShadow: "0 1px 0 rgba(255,255,255,.5) inset, 0 2px 8px rgba(0,0,0,.05)" }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13,
                background: state === "correct" ? "var(--success)" : state === "wrong" ? "var(--danger)" : "var(--fill)", color: state === "correct" || state === "wrong" ? "white" : "var(--text-2)" }}>
                {state === "correct" ? "✓" : state === "wrong" ? "✕" : LETTERS[i]}
              </span>
              <span style={{ fontSize: 14.5, lineHeight: 1.45 }}><Rich text={o} /></span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {answered && (
          <motion.div initial={{ opacity: 0, height: 0, y: -6 }} animate={{ opacity: 1, height: "auto", y: 0 }} transition={spring.gentle} style={{ overflow: "hidden" }}>
            <div className="inset row" style={{ gap: 12, padding: "12px 14px", alignItems: "flex-start", borderColor: right ? "rgba(48,209,88,.4)" : "rgba(255,159,10,.4)" }}>
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.pop} style={{ fontSize: 22 }}>{right ? "🎯" : "💡"}</motion.span>
              <div className="col grow" style={{ gap: 3 }}>
                <b>{right ? "Correct!" : "Not quite."}</b>
                <span className="muted" style={{ lineHeight: 1.55 }}><Rich text={q.explain} /></span>
              </div>
              <button className="btn primary sm" style={{ alignSelf: "center" }} onClick={onNext}>{last ? "See score" : "Next question →"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
