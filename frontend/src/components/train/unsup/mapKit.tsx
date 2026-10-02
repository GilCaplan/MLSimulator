import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { classColor, colorAt, ramp, withAlpha } from "../../../lib/colors";
import { extent, linear, useSize } from "../../charts";

/* ------------------------------------------------------------------ naming + colours */

/** Friendly 1-based cluster names (DBSCAN's −1 is "noise"). */
export const clusterName = (c: number) => (c < 0 ? "Noise" : `Cluster ${c + 1}`);
export const NOISE = "#8e8e93";
export const clusterColor = (c: number) => (c < 0 ? NOISE : colorAt(c));

/** Stable colour for a hidden-truth label given the sorted list of all labels. */
export const truthColor = (label: string | undefined, labels: string[]) => classColor(label ?? null, labels);

/** Sorted distinct truth labels of some points (undefined when there is no truth column). */
export function truthLabels(points: { truth?: string }[]): string[] | null {
  if (!points.length || points[0].truth === undefined) return null;
  return Array.from(new Set(points.map((p) => String(p.truth)))).sort();
}

/** Parse "#rrggbb" / "rgb(r, g, b)" into numbers (canvas painting). */
export function rgbOf(col: string): [number, number, number] {
  if (col.startsWith("#")) return [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
  const m = col.match(/\d+/g) ?? ["0", "0", "0"];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/* ------------------------------------------------------------------ the map */

export interface MapPoint { x: number; y: number; color: string; r?: number; ring?: string; opacity?: number }
export interface MapCentre { id: number; x: number; y: number; color: string; label?: string }
export interface MapSurface { nx: number; ny: number; x: [number, number]; y: [number, number]; grid: number[] }

/**
 * A 2-D map of rows: dots (colour transitions smoothly when they change group), big ringed centres that glide to new
 * positions, faint trails of where the centres walked, an optional heat background and a pulsing "you are here" dot.
 */
export function MapCanvas({ points, centres, trails, height = 300, domain, surface, pulse, caption, overlay, framed = true }: {
  points: MapPoint[];
  centres?: MapCentre[];
  /** past centre positions per centre id (the k-means walk) */
  trails?: Record<number, [number, number][]>;
  height?: number;
  domain?: { x: [number, number]; y: [number, number] };
  /** heat background (higher = hotter), painted under the points */
  surface?: MapSurface | null;
  pulse?: { x: number; y: number; color: string; label?: string } | null;
  caption?: ReactNode;
  overlay?: ReactNode;
  framed?: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const dom = useMemo(() => {
    if (domain) return domain;
    if (surface) return { x: surface.x, y: surface.y };
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    for (const c of centres ?? []) { xs.push(c.x); ys.push(c.y); }
    for (const t of Object.values(trails ?? {})) for (const [x, y] of t) { xs.push(x); ys.push(y); }
    if (pulse) { xs.push(pulse.x); ys.push(pulse.y); }
    const [x0, x1] = extent(xs), [y0, y1] = extent(ys);
    const px = (x1 - x0) * 0.05, py = (y1 - y0) * 0.06;
    return { x: [x0 - px, x1 + px] as [number, number], y: [y0 - py, y1 + py] as [number, number] };
  }, [domain, surface, points, centres, trails, pulse]);
  const pad = 10;
  const sx = linear(dom.x[0], dom.x[1], pad, Math.max(pad + 1, width - pad));
  const sy = linear(dom.y[0], dom.y[1], height - pad, pad);

  useEffect(() => {
    if (!surface || !canvas.current) return;
    const c = canvas.current;
    c.width = surface.nx;
    c.height = surface.ny;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(surface.nx, surface.ny);
    const [lo, hi] = extent(surface.grid);
    for (let j = 0; j < surface.ny; j++) {
      for (let i = 0; i < surface.nx; i++) {
        const t = (surface.grid[j * surface.nx + i] - lo) / (hi - lo || 1);
        const [r, g, b] = rgbOf(ramp(t));
        const o = ((surface.ny - 1 - j) * surface.nx + i) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = Math.round((0.03 + 0.34 * Math.pow(t, 1.8)) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [surface, width > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const sl = surface ? { left: sx(surface.x[0]), top: sy(surface.y[1]), width: sx(surface.x[1]) - sx(surface.x[0]), height: sy(surface.y[0]) - sy(surface.y[1]) } : null;

  return (
    <div ref={ref} className={framed ? "inset" : undefined} style={{ width: "100%", height, position: "relative", overflow: "hidden", borderRadius: framed ? 16 : 0, padding: 0 }}>
      {surface && sl && width > 0 && (
        <motion.canvas ref={canvas} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
          style={{ position: "absolute", ...sl, imageRendering: "auto", filter: "blur(1.5px)" }} />
      )}
      {width > 0 && (
        <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {trails && Object.entries(trails).map(([id, t]) => t.length > 1 && (
            <polyline key={`t${id}`} points={t.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} fill="none"
              stroke={clusterColor(Number(id))} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" opacity={0.55} />
          ))}
          {points.map((p, i) => (
            <g key={i} transform={`translate(${sx(p.x)}, ${sy(p.y)})`}>
              {p.ring && <circle r={(p.r ?? 3) + 3} fill="none" stroke={p.ring} strokeWidth={1.4} opacity={0.9} />}
              <circle r={p.r ?? 3} style={{ fill: p.color, transition: "fill .5s ease, r .4s ease" }} fillOpacity={p.opacity ?? 0.8} stroke="var(--glass-strong)" strokeWidth={0.6} />
            </g>
          ))}
          {centres?.map((c) => (
            <motion.g key={`c${c.id}`} initial={{ x: sx(c.x), y: sy(c.y), scale: 0 }} animate={{ x: sx(c.x), y: sy(c.y), scale: 1 }}
              transition={{ x: { type: "spring", stiffness: 70, damping: 14 }, y: { type: "spring", stiffness: 70, damping: 14 }, scale: { type: "spring", stiffness: 400, damping: 18 } }}>
              <circle r={17} fill={withAlpha(c.color, 0.16)} stroke={c.color} strokeWidth={3} />
              <circle r={17} fill="none" stroke={c.color} strokeWidth={1.5} opacity={0.5}>
                <animate attributeName="r" values="17;26;17" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle r={8} fill={c.color} stroke="white" strokeWidth={2} />
              {c.label && <text y={-23} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)" style={{ paintOrder: "stroke", stroke: "var(--glass-strong)", strokeWidth: 3 }}>{c.label}</text>}
            </motion.g>
          ))}
          {pulse && (
            <motion.g initial={{ x: sx(pulse.x), y: sy(pulse.y) }} animate={{ x: sx(pulse.x), y: sy(pulse.y) }} transition={{ type: "spring", stiffness: 160, damping: 18 }}>
              <circle r={10} fill="none" stroke={pulse.color} strokeWidth={2}>
                <animate attributeName="r" values="8;24;8" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.9;0;0.9" dur="1.8s" repeatCount="indefinite" />
              </circle>
              <circle r={8} fill={pulse.color} stroke="white" strokeWidth={3} style={{ filter: `drop-shadow(0 2px 6px ${withAlpha(pulse.color.startsWith("#") ? pulse.color : "#5E5CE6", 0.6)})` }} />
              {pulse.label && <text y={-16} textAnchor="middle" fontSize={11.5} fontWeight={750} fill="var(--text)" style={{ paintOrder: "stroke", stroke: "var(--glass-strong)", strokeWidth: 3.5 }}>{pulse.label}</text>}
            </motion.g>
          )}
        </svg>
      )}
      {overlay}
      {caption && (
        <span className="tiny" style={{ position: "absolute", right: 8, bottom: 6, color: "var(--text-3)", background: "var(--glass-strong)", padding: "2px 8px", borderRadius: 6, pointerEvents: "none" }}>
          {caption}
        </span>
      )}
    </div>
  );
}

/** Colour chips under a map. */
export function MapLegend({ items }: { items: { color: string; label: string; note?: string; ring?: boolean }[] }) {
  return (
    <div className="row wrap small" style={{ gap: 12 }}>
      {items.map((it) => (
        <span key={it.label} className="row" style={{ gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: it.ring ? "transparent" : it.color, border: it.ring ? `2px solid ${it.color}` : undefined }} />
          <span>{it.label}</span>
          {it.note && <span className="faint tiny num">{it.note}</span>}
        </span>
      ))}
    </div>
  );
}

/** Index of the nearest 2-D centre (used to recolour points while replaying a saved run). */
export function nearest(x: number, y: number, centres: number[][]): number {
  let best = 0, bd = Infinity;
  centres.forEach((c, i) => {
    const d = (c[0] - x) ** 2 + (c[1] - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
