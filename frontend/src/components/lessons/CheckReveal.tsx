import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { spring } from "../../design/motion";
import { METRIC_LABELS, fmt, pct } from "../../lib/format";
import type { ChallengeCheck } from "../../lib/types";
import { AnimatedNumber, InfoTip } from "../glass";
import { OWN_METRIC, SHORT_METRIC, fmtGoal } from "./shared";

const OK = "var(--success)";
const BAD = "var(--danger)";

/** Map a metric value onto a 0…1 bar (R² can be very negative). */
const bar = (v: number) => Math.max(0.015, Math.min(1, v));

type Goal = ChallengeCheck["goals"][number] & {
  /** estimate_gap */ your_test?: number; real_world?: number; of?: string;
  /** mae_vs_baseline */ mae?: number; baseline_mae?: number;
  /** ece */ predicted_cases?: number; actual_cases?: number;
};

/** Own-test metric comparable to each hidden-set goal (extends the shared map with the newer metrics). */
const OWN: Record<string, string | undefined> = { ...OWN_METRIC, roc_auc: "roc_auc" };
const SHORT: Record<string, string> = { ...SHORT_METRIC, roc_auc: "ROC-AUC", ece: "calibration error", estimate_gap: "estimate gap", mae_vs_baseline: "better than the baseline" };
const NAME = (m: string) => METRIC_LABELS[m] ?? SHORT[m] ?? m;

/** Goal formatting: percentages for rates, "pts" for gaps, plain decimals for ROC-AUC and R². */
function fmtG(metric: string, v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (metric === "roc_auc") return v.toFixed(2);
  if (metric === "ece") return pct(v, 1);
  if (metric === "estimate_gap") return `${(v * 100).toFixed(1)} pts`;
  if (metric === "mae_vs_baseline") return pct(v, 0);
  return fmtGoal(metric, v);
}

interface Side { eyebrow: string; value?: number; format: (v: number) => string; caption: ReactNode }

/** The "your test vs the real world" contrast — leads with a failed goal, with special layouts for the newer metrics. */
function contrast(check: ChallengeCheck) {
  const own: Record<string, number> = check.your_test ?? {};
  const goals = (check.goals ?? []) as Goal[];
  const special = (g: Goal) => g.metric === "estimate_gap" || g.metric === "mae_vs_baseline";
  const comparable = (g: Goal) => !!OWN[g.metric] && own[OWN[g.metric]!] !== undefined;
  const goal = goals.find((x) => !x.passed && (comparable(x) || special(x))) ?? goals.find((x) => !x.passed) ?? goals.find((x) => comparable(x) || special(x)) ?? goals[0];
  const hidden = `${check.n_hidden.toLocaleString()} hidden rows`;
  if (goal?.metric === "estimate_gap") {
    const of = goal.of ?? "accuracy";
    const mine = goal.your_test ?? own[of];
    const real = goal.real_world;
    return {
      goal, ownMetric: of, ownValue: mine, realValue: real ?? goal.value,
      left: { eyebrow: "🧪 Your test said", value: mine, format: (v: number) => fmtG(of, v), caption: <>{NAME(of)} on your own test split</> } as Side,
      right: real !== undefined
        ? { eyebrow: "🌍 The real world says", value: real, format: (v: number) => fmtG(of, v), caption: <>{NAME(of)} on {hidden}</> } as Side
        : { eyebrow: "🌍 Gap to the real world", value: goal.value, format: (v: number) => fmtG("estimate_gap", v), caption: <>on {hidden}</> } as Side,
      chip: <span className={`badge ${goal.passed ? "success" : "danger"}`}>gap {fmtG("estimate_gap", goal.value)} · goal ≤ {fmtG("estimate_gap", goal.target)}</span>,
    };
  }
  if (goal?.metric === "mae_vs_baseline") {
    return {
      goal, ownMetric: "mae_vs_baseline", ownValue: goal.target, realValue: goal.value,
      left: { eyebrow: "🎯 The goal", value: goal.target, format: (v: number) => `≥ ${fmtG("mae_vs_baseline", v)}`, caption: <>beat the always-the-average guess by at least this much</> } as Side,
      right: { eyebrow: "🌍 The real world says", value: goal.value, format: (v: number) => fmtG("mae_vs_baseline", v),
        caption: <>beats the baseline by {fmtG("mae_vs_baseline", goal.value)}{goal.mae !== undefined && goal.baseline_mae !== undefined ? <> · MAE {fmt(goal.mae, 3)} vs {fmt(goal.baseline_mae, 3)}</> : null} on {hidden}</> } as Side,
      chip: null,
    };
  }
  if (goal?.metric === "ece" && own.ece === undefined) {
    return {
      goal, ownMetric: "ece", ownValue: undefined as number | undefined, realValue: goal.value,
      left: { eyebrow: "🎯 The goal", value: goal.target, format: (v: number) => `≤ ${fmtG("ece", v)}`, caption: <>calibration error: the average gap between the stated probability and what really happens</> } as Side,
      right: { eyebrow: "🌍 The real world says", value: goal.value, format: (v: number) => fmtG("ece", v), caption: <>calibration error on {hidden}</> } as Side,
      chip: null,
    };
  }
  const ownKey = goal && comparable(goal) ? OWN[goal.metric]! : own.r2 !== undefined ? "r2" : "accuracy";
  const ownMetric = own[ownKey] !== undefined ? ownKey : Object.keys(own)[0] ?? ownKey;
  const ownValue = own[ownMetric] as number | undefined;
  const gm = goal?.metric ?? ownMetric;
  return {
    goal, ownMetric, ownValue, realValue: goal?.value ?? 0,
    left: { eyebrow: "🧪 Your test said", value: ownValue, format: (v: number) => fmtG(ownMetric, v), caption: <>{NAME(ownMetric)} on your own test split</> } as Side,
    right: { eyebrow: "🌍 The real world says", value: goal?.value, format: (v: number) => fmtG(gm, v), caption: <>{(goal?.label ?? NAME(gm)).split(/[≥≤]/)[0].trim()} on {hidden}</> } as Side,
    chip: null,
  };
}

