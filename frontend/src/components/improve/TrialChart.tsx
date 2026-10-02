import { motion } from "framer-motion";
import { extent, linear, niceTicks, useSize } from "../charts";

/** Animated scatter of tuning trials (score vs trial #) with a rising "best so far" staircase. */
export function TrialChart({ trials, n, baseline, height = 240 }: { trials: { i: number; score: number | null }[]; n: number; baseline?: number | null; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const m = { l: 46, r: 14, t: 14, b: 32 };
  const ok = trials.filter((t): t is { i: number; score: number } => t.score !== null && isFinite(t.score));
  let [lo, hi] = extent([...ok.map((t) => t.score), ...(baseline !== null && baseline !== undefined ? [baseline] : [])]);
  const pad = (hi - lo) * 0.12 || 0.01;
  lo -= pad;
  hi += pad;
  const sx = linear(1, Math.max(2, n), m.l, width - m.r);
  const sy = linear(lo, hi, height - m.b, m.t);
  const yt = niceTicks(lo, hi, 4);
  const decimals = yt.length > 1 ? Math.max(0, Math.min(5, -Math.floor(Math.log10(Math.abs(yt[1] - yt[0]) || 1)))) : 3;
  let best = -Infinity;
  const stair: string[] = [];
  const bestIdx = new Set<number>();
  for (const t of ok) {
    if (t.score > best) {
      best = t.score;
      bestIdx.add(t.i);
      stair.push(`${stair.length ? "L" : "M"}${sx(t.i).toFixed(1)},${sy(best).toFixed(1)}`);
    } else stair.push(`L${sx(t.i).toFixed(1)},${sy(best).toFixed(1)}`);
  }
  const stairD = ok.length ? stair.join("") + `L${sx(Math.max(ok[ok.length - 1].i, 1)).toFixed(1)},${sy(best).toFixed(1)}` : "";
  const champ = ok.length ? ok.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          {yt.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{t.toFixed(decimals)}</text>
            </g>
          ))}
          {niceTicks(1, Math.max(2, n), Math.min(8, n)).filter((t) => Number.isInteger(t)).map((t) => (
            <text key={`x${t}`} x={sx(t)} y={height - m.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{t}</text>
          ))}
          <text x={(m.l + width - m.r) / 2} y={height - 3} textAnchor="middle" fontSize={11} fill="var(--text-2)">Trial #</text>
          {baseline !== null && baseline !== undefined && (
            <g>
              <line x1={m.l} x2={width - m.r} y1={sy(baseline)} y2={sy(baseline)} stroke="var(--text-3)" strokeDasharray="4 4" />
              <text x={m.l + 6} y={sy(baseline) + 13} fontSize={10} fill="var(--text-3)">your current settings</text>
            </g>
          )}
          {stairD && (
            <motion.path d={stairD} fill="none" stroke="url(#tune-grad)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"
              initial={false} animate={{ d: stairD }} transition={{ duration: 0.4 }} />
          )}
          <defs>
            <linearGradient id="tune-grad" gradientUnits="userSpaceOnUse" x1={m.l} x2={width - m.r} y1={0} y2={0}>
              <stop offset="0%" stopColor="#0A84FF" />
              <stop offset="100%" stopColor="#BF5AF2" />
            </linearGradient>
          </defs>
          {trials.map((t) => {
            if (t.score === null || !isFinite(t.score)) {
              return <motion.text key={t.i} x={sx(t.i)} y={height - m.b - 4} textAnchor="middle" fontSize={11} fill="var(--danger)" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>✕</motion.text>;
            }
            const isBest = champ?.i === t.i;
            return (
              <g key={t.i}>
                {isBest && (
                  <motion.circle cx={sx(t.i)} cy={sy(t.score)} fill="none" stroke="#FFD60A" strokeWidth={2}
                    initial={{ r: 4, opacity: 0.9 }} animate={{ r: [6, 14], opacity: [0.9, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} />
                )}
                <motion.circle cx={sx(t.i)} cy={sy(t.score)} fill={isBest ? "#FFD60A" : bestIdx.has(t.i) ? "#BF5AF2" : "#0A84FF"} fillOpacity={isBest ? 1 : 0.7} stroke="white" strokeWidth={1.2}
                  initial={{ r: 0, cy: sy(t.score) - 18 }} animate={{ r: isBest ? 6 : 4.2, cy: sy(t.score) }} transition={{ type: "spring", stiffness: 420, damping: 18 }} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
