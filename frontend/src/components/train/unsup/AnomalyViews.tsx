import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import { ramp } from "../../../lib/colors";
import { fmt, pct } from "../../../lib/format";
import type { AnomalyResult } from "../../../lib/types";
import { extent, linear, useSize } from "../../charts";
import { InfoTip, Segmented, Slider } from "../../glass";
import { MapCanvas, MapLegend } from "./mapKit";

const RED = "#FF375F";

/** Precision / recall / flagged share if the threshold were at `t` (estimated from the histogram bins). */
function atThreshold(a: AnomalyResult, t: number) {
  const { edges, counts } = a.hist;
  let flagged = 0, tp = 0, total = 0, pos = 0;
  counts.forEach((c, i) => {
    const mid = (edges[i] + edges[i + 1]) / 2;
    const tr = a.hist_true?.[i] ?? 0;
    total += c;
    pos += tr;
    if (mid >= t) { flagged += c; tp += tr; }
  });
  return { flagged, tp, total, pos, share: flagged / (total || 1), precision: flagged ? tp / flagged : 0, recall: pos ? tp / pos : 0 };
}

/** Score histogram with the threshold line; with truth the real anomalies are stacked in red, and you can drag your own threshold. */
export function AnomalyScores({ data, metrics, height = 240 }: { data: AnomalyResult; metrics: Record<string, number>; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const { edges, counts } = data.hist;
  const [t, setT] = useState(data.threshold);
  const truth = !!data.hist_true;
  const pos = data.positive_label ?? "anomaly";
  const m = { l: 10, r: 10, t: 22, b: 22 };
  const n = counts.length;
  const sx = linear(edges[0], edges[n], m.l, width - m.r);
  const max = Math.max(1, ...counts);
  // square-root height so the rare anomalies on the right stay visible next to the big normal hump
  const sy = (c: number) => (Math.sqrt(c) / Math.sqrt(max)) * (height - m.t - m.b);
  const mine = atThreshold(data, t);
  const model = atThreshold(data, data.threshold);
  const moved = Math.abs(t - data.threshold) > (edges[n] - edges[0]) / 400;

  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        Every row gets an <b style={{ color: "var(--text)" }}>unusualness score</b> — further right = stranger. Rows past the dashed threshold are flagged.
        {truth ? <> The <b style={{ color: RED }}>red</b> part of each bar are the real {pos} rows you hid: a good detector pushes them all to the right.</> : null}
      </p>
      <div ref={ref} className="inset" style={{ width: "100%", height, padding: 0, position: "relative", overflow: "hidden" }}>
        {width > 0 && (
          <svg width={width} height={height}>
            <rect x={sx(t)} y={0} width={Math.max(0, width - m.r - sx(t))} height={height - m.b} fill={RED} opacity={0.07} />
            {counts.map((c, i) => {
              const x0 = sx(edges[i]) + 1, w = Math.max(1, sx(edges[i + 1]) - sx(edges[i]) - 2);
              const tr = data.hist_true?.[i] ?? 0;
              const hAll = sy(c), hTrue = c ? hAll * (tr / c) : 0;
              const base = height - m.b;
              return (
                <g key={i}>
                  <motion.rect x={x0} width={w} rx={2} fill="#5E5CE6" opacity={0.55}
                    initial={{ y: base, height: 0 }} animate={{ y: base - hAll, height: hAll }} transition={{ ...spring.gentle, delay: i * 0.012 }} />
                  {tr > 0 && (
                    <motion.rect x={x0} width={w} rx={2} fill={RED}
                      initial={{ y: base, height: 0 }} animate={{ y: base - hTrue, height: hTrue }} transition={{ ...spring.gentle, delay: 0.3 + i * 0.012 }} />
                  )}
                </g>
              );
            })}
            {moved && <line x1={sx(data.threshold)} x2={sx(data.threshold)} y1={m.t - 6} y2={height - m.b} stroke="var(--text-3)" strokeDasharray="2 3" strokeWidth={1.5} />}
            <motion.g animate={{ x: sx(t) }} initial={false} transition={spring.snappy}>
              <line x1={0} x2={0} y1={m.t - 8} y2={height - m.b} stroke={RED} strokeWidth={2} strokeDasharray="6 4" />
              <text x={-6} y={m.t - 10 + 8} textAnchor="end" fontSize={10.5} fontWeight={650} fill="var(--text-2)">normal</text>
              <text x={6} y={m.t - 10 + 8} fontSize={10.5} fontWeight={650} fill={RED}>flagged ⚑</text>
            </motion.g>
            <line x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} stroke="var(--hairline)" />
            <text x={m.l} y={height - 6} fontSize={10} fill="var(--text-3)">{fmt(edges[0], 3)} · more normal</text>
            <text x={width - m.r} y={height - 6} textAnchor="end" fontSize={10} fill="var(--text-3)">more unusual · {fmt(edges[n], 3)}</text>
          </svg>
        )}
      </div>
      <div className="row wrap small" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#5E5CE6", opacity: 0.6 }} />all rows</span>
        {truth && <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: RED }} />real {pos} (hidden truth)</span>}
        <span className="faint tiny">bar height uses a square-root scale so the rare rows stay visible</span>
      </div>

      <div className="inset col" style={{ padding: "12px 14px", gap: 10 }}>
        <Slider label={<span className="row" style={{ gap: 6 }}>Move the threshold <InfoTip text="Detectors give scores, not verdicts — someone has to choose where 'unusual' starts. Lower the line to catch more anomalies (but raise more false alarms); raise it for fewer, surer flags." /></span>}
          value={t} min={edges[0]} max={edges[n]} step={(edges[n] - edges[0]) / 200} onChange={setT} format={(v) => fmt(v, 3)} />
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <Stat label="Rows flagged" value={pct(mine.share, 1)} sub={`${mine.flagged.toLocaleString()} of ${mine.total.toLocaleString()}`} />
          {truth && <Stat label="Caught (recall)" value={pct(mine.recall, 0)} sub={`${mine.tp} of ${mine.pos} real ${pos}`} tone={mine.recall >= 0.8 ? "good" : mine.recall < 0.5 ? "bad" : undefined} />}
          {truth && <Stat label="Real among flags (precision)" value={pct(mine.precision, 0)} sub={`${mine.flagged - mine.tp} false alarm${mine.flagged - mine.tp === 1 ? "" : "s"}`} tone={mine.precision >= 0.7 ? "good" : mine.precision < 0.3 ? "bad" : undefined} />}
          {metrics.roc_auc !== undefined && <Stat label="Ranking quality (ROC-AUC)" value={metrics.roc_auc.toFixed(3)} sub="doesn't depend on the line" tone={metrics.roc_auc >= 0.9 ? "good" : metrics.roc_auc < 0.7 ? "bad" : undefined} />}
        </div>
        {moved && (
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="tiny muted">The model's own threshold (grey line) flags {pct(model.share, 1)}{truth ? ` and catches ${pct(model.recall, 0)} of the real ${pos}` : ""}.</span>
            <button className="btn sm ghost" onClick={() => setT(data.threshold)}>↺ Back to the model's line</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="col" style={{ gap: 1 }}>
      <span className="tiny faint">{label}</span>
      <b className="num" style={{ fontSize: 20, letterSpacing: "-0.02em", color: tone === "good" ? "var(--success)" : tone === "bad" ? "var(--danger)" : "var(--text)" }}>{value}</b>
      {sub && <span className="tiny muted num">{sub}</span>}
    </div>
  );
}

