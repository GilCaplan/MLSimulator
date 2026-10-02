import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { classColor, ramp } from "../../../lib/colors";
import { fmt } from "../../../lib/format";
import type { Point } from "../../../lib/types";
import { extent, linear, useSize } from "../../charts";

/**
 * "Image map": every picture as a dot, placed so that similar-looking pictures sit close together (PCA of tiny greyscale
 * versions). Hover a dot to see its picture.
 */
export function ImageMap({ datasetId, points, classes, continuous, size = 64, height = 320 }: {
  datasetId: string;
  points: Point[];
  classes: string[] | null;
  continuous: boolean;
  size?: number;
  height?: number;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = 16;
  const dx = useMemo(() => extent(points.map((p) => p.x)), [points]);
  const dy = useMemo(() => extent(points.map((p) => p.y)), [points]);
  const vext = useMemo(() => (continuous ? extent(points.map((p) => Number(p.label))) : [0, 1]), [points, continuous]);
  const sx = linear(dx[0], dx[1], pad, Math.max(pad + 1, width - pad));
  const sy = linear(dy[0], dy[1], height - pad, pad);
  const color = (p: Point) => (continuous ? ramp((Number(p.label) - vext[0]) / (vext[1] - vext[0] || 1)) : classColor(p.label as string, classes));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = -1, bd = 22 * 22;
    points.forEach((p, k) => {
      const d = (sx(p.x) - mx) ** 2 + (sy(p.y) - my) ** 2;
      if (d < bd) { bd = d; best = k; }
    });
    setHover(best >= 0 ? best : null);
  };

  // the dots don't change on hover — memoise them so moving the mouse only redraws the highlight
  const dots = useMemo(() => (
    <g className={`mlp-imap${hover !== null ? " dim" : ""}`}>
      <style>{`.mlp-imap circle{animation:mlpImapPop .55s cubic-bezier(.34,1.56,.64,1) both;transform-box:fill-box;transform-origin:center;transition:fill-opacity .2s}.mlp-imap.dim circle{fill-opacity:.32}@keyframes mlpImapPop{from{opacity:0;transform:scale(0)}to{opacity:1;transform:scale(1)}}`}</style>
      {points.map((p, k) => (
        <circle key={p.i ?? k} cx={sx(p.x)} cy={sy(p.y)} r={3} fill={color(p)} fillOpacity={0.85} stroke="var(--bg)" strokeOpacity={0.6} strokeWidth={0.6}
          style={{ animationDelay: `${Math.min(900, (k % 150) * 6)}ms` }} />
      ))}
    </g>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [points, width, height, classes, continuous, hover !== null]);

  const hp = hover !== null ? points[hover] : null;
  const legend = !continuous ? (classes ?? Array.from(new Set(points.map((p) => String(p.label))))).slice(0, 12) : [];
  const tipLeft = hp ? Math.min(Math.max(sx(hp.x) + 14, 0), Math.max(0, width - 108)) : 0;
  const tipTop = hp ? Math.min(Math.max(sy(hp.y) - 60, 0), height - 120) : 0;

  return (
    <div style={{ width: "100%" }}>
      <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
        {width > 0 && (
          <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ overflow: "visible", cursor: hp ? "zoom-in" : "crosshair" }}>
            {dots}
            {hp && (
              <g pointerEvents="none">
                <circle cx={sx(hp.x)} cy={sy(hp.y)} r={7} fill="none" stroke={color(hp)} strokeWidth={2} />
                <circle cx={sx(hp.x)} cy={sy(hp.y)} r={3.6} fill={color(hp)} stroke="var(--bg)" strokeWidth={1.2} />
              </g>
            )}
          </svg>
        )}
        <AnimatePresence>
          {hp && hp.i !== undefined && (
            <motion.div key="tip" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1, left: tipLeft, top: tipTop }} exit={{ opacity: 0, scale: 0.85 }}
              transition={{ ...spring.snappy, opacity: { duration: 0.12 } }}
              className="glass strong col" style={{ position: "absolute", padding: 6, gap: 4, borderRadius: 14, pointerEvents: "none", width: 96, alignItems: "center", zIndex: 3 }}>
              <img src={api.imageUrl(datasetId, hp.i, size)} alt="" width={84} height={84} style={{ borderRadius: 9, imageRendering: size <= 48 ? "pixelated" : "auto", display: "block", background: "var(--fill)" }} />
              <span className="tiny row" style={{ gap: 5, fontWeight: 650 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: color(hp) }} />
                {continuous ? fmt(Number(hp.label), 2) : String(hp.label)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {legend.length > 0 && (
        <div className="row wrap small" style={{ gap: 12, marginTop: 8 }}>
          {legend.map((l) => (
            <span key={String(l)} className="row" style={{ gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: classColor(l, classes) }} />
              <span className="muted">{String(l)}</span>
            </span>
          ))}
        </div>
      )}
      {continuous && points.length > 0 && (
        <div className="row small" style={{ gap: 8, marginTop: 8 }}>
          <span className="muted num">{fmt(vext[0], 2)}</span>
          <div style={{ flex: "0 1 160px", height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.33)}, ${ramp(0.66)}, ${ramp(1)})` }} />
          <span className="muted num">{fmt(vext[1], 2)}</span>
        </div>
      )}
    </div>
  );
}
