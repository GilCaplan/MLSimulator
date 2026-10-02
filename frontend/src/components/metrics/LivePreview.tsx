import { motion } from "framer-motion";
import { spring } from "../../design/motion";
import type { CustomMetric, RunResult } from "../../lib/types";
import { Tooltip } from "../glass";
import { boardRows, fmtMetric, metricLabel } from "../train/util";
import { evalCustom, fmtCustom } from "./custom";

const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * The latest run re-ranked by the draft metric, as you type: each model's value, how far it moved compared with the
 * built-in ranking, and a one-line verdict ("your score would pick X instead of Y").
 */
export function LivePreview({ draft, result, compareMetric, stale }: {
  draft: CustomMetric | null;
  result: RunResult | null;
  /** built-in metric the learner ranks by today */
  compareMetric: string;
  /** true while the formula has an error (we keep showing the last good ranking, dimmed) */
  stale?: boolean;
}) {
  if (!result) {
    return (
      <div className="inset col center" style={{ padding: 18, gap: 6, textAlign: "center", minHeight: 160 }}>
        <span style={{ fontSize: 26 }}>🔮</span>
        <b className="small">Live preview</b>
        <span className="tiny muted">Train some models once and you'll see them re-ranked here as you type.</span>
      </div>
    );
  }
  const task = result.task;
  const builtin = boardRows(result, compareMetric);
  const builtinRank: Record<string, number> = {};
  builtin.filter((r) => !r.baseline).forEach((r, i) => { builtinRank[r.key] = i; });
  const rows = Object.values(result.models).map((m) => {
    const v = draft ? evalCustom(draft, m, task) : { value: null as number | null, why: "Fix the formula to see a value." };
    return { key: m.key, label: m.label, baseline: !!m.baseline, ...v };
  });
  const lower = draft?.better === "lower";
  rows.sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : lower ? a.value - b.value : b.value - a.value));
  const real = rows.filter((r) => !r.baseline);
  const mine = real.find((r) => r.value !== null);
  const theirs = builtin.find((r) => !r.baseline && r.score !== null);
  const sameOrder = real.every((r, i) => builtinRank[r.key] === i);
  const note = rows.find((r) => r.note)?.note;
  const base = rows.find((r) => r.baseline);
  const beatBase = base?.value !== null && base?.value !== undefined ? real.filter((r) => r.value !== null && (lower ? r.value < base.value! : r.value > base.value!)).length : null;

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="eyebrow">Live preview · latest run</span>
        <span className="tiny faint">{lower ? "lower is better" : "higher is better"}</span>
      </div>
        <motion.div key={`${mine?.key}-${theirs?.key}-${sameOrder}-${!!draft}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy}
          className="inset small" style={{ padding: "9px 12px", lineHeight: 1.5, opacity: stale ? 0.55 : 1,
            background: mine && theirs && mine.key !== theirs.key ? "color-mix(in srgb, var(--accent) 10%, transparent)" : undefined,
            borderColor: mine && theirs && mine.key !== theirs.key ? "color-mix(in srgb, var(--accent) 40%, transparent)" : undefined }}>
          {!draft || !mine ? <span className="muted">Your score can't rank these models yet.</span>
            : !theirs ? <>Your score picks <b>{mine.label}</b>.</>
            : mine.key !== theirs.key ? <>✨ Your score would pick <b>{mine.label}</b> instead of <b>{theirs.label}</b> <span className="muted">(the pick by {metricLabel(compareMetric)}).</span></>
            : sameOrder ? <>Same winner and same order as {metricLabel(compareMetric)}: <b>{mine.label}</b> <span className="muted">— on this run the two agree.</span></>
            : <>Same winner as {metricLabel(compareMetric)} (<b>{mine.label}</b>), <span className="muted">but the rest of the order changes.</span></>}
        </motion.div>
      <div className="col" style={{ gap: 4, opacity: stale ? 0.55 : 1, transition: "opacity .2s" }}>
        {rows.map((r) => {
          const ri = real.indexOf(r);
          const was = builtinRank[r.key];
          const moved = !r.baseline && r.value !== null && was !== undefined ? was - ri : 0;
          return (
            <motion.div key={r.key} layout transition={spring.gentle} className="row"
              style={{ gap: 8, padding: "6px 10px", borderRadius: 10, border: r.baseline ? "1px dashed var(--text-3)" : "1px solid var(--hairline)", background: ri === 0 && r.value !== null ? "var(--accent-soft)" : r.baseline ? "transparent" : "var(--fill)" }}>
              <span style={{ width: 22, textAlign: "center", fontSize: ri >= 0 && ri < 3 && r.value !== null ? 16 : 12, fontWeight: 700, color: "var(--text-3)" }}>
                {r.baseline ? "🎯" : r.value === null ? "–" : MEDAL[ri] ?? ri + 1}
              </span>
              <span className="small truncate grow" style={{ fontWeight: r.baseline ? 500 : 600, color: r.baseline ? "var(--text-2)" : "var(--text)" }} title={r.label}>{r.baseline ? "Baseline" : r.label}</span>
              {moved !== 0 && (
                <Tooltip content={`${moved > 0 ? "Up" : "Down"} ${Math.abs(moved)} place${Math.abs(moved) === 1 ? "" : "s"} compared with ranking by ${metricLabel(compareMetric)}`} width={200}>
                  <motion.span key={`${r.key}-${moved}`} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={spring.pop} className="tiny num"
                    style={{ fontWeight: 700, color: moved > 0 ? "var(--success)" : "var(--danger)" }}>{moved > 0 ? "▲" : "▼"}{Math.abs(moved)}</motion.span>
                </Tooltip>
              )}
              {r.value === null ? (
                <Tooltip content={r.why ?? "No value"} width={220}><b className="num muted" style={{ cursor: "help", minWidth: 58, textAlign: "right" }}>—</b></Tooltip>
              ) : (
                <b className="num" style={{ minWidth: 58, textAlign: "right", fontSize: 13 }}>{fmtCustom(r.value)}</b>
              )}
            </motion.div>
          );
        })}
      </div>
      <span className="tiny faint" style={{ lineHeight: 1.45 }}>
        {beatBase !== null && real.length > 0 && <>{beatBase} of {real.length} beat the baseline on your score. </>}
        {theirs && <>By {metricLabel(compareMetric)} today: {theirs.label} ({fmtMetric(compareMetric, theirs.score)}). </>}
        {note && <>Costs {note}.</>}
      </span>
    </div>
  );
}