/**
 * "Your test said … — the real world says …": the learner's own test score versus the hidden real-world results.
 * `reveal` plays the dramatic version (the real-world side lands after a beat).
 */
export function CheckReveal({ check, reveal = false, compact = false }: { check: ChallengeCheck; reveal?: boolean; compact?: boolean }) {
  const [landed, setLanded] = useState(!reveal);
  useEffect(() => {
    if (!reveal) { setLanded(true); return; }
    setLanded(false);
    const t = setTimeout(() => setLanded(true), 1100);
    return () => clearTimeout(t);
  }, [check, reveal]);

  const goals = (check.goals ?? []) as Goal[];
  const yours: Record<string, number> = check.your_test ?? {};
  const h = contrast(check);
  if (!h.goal) return null;
  const sameMetric = OWN[h.goal.metric] === h.ownMetric || h.goal.metric === "estimate_gap";
  const lowerBetter = h.goal.op === "<=";
  const drop = h.ownValue !== undefined && !lowerBetter && h.goal.metric !== "mae_vs_baseline" ? h.ownValue - h.realValue : h.goal.metric === "estimate_gap" && h.ownValue !== undefined ? h.ownValue - h.realValue : 0;
  const big = compact ? 30 : 46;
  const fairness = goals.find((g) => g.per_group);
  const passedSide = h.goal.passed;

  return (
    <div className="col" style={{ gap: compact ? 12 : 18 }}>
      {/* the contrast */}
      <div className="grid" style={{ gridTemplateColumns: "1fr auto 1fr", alignItems: "stretch", gap: compact ? 8 : 12 }}>
        <motion.div initial={reveal ? { opacity: 0, x: -16 } : false} animate={{ opacity: 1, x: 0 }} transition={spring.gentle}
          className="inset col" style={{ gap: 4, padding: compact ? 12 : 18, borderRadius: 18 }}>
          <span className="eyebrow">{h.left.eyebrow}</span>
          <span style={{ fontSize: big, fontWeight: 750, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            {h.left.value === undefined ? "—" : <AnimatedNumber value={h.left.value} format={h.left.format} duration={reveal ? 0.9 : 0.01} />}
          </span>
          <span className="small muted">{h.left.caption}</span>
        </motion.div>

        <div className="col center" style={{ gap: 0 }}>
          <motion.span initial={reveal ? { scale: 0 } : false} animate={{ scale: 1 }} transition={{ ...spring.pop, delay: reveal ? 0.35 : 0 }}
            style={{ width: compact ? 30 : 38, height: compact ? 30 : 38, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--glass-strong)", border: "1px solid var(--glass-border)", fontWeight: 700, fontSize: compact ? 11 : 13, color: "var(--text-2)" }}>
            vs
          </motion.span>
        </div>

        <div className="inset col" style={{ gap: 4, padding: compact ? 12 : 18, borderRadius: 18, position: "relative", overflow: "hidden",
          background: landed ? (passedSide ? "rgba(48,209,88,.12)" : "rgba(255,69,58,.10)") : undefined, borderColor: landed ? (passedSide ? "rgba(48,209,88,.4)" : "rgba(255,69,58,.35)") : undefined, transition: "background .4s, border-color .4s" }}>
          <span className="eyebrow">{h.right.eyebrow}</span>
          <AnimatePresence mode="wait">
            {!landed ? (
              <motion.span key="wait" exit={{ opacity: 0, y: -8 }} className="row" style={{ gap: 10, height: big * 1.05 }}>
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }} style={{ fontSize: big * 0.6, display: "inline-block" }}>🌍</motion.span>
                <span className="muted small">Testing on {check.n_hidden.toLocaleString()} real-world rows…</span>
              </motion.span>
            ) : (
              <motion.span key="val" initial={reveal ? { opacity: 0, scale: 0.6, y: 10 } : false} animate={{ opacity: 1, scale: 1, y: 0 }} transition={spring.pop}
                style={{ fontSize: big, fontWeight: 750, letterSpacing: "-0.04em", lineHeight: 1.05, color: passedSide ? OK : BAD, transformOrigin: "left center" }}>
                {h.right.value === undefined ? "—" : <AnimatedNumber value={h.right.value} format={h.right.format} duration={reveal ? 0.7 : 0.01} />}
              </motion.span>
            )}
          </AnimatePresence>
          <span className="small muted">{h.right.caption}</span>
          {h.chip && landed && (
            <motion.span initial={reveal ? { opacity: 0, scale: 0.7 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.pop, delay: reveal ? 0.3 : 0 }} style={{ alignSelf: "flex-start", marginTop: 4 }}>
              {h.chip}
            </motion.span>
          )}
        </div>
      </div>

      {/* the teaching line */}
      <AnimatePresence>
        {landed && (
          <motion.div initial={reveal ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: reveal ? 0.25 : 0 }}
            className={compact ? "small" : ""} style={{ lineHeight: 1.55, color: "var(--text-2)", padding: "0 2px" }}>
            {verdict(check, h, drop, sameMetric)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* goals */}
      <div className="col" style={{ gap: 8 }}>
        {goals.map((g, i) => {
          const own = OWN[g.metric] ? yours[OWN[g.metric]!] : undefined;
          const lower = g.op === "<=";
          const max = lower ? Math.max(g.target * 2.5, g.value * 1.1, own ?? 0, 1e-6) : 1;
          return (
            <motion.div key={g.metric} initial={reveal ? { opacity: 0, x: 12 } : false} animate={landed ? { opacity: 1, x: 0 } : {}} transition={{ ...spring.gentle, delay: reveal ? 0.35 + i * 0.12 : 0 }}
              className="col" style={{ gap: 6, padding: compact ? "8px 2px" : "10px 4px", borderTop: i ? "1px solid var(--hairline)" : undefined }}>
              <div className="row between" style={{ gap: 10 }}>
                <span className="row" style={{ gap: 10, minWidth: 0 }}>
                  <motion.span initial={reveal ? { scale: 0, rotate: -40 } : false} animate={landed ? { scale: 1, rotate: 0 } : {}} transition={{ ...spring.pop, delay: reveal ? 0.5 + i * 0.12 : 0 }}
                    style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800, fontSize: 13, background: g.passed ? OK : BAD }}>
                    {g.passed ? "✓" : "✕"}
                  </motion.span>
                  <span className="col" style={{ gap: 0, minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>{g.label}</b>
                    <GoalNote g={g} own={own} />
                  </span>
                </span>
                <b className="num" style={{ fontSize: 17, color: g.passed ? OK : BAD }}>{fmtG(g.metric, g.value)}</b>
              </div>
              {g.metric !== "tpr_gap" && <GoalBar value={g.value / max} target={g.target / max} own={own === undefined ? undefined : own / max} passed={g.passed} lowerIsBetter={lower} label={`Goal: ${lower ? "≤" : "≥"} ${fmtG(g.metric, g.target)}`} animate={landed} />}
            </motion.div>
          );
        })}
      </div>

      {fairness?.per_group && <GroupBars perGroup={fairness.per_group} passed={fairness.passed} compact={compact} animate={landed} />}
    </div>
  );
}

/** The small grey line under a goal: what your own test said, or the extra numbers the grader returned. */
function GoalNote({ g, own }: { g: Goal; own?: number }) {
  let text: string | null = null;
  if (g.metric === "estimate_gap" && (g.your_test !== undefined || g.real_world !== undefined)) {
    const of = g.of ?? "accuracy";
    text = `your test said ${fmtG(of, g.your_test)} · real world ${fmtG(of, g.real_world)} · gap ${fmtG("estimate_gap", g.value)}`;
  } else if (g.metric === "mae_vs_baseline" && g.mae !== undefined && g.baseline_mae !== undefined) {
    text = `average miss ${fmt(g.mae, 3)} vs ${fmt(g.baseline_mae, 3)} for always-the-average`;
  } else if (g.metric === "ece" && g.predicted_cases !== undefined && g.actual_cases !== undefined) {
    text = `its probabilities add up to ${Math.round(g.predicted_cases).toLocaleString()} cases · ${g.actual_cases.toLocaleString()} really happened`;
  } else if (own !== undefined) {
    text = `your test: ${fmtG(g.metric, own)}`;
  }
  return text ? <span className="tiny faint">{text}</span> : null;
}

function verdict(check: ChallengeCheck, h: ReturnType<typeof contrast>, drop: number, sameMetric: boolean) {
  const g = h.goal as Goal;
  const own = h.ownValue === undefined ? "" : fmtG(h.ownMetric, h.ownValue);
  const realTxt = `${fmtG(g.metric, g.value)} ${SHORT[g.metric] ?? g.metric}`;
  const T = (x: ReactNode) => <b style={{ color: "var(--text)" }}>{x}</b>;
  const B = (x: ReactNode) => <b style={{ color: BAD }}>{x}</b>;
  if (g.metric === "estimate_gap" && h.ownValue !== undefined) {
    const of = g.of ?? "accuracy";
    return g.passed
      ? <>Your test said {T(fmtG(of, h.ownValue))} and the real world gave {T(fmtG(of, h.realValue))} — only {fmtG("estimate_gap", g.value)} apart. {check.passed ? <>An honest estimate is worth more than a high one.</> : <>Your estimate is honest — now make the model itself better.</>}</>
      : <>Your test said {T(fmtG(of, h.ownValue))}, but the real world gave {B(fmtG(of, h.realValue))} — a {B(fmtG("estimate_gap", g.value))} gap. Your test split was fooling you: rows that belong together (the same person, the same day) probably ended up on both sides of the split.</>;
  }
  if (!check.passed && g.metric === "mae_vs_baseline") {
    return g.value <= 0
      ? <>In the real world it's {B("worse than always guessing the average")}. The inputs aren't helping this model at all yet.</>
      : <>In the real world it beats the always-the-average guess by only {B(fmtG("mae_vs_baseline", g.value))} (goal: ≥ {fmtG("mae_vs_baseline", g.target)}). A model has to clearly beat the lazy guess to be worth using.</>;
  }
  if (!check.passed && g.metric === "ece") {
    return <>Its probabilities are off by {B(fmtG("ece", g.value))} on average{g.predicted_cases !== undefined && g.actual_cases !== undefined ? <> — they add up to {T(Math.round(g.predicted_cases).toLocaleString())} expected cases, but only {T(g.actual_cases.toLocaleString())} really happened</> : null}. When it says 70%, it doesn't mean 70%.</>;
  }
  if (!check.passed && g.metric === "roc_auc") {
    return <>Its ROC-AUC in the real world is {B(fmtG("roc_auc", g.value))} (goal ≥ {fmtG("roc_auc", g.target)}): it isn't ranking the risky cases above the safe ones well enough.</>;
  }
  if (check.passed) {
    return drop > 0.15
      ? <>It still scores lower in the real world than on your own test — but it clears every goal. {T("Honest beats impressive.")}</>
      : <>{T("Your score held up.")} What you measured is what the real world got — that's a model you can trust.</>;
  }
  if (sameMetric && drop > 0.15) {
    return <>Your own test said {T(own)} — out in the real world it's {B(realTxt)}. Your test rows carried the same flaw as your training rows, so they couldn't warn you. That gap is the lesson.</>;
  }
  if (!sameMetric && own && g.metric === "tpr_gap") {
    return <>Your test said {T(`${own} ${SHORT[h.ownMetric] ?? h.ownMetric}`)} — but in the real world, applicants who truly repay are approved at very different rates: a {B(`${(g.value * 100).toFixed(0)}-point gap`)} between groups. A good average can hide an unfair model.</>;
  }
  if (!sameMetric && own) {
    return <>A shiny {T(`${own} ${SHORT[h.ownMetric] ?? h.ownMetric}`)} on your test — yet only {B(realTxt)} where it matters. The headline number was hiding the real problem.</>;
  }
  return <>Not there yet — the real world doesn't quite meet the goals. Look again at how the data was prepared.</>;
}

function GoalBar({ value, target, own, passed, lowerIsBetter, label, animate }: { value: number; target: number; own?: number; passed: boolean; lowerIsBetter: boolean; label: string; animate: boolean }) {
  return (
    <div style={{ position: "relative", height: own !== undefined ? 18 : 8, marginLeft: 34 }}>
      {own !== undefined && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 6, borderRadius: 4, background: "var(--fill)" }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${bar(own) * 100}%` }} transition={spring.gentle}
            style={{ height: "100%", borderRadius: 4, background: "var(--text-3)", opacity: 0.55 }} />
        </div>
      )}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, borderRadius: 4, background: "var(--fill)" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: animate ? `${bar(value) * 100}%` : 0 }} transition={{ ...spring.soft, delay: 0.2 }}
          style={{ height: "100%", borderRadius: 4, background: passed ? OK : BAD }} />
      </div>
      <span title={label} style={{ position: "absolute", left: `${Math.min(1, Math.max(0, target)) * 100}%`, top: -3, bottom: -3, width: 2, borderRadius: 1, background: "var(--text)", opacity: 0.7 }} />
    </div>
  );
}

function GroupBars({ perGroup, passed, compact, animate }: { perGroup: Record<string, number>; passed: boolean; compact: boolean; animate: boolean }) {
  const entries = Object.entries(perGroup);
  const vals = entries.map(([, v]) => v);
  const gap = Math.max(...vals) - Math.min(...vals);
  const colors = ["#ff375f", "#0a84ff", "#bf5af2", "#30d158"];
  return (
    <div className="inset col" style={{ gap: 10, padding: compact ? 12 : 16 }}>
      <div className="row between">
        <span className="row" style={{ gap: 6 }}>
          <b style={{ fontSize: 13 }}>Approval rate for applicants who truly repay</b>
          <InfoTip text="The true positive rate per group: of the people who really repaid, how many did the model approve? Equal opportunity means these bars should match." />
        </span>
        <span className={`badge ${passed ? "success" : "danger"}`}>gap {(gap * 100).toFixed(1)} pts</span>
      </div>
      {entries.map(([name, v], i) => (
        <div key={name} className="row" style={{ gap: 10 }}>
          <span className="small" style={{ width: 70, fontWeight: 600, textTransform: "capitalize" }}>{name}</span>
          <div className="grow" style={{ height: compact ? 14 : 18, borderRadius: 9, background: "var(--fill)", overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: animate ? `${Math.max(0.01, v) * 100}%` : 0 }} transition={{ ...spring.soft, delay: 0.3 + i * 0.15 }}
              style={{ height: "100%", borderRadius: 9, background: colors[i % colors.length] }} />
          </div>
          <b className="num small" style={{ width: 44, textAlign: "right" }}>{(v * 100).toFixed(0)}%</b>
        </div>
      ))}
    </div>
  );
}
