/* The autoencoder's 2-D map: every dot is a handwritten digit placed by the encoder, coloured by what digit it is.
 * After training you can click / drag to probe a spot, draw a path between two spots, or overlay the decoded grid. */
import { useEffect, useRef } from "react";
import { colorAt } from "../../lib/colors";
import type { VaeFrame, VaeResult } from "../../lib/types";
import { useFitCanvas } from "./common";
import { easeInOut, rgba, useLabTheme, useMotionFull, type LabTheme } from "./theme";

export type Z = [number, number];
interface Domain { x0: number; x1: number; y0: number; y1: number }

/** Trimmed (1st–99th percentile) extent of the points, padded so the map breathes. */
export function domainOf(points: [number, number, number][]): Domain {
  if (!points.length) return { x0: -3, x1: 3, y0: -3, y1: 3 };
  const xs = points.map((p) => p[0]).sort((a, b) => a - b), ys = points.map((p) => p[1]).sort((a, b) => a - b);
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))];
  let x0 = q(xs, 0.01), x1 = q(xs, 0.99), y0 = q(ys, 0.01), y1 = q(ys, 0.99);
  const px = (x1 - x0 || 1) * 0.12, py = (y1 - y0 || 1) * 0.12;
  x0 -= px; x1 += px; y0 -= py; y1 += py;
  return { x0, x1, y0, y1 };
}

const TILE = 10;

interface Shown { pts: Float32Array; labels: Uint8Array; dom: Domain }

/** Grow the shorter side so one map unit is the same number of pixels across and down (keeps decoded tiles square). */
function fitAspect(d: Domain, w: number, h: number): Domain {
  const s = Math.max((d.x1 - d.x0) / w, (d.y1 - d.y0) / h);
  const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2;
  return { x0: cx - (s * w) / 2, x1: cx + (s * w) / 2, y0: cy - (s * h) / 2, y1: cy + (s * h) / 2 };
}

export function VaeMap({ frame, result, overlay, probe, path, onPick, interactive }: {
  frame: VaeFrame | null;
  result: VaeResult | null;
  overlay: boolean;
  probe: Z | null;
  path: { a: Z | null; b: Z | null };
  onPick?: (z: Z, phase: "down" | "move") => void;
  interactive: boolean;
}) {
  const { box, canvas, width, height, ctx } = useFitCanvas((w) => Math.max(240, Math.min(w * 0.72, 460)));
  const theme = useLabTheme();
  const motionFull = useMotionFull();
  const shown = useRef<Shown | null>(null);
  const raf = useRef(0);
  const gridImg = useRef<HTMLCanvasElement | null>(null);
  const extras = useRef({ result, overlay, probe, path, theme });
  extras.current = { result, overlay, probe, path, theme };
  const dragging = useRef(false);

  const draw = () => {
    const c = ctx();
    if (!c) return;
    paint(c, width, height, shown.current, extras.current, gridImg.current);
  };

  // decoded 12×12 grid as one crisp offscreen image (ink in the theme's text colour)
  useEffect(() => {
    if (!result) { gridImg.current = null; draw(); return; }
    const n = result.grid.n, S = n * TILE;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d")!;
    const img = g.createImageData(S, S);
    const [r, gg, b] = theme.text;
    result.grid.images.forEach((im, k) => {
      const gr = Math.floor(k / n), gc = k % n;
      for (let i = 0; i < 64; i++) {
        // 1-pixel gutter around every 8×8 tile so neighbouring digits don't run together
        const py = gr * TILE + 1 + Math.floor(i / 8), px = gc * TILE + 1 + (i % 8);
        const o = (py * S + px) * 4;
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = Math.round(Math.max(0, Math.min(1, im[i])) * 255);
      }
    });
    g.putImageData(img, 0, 0);
    gridImg.current = cv;
    draw();
  }, [result, theme]);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!frame) { shown.current = null; draw(); return; }
    const n = frame.points.length;
    const to = new Float32Array(n * 2);
    const labels = new Uint8Array(n);
    frame.points.forEach(([x, y, c], i) => { to[i * 2] = x; to[i * 2 + 1] = y; labels[i] = c; });
    const dom = domainOf(frame.points);
    const from = shown.current;
    if (!motionFull || !from || from.pts.length !== to.length) {
      shown.current = { pts: to, labels, dom };
      draw();
      return;
    }
    const p0 = from.pts.slice(), d0 = { ...from.dom };
    const t0 = performance.now(), dur = 380;
    const step = (t: number) => {
      const k = easeInOut(Math.min(1, (t - t0) / dur));
      const pts = new Float32Array(to.length);
      for (let i = 0; i < pts.length; i++) pts[i] = p0[i] + (to[i] - p0[i]) * k;
      const l = (a: number, b: number) => a + (b - a) * k;
      shown.current = { pts, labels, dom: { x0: l(d0.x0, dom.x0), x1: l(d0.x1, dom.x1), y0: l(d0.y0, dom.y0), y1: l(d0.y1, dom.y1) } };
      draw();
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [frame, motionFull]);

  useEffect(() => { draw(); }, [width, height, theme, overlay, probe, path.a, path.b]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const toZ = (e: React.PointerEvent): Z | null => {
    const s = shown.current;
    const el = canvas.current;
    if (!s || !el) return null;
    const r = el.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const { x0, x1, y0, y1 } = fitAspect(s.dom, r.width, r.height);
    return [x0 + fx * (x1 - x0), y1 - fy * (y1 - y0)];
  };

  return (
    <div ref={box} className="lab-well" style={{ width: "100%", minHeight: 240, cursor: interactive ? "crosshair" : "default" }}>
      <canvas ref={canvas} role="img" aria-label="Two-dimensional map of handwritten digits"
        onPointerDown={(e) => {
          if (!interactive || !onPick) return;
          const z = toZ(e);
          if (!z) return;
          dragging.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          onPick(z, "down");
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !onPick) return;
          const z = toZ(e);
          if (z) onPick(z, "move");
        }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }} />
    </div>
  );
}

