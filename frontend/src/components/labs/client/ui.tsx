/* Small UI pieces shared by the client-side labs: motion preference, stat tiles, captions, a lightweight line plot. */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { useUI } from "../../../lib/store";
import { AnimatedNumber } from "../../glass";
import { niceTicks, tickFmt, useSize } from "../../charts";

/** true when the user allows full motion (tweens, springs); otherwise update instantly. */
export const useFullMotion = () => useUI((s) => s.prefs.motion) === "full";

/** Live number tile. */
export function Tile({ label, value, format, color, sub, emphasis }: {
  label: ReactNode;
  value: number;
  format: (v: number) => string;
  color?: string;
  sub?: ReactNode;
  emphasis?: boolean;
}) {
  const full = useFullMotion();
  return (
    <div className="inset" style={{ padding: "10px 14px", minWidth: 0, boxShadow: emphasis ? `0 0 0 2px ${color ?? "var(--accent)"} inset` : "none", transition: "box-shadow .3s" }}>
      <div className="tiny muted" style={{ fontWeight: 560 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: color ?? "var(--text)", lineHeight: 1.3 }}>
        {full ? <AnimatedNumber value={value} format={format} duration={0.35} /> : <span className="num">{format(value)}</span>}
      </div>
      {sub && <div className="tiny faint" style={{ marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

export function Tiles({ children, min = 130 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10 }}>{children}</div>;
}

/** The "what you're seeing" line; cross-fades when `k` changes. */
export function Caption({ k, children }: { k: string; children: ReactNode }) {
  const full = useFullMotion();
  return (
    <div className="row" style={{ gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--accent-soft)", minHeight: 44 }}>
      <span aria-hidden style={{ fontSize: 16, lineHeight: "22px" }}>👀</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={k} initial={full ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} exit={full ? { opacity: 0, y: -6 } : { opacity: 1 }}
          transition={{ duration: full ? 0.22 : 0 }} style={{ fontSize: 13.5, lineHeight: "22px", color: "var(--text)", minWidth: 0 }} aria-live="polite">
          {children}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="row wrap between" style={{ gap: 10, rowGap: 6 }}>
      <div style={{ fontWeight: 650, fontSize: 15 }}>{children}</div>
      {right}
    </div>
  );
}

export interface PlotSeries { key: string; color: string; values: ArrayLike<number>; width?: number; opacity?: number; dashed?: boolean }

/** Minimal multi-series line plot (x = index) with axes. Cheap enough to redraw every animation frame. */
export function LinePlot({ series, height = 200, xMax, yDomain, xLabel, yLabel, zeroLine }: {
  series: PlotSeries[];
  height?: number;
  /** fixed x extent (index units); defaults to the longest series */
  xMax?: number;
  yDomain?: [number, number];
  xLabel?: string;
  yLabel?: string;
  zeroLine?: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const m = { l: 40, r: 10, t: 8, b: xLabel ? 34 : 22 };
  const n = xMax ?? Math.max(1, ...series.map((s) => s.values.length - 1));
  let lo = Infinity, hi = -Infinity;
  if (yDomain) [lo, hi] = yDomain;
  else for (const s of series) for (let i = 0; i < s.values.length; i++) { const v = s.values[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  if (!yDomain) { const pad = (hi - lo) * 0.06; lo -= pad; hi += pad; }
  const sx = (i: number) => m.l + (i / Math.max(1, n)) * (width - m.l - m.r);
  const sy = (v: number) => height - m.b - ((v - lo) / (hi - lo)) * (height - m.t - m.b);
  const path = (vals: ArrayLike<number>) => {
    // thin very long series to ≤ ~2 points per pixel
    const stepI = Math.max(1, Math.floor(vals.length / Math.max(1, width * 1.5)));
    let d = "";
    for (let i = 0; i < vals.length; i += stepI) d += `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(vals[i]).toFixed(1)}`;
    if (vals.length > 1 && (vals.length - 1) % stepI) d += `L${sx(vals.length - 1).toFixed(1)},${sy(vals[vals.length - 1]).toFixed(1)}`;
    return d;
  };
  const yt = niceTicks(lo, hi, 4), xt = niceTicks(0, n, 5);
  return (
    <div ref={ref} style={{ width: "100%", height, minWidth: 0 }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block" }}>
          {yt.map((t) => (
            <g key={`y${t}`}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" strokeDasharray={zeroLine && t === 0 ? undefined : "2 4"} strokeOpacity={zeroLine && t === 0 ? 1 : 0.9} />
              <text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>
            </g>
          ))}
          {xt.map((t) => <text key={`x${t}`} x={sx(t)} y={height - m.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>)}
          {xLabel && <text x={(m.l + width - m.r) / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="var(--text-2)">{xLabel}</text>}
          {yLabel && <text transform={`translate(10 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--text-2)">{yLabel}</text>}
          {series.map((s) => s.values.length > 0 && (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeOpacity={s.opacity ?? 1}
              strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
          ))}
          {series.map((s) => {
            const k = s.values.length - 1;
            return k >= 0 && (s.opacity ?? 1) > 0.5 ? <circle key={`d${s.key}`} cx={sx(k)} cy={sy(s.values[k])} r={3.4} fill={s.color} stroke="var(--glass-strong)" strokeWidth={1.5} /> : null;
          })}
        </svg>
      )}
    </div>
  );
}

/** requestAnimationFrame loop while `active`; `tick(dtSeconds)` runs every frame. */
export function useFrameLoop(active: boolean, tick: (dt: number) => void) {
  const cb = useRef(tick);
  cb.current = tick;
  useEffect(() => {
    if (!active) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      cb.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
