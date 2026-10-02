import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import { extent, linear, niceTicks, tickFmt, useSize } from "../../charts";
import { fmtVal, timeFmt } from "./tsData";

export interface TimeLine { key: string; color: string; points: { x: number; y: number }[]; width?: number; dashed?: boolean; opacity?: number }
export interface TimeBand { x0: number; x1: number; color: string; label?: string }
export interface TimeDot { x: number; y: number; color: string }

/**
 * Time-aware line chart (x = ms timestamps or step numbers): shaded bands for parts of the timeline,
 * optional scattered dots, a hover read-out, and lines that draw themselves in.
 */
export function TimeChart({ lines, bands = [], dots = [], isDate, height = 220, valueName, timeLabel }: {
  lines: TimeLine[];
  bands?: TimeBand[];
  dots?: TimeDot[];
  isDate: boolean;
  height?: number;
  valueName?: string;
  /** formats the hovered x (defaults to the axis formatter) */
  timeLabel?: (x: number) => string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 46, r: 12, t: 12, b: 24 };
  const allX = lines.flatMap((l) => l.points.map((p) => p.x)).concat(dots.map((d) => d.x));
  const allY = lines.flatMap((l) => l.points.map((p) => p.y)).concat(dots.map((d) => d.y));
  const dx = extent(allX);
  let dy = extent(allY);
  const pad = (dy[1] - dy[0]) * 0.08;
  dy = [dy[0] - pad, dy[1] + pad];
  const sx = linear(dx[0], dx[1], m.l, Math.max(m.l + 10, width - m.r));
  const sy = linear(dy[0], dy[1], height - m.b, m.t);
  const fmtX = timeFmt(dx[1] - dx[0], isDate);
  const yt = niceTicks(dy[0], dy[1], 4);
  const xt = useMemo(() => {
    const n = Math.max(2, Math.min(7, Math.floor(width / 110)));
    return Array.from({ length: n }, (_, i) => dx[0] + ((dx[1] - dx[0]) * (i + 0.5)) / n);
  }, [dx[0], dx[1], width]); // eslint-disable-line react-hooks/exhaustive-deps

  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < m.l || px > width - m.r) return setHover(null);
    setHover(dx[0] + ((px - m.l) / Math.max(1, width - m.r - m.l)) * (dx[1] - dx[0]));
  };
  const nearest = hover === null ? [] : lines.map((l) => {
    let best: { x: number; y: number } | null = null;
    for (const p of l.points) if (!best || Math.abs(p.x - hover) < Math.abs(best.x - hover)) best = p;
    return best ? { key: l.key, color: l.color, p: best } : null;
  }).filter((v): v is { key: string; color: string; p: { x: number; y: number } } => !!v);
  const hx = nearest[0]?.p.x;

  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
      {width > 0 && (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: "block" }}>
          {bands.map((b, i) => (
            <g key={`b${i}`}>
              <motion.rect y={m.t} height={height - m.t - m.b} fill={b.color} rx={4}
                initial={{ opacity: 0, x: sx(b.x0), width: 0 }} animate={{ opacity: 0.13, x: sx(b.x0), width: Math.max(2, sx(b.x1) - sx(b.x0)) }} transition={spring.gentle} />
              {b.label && <text x={sx(b.x0) + 4} y={m.t + 11} fontSize={10} fontWeight={650} fill={b.color}>{b.label}</text>}
            </g>
          ))}
          {yt.map((t) => (
            <g key={`y${t}`}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>
            </g>
          ))}
          {xt.map((t) => (
            <text key={`x${t}`} x={sx(t)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--text-3)">{fmtX(t)}</text>
          ))}
          {lines.map((l) => (
            <motion.path key={l.key} d={path(l.points)} fill="none" stroke={l.color} strokeWidth={l.width ?? 1.6} strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={l.dashed ? "4 3" : undefined} opacity={l.opacity ?? 1}
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
          ))}
          {dots.map((d, i) => (
            <motion.circle key={`d${i}`} cx={sx(d.x)} cy={sy(d.y)} r={2.6} fill={d.color} stroke="var(--glass-strong)" strokeWidth={0.8}
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.pop, delay: Math.min(0.8, i * 0.004) }}
              style={{ originX: `${sx(d.x)}px`, originY: `${sy(d.y)}px` }} />
          ))}
          {hx !== undefined && (
            <g pointerEvents="none">
              <line x1={sx(hx)} x2={sx(hx)} y1={m.t} y2={height - m.b} stroke="var(--text-3)" strokeDasharray="2 3" />
              {nearest.map((n) => <circle key={n.key} cx={sx(n.p.x)} cy={sy(n.p.y)} r={4} fill={n.color} stroke="white" strokeWidth={1.5} />)}
            </g>
          )}
        </svg>
      )}
      {hx !== undefined && nearest.length > 0 && (
        <div className="glass strong tiny" style={{ position: "absolute", top: 4, left: Math.min(Math.max(sx(hx) + 10, 0), Math.max(0, width - 170)), padding: "6px 10px", borderRadius: 10, pointerEvents: "none", minWidth: 120, zIndex: 2 }}>
          <b>{(timeLabel ?? fmtX)(hx)}</b>
          {nearest.slice(0, 4).map((n) => (
            <div key={n.key} className="row between" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: n.color }} />{lines.length > 1 ? n.key : valueName ?? "value"}</span>
              <b className="num">{fmtVal(n.p.y)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Average level at each position of the season (Mon…Sun, 00h…23h, Jan…Dec), as bars above / below the average. */
export function SeasonBars({ labels, values, height = 150 }: { labels: string[]; values: number[]; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const n = values.length;
  const max = Math.max(1e-9, ...values.map((v) => Math.abs(v)));
  const hi = values.indexOf(Math.max(...values));
  const lo = values.indexOf(Math.min(...values));
  const mid = (height - 18) / 2;
  const bw = width / Math.max(1, n);
  const every = n > 12 ? Math.ceil(n / 12) : 1;
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block" }}>
          <line x1={0} x2={width} y1={mid} y2={mid} stroke="var(--hairline)" />
          <text x={width - 2} y={mid - 4} textAnchor="end" fontSize={9.5} fill="var(--text-3)">average</text>
          {values.map((v, i) => {
            const h = (Math.abs(v) / max) * (mid - 6);
            const up = v >= 0;
            const color = i === hi ? "var(--success)" : i === lo ? "var(--warning)" : up ? "var(--accent)" : "var(--fill-2)";
            return (
              <g key={i}>
                <title>{`${labels[i]}: ${v >= 0 ? "+" : ""}${v.toFixed(2)} (scaled)`}</title>
                <motion.rect x={i * bw + bw * 0.16} width={bw * 0.68} rx={Math.min(5, bw * 0.2)} fill={color}
                  initial={{ y: mid, height: 0 }} animate={{ y: up ? mid - h : mid, height: Math.max(1, h) }}
                  transition={{ ...spring.gentle, delay: i * (n > 12 ? 0.015 : 0.05) }} />
                {i % every === 0 && <text x={i * bw + bw / 2} y={height - 3} textAnchor="middle" fontSize={10} fill={i === hi ? "var(--success)" : "var(--text-3)"} fontWeight={i === hi ? 700 : 400}>{labels[i]}</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Autocorrelation per lag: how much the series looks like itself k steps earlier. Season lags glow orange. */
export function AcfBars({ acf, season, height = 150, onHover }: { acf: { lag: number; r: number }[]; season: number; height?: number; onHover?: (lag: number | null) => void }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hov, setHov] = useState<number | null>(null);
  const n = acf.length;
  const m = { l: 26, b: 16, t: 6 };
  const plotH = height - m.b - m.t;
  const sy = linear(-1, 1, m.t + plotH, m.t);
  const bw = (width - m.l) / Math.max(1, n);
  const every = n > 30 ? Math.ceil(n / 15) : n > 15 ? 2 : 1;
  const isSeason = (lag: number) => season > 1 && lag % season === 0;
  const set = (v: number | null) => { setHov(v); onHover?.(v); };
  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block" }} onMouseLeave={() => set(null)}>
          {[-1, -0.5, 0, 0.5, 1].map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? "var(--text-3)" : "var(--hairline)"} strokeDasharray={t === 0 ? undefined : "2 3"} />
              <text x={m.l - 4} y={sy(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-3)">{t}</text>
            </g>
          ))}
          {acf.map((a, i) => {
            const s = isSeason(a.lag);
            const y0 = sy(0), y1 = sy(a.r);
            const color = s ? "var(--warning)" : a.r >= 0 ? "var(--accent)" : "#FF375F";
            return (
              <g key={a.lag} onMouseEnter={() => set(a.lag)}>
                <rect x={m.l + i * bw} y={m.t} width={bw} height={plotH} fill="transparent" />
                <motion.rect x={m.l + i * bw + bw * 0.18} width={Math.max(1.5, bw * 0.64)} rx={Math.min(3, bw * 0.2)} fill={color}
                  opacity={hov === null || hov === a.lag ? 1 : 0.45}
                  initial={{ y: y0, height: 0 }} animate={{ y: Math.min(y0, y1), height: Math.max(1, Math.abs(y1 - y0)) }}
                  transition={{ ...spring.gentle, delay: i * 0.012 }} />
                {(i % every === 0 || s) && (
                  <text x={m.l + i * bw + bw / 2} y={height - 3} textAnchor="middle" fontSize={9.5} fill={s ? "var(--warning)" : "var(--text-3)"} fontWeight={s ? 700 : 400}>{a.lag}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ built-in set previews */

/** A deterministic little sketch of what each built-in series looks like (drawn before it's generated). */
export function previewValues(name: string, n = 72): number[] {
  const noise = (i: number) => { const s = Math.sin(i * 12.9898 + name.length * 7.1) * 43758.5453; return s - Math.floor(s) - 0.5; };
  return Array.from({ length: n }, (_, i) => {
    switch (name) {
      case "store_sales": return (1 + i / n * 0.3) * [0.82, 0.78, 0.84, 0.93, 1.12, 1.38, 1.13][i % 7] + 0.05 * noise(i);
      case "energy": { const h = (i * 2) % 24; return 430 + 170 * Math.exp(-((h - 8) ** 2) / 6) + 240 * Math.exp(-((h - 19) ** 2) / 8) - 90 * Math.exp(-((h - 3) ** 2) / 6) + 15 * noise(i); }
      case "airline": { const m = i % 12; return Math.exp(0.018 * i) * (1 + 0.16 * Math.sin((2 * Math.PI * (m - 3)) / 12) + (m === 6 || m === 7 ? 0.12 : 0)); }
      case "web_traffic": return (i > n * 0.7 ? 1.55 : 1) * [1.12, 1.15, 1.13, 1.08, 0.98, 0.74, 0.8][i % 7] * (i === 23 || i === 41 ? 2.4 : 1) + 0.04 * noise(i);
      default: return Math.sin(i / 4) + 0.3 * noise(i);
    }
  });
}

/** Animated mini line for a set tile. */
export function MiniLine({ values, color, height = 56 }: { values: number[]; color: string; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [lo, hi] = extent(values);
  const sx = linear(0, values.length - 1, 2, Math.max(4, width - 2));
  const sy = linear(lo, hi, height - 4, 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
          <path d={`${d}L${sx(values.length - 1)},${height}L${sx(0)},${height}Z`} fill={color} opacity={0.1} />
          <motion.path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: "easeInOut" }} />
        </svg>
      )}
    </div>
  );
}
