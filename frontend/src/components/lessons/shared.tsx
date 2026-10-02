import { useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { api } from "../../lib/api";
import { navigate } from "../../lib/router";
import { pct } from "../../lib/format";
import type { ChallengeCheck, Lesson, LessonProgress } from "../../lib/types";

/* ------------------------------------------------------------------ inline rich text */

/**
 * Tiny, safe renderer for lesson copy: `**bold**`, `*italic*` and `` `code` ``. Produces React nodes only (no innerHTML).
 */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<b key={i++} style={{ fontWeight: 650, color: "var(--text)" }}>{tok.slice(2, -2)}</b>);
    else if (tok.startsWith("`")) out.push(<code key={i++} className="mono" style={{ background: "var(--fill)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "1px 5px", fontSize: "0.88em", color: "var(--text)" }}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/* ------------------------------------------------------------------ stages & status */

export const STAGE_TINT: Record<string, { color: string; bg: string }> = {
  Cleaning: { color: "#0a84ff", bg: "rgba(10,132,255,.14)" },
  Features: { color: "#bf5af2", bg: "rgba(191,90,242,.15)" },
  Preparation: { color: "#ff9f0a", bg: "rgba(255,159,10,.16)" },
  Modeling: { color: "#30b0c7", bg: "rgba(48,176,199,.16)" },
  Generalization: { color: "#ff375f", bg: "rgba(255,55,95,.14)" },
  "Responsible ML": { color: "#30d158", bg: "rgba(48,209,88,.15)" },
  Recommend: { color: "#5e5ce6", bg: "rgba(94,92,230,.15)" },
};
export const stageTint = (stage: string) => STAGE_TINT[stage] ?? { color: "var(--accent)", bg: "var(--accent-soft)" };

export function StageChip({ stage, small }: { stage: string; small?: boolean }) {
  const t = stageTint(stage);
  return (
    <span className="badge" style={{ background: t.bg, color: t.color, ...(small ? { height: 20, fontSize: 10.5 } : {}) }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: t.color }} />
      {stage}
    </span>
  );
}

export type LessonStatus = "new" | "progress" | "done";
export function lessonStatus(p: LessonProgress | undefined): LessonStatus {
  if (!p) return "new";
  if (p.completed_at) return "done";
  if (p.learn_done || p.demo_done || p.quiz_passed || p.started_at) return "progress";
  return "new";
}

export const LESSON_STEPS = [
  { id: "learn", label: "Learn", icon: "📖" },
  { id: "try", label: "Try it", icon: "🕹️" },
  { id: "quiz", label: "Quiz", icon: "✅" },
  { id: "practice", label: "Practice", icon: "🎯" },
] as const;
export type LessonStepId = (typeof LESSON_STEPS)[number]["id"];

export function stepFlags(p: LessonProgress | undefined): Record<LessonStepId, boolean> {
  return { learn: !!p?.learn_done, try: !!p?.demo_done, quiz: !!p?.quiz_passed, practice: !!p?.completed_at };
}

/* ------------------------------------------------------------------ metrics */

/** Format a goal / check value: R² as a decimal, everything else as a percentage. */
export const fmtGoal = (metric: string, v: number | null | undefined) =>
  v === null || v === undefined ? "—"
    : metric === "r2" || metric === "ari" || metric === "roc_auc" ? (Math.abs(v) >= 100 ? v.toExponential(1) : v.toFixed(2))
    : pct(v, metric === "tpr_gap" ? 1 : 0);

/** The learner's own-test metric comparable to a hidden-set goal metric (if any). */
export const OWN_METRIC: Record<string, string | undefined> = { accuracy: "accuracy", balanced_accuracy: "balanced_accuracy", r2: "r2", ari: "ari", recall_at_10: "recall_at_10", coverage: "coverage" };

export const SHORT_METRIC: Record<string, string> = {
  accuracy: "accuracy", balanced_accuracy: "balanced accuracy", r2: "R²", recall_pos: "recall", precision_pos: "precision",
  f1_pos: "F1", tpr_gap: "approval gap", ari: "agreement (ARI)", ece: "calibration error", roc_auc: "ROC-AUC",
  mae_vs_baseline: "gain over baseline", estimate_gap: "estimate gap",
  recall_at_10: "of liked films found in the top 10", coverage: "of the catalogue recommended",
};

/** Headline numbers for the "your test vs the real world" contrast — leads with a failed goal when there is one. */
export function headline(check: ChallengeCheck) {
  const own = check.your_test;
  const comparable = (g: ChallengeCheck["goals"][number]) => !!OWN_METRIC[g.metric] && own[OWN_METRIC[g.metric]!] !== undefined;
  const g = check.goals.find((x) => !x.passed && comparable(x)) ?? check.goals.find((x) => !x.passed) ?? check.goals.find(comparable) ?? check.goals[0];
  const ownKey = comparable(g) ? OWN_METRIC[g.metric]! : own.r2 !== undefined ? "r2" : own.silhouette !== undefined ? "silhouette" : "accuracy";
  const ownMetric = own[ownKey] !== undefined ? ownKey : Object.keys(own)[0];
  return { ownMetric, ownValue: own[ownMetric] as number | undefined, goal: g };
}

/* ------------------------------------------------------------------ lesson cache */

const cache = new Map<string, Promise<Lesson>>();

/** Fetch a lesson once per session (shared by the wizard banner and the check panel). */
export function useLesson(id: string | null | undefined) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let p = cache.get(id);
    if (!p) {
      p = api.lesson(id);
      cache.set(id, p);
      p.catch(() => cache.delete(id));
    }
    p.then((l) => alive && setLesson(l)).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return lesson;
}
export const invalidateLesson = (id: string) => cache.delete(id);

/* ------------------------------------------------------------------ progressive hints */

const HINT_KEY = "mlp.lessonHints";
const readHints = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(HINT_KEY) || "{}"); } catch { return {}; }
};

interface HintState { shown: Record<string, number>; reveal: (id: string, max: number) => void }
/** How many hints the learner has revealed per lesson — shared between the lesson page, banner and check panel. */
export const useHints = create<HintState>((set, get) => ({
  shown: readHints(),
  reveal: (id, max) => {
    const shown = { ...get().shown, [id]: Math.min(max, (get().shown[id] ?? 0) + 1) };
    try { localStorage.setItem(HINT_KEY, JSON.stringify(shown)); } catch { /* storage unavailable */ }
    set({ shown });
  },
}));

/* ------------------------------------------------------------------ deep links */

let focusSection: string | null = null;
/** Open a lesson page and scroll to one of its sections (learn · try · quiz · practice). */
export function openLesson(id: string, section?: string) {
  focusSection = section ?? null;
  navigate(`/lessons/${id}`);
}
/** Read (and clear) the section a caller asked the lesson page to scroll to. */
export function takeLessonFocus() {
  const s = focusSection;
  focusSection = null;
  return s;
}
