import { motion } from "framer-motion";
import type { Histogram as H } from "../../lib/types";
import { tickFmt, useSize } from "./util";

/** Animated histogram: bars spring to new heights whenever the data changes. */
export function Histogram({ data, color = "var(--accent)", height = 90, showAxis = true, overlay }: { data: H; color?: string; height?: number; showAxis?: boolean; overlay?: H }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const n = data?.counts?.length || 0;
  const max = Math.max(1, ...(data?.counts || [0]), ...(overlay?.counts || [0]));
  const axisH = showAxis ? 16 : 0;
  const h = height - axisH;
  const bw = n ? width / n : 0;
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height}>
          {data.counts.map((c, i) => (
            <motion.rect
              key={i}
              x={i * bw + 1}
              width={Math.max(1, bw - 2)}
              rx={Math.min(3, bw / 4)}
              fill={color}
              initial={{ height: 0, y: h }}
              animate={{ height: (c / max) * (h - 2), y: h - (c / max) * (h - 2) }}
              transition={{ type: "tween", duration: 0.5, ease: [0.32, 0.72, 0, 1], delay: i * 0.008 }}
              opacity={0.85}
            />
          ))}
          {overlay && overlay.counts.map((c, i) => (
            <motion.rect key={`o${i}`} x={i * bw + bw * 0.3} width={Math.max(1, bw * 0.4)} rx={2} fill="var(--accent-2)" opacity={0.75}
              animate={{ height: (c / max) * (h - 2), y: h - (c / max) * (h - 2) }} transition={{ type: "tween", duration: 0.5, ease: [0.32, 0.72, 0, 1] }} />
          ))}
          {showAxis && (
            <g fontSize={10} fill="var(--text-3)">
              <text x={0} y={height - 3}>{tickFmt(data.edges[0])}</text>
              <text x={width} y={height - 3} textAnchor="end">{tickFmt(data.edges[data.edges.length - 1])}</text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

/** Tiny inline histogram for tables. */
export function MiniHist({ data, width = 80, height = 22, color = "var(--accent)" }: { data?: H; width?: number; height?: number; color?: string }) {
  if (!data?.counts?.length) return null;
  const max = Math.max(1, ...data.counts);
  const bw = width / data.counts.length;
  return (
    <svg width={width} height={height}>
      {data.counts.map((c, i) => (
        <rect key={i} x={i * bw} width={Math.max(1, bw - 1)} y={height - (c / max) * height} height={(c / max) * height} fill={color} opacity={0.75} rx={1} />
      ))}
    </svg>
  );
}
