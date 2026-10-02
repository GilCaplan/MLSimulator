import { useMemo } from "react";
import { classColor, ramp } from "../../lib/colors";
import type { Point } from "../../lib/types";
import { extent, linear, useSize } from "./util";

/**
 * Animated scatter. Points are keyed by `id` (or index), so when the data changes
 * matching points glide to their new place, new points pop in and removed ones vanish.
 * Synthetic points (from SMOTE etc.) get a ring.
 */
export function Scatter({ points, classes, height = 280, radius = 3.2, continuous, domain, showLegend = true }: {
  points: Point[];
  classes?: (string | number)[] | null;
  height?: number;
  radius?: number;
  /** colour by a continuous value (regression) */
  continuous?: boolean;
  /** fix axes (so before/after views share a frame) */
  domain?: { x: [number, number]; y: [number, number] };
  showLegend?: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const pad = 14;
  const dx = domain?.x ?? extent(points.map((p) => p.x));
  const dy = domain?.y ?? extent(points.map((p) => p.y));
  const sx = linear(dx[0], dx[1], pad, width - pad);
  const sy = linear(dy[0], dy[1], height - pad, pad);
  const vext = useMemo(() => (continuous ? extent(points.map((p) => Number(p.label))) : [0, 1]), [points, continuous]);
  const color = (p: Point) => (continuous ? ramp((Number(p.label) - vext[0]) / (vext[1] - vext[0] || 1)) : classColor(p.label as any, classes));
  const legend = !continuous && showLegend ? (classes ?? Array.from(new Set(points.map((p) => String(p.label))))).slice(0, 12) : [];
  return (
    <div style={{ width: "100%" }}>
      <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
        {width > 0 && (
          <svg width={width} height={height} style={{ overflow: "visible" }}>
            <style>{`.mlp-pt{transition:transform .9s cubic-bezier(.32,.72,0,1), opacity .5s}.mlp-pop{animation:mlpPop .6s cubic-bezier(.34,1.56,.64,1) both}@keyframes mlpPop{from{opacity:0;transform:var(--t) scale(0)}to{opacity:1;transform:var(--t) scale(1)}}`}</style>
            {points.map((p, i) => {
              const t = `translate(${sx(p.x)}px, ${sy(p.y)}px)`;
              const c = color(p);
              return (
                <g key={p.id ?? i} className={`mlp-pt ${p.synthetic ? "mlp-pop" : ""}`} style={{ transform: t, ["--t" as any]: t, animationDelay: p.synthetic ? `${(i % 60) * 12}ms` : undefined }}>
                  {p.synthetic && <circle r={radius + 2.6} fill="none" stroke={c} strokeWidth={1.2} opacity={0.7} />}
                  <circle r={radius} fill={c} fillOpacity={p.synthetic ? 0.95 : 0.78} stroke="var(--bg)" strokeOpacity={0.6} strokeWidth={0.6} />
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {legend.length > 0 && (
        <div className="row wrap small" style={{ gap: 12, marginTop: 8 }}>
          {legend.map((l) => (
            <span key={String(l)} className="row" style={{ gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: classColor(l as any, classes) }} />
              <span className="muted">{String(l)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
