import { AnimatePresence, motion } from "framer-motion";
import { timeAgo } from "../../lib/format";
import type { Project } from "../../lib/types";
import { LineChart } from "../charts";
import { PALETTE } from "../../lib/colors";
import { fmtMetric, metricLabel } from "../train/util";

/** A little celebratory particle burst. */
export function Burst({ count = 18 }: { count?: number }) {
  return (
    <span aria-hidden style={{ position: "relative", display: "inline-block", width: 0, height: 0 }}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        const d = 34 + (i % 3) * 14;
        return (
          <motion.span key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: 0, scale: 0.4, rotate: 180 }}
            transition={{ duration: 1.2, ease: "easeOut", repeat: Infinity, repeatDelay: 2.4, delay: (i % 4) * 0.03 }}
            style={{ position: "absolute", width: i % 2 ? 6 : 8, height: i % 2 ? 6 : 4, borderRadius: i % 2 ? 3 : 1, background: PALETTE[i % PALETTE.length], left: -3, top: -3 }} />
        );
      })}
    </span>
  );
}

/** Best test score per training run, as a chart and a compact table. */
export function ProgressOverRuns({ project }: { project: Project }) {
  // the 'always guess' baseline row is a reference, never a run's best model
  const runs = (project.history || []).map((h) => ({ ...h, leaderboard: (h.leaderboard || []).filter((r) => !r.baseline), base: (h.leaderboard || []).find((r) => r.baseline) }))
    .filter((h) => h.leaderboard.length);
  if (!runs.length) return <p className="small muted">Your training runs will show up here.</p>;
  const metric = runs[runs.length - 1].leaderboard[0].metric;
  const bests = runs.map((h) => h.leaderboard.find((r) => r.score !== null && r.score !== undefined) ?? h.leaderboard[0]);
  const hasBase = runs.some((h) => h.base?.score !== null && h.base?.score !== undefined);
  const latest = bests[bests.length - 1];
  const prevBest = bests.length > 1 ? Math.max(...bests.slice(0, -1).map((b) => b.score ?? -Infinity)) : null;
  const topIdx = bests.reduce((bi, b, i) => ((b.score ?? -Infinity) > (bests[bi].score ?? -Infinity) ? i : bi), 0);
  const improved = prevBest !== null && latest.score !== null && latest.score > prevBest;
  return (
    <div className="col" style={{ gap: 14 }}>
      <AnimatePresence>
        {improved && (
          <motion.div initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="row" style={{ gap: 14, padding: "12px 16px", borderRadius: 16, background: "linear-gradient(135deg, rgba(48,209,88,.16), rgba(10,132,255,.12))", border: "1px solid rgba(48,209,88,.35)" }}>
            <span style={{ position: "relative", fontSize: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34 }}>
              <span style={{ position: "absolute", left: "50%", top: "50%" }}><Burst /></span>
              <motion.span animate={{ rotate: [0, -14, 14, 0], scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.6, repeatDelay: 2 }}>🎉</motion.span>
            </span>
            <span><b>New personal best!</b> <span className="muted">Run #{runs.length} beat your previous best by {fmtMetric(metric, latest.score - (prevBest ?? 0))} — {latest.label} reached {fmtMetric(metric, latest.score)}.</span></span>
          </motion.div>
        )}
      </AnimatePresence>
      {runs.length > 1 ? (
        <LineChart height={190} xLabel="Training run" yLabel={`Best ${metricLabel(metric)}`} area
          showLegend={hasBase}
          series={[
            { name: "Best test score", color: "#5E5CE6", points: bests.map((b, i) => ({ x: i + 1, y: b.score })), width: 2.6 },
            ...(hasBase ? [{ name: "🎯 Baseline (always guessing)", color: "#8E8E93", points: runs.map((h, i) => ({ x: i + 1, y: h.base?.score })), dashed: true, width: 1.6 }] : []),
          ]} />
      ) : (
        <p className="small muted">Only one run so far — change something (settings, preparation, models) and train again to see whether it helps.</p>
      )}
      <div className="inset scroll" style={{ maxHeight: 220 }}>
        <table className="table">
          <thead><tr><th>Run</th><th>When</th><th>Best model</th><th style={{ textAlign: "right" }}>Test {metricLabel(metric)}</th></tr></thead>
          <tbody>
            {[...bests].map((b, i) => ({ b, i })).reverse().map(({ b, i }) => {
              const isTop = i === topIdx;
              return (
                <motion.tr key={runs[i].job_id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(10, runs.length - 1 - i) * 0.04 }}>
                  <td className="num"><b>#{i + 1}</b></td>
                  <td className="muted">{timeAgo(runs[i].at)}</td>
                  <td>{b.label}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 650 }}>{isTop && "⭐ "}{fmtMetric(metric, b.score)}</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
