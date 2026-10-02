import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useProject } from "../../lib/store";
import type { LeaderRow, Project, RunResult } from "../../lib/types";
import { LineChart } from "../charts";
import { PALETTE } from "../../lib/colors";
import { Spinner } from "../glass";
import { isCustomKey } from "../metrics/custom";
import { better, boardRows, fmtMetric, lowerBetter, metricLabel as baseMetricLabel, metricUsable, useRankMetric } from "../train/util";

/** Ranking metrics of recommenders (fallback labels until the shared table has them). */
const REC_LABELS: Record<string, string> = {
  ndcg_at_10: "NDCG@10", recall_at_10: "Recall@10", precision_at_10: "Precision@10", hit_rate: "Hit rate", coverage: "Coverage", novelty: "Novelty",
};
const metricLabel = (m: string) => REC_LABELS[m] ?? baseMetricLabel(m);

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

/* Past runs' full results, fetched once per session when the chosen metric isn't the one their history was saved with. */
const resultCache = new Map<string, RunResult | null>();
const inflight = new Map<string, Promise<RunResult | null>>();
function fetchResult(jobId: string): Promise<RunResult | null> {
  if (resultCache.has(jobId)) return Promise.resolve(resultCache.get(jobId)!);
  let p = inflight.get(jobId);
  if (!p) {
    p = api.result(jobId).then((r) => r, () => null).then((r) => { resultCache.set(jobId, r); inflight.delete(jobId); return r; });
    inflight.set(jobId, p);
  }
  return p;
}

/** Results for the given runs (null = unavailable, undefined = still loading). */
function useRunResults(jobIds: string[], enabled: boolean): Record<string, RunResult | null | undefined> {
  const current = useProject((s) => s.result);
  if (current) resultCache.set(current.job_id, current);
  const [, bump] = useState(0);
  const key = jobIds.join(",");
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      for (const id of jobIds) {
        if (resultCache.has(id)) continue;
        await fetchResult(id);
        if (alive) bump((n) => n + 1);
      }
    })();
    return () => { alive = false; };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return Object.fromEntries(jobIds.map((id) => [id, resultCache.has(id) ? resultCache.get(id)! : undefined]));
}

type RunRow = Pick<LeaderRow, "key" | "label" | "model_id"> & { score: number | null; baseline?: boolean };

