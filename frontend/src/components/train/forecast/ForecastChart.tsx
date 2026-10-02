import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import type { TsBandPoint, TsPoint } from "../../../lib/types";
import { extent, linear, niceTicks, tickFmt, useSize } from "../../charts";
import { fmtT, fmtV, tNum, tickT } from "./fcKit";

export const FC_COLORS = {
  history: "#0A84FF",
  actual: "var(--text)",
  forecast: "#BF5AF2",
  oneStep: "#FF9F0A",
  mark: "#FF9F0A",
};

type OneStep = TsPoint & { actual?: number };

interface P { x: number; y: number }

/**
 * The forecast chart: recent history, what really happened, the forecast with its ~80% band, optional one-step-ahead dots,
 * a "forecast starts" line and a hover crosshair. Paths morph when values change (same length) and redraw when the length
 * changes. `scattered` = random split: one-step guesses sit between history points, drawn as dots with error sticks.
 */
export function ForecastChart({ history, actual = [], forecast, oneStep = [], showOneStep = false, scattered = false, unit, valueName = "value",
  height = 300, startLabel = "forecast starts", marks = [], markLabel, ghost }: {
  history: TsPoint[];
  actual?: TsPoint[];
  forecast: TsBandPoint[];
  oneStep?: OneStep[];
  showOneStep?: boolean;
  scattered?: boolean;
  unit?: string;
  valueName?: string;
  height?: number;
  startLabel?: string;
  /** time points to highlight with a soft column (e.g. promotion days) */
  marks?: (string | number)[];
  markLabel?: string;
  /** a previous forecast drawn faintly underneath (e.g. before a what-if change) */
  ghost?: TsBandPoint[] | null;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 48, r: 14, t: 16, b: 26 };

  const data = useMemo(() => {
    const h = history.map((p) => ({ x: tNum(p.t), y: p.y, t: p.t }));
    const a = actual.map((p) => ({ x: tNum(p.t), y: p.y, t: p.t }));
    const f = forecast.map((p) => ({ x: tNum(p.t), y: p.y, lo: p.lo, hi: p.hi, t: p.t }));
    const o = oneStep.map((p) => ({ x: tNum(p.t), y: p.y, actual: p.actual, t: p.t }));
    const g = (ghost ?? []).map((p) => ({ x: tNum(p.t), y: p.y }));
    const xs = [...h, ...a, ...f].map((p) => p.x);
    const ys = [...h.map((p) => p.y), ...a.map((p) => p.y), ...f.flatMap((p) => [p.lo, p.hi]), ...g.map((p) => p.y),
      ...(showOneStep || scattered ? o.map((p) => p.y) : [])];
    // every time point a crosshair can snap to, with whatever each series has there
    const at = new Map<number, { t: string | number; h?: number; a?: number; f?: { y: number; lo: number; hi: number }; o?: OneStep }>();
    const slot = (x: number, t: string | number) => { let s = at.get(x); if (!s) { s = { t }; at.set(x, s); } return s; };
    h.forEach((p) => { slot(p.x, p.t).h = p.y; });
    a.forEach((p) => { slot(p.x, p.t).a = p.y; });
    f.forEach((p) => { slot(p.x, p.t).f = { y: p.y, lo: p.lo, hi: p.hi }; });
    if (showOneStep || scattered) o.forEach((p) => { slot(p.x, p.t).o = { t: p.t, y: p.y, actual: p.actual }; });
    const keys = [...at.keys()].sort((x, y) => x - y);
    return { h, a, f, o, g, dx: extent(xs), dy: extent(ys), at, keys };
  }, [history, actual, forecast, oneStep, ghost, showOneStep, scattered]);

  const pad = (data.dy[1] - data.dy[0]) * 0.08;
  const dy: [number, number] = [Math.max(data.dy[0] >= 0 ? 0 : -Infinity, data.dy[0] - pad), data.dy[1] + pad];
  const sx = linear(data.dx[0], data.dx[1], m.l, Math.max(m.l + 10, width - m.r));
  const sy = linear(dy[0], dy[1], height - m.b, m.t);
  const line = (pts: P[]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
  // the forecast (and its band) start from the last known value so there's no gap
  const anchor = data.a.length && !scattered ? null : data.h[data.h.length - 1];
  const joinF = anchor && data.f.length && data.f[0].x > anchor.x ? [{ x: anchor.x, y: anchor.y, lo: anchor.y, hi: anchor.y }, ...data.f] : data.f;
  const bandD = joinF.length
    ? `${joinF.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.hi).toFixed(1)}`).join("")}${[...joinF].reverse().map((p) => `L${sx(p.x).toFixed(1)},${sy(p.lo).toFixed(1)}`).join("")}Z`
    : "";
  const histEnd = data.h.length ? data.h[data.h.length - 1].x : data.dx[0];
  const startX = scattered ? (data.f[0]?.x ?? histEnd) : (data.a[0]?.x ?? data.f[0]?.x ?? histEnd);
  const step = data.keys.length > 1 ? (data.keys[data.keys.length - 1] - data.keys[0]) / (data.keys.length - 1) : 1;
  const yt = niceTicks(dy[0], dy[1], 4);
  const nTicks = width < 420 ? 3 : 5;
  const xt: number[] = width > 0 ? Array.from({ length: nTicks }, (_, i) => data.dx[0] + (i / (nTicks - 1)) * (data.dx[1] - data.dx[0])) : [];
  const shape = `${data.h.length}-${data.a.length}-${data.f.length}-${Math.round(width)}`;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const x = data.dx[0] + ((e.clientX - r.left) / Math.max(1, r.width)) * (data.dx[1] - data.dx[0]);
    let lo = 0, hi = data.keys.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (data.keys[mid] < x) lo = mid; else hi = mid; }
    setHover(Math.abs(data.keys[lo] - x) <= Math.abs(data.keys[hi] - x) ? data.keys[lo] : data.keys[hi]);
  };
  const hv = hover !== null ? data.at.get(hover) : undefined;
  const markSet = useMemo(() => marks.map(tNum), [marks]);

  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative" }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
          {yt.map((t) => (
            <g key={`y${t}`}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>
            </g>
          ))}
          {xt.map((t, i) => (
            <text key={`x${i}`} x={sx(t)} y={height - 8} textAnchor={i === 0 ? "start" : i === xt.length - 1 ? "end" : "middle"} fontSize={10} fill="var(--text-3)">{tickT(t, unit)}</text>
          ))}
          {/* highlighted columns (promotion days…) */}
          {markSet.map((x) => (
            <motion.rect key={`m${x}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              x={sx(x) - Math.max(1.5, (sx(data.dx[0] + step) - sx(data.dx[0])) / 2)} width={Math.max(3, sx(data.dx[0] + step) - sx(data.dx[0]))}
              y={m.t} height={height - m.b - m.t} fill={FC_COLORS.mark} opacity={0.12} />
          ))}
          {/* the future side of the chart */}
          <rect x={sx(startX)} y={m.t} width={Math.max(0, width - m.r - sx(startX))} height={height - m.b - m.t} fill="var(--fill)" opacity={0.55} />
          <line x1={sx(startX)} x2={sx(startX)} y1={m.t - 6} y2={height - m.b} stroke="var(--text-3)" strokeDasharray="3 4" />
          <text x={sx(startX) + 5} y={m.t - 4} fontSize={10.5} fontWeight={600} fill="var(--text-2)">{startLabel} →</text>

          {data.g.length > 0 && <path d={line(data.g)} fill="none" stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="4 4" />}
          {bandD && (
            <motion.path key={`band-${shape}`} initial={{ opacity: 0 }} animate={{ opacity: 0.2, d: bandD }} transition={{ duration: 0.5, ease: "easeOut" }} d={bandD}
              fill={FC_COLORS.forecast} />
          )}
          {data.h.length > 1 && (
            <motion.path key={`h-${shape}`} d={line(data.h)} fill="none" stroke={FC_COLORS.history} strokeWidth={scattered ? 1.3 : 1.9} opacity={scattered ? 0.55 : 1}
              strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1, d: line(data.h) }} transition={{ duration: 0.8, ease: "easeOut" }} />
          )}
          {data.a.length > 1 && (
            <motion.path key={`a-${shape}`} d={line(data.a)} fill="none" stroke={FC_COLORS.actual} strokeWidth={2} strokeLinejoin="round" opacity={0.85}
              initial={{ pathLength: 0 }} animate={{ pathLength: 1, d: line(data.a) }} transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }} />
          )}
          {joinF.length > 1 && (
            <motion.path key={`f-${shape}`} d={line(joinF)} fill="none" stroke={FC_COLORS.forecast} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1, d: line(joinF) }} transition={{ pathLength: { duration: 0.9, ease: "easeOut", delay: 0.35 }, d: { duration: 0.5, ease: "easeInOut" } }} />
          )}
          {/* one-step-ahead guesses */}
          <AnimatePresence>
            {(showOneStep || scattered) && data.o.map((p, i) => (
              <motion.g key={`o${p.x}`} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25, delay: Math.min(0.6, i * (scattered ? 0.002 : 0.015)) }} style={{ transformOrigin: `${sx(p.x)}px ${sy(p.y)}px` }}>
                {scattered && p.actual !== undefined && <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.actual)} y2={sy(p.y)} stroke={FC_COLORS.oneStep} strokeWidth={1} opacity={0.7} />}
                <circle cx={sx(p.x)} cy={sy(p.y)} r={scattered ? 2.2 : 3} fill={FC_COLORS.oneStep} stroke="var(--glass-strong)" strokeWidth={scattered ? 0.6 : 1} />
              </motion.g>
            ))}
          </AnimatePresence>

          {/* crosshair */}
          {hover !== null && hv && (
            <g pointerEvents="none">
              <line x1={sx(hover)} x2={sx(hover)} y1={m.t} y2={height - m.b} stroke="var(--text-2)" strokeWidth={1} />
              {hv.h !== undefined && <circle cx={sx(hover)} cy={sy(hv.h)} r={3.5} fill={FC_COLORS.history} stroke="white" strokeWidth={1.4} />}
              {hv.a !== undefined && <circle cx={sx(hover)} cy={sy(hv.a)} r={3.5} fill="var(--text)" stroke="white" strokeWidth={1.4} />}
              {hv.f && <circle cx={sx(hover)} cy={sy(hv.f.y)} r={4} fill={FC_COLORS.forecast} stroke="white" strokeWidth={1.4} />}
              {hv.o && <circle cx={sx(hover)} cy={sy(hv.o.y)} r={3.5} fill={FC_COLORS.oneStep} stroke="white" strokeWidth={1.4} />}
            </g>
          )}
          <rect x={m.l} y={m.t} width={Math.max(0, width - m.l - m.r)} height={height - m.t - m.b} fill="transparent" onMouseMove={onMove} style={{ cursor: "crosshair" }} />
        </svg>
      )}
      <AnimatePresence>
        {hover !== null && hv && width > 0 && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            className="glass strong" style={{ position: "absolute", top: 4, left: Math.min(Math.max(0, sx(hover) + (sx(hover) > width * 0.6 ? -196 : 14)), Math.max(0, width - 186)), width: 182,
              padding: "8px 10px", borderRadius: 12, pointerEvents: "none", zIndex: 3, boxShadow: "0 8px 24px rgba(0,0,0,.14)" }}>
            <div className="tiny" style={{ fontWeight: 650, marginBottom: 4 }}>{fmtT(hv.t, unit, true)}{markSet.includes(hover) && markLabel ? <span className="faint"> · {markLabel}</span> : null}</div>
            {hv.h !== undefined && <TipRow color={FC_COLORS.history} label="Real" value={fmtV(hv.h)} />}
            {hv.a !== undefined && <TipRow color="var(--text)" label="Really happened" value={fmtV(hv.a)} />}
            {hv.f && <TipRow color={FC_COLORS.forecast} label="Forecast" value={fmtV(hv.f.y)} sub={`80% band ${fmtV(hv.f.lo)} – ${fmtV(hv.f.hi)}`} />}
            {hv.o && <TipRow color={FC_COLORS.oneStep} label="One step ahead" value={fmtV(hv.o.y)} sub={hv.o.actual !== undefined ? `real ${fmtV(hv.o.actual)} · off by ${fmtV(Math.abs(hv.o.y - hv.o.actual))}` : hv.a !== undefined ? `off by ${fmtV(Math.abs(hv.o.y - hv.a))}` : undefined} />}
            {hv.f && hv.a !== undefined && <div className="tiny faint" style={{ marginTop: 3 }}>forecast off by {fmtV(Math.abs(hv.f.y - hv.a))} {valueName}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TipRow({ color, label, value, sub }: { color: string; label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="col" style={{ gap: 0, marginTop: 2 }}>
      <div className="row between tiny" style={{ gap: 8 }}>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />{label}</span>
        <b className="num">{value}</b>
      </div>
      {sub && <span className="faint" style={{ fontSize: 10.5, marginLeft: 13 }}>{sub}</span>}
    </div>
  );
}

/** Legend chips under the chart. */
export function ForecastLegend({ items }: { items: { color: string; label: ReactNode; band?: boolean; dot?: boolean; dashed?: boolean }[] }) {
  return (
    <div className="row wrap tiny muted" style={{ gap: 14 }}>
      {items.map((it, i) => (
        <span key={i} className="row" style={{ gap: 6 }}>
          {it.dot ? <span style={{ width: 8, height: 8, borderRadius: 4, background: it.color }} />
            : it.band ? <span style={{ width: 18, height: 10, borderRadius: 3, background: it.color, opacity: 0.25 }} />
              : <span style={{ width: 18, height: 0, borderTop: `${it.dashed ? "2px dashed" : "2.5px solid"} ${it.color}`, borderRadius: 2 }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}