/** The rows on a 2-D map: size and colour = score, flagged rows ringed, and the score landscape as a heat background. */
export function AnomalyMap({ data, height = 380 }: { data: AnomalyResult; height?: number }) {
  const truth = data.points[0]?.truth !== undefined;
  const pos = data.positive_label ?? "anomaly";
  const [by, setBy] = useState<"score" | "truth">("score");
  const [lo, hi] = useMemo(() => extent(data.points.map((p) => p.score)), [data.points]);
  const points = useMemo(() => {
    const pts = data.points.map((p) => {
      const t = (p.score - lo) / (hi - lo || 1);
      const color = by === "truth" ? (p.truth === pos ? RED : "#8e8e93") : ramp(t);
      return { x: p.x, y: p.y, r: 1.8 + 4.6 * t * t, color, ring: p.flag ? RED : undefined, opacity: by === "truth" ? (p.truth === pos ? 0.95 : 0.4) : 0.4 + 0.55 * t, s: p.score };
    });
    return pts.sort((a, b) => a.s - b.s); // draw the most unusual on top
  }, [data.points, by, lo, hi, pos]);
  const nFlag = data.points.filter((p) => p.flag).length;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row between wrap" style={{ gap: 10 }}>
        <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 560, margin: 0 }}>
          Rows on a flat map (PCA). Bigger, pinker dots are more unusual; <b style={{ color: RED }}>ringed</b> ones are flagged.
          {data.surface ? " The glow behind them is the detector's score landscape — anywhere hot would count as strange." : ""}
        </p>
        {truth && <Segmented size="sm" value={by} onChange={setBy} options={[{ value: "score", label: "🌡️ Score" }, { value: "truth", label: "🙈 Hidden truth" }]} />}
      </div>
      <MapCanvas points={points} surface={data.surface ?? undefined} height={height} caption={`${nFlag} of ${data.points.length} sample rows flagged`} />
      <MapLegend items={[
        ...(by === "truth" ? [{ color: RED, label: `real ${pos}` }, { color: "#8e8e93", label: "normal" }] : [{ color: ramp(0.05), label: "typical" }, { color: ramp(0.95), label: "unusual" }]),
        { color: RED, label: "flagged", ring: true },
      ]} />
    </div>
  );
}