/** Best test score per training run, as a chart and a compact table — ranked by the project's chosen metric. */
export function ProgressOverRuns({ project, baselineModel, baselineLabel = "🎯 Baseline (always guessing)" }: {
  project: Project;
  /** a regular model that doubles as the reference line (recommenders: "popularity") */
  baselineModel?: string;
  baselineLabel?: string;
}) {
  const latest0 = useProject((s) => s.result);
  const chosen = useRankMetric(latest0);
  const history = (project.history || []).filter((h) => h.leaderboard?.length);
  const savedMetric = history[history.length - 1]?.leaderboard[0]?.metric;
  // the history only stores scores in the run's default metric; other metrics need each run's full results
  const metric = chosen || savedMetric || "";
  const needs = history.filter((h) => h.leaderboard[0]?.metric !== metric).map((h) => h.job_id);
  const fetched = useRunResults(needs, needs.length > 0);
  const loading = needs.some((id) => fetched[id] === undefined);
  const unavailable = needs.filter((id) => fetched[id] === null).length;

  // the 'always guess' baseline row (and a regular model doubling as the reference) is never a run's best model
  const runs = history.map((h) => {
    let lb: RunRow[] = h.leaderboard;
    if (h.leaderboard[0]?.metric !== metric) {
      const res = fetched[h.job_id];
      lb = res && metricUsable(res, metric) ? boardRows(res, metric).map((r) => ({ key: r.key, label: r.label, model_id: r.model_id, score: r.score, baseline: r.baseline })) : h.leaderboard.map((r) => ({ ...r, score: null }));
    }
    const real = lb.filter((r) => !r.baseline && !(baselineModel && r.model_id === baselineModel));
    return { ...h, leaderboard: real.length ? real : lb.filter((r) => !r.baseline), base: lb.find((r) => r.baseline || (!!baselineModel && r.model_id === baselineModel)) };
  }).filter((h) => h.leaderboard.length);
  if (!runs.length) return <p className="small muted">Your training runs will show up here.</p>;
  const lower = lowerBetter(metric);
  const custom = isCustomKey(metric);
  const worst = lower ? Infinity : -Infinity;
  const val = (s: number | null | undefined) => (s === null || s === undefined ? worst : s);
  const bests = runs.map((h) => h.leaderboard.find((r) => r.score !== null && r.score !== undefined) ?? h.leaderboard[0]);
  const hasBase = runs.some((h) => h.base?.score !== null && h.base?.score !== undefined);
  const latest = bests[bests.length - 1];
  const prev = bests.slice(0, -1).map((b) => val(b.score));
  const prevBest = prev.length ? (lower ? Math.min(...prev) : Math.max(...prev)) : null;
  const topIdx = bests.reduce((bi, b, i) => (better(metric, val(b.score), val(bests[bi].score)) ? i : bi), 0);
  const improved = prevBest !== null && Number.isFinite(prevBest) && latest.score !== null && better(metric, latest.score, prevBest);
  return (
    <div className="col" style={{ gap: 14 }}>
      <AnimatePresence>
        {improved && (
          <motion.div initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="row" style={{ gap: 14, padding: "12px 16px", borderRadius: 16, background: "linear-gradient(135deg, color-mix(in srgb, var(--success) 16%, transparent), color-mix(in srgb, var(--accent) 12%, transparent))", border: "1px solid color-mix(in srgb, var(--success) 35%, transparent)" }}>
            <span style={{ position: "relative", fontSize: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34 }}>
              <span style={{ position: "absolute", left: "50%", top: "50%" }}><Burst /></span>
              <motion.span animate={{ rotate: [0, -14, 14, 0], scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.6, repeatDelay: 2 }}>🎉</motion.span>
            </span>
            <span><b>New personal best!</b> <span className="muted">Run #{runs.length} beat your previous best{custom ? ` on ${metricLabel(metric)}` : ""} by {fmtMetric(metric, Math.abs(latest.score! - (prevBest ?? 0)))}{lower ? (custom ? " (lower)" : " less error") : ""} — {latest.label} reached {fmtMetric(metric, latest.score)}.</span></span>
          </motion.div>
        )}
      </AnimatePresence>
      {(loading || unavailable > 0) && (
        <span className="tiny muted row" style={{ gap: 6 }}>
          {loading ? <><Spinner size={11} /> Re-scoring earlier runs by {metricLabel(metric)}…</> : <>{unavailable} earlier run{unavailable === 1 ? " isn't" : "s aren't"} available any more, so {unavailable === 1 ? "it shows" : "they show"} “—”.</>}
        </span>
      )}
      {runs.length > 1 ? (
        <LineChart height={190} xLabel="Training run" yLabel={custom ? metricLabel(metric) : `Best ${metricLabel(metric)}`} area
          showLegend={hasBase}
          series={[
            { name: custom ? "Best model on your score" : "Best test score", color: "#5E5CE6", points: bests.map((b, i) => ({ x: i + 1, y: b.score })), width: 2.6 },
            ...(hasBase ? [{ name: baselineLabel, color: "#8E8E93", points: runs.map((h, i) => ({ x: i + 1, y: h.base?.score })), dashed: true, width: 1.6 }] : []),
          ]} />
      ) : (
        <p className="small muted">Only one run so far — change something (settings, preparation, models) and train again to see whether it helps.</p>
      )}
      <div className="inset scroll" style={{ maxHeight: 220 }}>
        <table className="table">
          <thead><tr><th>Run</th><th>When</th><th>Best model</th><th style={{ textAlign: "right" }}>{custom ? "" : "Test "}{metricLabel(metric)}{lower ? " ↓" : ""}</th></tr></thead>
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
