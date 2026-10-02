/* GAN live view: real points (neutral), forged points (accent) and the detective's opinion map as a smooth heat
 * background. Points and the map tween between frames unless the user turned motion down. */
import { useEffect, useRef } from "react";
import type { GanFrame } from "../../lib/types";
import { useFitCanvas } from "./common";
import type { Pt } from "./targets";
import { easeInOut, rgba, useLabTheme, useMotionFull, type LabTheme } from "./theme";

const N = 25;

interface Shown { fake: Float32Array; grid: Float32Array | null }

export function GanCanvas({ frame, real, extent, children }: { frame: GanFrame | null; real: Pt[]; extent: number; children?: React.ReactNode }) {
  const { box, canvas, width, height, ctx } = useFitCanvas((w) => Math.min(w, 520));
  const theme = useLabTheme();
  const motionFull = useMotionFull();
  const shown = useRef<Shown>({ fake: new Float32Array(0), grid: null });
  const raf = useRef(0);
  const heat = useRef<HTMLCanvasElement | null>(null);
  const lastTween = useRef(0);

  const latest = useRef({ real, extent, theme });
  latest.current = { real, extent, theme };

  const draw = () => {
    const c = ctx();
    if (!c) return;
    paint(c, width, height, shown.current, latest.current.real, latest.current.extent, latest.current.theme, heat);
  };

  // tween to each new frame
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!frame) {
      shown.current = { fake: new Float32Array(0), grid: null };
      draw();
      return;
    }
    const toFake = new Float32Array(frame.fake.length * 2);
    frame.fake.forEach(([x, y], i) => { toFake[i * 2] = x; toFake[i * 2 + 1] = y; });
    const toGrid = new Float32Array(N * N);
    frame.d_grid.forEach((row, i) => row.forEach((v, j) => { toGrid[i * N + j] = v; }));
    const from = shown.current;
    const now = performance.now();
    // match the tween to how fast frames arrive (replay ≈ 90 ms, live ≈ 150–400 ms)
    const gap = now - lastTween.current;
    lastTween.current = now;
    const dur = Math.max(50, Math.min(320, gap * 0.9));
    if (!motionFull || from.fake.length !== toFake.length || !from.grid) {
      shown.current = { fake: toFake, grid: toGrid };
      draw();
      return;
    }
    const f0 = from.fake.slice(), g0 = from.grid.slice();
    const step = (t: number) => {
      const k = easeInOut(Math.min(1, (t - now) / dur));
      const fake = new Float32Array(toFake.length);
      for (let i = 0; i < fake.length; i++) fake[i] = f0[i] + (toFake[i] - f0[i]) * k;
      const grid = new Float32Array(N * N);
      for (let i = 0; i < grid.length; i++) grid[i] = g0[i] + (toGrid[i] - g0[i]) * k;
      shown.current = { fake, grid };
      draw();
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [frame, motionFull]);

  // static redraw on resize / theme / shape changes
  useEffect(() => { draw(); }, [width, height, theme, real, extent]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div ref={box} className="lab-well" style={{ width: "100%", minHeight: 200 }}>
      <canvas ref={canvas} role="img" aria-label="Real points, forged points and the detective's opinion map" />
      {children}
    </div>
  );
}

function paint(c: CanvasRenderingContext2D, w: number, h: number, s: Shown, real: Pt[], ext: number, theme: LabTheme, heatRef: React.MutableRefObject<HTMLCanvasElement | null>) {
  const P = Math.min(w, h) - 16;
  const L = (w - P) / 2, T = (h - P) / 2;
  const sx = (x: number) => L + ((x + ext) / (2 * ext)) * P;
  const sy = (y: number) => T + ((ext - y) / (2 * ext)) * P;

  c.save();
  c.beginPath();
  c.roundRect(L, T, P, P, 12);
  c.clip();

  // detective's opinion: P(real) → success tint, P(fake) → danger tint, 0.5 → clear
  if (s.grid) {
    if (!heatRef.current) heatRef.current = document.createElement("canvas");
    const hc = heatRef.current;
    hc.width = N; hc.height = N;
    const hx = hc.getContext("2d")!;
    const img = hx.createImageData(N, N);
    const [sr, sg, sb] = theme.success, [dr, dg, db] = theme.danger;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const v = s.grid[i * N + j];
        const o = ((N - 1 - i) * N + j) * 4; // row 0 of d_grid is the bottom (y = -extent)
        const real_ = v >= 0.5;
        const a = Math.min(1, Math.abs(v - 0.5) * 2) * 0.42;
        img.data[o] = real_ ? sr : dr; img.data[o + 1] = real_ ? sg : dg; img.data[o + 2] = real_ ? sb : db;
        img.data[o + 3] = Math.round(a * 255);
      }
    }
    hx.putImageData(img, 0, 0);
    const cell = (2 * ext) / (N - 1);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(hc, sx(-ext - cell / 2), sy(ext + cell / 2), (P * (2 * ext + cell)) / (2 * ext), (P * (2 * ext + cell)) / (2 * ext));
  }

  // axes cross
  c.strokeStyle = rgba(theme.hairline);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(sx(0), T); c.lineTo(sx(0), T + P);
  c.moveTo(L, sy(0)); c.lineTo(L + P, sy(0));
  c.stroke();

  // real shape
  c.fillStyle = rgba(theme.text, 0.32);
  for (const [x, y] of real) {
    c.beginPath();
    c.arc(sx(x), sy(y), 2.1, 0, Math.PI * 2);
    c.fill();
  }

  // forgeries
  const r = P < 360 ? 2.3 : 2.8;
  c.fillStyle = rgba(theme.accent, 0.9);
  c.strokeStyle = rgba(theme.accent, 0.35);
  for (let i = 0; i < s.fake.length; i += 2) {
    const x = sx(s.fake[i]), y = sy(s.fake[i + 1]);
    if (x < L - 6 || x > L + P + 6 || y < T - 6 || y > T + P + 6) continue;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  c.strokeStyle = rgba(theme.hairline);
  c.beginPath();
  c.roundRect(L + 0.5, T + 0.5, P - 1, P - 1, 12);
  c.stroke();
}
