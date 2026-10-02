import { AnimatePresence, motion } from "framer-motion";
import { extent, linear, niceTicks, tickFmt, useSize } from "../charts";

export interface SweepSeries { name: string; color: string; values: { k: number; v: number | null | undefined }[] }

/** Metric-vs-k chart for the k sweep: lines grow and dots pop in as each k finishes; best and chosen k are marked. */
export function SweepChart({ series, kMin, kMax, best, selected, onSelect, height = 230, yDomain, yLabel, compact }: {
  series: SweepSeries[];
  kMin: number;
  kMax: number;
  /** k with the best score (gold ring) */
  best?: number | null;
  /** k the user is looking at (dashed marker) */
  selected?: number | null;
  onSelect?: (k: number) => void;
  height?: number;
  yDomain?: [number, number];
  yLabel?: string;
  compact?: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const m = { l: 46, r: 14, t: 12, b: compact ? 26 : 34 };
  const vals = series.flatMap((s) => s.values.map((p) => p.v).filter((v): v is number => v !== null && v !== undefined && isFinite(v)));
  let [lo, hi] = yDomain ?? extent(vals);
  if (!yDomain) { const pad = (hi - lo) * 0.12 || 0.05; lo -= pad; hi += pad; }
  const sx = linear(kMin - 0.4, kMax + 0.4, m.l, width - m.r);
  const sy = linear(lo, hi, height - m.b, m.t);
  const yt = niceTicks(lo, hi, compact ? 3 : 4);
  const ks = Array.from({ length: Math.max(0, kMax - kMin + 1) }, (_, i) => kMin + i);
  const step = ks.length > 1 ? sx(kMin + 1) - sx(kMin) : 40;
  const path = (s: SweepSeries) => s.values
    .filter((p) => p.v !== null && p.v !== undefined && isFinite(p.v))
    .map((p, i) => `${i ? "L" : "M"}${sx(p.k).toFixed(1)},${sy(p.v as number).toFixed(1)}`).join("");
  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
      {width > 0 && (
        <svg width={width} height={height} style={{ overflow: "visible" }}>
          {/* clickable columns per k */}
          {onSelect && ks.map((k) => (
            <rect key={`hit${k}`} x={sx(k) - step / 2} y={m.t} width={step} height={height - m.t - m.b} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onSelect(k)} />
          ))}
          <AnimatePresence>
            {best !== null && best !== undefined && (
              <motion.rect key="best" initial={{ opacity: 0, x: sx(best) - step * 0.4 }} animate={{ opacity: 1, x: sx(best) - step * 0.4 }} exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                y={m.t} width={step * 0.8} height={height - m.t - m.b} rx={8} fill="rgba(255,214,10,.16)" pointerEvents="none" />
            )}
          </AnimatePresence>
          {yt.map((t) => (
            <g key={t} pointerEvents="none">
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{tickFmt(t)}</text>
            </g>
          ))}
          {lo < 0 && hi > 0 && <line x1={m.l} x2={width - m.r} y1={sy(0)} y2={sy(0)} stroke="var(--text-3)" strokeDasharray="3 3" pointerEvents="none" />}
          {ks.map((k) => (
            <text key={`x${k}`} x={sx(k)} y={height - m.b + 14} textAnchor="middle" fontSize={10.5} fontWeight={k === best ? 750 : 500}
              fill={k === best ? "var(--text)" : "var(--text-3)"} pointerEvents="none">{k}</text>
          ))}
          {!compact && <text x={(m.l + width - m.r) / 2} y={height - 3} textAnchor="middle" fontSize={11} fill="var(--text-2)" pointerEvents="none">Number of groups (k)</text>}
          {yLabel && <text x={12} y={(m.t + height - m.b) / 2} textAnchor="middle" fontSize={10.5} fill="var(--text-3)" transform={`rotate(-90 12 ${(m.t + height - m.b) / 2})`} pointerEvents="none">{yLabel}</text>}
          {selected !== null && selected !== undefined && (
            <motion.line initial={false} animate={{ x1: sx(selected), x2: sx(selected) }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
              y1={m.t} y2={height - m.b} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 4" pointerEvents="none" />
          )}
          {series.map((s) => (
            <g key={s.name} pointerEvents="none">
              <motion.path d={path(s)} fill="none" stroke={s.color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"
                initial={false} animate={{ d: path(s) }} transition={{ duration: 0.35 }} />
              {s.values.map((p) => (p.v === null || p.v === undefined || !isFinite(p.v) ? null : (
                <g key={p.k}>
                  {p.k === best && (
                    <motion.circle cx={sx(p.k)} cy={sy(p.v)} fill="none" stroke="#FFD60A" strokeWidth={2}
                      initial={{ r: 5, opacity: 0.9 }} animate={{ r: [6, 15], opacity: [0.9, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} />
                  )}
                  <motion.circle cx={sx(p.k)} fill={p.k === best ? "#FFD60A" : s.color} stroke="white" strokeWidth={1.4}
                    initial={{ r: 0, cy: sy(p.v) - 22 }} animate={{ r: p.k === selected || p.k === best ? 6 : 4.4, cy: sy(p.v) }}
                    transition={{ type: "spring", stiffness: 420, damping: 17 }} />
                </g>
              )))}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
