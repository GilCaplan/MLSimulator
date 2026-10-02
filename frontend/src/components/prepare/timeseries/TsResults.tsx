import { motion } from "framer-motion";
import { useState } from "react";
import { fadeUp, stagger } from "../../../design/motion";
import type { PrepareReport, SplitInfo } from "../../../lib/types";
import { SplitBar } from "../../charts";
import { fmtMs, fmtTime, isDateSeries, partColor, tNum } from "../../data/timeseries/tsData";
import { TimeChart, type TimeBand, type TimeDot } from "../../data/timeseries/viz";
import { AnimatedNumber, Glass, InfoTip, Segmented } from "../../glass";

/** What the forecasters will learn from: the timeline split into parts, rows per part, and every clue in plain words. */
export function TsResults({ report }: { report: PrepareReport }) {
  const tl = (report.timeline ?? []).slice(0, 4);
  const [pick, setPick] = useState(tl[0]?.series ?? "");
  const s = tl.find((x) => x.series === pick) ?? tl[0];
  const random = report.split_info?.method === "random";
  const unit = report.unit ?? "step";
  const H = report.horizon ?? 0;
  const tr = report.splits.train, va = report.splits.val, te = report.splits.test;
  const isDate = !!s && isDateSeries(s.points);

  const pts = (s?.points ?? []).map((p) => ({ x: tNum(p.t), y: p.y, part: p.part }));
  const bands: TimeBand[] = [];
  const dots: TimeDot[] = [];
  if (!random && pts.length) {
    for (const part of ["val", "test"] as const) {
      const xs = pts.filter((p) => p.part === part).map((p) => p.x);
      if (xs.length) {
        // start the band halfway from the previous step so neighbouring bands touch
        const i0 = pts.findIndex((p) => p.part === part);
        const x0 = i0 > 0 ? (pts[i0 - 1].x + xs[0]) / 2 : xs[0];
        bands.push({ x0, x1: xs[xs.length - 1], color: partColor(part), label: part === "val" ? "check" : "test" });
      }
    }
  } else {
    for (const p of pts) if (p.part !== "train") dots.push({ x: p.x, y: p.y, color: partColor(p.part) });
  }
  const lines = !random
    ? [
      { key: "train", color: partColor("train"), points: pts.filter((p) => p.part === "train") },
      { key: "validation", color: partColor("val"), points: pts.filter((p, i) => p.part === "val" || (pts[i + 1]?.part === "val" && p.part === "train")) },
      { key: "test", color: partColor("test"), points: pts.filter((p, i) => p.part === "test" || pts[i + 1]?.part === "test") },
    ].filter((l) => l.points.length > 1)
    : [{ key: "series", color: partColor("train"), points: pts, opacity: 0.7, width: 1.2 }];

  const feats = report.features_explained ?? [];
  // forecasting adds test_start to split_info (not in the shared SplitInfo type)
  const testStart = (report.split_info as (SplitInfo & { test_start?: string | null }) | undefined)?.test_start;
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <motion.div variants={fadeUp}>
        <Glass>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Tile icon="📚" label="Training rows" value={tr} />
            <Tile icon="🔎" label="Validation rows" value={va} sub={va ? undefined : "series too short"} />
            <Tile icon="🎯" label="Test rows" value={te} sub={random ? "random steps" : `${H} ${unit}s × ${report.n_series ?? 1} series`} />
            <Tile icon="🧩" label="Clues per row" value={report.n_features} />
            <Tile icon="🔭" label="Horizon" value={H} sub={`${unit}s ahead`} />
          </div>
          <div className="col" style={{ gap: 6, marginTop: 16 }}>
            <span className="small row" style={{ gap: 6, fontWeight: 650 }}>Rows per part <InfoTip text={`The first ${report.lags_needed ?? 0} ${unit}s of each series have no full history of lags yet, so they can't become training rows.`} /></span>
            <SplitBar parts={[{ label: "Train", value: tr, color: partColor("train") }, { label: "Validation", value: va, color: partColor("val") }, { label: "Test", value: te, color: partColor("test") }].filter((p) => p.value > 0)} />
          </div>
        </Glass>
      </motion.div>

      {s && (
        <motion.div variants={fadeUp}>
          <Glass>
            <div className="row between wrap" style={{ gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
              <div className="col" style={{ gap: 2 }}>
                <h3>🗓️ The timeline, split</h3>
                <span className="small muted">
                  {random
                    ? <>Test and validation steps are <b>scattered</b> between training steps — the models see both sides of every test step.</>
                    : <>Training ends, then {va ? <>a <b style={{ color: partColor("val") }}>check</b> stretch and </> : null}the <b style={{ color: partColor("test") }}>test</b> forecast {testStart ? <>from <b>{fmtTime(testStart, report.freq)}</b></> : null} — the future the models never see.</>}
                </span>
              </div>
              {tl.length > 1 && <Segmented size="sm" value={s.series} onChange={setPick} options={tl.map((x) => ({ value: x.series, label: x.series }))} />}
            </div>
            <TimeChart key={`${s.series}-${random}`} lines={lines} bands={bands} dots={dots} isDate={isDate} height={220}
              valueName={s.series === "all" ? "value" : s.series} timeLabel={(x) => (isDate ? fmtMs(x, report.freq) : `step ${Math.round(x)}`)} />
          </Glass>
        </motion.div>
      )}

      {feats.length > 0 && (
        <motion.div variants={fadeUp}>
          <Glass>
            <div className="col" style={{ gap: 2, marginBottom: 10 }}>
              <h3 className="row" style={{ gap: 8 }}>🧩 The clues, in plain words <InfoTip text="Every training row gets these columns. Regression and neural models learn which ones matter; after training you can see their importance." /></h3>
              <span className="small muted">{report.n_features} columns in total{report.forecast_config?.diff ? " · the models predict the change from one step to the next" : ""}{report.forecast_config?.log ? " · on a log scale" : ""}.</span>
            </div>
            <div className="scroll" style={{ maxHeight: 320 }}>
              <table className="table">
                <thead><tr><th>Clue</th><th>What it means</th></tr></thead>
                <tbody>
                  {feats.map((f, i) => (
                    <motion.tr key={f.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(0.6, i * 0.03) }}>
                      <td className="mono small" style={{ whiteSpace: "nowrap" }}>{f.name}</td>
                      <td className="small muted">{f.explain}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Glass>
        </motion.div>
      )}

      {report.warnings.length > 0 && (
        <motion.div variants={fadeUp}>
          <Glass variant="thin">
            <div className="col small" style={{ gap: 6 }}>
              {report.warnings.map((w) => <span key={w} style={{ color: "var(--warning)" }}>⚠️ {w}</span>)}
            </div>
          </Glass>
        </motion.div>
      )}
    </motion.div>
  );
}

function Tile({ icon, label, value, sub }: { icon: string; label: string; value: number; sub?: string }) {
  return (
    <div className="inset col" style={{ padding: "10px 12px", gap: 2 }}>
      <span className="tiny muted">{icon} {label}</span>
      <b className="num" style={{ fontSize: 20 }}><AnimatedNumber value={value} format={(v) => Math.round(v).toLocaleString()} /></b>
      {sub && <span className="tiny faint">{sub}</span>}
    </div>
  );
}
