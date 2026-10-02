import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChallengeSection } from "../components/lessons/ChallengeSection";
import { DEMOS } from "../components/lessons/demos";
import { LearnSection } from "../components/lessons/LearnSection";
import { LessonNav } from "../components/lessons/LessonNav";
import { ProgressRail } from "../components/lessons/ProgressRail";
import { QuizSection } from "../components/lessons/QuizSection";
import { Section } from "../components/lessons/Section";
import { LESSON_STEPS, Rich, StageChip, invalidateLesson, stepFlags, takeLessonFocus, type LessonStepId } from "../components/lessons/shared";
import { EmptyState, Glass, Spinner } from "../components/glass";
import { spring } from "../design/motion";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { toast } from "../lib/store";
import type { Lesson, LessonProgress, LessonSummary } from "../lib/types";

export function LessonPage({ lessonId }: { lessonId: string }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<LessonStepId | null>(null);
  const [headerGone, setHeaderGone] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const sections = useRef<Partial<Record<LessonStepId, HTMLElement | null>>>({});
  const sent = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setLesson(null);
    setError(null);
    sent.current = new Set();
    scroller.current?.scrollTo({ top: 0 });
    invalidateLesson(lessonId);
    api.lesson(lessonId).then((l) => alive && setLesson(l)).catch((e) => alive && setError(String(e.message || e)));
    api.lessons().then((ls) => alive && setLessons([...ls].sort((a, b) => a.order - b.order))).catch(() => {});
    return () => { alive = false; };
  }, [lessonId]);

  const jump = useCallback((id: LessonStepId) => {
    const el = sections.current[id];
    const sc = scroller.current;
    if (!el || !sc) return;
    sc.scrollTo({ top: el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 76, behavior: "smooth" });
  }, []);

  // deep link from the wizard ("Back to lesson")
  useEffect(() => {
    if (!lesson) return;
    const focus = takeLessonFocus() as LessonStepId | null;
    if (focus) setTimeout(() => jump(focus), 350);
  }, [lesson?.id, jump]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const sc = scroller.current;
    if (!sc) return;
    const top = sc.getBoundingClientRect().top;
    let cur: LessonStepId | null = null;
    for (const s of LESSON_STEPS) {
      const el = sections.current[s.id];
      if (el && el.getBoundingClientRect().top - top < sc.clientHeight * 0.33) cur = s.id;
    }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) cur = "practice";
    setActive(cur);
    const h = header.current;
    setHeaderGone(!!h && h.getBoundingClientRect().bottom - top < 0);
  };

  const mark = (patch: Partial<Pick<LessonProgress, "learn_done" | "demo_done" | "quiz_passed">>) => {
    const k = Object.keys(patch).join();
    if (!lesson || sent.current.has(k) || Object.entries(patch).every(([key, v]) => (lesson.progress as any)[key] === v)) return;
    sent.current.add(k);
    setLesson((l) => (l ? { ...l, progress: { ...l.progress, ...patch } } : l));
    api.lessonProgress(lesson.id, patch)
      .then((p) => setLesson((l) => (l && l.id === lessonId ? { ...l, progress: { ...l.progress, ...p } } : l)))
      .catch((e) => { sent.current.delete(k); toast.error(e); });
  };

  if (error) {
    return (
      <div className="row center" style={{ height: "100%" }}>
        <Glass><EmptyState icon="🧭" title="Lesson not found" text={error} action={<button className="btn primary" onClick={() => navigate("/lessons")}>All lessons</button>} /></Glass>
      </div>
    );
  }
  if (!lesson) return <div className="row center" style={{ height: "100%" }}><Spinner size={28} /></div>;

  const flags = stepFlags(lesson.progress);
  const Demo = DEMOS[lesson.demo];
  const ref = (id: LessonStepId) => (el: HTMLElement | null) => { sections.current[id] = el; };

  return (
    <div ref={scroller} className="scroll" style={{ height: "100%" }} onScroll={onScroll}>
      <motion.div key={lesson.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle} className="col"
        style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 22px 90px", gap: 30 }}>

        <ProgressRail active={active} flags={flags} onJump={jump} title={lesson.title} emoji={lesson.emoji} compact={headerGone} />

        {/* header */}
        <div ref={header} className="col" style={{ gap: 14, padding: "8px 4px 0" }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn ghost sm" onClick={() => navigate("/lessons")} style={{ marginLeft: -8 }}>← Lessons</button>
            <StageChip stage={lesson.stage} />
            <span className="tiny faint">Lesson {lesson.order} of {lessons.length || 8}</span>
          </div>
          <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
            <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.1 }}
              className="glass strong" style={{ width: 84, height: 84, borderRadius: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, flexShrink: 0 }}>
              {lesson.emoji}
            </motion.span>
            <div className="col" style={{ gap: 8, minWidth: 0 }}>
              <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.12 }}
                style={{ fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.08, letterSpacing: "-0.03em" }}>
                {lesson.title}
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.18 }} className="muted" style={{ fontSize: 17, lineHeight: 1.5 }}>
                <Rich text={lesson.tagline} />
              </motion.p>
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="inset row small" style={{ gap: 8, padding: "6px 12px", borderRadius: 999, alignSelf: "flex-start" }}>
                🧬 <span className="muted">Modeled on a real project:</span> <b style={{ fontWeight: 600 }}>{lesson.modeled_on}</b>
              </motion.span>
            </div>
          </div>
        </div>

        <Section ref={ref("learn")} id="learn" n={1} icon="📖" eyebrow="Learn" title="The big idea" done={flags.learn}
          subtitle="Four short cards. Read them in order — each one builds on the last.">
          <LearnSection lesson={lesson} onFinished={() => mark({ learn_done: true })} onContinue={() => { mark({ learn_done: true }); jump("try"); }} />
        </Section>

        <Section ref={ref("try")} id="try" n={2} icon="🕹️" eyebrow="Try it" title="Feel it for yourself" done={flags.try} subtitle={<Rich text={lesson.demo_caption} />}>
          <Glass pad="lg" style={{ minHeight: 320 }}>
            {Demo ? <Demo onDone={() => mark({ demo_done: true })} /> : <p className="muted">This demo isn't available yet.</p>}
          </Glass>
        </Section>

        <Section ref={ref("quiz")} id="quiz" n={3} icon="✅" eyebrow="Check yourself" title="Quick quiz" done={flags.quiz}
          subtitle="Two questions. Get both right to pass — you can retry as often as you like.">
          <QuizSection lesson={lesson} passed={flags.quiz} onPassed={() => mark({ quiz_passed: true })} onContinue={() => jump("practice")} />
        </Section>

        <Section ref={ref("practice")} id="practice" n={4} icon="🎯" eyebrow="Practice" title="Now do it for real" done={flags.practice}
          subtitle={<>You'll get a dataset with this exact problem baked in. Work through the normal steps with the app's tools — then your model is graded on a <b style={{ color: "var(--text)" }}>hidden test set</b> that represents the real world.</>}>
          <ChallengeSection lesson={lesson} />
        </Section>

        {lessons.length > 0 && <LessonNav lessons={lessons} currentId={lesson.id} />}
      </motion.div>
    </div>
  );
}
