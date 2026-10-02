import { motion } from "framer-motion";
import { useState } from "react";
import { extent, linear, niceTicks, tickFmt, useSize } from "./util";

export interface Series { name: string; color: string; points: { x: number; y: number | null | undefined }[]; dashed?: boolean; width?: number }

/** Multi-series line chart with axes; new points extend the line smoothly. */
export function LineChart({ series, height = 220, xLabel, yLabel, yDomain, marker, area, showLegend = true, diagonal }: {
  series: Series[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  yDomain?: [number, number];
  /** vertical marker line at x */
  marker?: { x: number; label?: string };
  area?: boolean;
  showLegend?: boolean;
  diagonal?: boolean;
}) {
  const [drawn, setDrawn] = useState(false);
  const [ref, { width }] = useSize<HTMLDivElement>();
  const m = { l: 44, r: 12, t: 10, b: xLabel ? 34 : 22 };
  const all = series.flatMap((s) => s.points.filter((p) => p.y !== null && p.y !== undefined && isFinite(p.y as number)));
  const dx = extent(all.map((p) => p.x));
  let dy = yDomain ?? extent(all.map((p) => p.y as number));
  if (!yDomain) {
    const pad = (dy[1] - dy[0]) * 0.08;
    dy = [dy[0] - pad, dy[1] + pad];
  }
  const sx = linear(dx[0], dx[1], m.l, width - m.r);
  const sy = linear(dy[0], dy[1], height - m.b, m.t);
  const path = (pts: Series["points"]) => {
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (p.y === null || p.y === undefined || !isFinite(p.y)) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const yt = niceTicks(dy[0], dy[1], 4);
  const xt = niceTicks(dx[0], dx[1], 5);
  return (
    <div style={{ width: "100%" }}>
      <div ref={ref} style={{ width: "100%", height }}>
        {width > 0 && (
          <svg width={width} height={height}>
            {yt.map((t) => (
              <g key={`y${t}`}>
                <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
                <text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>
              </g>
            ))}
            {xt.map((t) => (
              <text key={`x${t}`} x={sx(t)} y={height - m.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>
            ))}
            {xLabel && <text x={(m.l + width - m.r) / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--text-2)">{xLabel}</text>}
            {yLabel && <text transform={`translate(11 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--text-2)">{yLabel}</text>}
            {diagonal && <line x1={sx(dx[0])} y1={sy(dy[0])} x2={sx(dx[1])} y2={sy(dy[1])} stroke="var(--text-3)" strokeDasharray="4 4" />}
            {marker && (
              <g>
                <line x1={sx(marker.x)} x2={sx(marker.x)} y1={m.t} y2={height - m.b} stroke="var(--success)" strokeDasharray="3 3" />
                {marker.label && <text x={sx(marker.x) + 4} y={m.t + 10} fontSize={10} fill="var(--success)">{marker.label}</text>}
              </g>
            )}
            {series.map((s) => {
              const d = path(s.points);
              if (!d) return null;
              return (
                <g key={s.name}>
                  {area && (
                    <path d={`${d}L${sx(s.points[s.points.length - 1].x)},${height - m.b}L${sx(s.points[0].x)},${height - m.b}Z`} fill={s.color} opacity={0.1} />
                  )}
                  {drawn || s.dashed ? (
                    // after the first draw-in, a plain path: framer's pathLength would otherwise freeze the length at mount
                    // (lines that keep growing get clipped) and override the dash pattern
                    <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray={s.dashed ? "5 4" : undefined} />
                  ) : (
                    <motion.path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }}
                      onAnimationComplete={() => setDrawn(true)} />
                  )}
                </g>
              );
            })}
            {series.map((s) => {
              const last = [...s.points].reverse().find((p) => p.y !== null && p.y !== undefined && isFinite(p.y as number));
              return last ? <circle key={`d${s.name}`} cx={sx(last.x)} cy={sy(last.y as number)} r={3.5} fill={s.color} stroke="white" strokeWidth={1.5} /> : null;
            })}
          </svg>
        )}
      </div>
      {showLegend && series.length > 1 && (
        <div className="row wrap small" style={{ gap: 14, marginTop: 6, paddingLeft: m.l }}>
          {series.map((s) => (
            <span key={s.name} className="row" style={{ gap: 6 }}>
              <svg width={18} height={6}><line x1={0} x2={18} y1={3} y2={3} stroke={s.color} strokeWidth={2.4} strokeDasharray={s.dashed ? "4 3" : undefined} /></svg>
              <span className="muted">{s.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 32, color = "var(--accent)" }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const [lo, hi] = extent(values);
  const sx = linear(0, values.length - 1, 2, width - 2);
  const sy = linear(lo, hi, height - 3, 3);
  const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
