import { motion } from "framer-motion";
import { Fragment, useEffect, useRef, useState } from "react";
import { classColor, colorAt, ramp, withAlpha } from "../../lib/colors";
import type { ModelResult, Surface } from "../../lib/types";
import { Segmented } from "../glass";
import { LineChart } from "./LineChart";
import { extent, linear, niceTicks, tickFmt, useSize } from "./util";

/** Confusion matrix with colour intensity, staggered reveal and count/percentage toggle. */
export function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const [mode, setMode] = useState<"count" | "pct">("count");
  const k = labels.length;
  const rowSums = matrix.map((r) => r.reduce((a, b) => a + b, 0) || 1);
  const max = Math.max(1, ...matrix.flat());
  const cell = Math.max(26, Math.min(64, 340 / k));
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between">
        <span className="small muted">Rows = true class · columns = predicted</span>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "count", label: "Counts" }, { value: "pct", label: "% of row" }]} />
      </div>
      <div style={{ overflow: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `90px repeat(${k}, ${cell}px)`, gap: 3, alignItems: "center" }}>
          <span />
          {labels.map((l) => <span key={`h${l}`} className="tiny muted truncate" style={{ textAlign: "center" }} title={l}>{l}</span>)}
          {matrix.map((row, i) => (
            <Fragment key={i}>
              <span className="tiny muted truncate" style={{ textAlign: "right", paddingRight: 6 }} title={labels[i]}>{labels[i]}</span>
              {row.map((v, j) => {
                const frac = mode === "pct" ? v / rowSums[i] : v / max;
                const diag = i === j;
                const base = diag ? "#30D158" : "#FF453A";
                return (
                  <motion.div key={`${i}-${j}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (i * k + j) * 0.012, type: "spring", stiffness: 300, damping: 22 }}
                    title={`true ${labels[i]} → predicted ${labels[j]}: ${v}`}
                    style={{ height: cell, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: k > 8 ? 10 : 12.5, fontWeight: 650,
                      background: v === 0 ? "var(--fill)" : withAlpha(base, 0.12 + 0.78 * frac), color: frac > 0.55 ? "white" : "var(--text)" }}>
                    {mode === "pct" ? `${Math.round((v / rowSums[i]) * 100)}%` : v}
                  </motion.div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RocChart({ curves, height = 240 }: { curves: NonNullable<ModelResult["roc"]>; height?: number }) {
  return (
    <LineChart
      height={height}
      xLabel="False positive rate"
      yLabel="True positive rate"
      yDomain={[0, 1]}
      diagonal
      area={curves.length === 1}
      series={curves.map((c, i) => ({ name: `${c.label} (AUC ${c.auc?.toFixed(3)})`, color: colorAt(i), points: c.fpr.map((x, j) => ({ x, y: c.tpr[j] })) }))}
    />
  );
}

/** Predicted vs actual for regression, with the perfect-prediction diagonal. */
export function ResidualPlot({ points, height = 260 }: { points: { t: number; p: number }[]; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const m = { l: 48, r: 12, t: 10, b: 34 };
  const d = extent([...points.map((p) => p.t), ...points.map((p) => p.p)]);
  const sx = linear(d[0], d[1], m.l, width - m.r);
  const sy = linear(d[0], d[1], height - m.b, m.t);
  const ticks = niceTicks(d[0], d[1], 4);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(t) + 3} textAnchor="end" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>
              <text x={sx(t)} y={height - m.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>
            </g>
          ))}
          <line x1={sx(d[0])} y1={sy(d[0])} x2={sx(d[1])} y2={sy(d[1])} stroke="var(--success)" strokeDasharray="5 4" strokeWidth={1.5} />
          {points.map((p, i) => {
            const err = Math.abs(p.t - p.p) / (d[1] - d[0] || 1);
            return (
              <motion.circle key={i} r={3} fill={ramp(Math.min(1, err * 4))} fillOpacity={0.7}
                initial={{ cx: sx(p.t), cy: sy(p.t), opacity: 0 }} animate={{ cx: sx(p.t), cy: sy(p.p), opacity: 1 }}
                transition={{ type: "spring", stiffness: 90, damping: 16, delay: (i % 100) * 0.004 }} />
            );
          })}
          <text x={(m.l + width - m.r) / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--text-2)">Actual value</text>
          <text transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--text-2)">Predicted</text>
        </svg>
      )}
    </div>
  );
}

/**
 * Decision surface: a canvas heat-map of the model's predictions over the 2-D projection
 * plane, with the training points on top. Classification colours by predicted class
 * (alpha = confidence); regression uses a colour ramp. 1-feature data shows a fitted curve.
 */
export function DecisionSurface({ surface, classes, height = 300 }: { surface: Surface; classes?: string[] | null; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const isCls = !!classes;

  useEffect(() => {
    if (surface.kind !== "grid" || !canvas.current || !width) return;
    const c = canvas.current;
    const nx = surface.nx!, ny = surface.ny!;
    c.width = nx;
    c.height = ny;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(nx, ny);
    const vals = surface.grid!;
    const [lo, hi] = isCls ? [0, 1] : extent(vals);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const col = isCls ? classColor(classes![vals[idx]], classes) : ramp((vals[idx] - lo) / (hi - lo || 1));
        const rgb = col.startsWith("#")
          ? [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)]
          : col.match(/\d+/g)!.map(Number);
        const conf = isCls && surface.confidence ? surface.confidence[idx] : 1;
        const a = isCls ? 0.18 + 0.5 * Math.max(0, (conf - 1 / classes!.length) / (1 - 1 / classes!.length)) : 0.62;
        const o = ((ny - 1 - j) * nx + i) * 4;
        img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [surface, width, isCls, classes]);

  if (surface.kind === "curve") {
    const pts = surface.points.map((p) => ({ x: p.x, y: Number(p.y) }));
    return (
      <div style={{ position: "relative" }}>
        <LineChart height={height} xLabel="Feature" yLabel="Target" showLegend={false}
          series={[{ name: "Model", color: "#BF5AF2", points: surface.xs!.map((x, i) => ({ x, y: surface.pred![i] })), width: 3 }]} />
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <CurvePoints pts={pts} height={height} xs={surface.xs!} preds={surface.pred!} />
        </div>
      </div>
    );
  }
  const sx = linear(surface.x![0], surface.x![1], 0, width);
  const sy = linear(surface.y![0], surface.y![1], height, 0);
  const [vlo, vhi] = isCls ? [0, 1] : extent(surface.grid ?? []);
  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative", borderRadius: 14, overflow: "hidden", background: "var(--fill)" }}>
      <motion.canvas ref={canvas} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "auto", filter: "blur(0.6px)" }} />
      {width > 0 && (
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          {surface.points.map((p, i) => (
            <motion.circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} initial={{ r: 0 }} animate={{ r: 3 }} transition={{ delay: 0.3 + (i % 200) * 0.002 }}
              fill={isCls ? classColor(p.label as string, classes) : ramp((Number(p.label) - vlo) / (vhi - vlo || 1))} stroke="white" strokeWidth={0.8} />
          ))}
        </svg>
      )}
      {!surface.exact && (
        <span className="tiny" style={{ position: "absolute", right: 8, bottom: 6, color: "var(--text-3)", background: "var(--glass-strong)", padding: "2px 7px", borderRadius: 6 }}>
          2-D projection (PCA) of your features
        </span>
      )}
    </div>
  );
}

function CurvePoints({ pts, height, xs, preds }: { pts: { x: number; y: number }[]; height: number; xs: number[]; preds: number[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const m = { l: 44, r: 12, t: 10, b: 34 };
  const dx = extent([...pts.map((p) => p.x), ...xs]);
  let dy = extent([...pts.map((p) => p.y), ...preds]);
  const pad = (dy[1] - dy[0]) * 0.08;
  dy = [dy[0] - pad, dy[1] + pad];
  const sx = linear(dx[0], dx[1], m.l, width - m.r);
  const sy = linear(dy[0], dy[1], height - m.b, m.t);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && <svg width={width} height={height}>{pts.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill="#0A84FF" opacity={0.5} />)}</svg>}
    </div>
  );
}

/** Correlation heat-map. */
export function Heatmap({ columns, matrix }: { columns: string[]; matrix: number[][] }) {
  const n = columns.length;
  const cell = Math.max(22, Math.min(44, 380 / n));
  return (
    <div style={{ overflow: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `100px repeat(${n}, ${cell}px)`, gap: 2 }}>
        <span />
        {columns.map((c) => <span key={c} className="tiny muted truncate" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", height: 70, justifySelf: "center" }} title={c}>{c}</span>)}
        {matrix.map((row, i) => (
          <Fragment key={i}>
            <span className="tiny muted truncate" style={{ alignSelf: "center", textAlign: "right", paddingRight: 6 }} title={columns[i]}>{columns[i]}</span>
            {row.map((v, j) => (
              <motion.div key={`${i}-${j}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (i + j) * 0.015 }} title={`${columns[i]} × ${columns[j]}: ${v}`}
                style={{ height: cell, borderRadius: 5, background: withAlpha(v >= 0 ? "#0A84FF" : "#FF375F", Math.abs(v) * 0.85 + 0.05), fontSize: 9.5, display: "flex", alignItems: "center", justifyContent: "center", color: Math.abs(v) > 0.6 ? "white" : "var(--text-2)" }}>
                {cell > 30 ? v.toFixed(1) : ""}
              </motion.div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** Semicircle gauge (0..1) for probabilities. */
export function Gauge({ value, label, color = "var(--accent)", size = 180 }: { value: number; label?: string; color?: string; size?: number }) {
  const r = size / 2 - 12;
  const c = Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size / 2 + 18} viewBox={`0 0 ${size} ${size / 2 + 18}`}>
      <path d={`M12 ${size / 2} A${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} fill="none" stroke="var(--fill-2)" strokeWidth={14} strokeLinecap="round" />
      <motion.path d={`M12 ${size / 2} A${r} ${r} 0 0 1 ${size - 12} ${size / 2}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - v) }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
      <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fontSize={26} fontWeight={700} fill="var(--text)">{Math.round(v * 100)}%</text>
      {label && <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize={11} fill="var(--text-2)">{label}</text>}
    </svg>
  );
}