/** The most unusual rows with their raw values, score bars and (with truth) whether they really were anomalies. */
export function TopAnomalies({ data }: { data: AnomalyResult }) {
  const top = data.top;
  if (!top?.rows.length) return <p className="small muted">No rows to show.</p>;
  const pos = data.positive_label;
  const hi = Math.max(...top.rows.map((r) => r.score));
  const lo = Math.min(data.hist.edges[0], data.threshold);
  const hits = pos ? top.rows.filter((r) => r.truth === pos).length : null;
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="small muted" style={{ lineHeight: 1.55, margin: 0 }}>
        The {top.rows.length} rows the detector finds strangest, with their original values. Ask yourself: <i>would a human expert agree these look odd?</i>
        {hits !== null ? <> <b style={{ color: "var(--text)" }}>{hits} of {top.rows.length}</b> really were “{pos}”.</> : null}
      </p>
      <div className="inset scroll" style={{ overflow: "auto", maxHeight: 460, padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ minWidth: 130 }}>Score</th>
              {pos && <th>Truth</th>}
              {top.columns.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {top.rows.map((r, i) => {
              const w = (r.score - lo) / (hi - lo || 1);
              const flagged = r.score >= data.threshold;
              return (
                <motion.tr key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: Math.min(i, 15) * 0.025 }}>
                  <td className="faint num">{i + 1}</td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ width: 70, height: 8, borderRadius: 4, background: "var(--fill)", overflow: "hidden" }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(4, w * 100)}%` }} transition={{ ...spring.gentle, delay: 0.1 + Math.min(i, 15) * 0.025 }}
                          style={{ height: "100%", borderRadius: 4, background: flagged ? `linear-gradient(90deg, #BF5AF2, ${RED})` : "#5E5CE6" }} />
                      </div>
                      <span className="num small">{fmt(r.score, 3)}</span>
                    </div>
                  </td>
                  {pos && (
                    <td>{r.truth === pos ? <span className="badge danger">⚠ {r.truth}</span> : <span className="badge">{r.truth ?? "—"}</span>}</td>
                  )}
                  {r.values.map((v, j) => <td key={j} className="num mono" style={{ fontSize: 12 }}>{v === null || v === undefined ? "—" : typeof v === "number" ? fmt(v, 4) : String(v)}</td>)}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
