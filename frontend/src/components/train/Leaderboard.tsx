import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../design/motion";
import { LOWER_IS_BETTER, METRIC_HELP, secs } from "../../lib/format";
import { useProject } from "../../lib/store";
import type { RunResult } from "../../lib/types";
import { Glass, InfoTip, Select, Tooltip } from "../glass";
import { CLS_METRICS, REG_METRICS, type BoardRow, boardRows, fmtMetric, isUnit, metricLabel, useSaved, vsBaseline } from "./util";

const MEDAL = ["🥇", "🥈", "🥉"];

/** Animated leaderboard: rows glide into place whenever the ranking metric changes. */
export function Leaderboard({ result, metric, onMetric, selected, onSelect }: {
  result: RunResult;
  metric: string;
  onMetric: (m: string) => void;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const spec = useProject((s) => s.spec);
  useProject((s) => s.registry);
  const saved = useSaved((s) => s.saved);
  const project = useProject((s) => s.project);
  const failLabel = (k: string) => {
    const cfg = project?.models.find((m) => m.key === k);
    return cfg ? spec(cfg.model_id)?.label ?? cfg.model_id : k;
  };
  const available = (result.task === "regression" ? REG_METRICS : CLS_METRICS).filter((m) => Object.values(result.models).some((r) => !r.baseline && r.metrics.test?.[m] !== undefined));
  const rows = boardRows(result, metric);
  const lower = LOWER_IS_BETTER.has(metric);
  const scores = rows.map((r) => r.score).filter((s): s is number => s !== null);
  const best = scores.length ? (lower ? Math.min(...scores) : Math.max(...scores)) : 0;
  const worst = scores.length ? (lower ? Math.max(...scores) : Math.min(...scores)) : 0;
  const barOf = (v: number | null) => {
    if (v === null) return 0;
    if (lower) return v > 0 ? Math.max(0.04, best / v) : 1;
    if (isUnit(metric)) return Math.max(0.02, Math.min(1, v));
    // r² can be negative: scale between min(0, worst) and 1
    const lo = Math.min(0, worst);
    return Math.max(0.02, (v - lo) / (Math.max(1, best) - lo || 1));
  };
  const base = rows.find((r) => r.baseline);
  const baseScore = base?.score ?? null;
  const baseBar = baseScore !== null ? barOf(baseScore) : null;
  const real = rows.filter((r) => !r.baseline && r.score !== null);
  const beaten = baseScore === null ? real.length : real.filter((r) => (lower ? r.score! < baseScore : r.score! > baseScore)).length;
  // medals go to real models only, in ranking order
  const realRank: Record<string, number> = {};
  rows.filter((r) => !r.baseline).forEach((r, i) => { realRank[r.key] = i; });
  let passedBase = false;

  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ marginBottom: 14, gap: 10 }}>
        <div className="col" style={{ gap: 2 }}>
          <h3>🏆 Leaderboard</h3>
          <span className="small muted">Scored on test rows none of the models saw while learning. Click a row for the full report.</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="small muted">Rank by</span>
          <Select value={metric} onChange={onMetric} options={available.map((m) => ({ value: m, label: metricLabel(m) + (LOWER_IS_BETTER.has(m) ? " ↓" : "") }))} />
          {METRIC_HELP[metric] && <InfoTip text={METRIC_HELP[metric]} />}
        </div>
      </div>

      {base && baseScore !== null && real.length > 0 && (
        <motion.div key={`${metric}-${beaten}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}
          className="inset row" style={{ gap: 10, padding: "9px 12px", marginBottom: 12, alignItems: "flex-start",
            background: beaten === real.length ? "rgba(48,209,88,.08)" : beaten === 0 ? "rgba(255,69,58,.08)" : "rgba(255,159,10,.08)",
            borderColor: beaten === real.length ? "rgba(48,209,88,.3)" : beaten === 0 ? "rgba(255,69,58,.3)" : "rgba(255,159,10,.3)" }}>
          <span style={{ fontSize: 18 }}>{beaten === real.length ? "✅" : beaten === 0 ? "🚨" : "🎯"}</span>
          <span className="small" style={{ lineHeight: 1.5 }}>
            {beaten === real.length
              ? <><b>Every model beats the baseline</b> <span className="muted">— they learned something real, not just {result.task === "regression" ? "“always guess the average”" : "“always say the most common answer”"}.</span></>
              : beaten === 0
                ? <><b>No model beats the baseline on {metricLabel(metric)}.</b> <span className="muted">Always guessing the same answer does at least as well — so the score isn't showing real learning.{!lower && metric === "accuracy" ? " If one answer is very common, accuracy flatters lazy guessing: try ranking by balanced accuracy." : " Look at the data and features again."}</span></>
                : <><b>{beaten} of {real.length} models beat the baseline.</b> <span className="muted">Anything ranked below the 🎯 line is worse than always giving the same answer.</span></>}
          </span>
          <InfoTip text="A baseline is the simplest possible “model”: it ignores every input and always predicts the most common class (classification) or the average (regression). A real model has to beat it to be worth anything." />
        </motion.div>
      )}

      <div className="row tiny faint" style={{ padding: "0 12px 6px", gap: 12 }}>
        <span style={{ width: 30 }} />
        <span style={{ flex: "0 0 180px" }}>Model</span>
        <span className="grow">Test {metricLabel(metric)}</span>
        <span style={{ width: 120, textAlign: "right" }}>Train → Test</span>
        <span style={{ width: 64, textAlign: "right" }}>Fit time</span>
      </div>

      <div className="col" style={{ gap: 6 }}>
        <AnimatePresence initial={false}>
          {rows.map((r, i) => {
            if (r.baseline) {
              passedBase = true;
              return <BaselineRow key={r.key} r={r} i={i} metric={metric} sel={selected === r.key} onSelect={onSelect} bar={barOf(r.score)} />;
            }
            const below = passedBase && r.score !== null && baseScore !== null;
            const ri = realRank[r.key] ?? i;
            const gap = r.train !== null && r.score !== null && !lower ? r.train - r.score : 0;
            const overfit = gap > 0.08;
            const sel = selected === r.key;
            const isSaved = !!saved[`${result.job_id}:${r.key}`];
            const vs = vsBaseline(metric, r.score, baseScore);
            const top = ri === 0 && !below;
            return (
              <motion.button
                key={r.key}
                layout
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: below ? 0.78 : 1, x: 0 }}
                transition={{ layout: spring.gentle, default: { ...spring.gentle, delay: i * 0.05 } }}
                onClick={() => onSelect(r.key)}
                className="row"
                style={{
                  gap: 12, padding: "10px 12px", borderRadius: 14, cursor: "pointer", textAlign: "left", width: "100%",
                  border: `1px solid ${sel ? "var(--accent)" : below ? "rgba(255,69,58,.28)" : "var(--hairline)"}`,
                  background: sel ? "var(--accent-soft)" : below ? "rgba(255,69,58,.05)" : top ? "var(--glass-strong)" : "var(--fill)",
                  boxShadow: sel ? "0 0 0 3px var(--accent-soft)" : "none",
                }}
              >
                <motion.span key={`${metric}-${ri}`} initial={{ scale: 0.3, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
                  style={{ width: 30, textAlign: "center", fontSize: ri < 3 && r.score !== null && !below ? 24 : 13, fontWeight: 700, color: ri < 3 && r.score !== null && !below ? "var(--text)" : "var(--text-3)", display: "inline-block" }}>
                  {r.score === null ? "–" : below ? ri + 1 : MEDAL[ri] ?? ri + 1}
                </motion.span>
                <span className="row" style={{ flex: "0 0 180px", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 17 }}>{spec(r.model_id)?.emoji ?? "🤖"}</span>
                  <span className="col" style={{ gap: 1, minWidth: 0 }}>
                    <b className="truncate" style={{ fontSize: 13.5 }}>{r.label}</b>
                    {vs && (
                      <motion.span key={`${metric}-vs`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.25 + i * 0.05 }}
                        className="tiny num" style={{ color: vs.delta > 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                        {vs.delta > 0 ? "▲" : "▼"} {vs.text} vs baseline
                      </motion.span>
                    )}
                    {isSaved && <span className="tiny" style={{ color: "var(--success)" }}>✓ saved to library</span>}
                  </span>
                </span>
                <span className="row grow" style={{ gap: 10 }}>
                  <span style={{ flex: 1, height: 12, borderRadius: 6, background: "var(--fill-2)", overflow: "hidden", position: "relative" }}>
                    <motion.span style={{ display: "block", height: "100%", borderRadius: 6, background: below ? "var(--danger)" : top ? "var(--grad)" : "var(--accent)", opacity: top ? 1 : 0.6 }}
                      initial={{ width: 0 }} animate={{ width: `${barOf(r.score) * 100}%` }} transition={{ ...spring.gentle, delay: 0.1 + i * 0.05 }} />
                    {baseBar !== null && (
                      <motion.span aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1, left: `${baseBar * 100}%` }} transition={{ ...spring.gentle, delay: 0.3 }}
                        title="Baseline" style={{ position: "absolute", top: -2, bottom: -2, width: 0, borderLeft: "2px dashed var(--text-2)", marginLeft: -1 }} />
                    )}
                  </span>
                  <b className="num" style={{ width: 62, textAlign: "right", fontSize: 14 }}>{fmtMetric(metric, r.score)}</b>
                </span>
                <span className="row num small muted" style={{ width: 120, justifyContent: "flex-end", gap: 4 }}>
                  {fmtMetric(metric, r.train)} → {fmtMetric(metric, r.score)}
                  {overfit && (
                    <Tooltip content={`It scores ${fmtMetric(metric, gap)} better on rows it practised on than on new ones — a sign of memorising (overfitting).`}>
                      <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} style={{ cursor: "help" }}>⚠️</motion.span>
                    </Tooltip>
                  )}
                </span>
                <span className="num small faint" style={{ width: 64, textAlign: "right" }}>{secs(r.fit)}</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {Object.keys(result.failures || {}).length > 0 && (
        <div className="col" style={{ gap: 6, marginTop: 12 }}>
          {Object.entries(result.failures).map(([k, err]) => (
            <div key={k} className="inset row" style={{ padding: "8px 12px", gap: 10, alignItems: "flex-start", borderColor: "rgba(255,69,58,.3)" }}>
              <span>💥</span>
              <span className="small"><b>{failLabel(k)}</b> <span className="muted">failed: {err}</span></span>
            </div>
          ))}
        </div>
      )}
    </Glass>
  );
}

/** The "always guess" reference: dashed, muted, never gets a medal — anything ranked under it is worse than guessing. */
function BaselineRow({ r, i, metric, sel, onSelect, bar }: { r: BoardRow; i: number; metric: string; sel: boolean; onSelect: (k: string) => void; bar: number }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ layout: spring.gentle, default: { ...spring.gentle, delay: i * 0.05 } }}
      onClick={() => onSelect(r.key)}
      className="row"
      style={{
        gap: 12, padding: "9px 12px", borderRadius: 14, cursor: "pointer", textAlign: "left", width: "100%",
        border: `1.5px dashed ${sel ? "var(--accent)" : "var(--text-3)"}`, background: sel ? "var(--accent-soft)" : "transparent",
      }}
    >
      <motion.span key={`${metric}-b`} initial={{ scale: 0.3, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
        style={{ width: 30, textAlign: "center", fontSize: 20, display: "inline-block" }}>🎯</motion.span>
      <span className="col" style={{ flex: "0 0 180px", gap: 0, minWidth: 0 }}>
        <b className="truncate" style={{ fontSize: 13, color: "var(--text-2)" }}>Baseline</b>
        <span className="tiny faint" style={{ lineHeight: 1.3 }}>what you'd get by always guessing</span>
        <span className="tiny truncate" style={{ color: "var(--text-2)", fontWeight: 600 }} title={r.label}>{r.label.replace(/^Baseline\s*·\s*/, "")}</span>
      </span>
      <span className="row grow" style={{ gap: 10 }}>
        <span style={{ flex: 1, height: 12, borderRadius: 6, background: "var(--fill)", overflow: "hidden" }}>
          <motion.span style={{ display: "block", height: "100%", borderRadius: 6, background: "repeating-linear-gradient(135deg, var(--text-3) 0 5px, transparent 5px 9px)", opacity: 0.7 }}
            initial={{ width: 0 }} animate={{ width: `${bar * 100}%` }} transition={{ ...spring.gentle, delay: 0.1 + i * 0.05 }} />
        </span>
        <b className="num muted" style={{ width: 62, textAlign: "right", fontSize: 14 }}>{fmtMetric(metric, r.score)}</b>
      </span>
      <span className="row num small faint" style={{ width: 120, justifyContent: "flex-end" }}>{fmtMetric(metric, r.train)} → {fmtMetric(metric, r.score)}</span>
      <span className="small faint" style={{ width: 64, textAlign: "right" }}>reference</span>
    </motion.button>
  );
}
