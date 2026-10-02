import { motion } from "framer-motion";
import { useId, useMemo } from "react";
import { spring } from "../../design/motion";
import { linear, useSize } from "../charts";

/** Inset that lines the curve up with the slider thumb's travel (thumb is 22px wide). */
const THUMB = 11;

/**
 * Tiny "what-if" line: how the model's answer changes as one input sweeps its range,
 * with a dot riding at the current value. Same horizontal scale as the slider above it.
 */
export function WhatIfCurve({ xs, ys, value, domain, color, height = 38, format }: {
  xs: number[];
  ys: number[];
  value: number;
  domain: [number, number];
  color: string;
  height?: number;
  format: (v: number) => string;
}) {
  const gid = useId().replace(/:/g, "");
  const [ref, { width }] = useSize<HTMLDivElement>();
  const geo = useMemo(() => {
    if (!width || xs.length < 2) return null;
    const sx = linear(xs[0], xs[xs.length - 1], THUMB, width - THUMB);
    const sy = linear(domain[0], domain[1], height - 3, 3);
    const line = xs.map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join("");
    const area = `${line}L${sx(xs[xs.length - 1]).toFixed(1)},${height}L${sx(xs[0]).toFixed(1)},${height}Z`;
    // interpolate the curve at the current value
    const v = Math.min(xs[xs.length - 1], Math.max(xs[0], value));
    let k = xs.findIndex((x) => x >= v);
    if (k <= 0) k = 1;
    const f = (v - xs[k - 1]) / (xs[k] - xs[k - 1] || 1);
    const yv = ys[k - 1] + f * (ys[k] - ys[k - 1]);
    return { line, area, cx: sx(v), cy: sy(yv), yv };
  }, [width, xs, ys, value, domain, height]);

  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
      {geo && (
        <svg width={width} height={height} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={`wf${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <line x1={THUMB} x2={width - THUMB} y1={height - 0.5} y2={height - 0.5} stroke="var(--hairline)" />
          <motion.path animate={{ d: geo.area }} initial={false} transition={spring.gentle} fill={`url(#wf${gid})`} />
          <motion.path animate={{ d: geo.line }} initial={false} transition={spring.gentle} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <motion.line animate={{ x1: geo.cx, x2: geo.cx }} initial={false} transition={spring.snappy} y1={0} y2={height} stroke={color} strokeOpacity={0.25} strokeDasharray="2 3" />
          <motion.circle animate={{ cx: geo.cx, cy: geo.cy }} initial={false} transition={spring.snappy} r={4.5} fill={color} stroke="white" strokeWidth={1.8}>
            <title>{format(geo.yv)}</title>
          </motion.circle>
        </svg>
      )}
    </div>
  );
}
