import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, type ReactNode } from "react";
import { spring } from "../../../design/motion";
import { AnimatedNumber } from "../../glass";

/* ---------------------------------------------------------------- deterministic randomness */

/** Tiny seeded PRNG (mulberry32): same seed → same "random" data on every render and every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box–Muller) from a uniform generator. */
export function gauss(r: () => number) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const money = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${s}$${Math.round(a / 1e3)}k`;
  return `${s}$${Math.round(a).toLocaleString()}`;
};

/* ---------------------------------------------------------------- semantic mark colours (theme-neutral hues) */

export const C = {
  pos: "#FF375F", // sick / fraud / readmitted
  neg: "#0A84FF", // healthy / legit / home
  ok: "#30D158",
  warn: "#FF9F0A",
  amber: "#FFD60A",
  purple: "#BF5AF2",
  teal: "#40C8C0",
  indigo: "#5E5CE6",
};

/* ---------------------------------------------------------------- once-only completion */

/** Returns a stable `done()` that calls `onDone` at most once. */
export function useDone(onDone?: () => void) {
  const fired = useRef(false);
  const cb = useRef(onDone);
  cb.current = onDone;
  return useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    cb.current?.();
  }, []);
}

/* ---------------------------------------------------------------- layout pieces */

/** Standard demo layout: controls on top, the visual, live numbers, then the "what you're seeing" line. */
export function DemoFrame({ controls, children, stats, caption, captionKey }: {
  controls: ReactNode;
  children: ReactNode;
  stats?: ReactNode;
  caption: ReactNode;
  /** caption cross-fades whenever this key changes (not on every number tick) */
  captionKey: string;
}) {
  return (
    <div className="col" style={{ gap: 16, width: "100%", minWidth: 0 }}>
      <div className="row wrap between" style={{ gap: 12, rowGap: 10 }}>{controls}</div>
      {children}
      {stats && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 10 }}>{stats}</div>}
      <Caption k={captionKey}>{caption}</Caption>
    </div>
  );
}

export function Caption({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: "flex-start", padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--accent-soft)", minHeight: 44 }}>
      <span aria-hidden style={{ fontSize: 16, lineHeight: "22px" }}>👀</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}
          style={{ fontSize: 13.5, lineHeight: "22px", color: "var(--text)" }} aria-live="polite">
          {children}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/** Live number tile. */
export function Stat({ label, value, format = pct, color, sub, emphasis }: {
  label: ReactNode;
  value: number;
  format?: (v: number) => string;
  color?: string;
  sub?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <motion.div className="inset" layout transition={spring.snappy}
      style={{ padding: "10px 14px", minWidth: 0, boxShadow: emphasis ? `0 0 0 2px ${color ?? "var(--accent)"} inset` : "none", transition: "box-shadow .3s" }}>
      <div className="tiny muted" style={{ fontWeight: 560 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: color ?? "var(--text)", lineHeight: 1.25 }}>
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub && <div className="tiny faint" style={{ marginTop: 1 }}>{sub}</div>}
    </motion.div>
  );
}

export type LegendItem = { color: string; label: ReactNode; shape?: "dot" | "ring" | "square" | "line" | "dash" };

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="row wrap small" style={{ gap: 14, rowGap: 4 }}>
      {items.map((it, i) => (
        <span key={i} className="row" style={{ gap: 6 }}>
          <LegendMark color={it.color} shape={it.shape ?? "dot"} />
          <span className="muted">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function LegendMark({ color, shape }: { color: string; shape: NonNullable<LegendItem["shape"]> }) {
  if (shape === "line" || shape === "dash")
    return <svg width={18} height={8}><line x1={1} x2={17} y1={4} y2={4} stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeDasharray={shape === "dash" ? "3 3" : undefined} /></svg>;
  if (shape === "ring") return <span style={{ width: 10, height: 10, borderRadius: 6, border: `2px solid ${color}`, boxSizing: "border-box" }} />;
  return <span style={{ width: 10, height: 10, borderRadius: shape === "square" ? 3 : 6, background: color }} />;
}

/** Horizontal bar with an animated fill and a live percentage — for side-by-side comparisons. */
export function MeterBar({ label, value, color, max = 1, format = pct, height = 26, dim, note }: {
  label: ReactNode;
  value: number;
  color: string;
  max?: number;
  format?: (v: number) => string;
  height?: number;
  dim?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className="col" style={{ gap: 5, opacity: dim ? 0.55 : 1, transition: "opacity .3s" }}>
      <div className="row between small" style={{ gap: 8 }}>
        <span style={{ fontWeight: 560 }}>{label}</span>
        <span className="num" style={{ fontWeight: 700, fontSize: 15, color }}><AnimatedNumber value={value} format={format} /></span>
      </div>
      <div style={{ height, borderRadius: height / 2.6, background: "var(--fill)", overflow: "hidden", position: "relative" }}>
        <motion.div initial={false} animate={{ width: `${clamp(value / max, 0, 1) * 100}%` }} transition={spring.gentle}
          style={{ height: "100%", borderRadius: height / 2.6, background: `linear-gradient(90deg, ${color}bb, ${color})`, boxShadow: `0 4px 14px ${color}44` }} />
      </div>
      {note && <div className="tiny faint">{note}</div>}
    </div>
  );
}

/** A compact 2×2 confusion matrix with live counts. */
export function MiniConfusion({ tp, fn, fp, tn, posLabel, negLabel }: { tp: number; fn: number; fp: number; tn: number; posLabel: string; negLabel: string }) {
  const max = Math.max(1, tp, fn, fp, tn);
  const cell = (v: number, good: boolean, title: string) => (
    <div title={title} style={{ height: 46, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: v === 0 ? "var(--fill)" : good ? `rgba(48, 209, 88, ${0.14 + 0.5 * (v / max)})` : `rgba(255, 69, 58, ${0.14 + 0.5 * (v / max)})`, transition: "background .4s" }}>
      <span className="num" style={{ fontWeight: 700, fontSize: 16 }}><AnimatedNumber value={v} /></span>
      <span className="tiny muted" style={{ fontSize: 9.5, marginTop: -2 }}>{title}</span>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 4, alignItems: "center", fontSize: 11 }}>
      <span />
      <span className="tiny muted" style={{ textAlign: "center" }}>says {posLabel}</span>
      <span className="tiny muted" style={{ textAlign: "center" }}>says {negLabel}</span>
      <span className="tiny muted" style={{ textAlign: "right", paddingRight: 4 }}>really {posLabel}</span>
      {cell(tp, true, "caught")}
      {cell(fn, false, "missed")}
      <span className="tiny muted" style={{ textAlign: "right", paddingRight: 4 }}>really {negLabel}</span>
      {cell(fp, false, "false alarm")}
      {cell(tn, true, "correct")}
    </div>
  );
}

/** Clip a line y = a + b·x to a rectangle; returns the visible segment (data coords) or null. */
export function clipLine(a: number, b: number, x0: number, x1: number, y0: number, y1: number) {
  // Parametrise along x, then intersect with the y-slab.
  let t0 = x0, t1 = x1;
  if (Math.abs(b) < 1e-15) {
    if (a < y0 || a > y1) return null;
  } else {
    const xa = (y0 - a) / b, xb = (y1 - a) / b;
    t0 = Math.max(t0, Math.min(xa, xb));
    t1 = Math.min(t1, Math.max(xa, xb));
    if (t0 > t1) return null;
  }
  return { x1: t0, y1: a + b * t0, x2: t1, y2: a + b * t1 };
}

/** Ordinary least squares y = a + b·x and R² on the same points. */
export function ols(xs: number[], ys: number[]) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

export function r2(ys: number[], preds: number[]) {
  const my = mean(ys);
  let ssr = 0, sst = 0;
  for (let i = 0; i < ys.length; i++) { ssr += (ys[i] - preds[i]) ** 2; sst += (ys[i] - my) ** 2; }
  return sst ? 1 - ssr / sst : 0;
}

/** Histogram-like bars that morph smoothly (CSS scaleY, so springy overshoot never produces invalid SVG). */
export function MorphBars({ counts, color, height = 150 }: { counts: number[]; color: string; height?: number }) {
  const max = Math.max(1, ...counts);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, width: "100%" }}>
      {counts.map((c, i) => (
        <div key={i} title={String(c)} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}>
          <div style={{
            width: "100%", height: "100%", transformOrigin: "50% 100%", transform: `scaleY(${Math.max(0.004, c / max)})`,
            transition: `transform .85s cubic-bezier(.34,1.28,.64,1) ${i * 18}ms, background .5s`,
            background: `linear-gradient(180deg, ${color}, ${color}bb)`, borderRadius: "4px 4px 2px 2px",
          }} />
        </div>
      ))}
    </div>
  );
}
