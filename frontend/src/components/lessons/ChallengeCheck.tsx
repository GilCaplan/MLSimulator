import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { navigate } from "../../lib/router";
import { isUnsupervised, toast, useProject } from "../../lib/store";
import type { ChallengeCheck as Check } from "../../lib/types";
import { Glass, InfoTip, Spinner, Tooltip } from "../glass";
import { fmtMetric, isForecast, isRecsys, metricLabel, primaryMetric } from "../train/util";
import { CheckReveal } from "./CheckReveal";
import { Confetti } from "./Confetti";
import { Rich, invalidateLesson, openLesson, useHints, useLesson } from "./shared";

/** Train results: grade any trained model on the hidden real-world test set. */
export function ChallengeCheck() {
  const project = useProject((s) => s.project);
  const result = useProject((s) => s.result);
  const spec = useProject((s) => s.spec);
  useProject((s) => s.registry);
  const lessonId = project?.challenge?.lesson_id ?? null;
  const lesson = useLesson(lessonId);
  const [busy, setBusy] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [burst, setBurst] = useState({ n: 0, x: 0, y: 0 });
  const shown = useHints((s) => (lessonId ? s.shown[lessonId] ?? 0 : 0));
  const reveal = useHints((s) => s.reveal);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => { setCheck(null); }, [result?.job_id]);

  if (!project?.challenge || !result || !lessonId) return null;
  const allowed = lesson?.challenge.allowed_models ?? null;
  const rec = isRecsys(result.task);
  // recommendation challenges are judged on recall@10 — show the learner the same number from their own test
  const metric = rec ? "recall_at_10" : primaryMetric(result.task);
  const rows = [...result.leaderboard].filter((r) => !r.baseline && !result.models[r.key]?.baseline).sort((a, b) => a.rank - b.rank);
  const hints = lesson?.challenge.hints ?? [];
  const unsup = isUnsupervised(result.task);
  const fc = isForecast(result.task);

  const run = async (key: string) => {
    setBusy(key);
    try {
      const c = await api.checkChallenge(lessonId, result.job_id, key);
      setCheck(c);
      invalidateLesson(lessonId);
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      if (c.passed) {
        setTimeout(() => {
          const r = panel.current?.getBoundingClientRect();
          setBurst((b) => ({ n: b.n + 1, x: r ? r.left + r.width / 2 : window.innerWidth / 2, y: r ? r.top + 80 : window.innerHeight / 3 }));
        }, 1250);
      } else if (shown < hints.length) {
        reveal(lessonId, hints.length);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const latestHint = shown > 0 ? hints[Math.min(shown, hints.length) - 1] : null;

  return (
    <Glass ref={panel} animate_in variant="strong" style={{ borderColor: check ? (check.passed ? "rgba(48,209,88,.55)" : "rgba(255,159,10,.5)") : "rgba(94,92,230,.35)", overflow: "hidden" }}>
      <Confetti burst={burst.n} x={burst.x} y={burst.y} />
      <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", background: "radial-gradient(ellipse at 100% 0%, rgba(94,92,230,.14), transparent 55%)" }} />

      <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <motion.span animate={{ rotate: [0, 360] }} transition={{ repeat: Infinity, duration: 18, ease: "linear" }} style={{ fontSize: 30, display: "inline-block" }}>🌍</motion.span>
          <div className="col" style={{ gap: 2 }}>
            <span className="eyebrow" style={{ color: "var(--accent-2)" }}>🎯 Challenge · {lesson?.challenge.title ?? "…"}</span>
            <h3 className="row" style={{ gap: 6 }}>Check against the real world
              <InfoTip text="Your test rows came from the same data as your training rows, so they share its quirks. The real world doesn't. We kept a hidden test set that looks like the data your model will really meet." />
            </h3>
          </div>
        </div>
        {lesson && (
          <div className="row wrap" style={{ gap: 6 }}>
            {lesson.challenge.goals.map((g) => <span key={g.metric} className="badge">{g.label}</span>)}
          </div>
        )}
      </div>

      <p className="small muted" style={{ lineHeight: 1.55, marginBottom: 12, maxWidth: 680 }}>
        {fc
          ? <>Your leaderboard scores each model on <b>your</b> test. Pick a model to send its forecast into the <b>real future</b> — the days right after your data ends, which we kept hidden — and compare. If the real error is far bigger than your test promised, something let the model peek.</>
          : rec
          ? lessonId === "cold_start"
            ? <>Your leaderboard tests viewers the models already know well. The real world keeps sending <b>brand-new viewers</b> who've rated only a couple of films. Pick a model to see how its top-10 lists do for them — the only score that decides the challenge.</>
            : <>The leaderboard shows how each model's top-10 lists did on <b>your</b> held-out ratings. Pick a model to test it on <b>hidden viewers from the real world</b> — the only score that decides the challenge.</>
          : unsup
          ? <>Without answers, the leaderboard can only say how <b>crisp</b> each model's groups look. Pick a model to see whether its groups match the <b>real, hidden groups</b> in fresh data — the only score that decides the challenge.</>
          : <>The leaderboard shows how each model did on <b>your</b> test split. Pick a model to see how it does on <b>hidden data from the real world</b> — the only score that decides the challenge.</>}
      </p>

      <div className="col" style={{ gap: 6 }}>
        {rows.map((row, i) => {
          const m = result.models[row.key];
          if (!m) return null;
          const blocked = !!allowed && !allowed.includes(m.model_id);
          const selected = check?.key === row.key;
          const btn = (
            <motion.button whileTap={{ scale: 0.96 }} className={`btn sm ${selected ? "" : "gradient"}`} disabled={blocked || !!busy} onClick={() => run(row.key)}>
              {busy === row.key ? <Spinner size={13} /> : selected ? "↻" : "🌍"} {selected ? "Check again" : "Check against the real world"}
            </motion.button>
          );
          return (
            <motion.div key={row.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: blocked ? 0.6 : 1, y: 0 }} transition={{ ...spring.gentle, delay: i * 0.05 }}
              className="inset row between wrap" style={{ gap: 10, padding: "9px 12px", borderColor: selected ? "var(--accent)" : undefined }}>
              <span className="row" style={{ gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 18 }}>{spec(m.model_id)?.emoji ?? "🤖"}</span>
                <span className="col" style={{ gap: 0, minWidth: 0 }}>
                  <b className="truncate" style={{ fontSize: 13.5 }}>{m.label}{rec && m.params?.cold_start === "popularity" ? " · 🛟 fallback" : ""}</b>
                  <span className="tiny faint">{unsup ? "On your rows" : "Your test"}: {fc ? "average miss" : metricLabel(metric)} {fmtMetric(metric, m.metrics.test?.[metric])}{fc && m.forecast?.split === "random" ? " · random split" : ""}</span>
                </span>
              </span>
              {blocked ? (
                <Tooltip content={`This challenge must be solved with ${allowed!.map((a) => spec(a)?.label ?? a).join(" or ")}.`} width={220}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="tiny faint">Not allowed in this challenge</span>
                    {btn}
                  </span>
                </Tooltip>
              ) : btn}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {check && (
          <motion.div key={`${check.key}-${check.checked_at}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle} style={{ overflow: "hidden" }}>
            <div className="divider" style={{ margin: "18px 0" }} />
            <div className="row between" style={{ marginBottom: 12 }}>
              <span className="small muted">Results for <b style={{ color: "var(--text)" }}>{check.model}</b></span>
            </div>
            <CheckReveal check={check} reveal lessonId={lessonId} />
            <Outcome check={check} lessonId={lessonId} hint={latestHint} hintIndex={shown} hintCount={hints.length} />
          </motion.div>
        )}
      </AnimatePresence>
    </Glass>
  );
}

function Outcome({ check, lessonId, hint, hintIndex, hintCount }: { check: Check; lessonId: string; hint: string | null; hintIndex: number; hintCount: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 1.6 }} style={{ marginTop: 18 }}>
      {check.passed ? (
        <div className="col" style={{ gap: 14, padding: 20, borderRadius: 20, background: "linear-gradient(135deg, rgba(48,209,88,.16), rgba(10,132,255,.12) 60%, rgba(191,90,242,.14))", border: "1px solid rgba(48,209,88,.35)" }}>
          <div className="row" style={{ gap: 14 }}>
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: [0, 1.3, 1], rotate: 0 }} transition={{ duration: 0.7, delay: 1.7 }} style={{ fontSize: 44 }}>🏆</motion.span>
            <div className="col" style={{ gap: 2 }}>
              <h2 className="gradient-text">Challenge complete!</h2>
              <span className="muted">Your model works where it matters — on data it will actually meet.</span>
            </div>
          </div>
          {check.solution && (
            <div className="inset col" style={{ gap: 4, padding: "12px 14px", background: "var(--glass-strong)" }}>
              <span className="eyebrow">What we were looking for</span>
              <span style={{ lineHeight: 1.55 }}><Rich text={check.solution} /></span>
            </div>
          )}
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn primary" onClick={() => openLesson(lessonId, "practice")}>🎓 Back to the lesson</button>
            <button className="btn ghost" onClick={() => navigate("/lessons")}>All lessons →</button>
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 12, padding: 18, borderRadius: 20, background: "rgba(255,159,10,.10)", border: "1px solid rgba(255,159,10,.35)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 28 }}>🧭</span>
            <div className="col" style={{ gap: 3 }}>
              <b style={{ fontSize: 15 }}>Not yet — and that's exactly how data scientists learn.</b>
              <span className="small muted" style={{ lineHeight: 1.55 }}>
                The gap between "looks great on my test" and "works in the real world" is the clue. Change one thing in your setup, train again, and re-check.
              </span>
            </div>
          </div>
          {hint && (
            <motion.div key={hintIndex} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={spring.gentle}
              className="inset row" style={{ gap: 10, padding: "10px 12px", alignItems: "flex-start", background: "var(--glass-strong)" }}>
              <span className="badge warning" style={{ flexShrink: 0 }}>💡 Hint {hintIndex}/{hintCount}</span>
              <span className="small" style={{ lineHeight: 1.55 }}><Rich text={hint} /></span>
            </motion.div>
          )}
          <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => navigate(`/lessons/${lessonId}`)}>Re-read the lesson ↗</button>
        </div>
      )}
    </motion.div>
  );
}
