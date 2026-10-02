import { motion } from "framer-motion";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";

/* Shared building blocks for image models: heat-map colours, pixel canvases and thumbnails with overlays. */

/** Warm "magma" ramp for heat maps: deep purple → pink → orange → pale yellow. t in 0..1. */
const HEAT_STOPS: [number, number, number][] = [
  [20, 11, 52], [94, 23, 116], [176, 42, 112], [237, 85, 72], [251, 160, 46], [252, 236, 160],
];
export function heatRGB(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export const heatCss = (t: number) => {
  const [r, g, b] = heatRGB(t);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};
export const HEAT_GRADIENT = `linear-gradient(90deg, ${[0, 0.2, 0.4, 0.6, 0.8, 1].map(heatCss).join(", ")})`;

type Mode = "heat" | "overlay" | "gray";

/**
 * Paints a small grid (H×W of 0..1 values, or H×W×3 RGB) onto a canvas at its native resolution; CSS scales it up.
 * `overlay` mode is transparent where the value is low so it can sit on top of a photo.
 */
export function PixelCanvas({ grid, rgb, mode = "heat", size, smooth = false, boost, style, title }: {
  grid?: number[][];
  /** stretch contrast so the top few percent of values reach full brightness (default on for overlays) */
  boost?: boolean;
  rgb?: number[][][];
  mode?: Mode;
  size: number | string;
  smooth?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h = rgb?.length ?? grid?.length ?? 0;
  const w = rgb?.[0]?.length ?? grid?.[0]?.length ?? 0;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !h || !w) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    let top = 1;
    if (grid && (boost ?? mode === "overlay")) {
      // saliency is spiky: a handful of pixels hold the maximum, so scale by the 97th percentile instead
      const vals = grid.flat().filter((v) => v > 0).sort((a, b) => a - b);
      top = Math.max(0.05, vals[Math.floor(vals.length * 0.97)] ?? 1);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        if (rgb) {
          const px = rgb[y][x];
          img.data[k] = px[0] * 255; img.data[k + 1] = px[1] * 255; img.data[k + 2] = px[2] * 255; img.data[k + 3] = 255;
          continue;
        }
        const v = Math.min(1, Math.max(0, (grid![y][x] ?? 0) / top));
        if (mode === "gray") {
          img.data[k] = img.data[k + 1] = img.data[k + 2] = v * 255; img.data[k + 3] = 255;
        } else {
          const [r, g, b] = heatRGB(mode === "overlay" ? 0.35 + 0.65 * v : v);
          img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b;
          // overlay: low values fade out completely so the picture shows through
          img.data[k + 3] = mode === "overlay" ? Math.round(255 * Math.min(1, Math.pow(v, 1.1) * 1.15)) : 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [grid, rgb, mode, h, w, boost]);
  return (
    <canvas ref={ref} width={w || 1} height={h || 1} title={title}
      style={{ width: size, height: size, display: "block", imageRendering: smooth ? "auto" : "pixelated", ...style }} />
  );
}

/** A dataset thumbnail (pixelated, rounded) with an optional heat-map overlay at `strength` (0..1). */
export function Thumb({ datasetId, i, src, size = 96, px = 96, heat, strength = 0.75, radius = 14, children, style, onClick }: {
  datasetId?: string;
  i?: number;
  src?: string;
  size?: number | string;
  px?: number;
  heat?: number[][] | null;
  strength?: number;
  radius?: number;
  children?: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const url = src ?? (datasetId !== undefined && i !== undefined ? api.imageUrl(datasetId, i, px) : undefined);
  return (
    <div onClick={onClick} style={{ position: "relative", width: size, aspectRatio: "1 / 1", borderRadius: radius, overflow: "hidden", background: "var(--fill-2)", flexShrink: 0, cursor: onClick ? "pointer" : undefined, boxShadow: "0 1px 0 rgba(255,255,255,0.25) inset, 0 4px 14px rgba(0,0,0,0.12)", ...style }}>
      {url && (
        <img src={url} alt="" draggable={false} loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated" }} />
      )}
      {heat && (
        <motion.div initial={false} animate={{ opacity: strength }} transition={{ duration: 0.25 }} style={{ position: "absolute", inset: 0 }}>
          <PixelCanvas grid={heat} mode="overlay" size="100%" smooth />
        </motion.div>
      )}
      {children}
    </div>
  );
}

/** Small confidence ring (0..1) for gallery tiles: sits on a frosted disc so it reads on any picture. */
export function ConfRing({ value, color, size = 34 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "rgba(20,20,30,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={3} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }} transition={{ ...spring.gentle, delay: 0.15 }} />
      </svg>
      <span style={{ fontSize: size * 0.3, fontWeight: 700, color: "#fff", position: "relative" }} className="num">{Math.round(value * 100)}</span>
    </div>
  );
}

/** Legend bar for the heat colours. */
export function HeatLegend({ low = "ignored", high = "looked hard", width = 160 }: { low?: string; high?: string; width?: number }) {
  return (
    <div className="row tiny faint" style={{ gap: 8 }}>
      <span>{low}</span>
      <span style={{ width, height: 8, borderRadius: 4, background: HEAT_GRADIENT }} />
      <span>{high}</span>
    </div>
  );
}
