/* Test-accuracy curves for the transfer lab: a fixed 0–100% × 1…epochs frame so lines grow into place as epochs
 * arrive. (Hand-rolled because the shared LineChart measures its pathLength once and clips lines that keep growing.) */
import { motion } from "framer-motion";
import { linear, useSize } from "../charts";

export interface AccSeries { name: string; color: string; dashed?: boolean; points: { epoch: number; test_acc: number }[] }

export function AccuracyChart({ series, epochs, height = 240 }: { series: AccSeries[]; epochs: number; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const m = { l: 40, r: 44, t: 10, b: 30 };
  const sx = linear(1, Math.max(2, epochs), m.l, width - m.r);
  const sy = linear(0, 1, height - m.b, m.t);
  const xt = [1, ...[0.25, 0.5, 0.75].map((f) => Math.round(1 + f * (epochs - 1))), epochs].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Test accuracy per epoch for each approach">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{Math.round(t * 100)}%</text>
            </g>
          ))}
          {xt.map((t) => <text key={t} x={sx(t)} y={height - m.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{t}</text>)}
          <text x={(m.l + width - m.r) / 2} y={height - 2} textAnchor="middle" fontSize={11} fill="var(--text-2)">epoch</text>
          {series.map((s) => {
            if (!s.points.length) return null;
            const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.epoch).toFixed(1)},${sy(p.test_acc).toFixed(1)}`).join("");
            const last = s.points[s.points.length - 1];
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
                <motion.circle r={4} fill={s.color} stroke="var(--glass-strong)" strokeWidth={1.5} initial={false}
                  animate={{ cx: sx(last.epoch), cy: sy(last.test_acc) }} transition={{ type: "spring", stiffness: 300, damping: 30 }} />
                <motion.text x={sx(last.epoch) + 7} fontSize={11} fontWeight={600} fill={s.color} initial={false}
                  animate={{ y: sy(last.test_acc) + 4 }}>{Math.round(last.test_acc * 100)}%</motion.text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