function paint(c: CanvasRenderingContext2D, w: number, h: number, s: Shown | null,
  ex: { result: VaeResult | null; overlay: boolean; probe: Z | null; path: { a: Z | null; b: Z | null }; theme: LabTheme },
  grid: HTMLCanvasElement | null) {
  if (!s) return;
  const { x0, x1, y0, y1 } = fitAspect(s.dom, w, h);
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * w;
  const sy = (y: number) => ((y1 - y) / (y1 - y0)) * h;
  const { theme } = ex;

  // faint origin cross
  c.strokeStyle = rgba(theme.hairline);
  c.lineWidth = 1;
  c.beginPath();
  if (x0 < 0 && x1 > 0) { c.moveTo(sx(0), 0); c.lineTo(sx(0), h); }
  if (y0 < 0 && y1 > 0) { c.moveTo(0, sy(0)); c.lineTo(w, sy(0)); }
  c.stroke();

  const showGrid = ex.overlay && grid && ex.result;
  const r = w < 420 ? 2 : 2.6;
  c.globalAlpha = showGrid ? 0.22 : 0.85;
  for (let i = 0; i < s.labels.length; i++) {
    c.fillStyle = colorAt(s.labels[i]);
    c.beginPath();
    c.arc(sx(s.pts[i * 2]), sy(s.pts[i * 2 + 1]), r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;

  if (showGrid) {
    const e = ex.result!.extent, n = ex.result!.grid.n;
    const dx = (e.x[1] - e.x[0]) / (n - 1), dy = (e.y[1] - e.y[0]) / (n - 1);
    const L = sx(e.x[0] - dx / 2), R = sx(e.x[1] + dx / 2), T = sy(e.y[1] + dy / 2), B = sy(e.y[0] - dy / 2);
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 0.92;
    c.drawImage(grid!, L, T, R - L, B - T);
    c.globalAlpha = 1;
    c.strokeStyle = rgba(theme.hairline, 1.5);
    c.strokeRect(L + 0.5, T + 0.5, R - L - 1, B - T - 1);
  }

  const ring = (z: Z, label?: string) => {
    const x = sx(z[0]), y = sy(z[1]);
    c.lineWidth = 2.5;
    c.strokeStyle = rgba(theme.accent);
    c.fillStyle = rgba(theme.accent, 0.18);
    c.beginPath();
    c.arc(x, y, 9, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(x, y, 2.5, 0, Math.PI * 2);
    c.fillStyle = rgba(theme.accent);
    c.fill();
    if (label) {
      c.font = "600 12px -apple-system, system-ui, sans-serif";
      c.fillStyle = rgba(theme.text);
      c.fillText(label, x + 12, y - 10);
    }
  };

  const { a, b } = ex.path;
  if (a && b) {
    c.strokeStyle = rgba(theme.accent, 0.7);
    c.setLineDash([5, 4]);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(sx(a[0]), sy(a[1]));
    c.lineTo(sx(b[0]), sy(b[1]));
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = rgba(theme.accent);
    for (let k = 1; k < 7; k++) {
      const t = k / 7;
      c.beginPath();
      c.arc(sx(a[0] + (b[0] - a[0]) * t), sy(a[1] + (b[1] - a[1]) * t), 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (a) ring(a, "A");
  if (b) ring(b, "B");
  if (ex.probe) ring(ex.probe);
}
