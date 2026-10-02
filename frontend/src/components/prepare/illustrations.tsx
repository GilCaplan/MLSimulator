import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../design/motion";
import { PALETTE } from "../../lib/colors";
import { useUI } from "../../lib/store";
import type { PipelineSpec } from "../../lib/types";

/* ------------------------------------------------------------------ Encode: one-hot vs ordinal */

const COLOURS = ["red", "green", "blue", "green"];
const SWATCH: Record<string, string> = { red: "#FF453A", green: "#30D158", blue: "#0A84FF" };

/** A "colour" column turning into three yes/no columns (one-hot) or into 0/1/2 (ordinal). */
export function EncodeDemo({ method }: { method: PipelineSpec["encode"]["method"] }) {
  const cell: React.CSSProperties = { height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, borderRadius: 7 };
  const cats = ["blue", "green", "red"];
  return (
    <div className="inset row" style={{ padding: 14, gap: 14, alignItems: "flex-start", justifyContent: "center", minHeight: 150 }}>
      <div className="col" style={{ gap: 4, width: 76 }}>
        <span className="tiny faint" style={{ textAlign: "center", fontWeight: 600 }}>colour</span>
        {COLOURS.map((c, i) => (
          <div key={i} style={{ ...cell, gap: 6, background: "var(--fill)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: SWATCH[c] }} />{c}
          </div>
        ))}
      </div>
      <motion.span animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ alignSelf: "center", fontSize: 18, color: "var(--accent)" }}>→</motion.span>
      <AnimatePresence mode="wait">
        <motion.div key={method} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }} className="row" style={{ gap: 4, alignItems: "flex-start" }}>
          {(method === "onehot" ? cats : ["colour"]).map((col, j) => (
            <div key={col} className="col" style={{ gap: 4, width: method === "onehot" ? 58 : 76 }}>
              <span className="tiny faint" style={{ textAlign: "center", fontWeight: 600, whiteSpace: "nowrap" }}>{method === "onehot" ? `is ${col}` : "colour"}</span>
              {COLOURS.map((c, i) => {
                const v = method === "onehot" ? (c === col ? 1 : 0) : cats.indexOf(c);
                const hot = method === "onehot" ? v === 1 : true;
                return (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ ...spring.pop, delay: 0.08 + (j * 4 + i) * 0.035 }}
                    className="num mono"
                    style={{ ...cell, fontWeight: 650, background: hot ? `${SWATCH[c]}2e` : "var(--fill)", color: hot ? SWATCH[c] : "var(--text-3)" }}
                  >
                    {v}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ Scale: squeeze two features to similar ranges */

const AGE = [22, 25, 31, 35, 38, 42, 47, 55, 63, 78];
const INCOME = [28e3, 35e3, 41e3, 48e3, 52e3, 60e3, 71e3, 85e3, 98e3, 190e3];

function transform(vals: number[], m: PipelineSpec["scale"]["method"]) {
  const s = [...vals].sort((a, b) => a - b);
  const q = (p: number) => { const x = p * (s.length - 1), i = Math.floor(x); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (x - i); };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  switch (m) {
    case "standard": return vals.map((v) => (v - mean) / sd);
    case "minmax": return vals.map((v) => (v - s[0]) / (s[s.length - 1] - s[0] || 1));
    case "robust": return vals.map((v) => (v - q(0.5)) / (q(0.75) - q(0.25) || 1));
    default: return vals;
  }
}

const SCALE_CAPTION: Record<PipelineSpec["scale"]["method"], string> = {
  none: "Raw numbers: income's huge values stretch the ruler, and age is squashed into one corner.",
  standard: "Each feature is centred on 0 and spread by its typical deviation, so both get a similar say.",
  minmax: "Each feature is squeezed into 0 … 1. Simple, but one extreme value can squash everybody else.",
  robust: "Centred on the median and scaled by the middle half of the data, so the rich outlier barely matters.",
};

const tick = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : Number(v.toFixed(1)).toString());

/** Dots on two rulers that glide to their scaled positions when the method changes. */
export function ScaleDemo({ method }: { method: PipelineSpec["scale"]["method"] }) {
  const { age, income, lo, hi } = useMemo(() => {
    const age = transform(AGE, method), income = transform(INCOME, method);
    const all = [...age, ...income, ...(method === "none" ? [0] : [])];
    const lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.04;
    return { age, income, lo: lo - pad, hi: hi + pad };
  }, [method]);
  const W = 340, L = 64, R = W - 12;
  const x = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (R - L);
  const rows = [
    { name: "age", vals: age, y: 30, c: PALETTE[0] },
    { name: "income", vals: income, y: 74, c: PALETTE[4] },
  ];
  return (
    <div className="inset col" style={{ padding: "12px 14px", gap: 6 }}>
      <svg viewBox={`0 0 ${W} 104`} width="100%" style={{ display: "block", maxHeight: 130 }}>
        {rows.map((r) => (
          <g key={r.name}>
            <text x={0} y={r.y + 4} fontSize={11} fill="var(--text-2)" fontWeight={600}>{r.name}</text>
            <line x1={L} x2={R} y1={r.y} y2={r.y} stroke="var(--hairline)" strokeWidth={2} strokeLinecap="round" />
            {r.vals.map((v, i) => (
              <motion.circle key={i} r={5} cy={r.y} fill={r.c} fillOpacity={0.85} stroke="var(--bg)" strokeOpacity={0.7} strokeWidth={1}
                initial={false} animate={{ cx: x(v) }} transition={{ ...spring.gentle, delay: i * 0.02 }} />
            ))}
          </g>
        ))}
        <g fontSize={10} fill="var(--text-3)">
          <text x={L} y={100}>{tick(lo)}</text>
          {lo < 0 && hi > 0 && <motion.text initial={false} animate={{ x: x(0) }} transition={spring.gentle} y={100} textAnchor="middle">0</motion.text>}
          <text x={R} y={100} textAnchor="end">{tick(hi)}</text>
        </g>
      </svg>
      <AnimatePresence mode="wait">
        <motion.span key={method} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="tiny muted" style={{ lineHeight: 1.45 }}>
          {SCALE_CAPTION[method]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ SMOTE explainer loop */

const RARE = [{ x: 52, y: 40 }, { x: 88, y: 30 }, { x: 70, y: 74 }, { x: 112, y: 62 }, { x: 40, y: 92 }, { x: 98, y: 98 }];
const COMMON = [{ x: 160, y: 30 }, { x: 196, y: 46 }, { x: 178, y: 82 }, { x: 214, y: 100 }, { x: 150, y: 108 }, { x: 206, y: 18 }, { x: 140, y: 64 }, { x: 222, y: 72 }, { x: 186, y: 116 }, { x: 166, y: 52 }];
const PAIRS: [number, number, number][] = [[0, 1, 0.45], [2, 3, 0.6], [4, 2, 0.4], [1, 3, 0.5], [5, 3, 0.35], [0, 2, 0.55]];

/** Two same-class neighbours, a line between them, and a new synthetic point popping up on that line. */
export function SmoteDemo({ color = PALETTE[1], other = PALETTE[0] }: { color?: string; other?: string }) {
  const reduce = useUI((s) => s.reduceMotion);
  const [step, setStep] = useState(reduce ? PAIRS.length : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStep((s) => (s >= PAIRS.length + 1 ? 0 : s + 1)), 1400);
    return () => clearInterval(t);
  }, [reduce]);
  const cur = step < PAIRS.length ? PAIRS[step] : null;
  const lerp = ([a, b, t]: [number, number, number]) => ({ x: RARE[a].x + (RARE[b].x - RARE[a].x) * t, y: RARE[a].y + (RARE[b].y - RARE[a].y) * t });
  const made = PAIRS.slice(0, Math.min(step + 1, PAIRS.length));
  return (
    <div className="inset" style={{ padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg viewBox="0 0 250 130" width="100%" style={{ maxWidth: 280, display: "block" }}>
        {COMMON.map((p, i) => <circle key={`c${i}`} cx={p.x} cy={p.y} r={5} fill={other} fillOpacity={0.55} />)}
        {RARE.map((p, i) => {
          const hot = cur && (cur[0] === i || cur[1] === i);
          return (
            <g key={`r${i}`}>
              {hot && <motion.circle cx={p.x} cy={p.y} fill="none" stroke={color} strokeWidth={1.5} initial={{ r: 5, opacity: 0.9 }} animate={{ r: 13, opacity: 0 }} transition={{ duration: 1, repeat: Infinity }} />}
              <circle cx={p.x} cy={p.y} r={hot ? 6.5 : 5.5} fill={color} stroke="var(--bg)" strokeWidth={1.2} style={{ transition: "r .2s" }} />
            </g>
          );
        })}
        <AnimatePresence>
          {cur && (
            <motion.line key={`l${step}`} x1={RARE[cur[0]].x} y1={RARE[cur[0]].y} x2={RARE[cur[1]].x} y2={RARE[cur[1]].y}
              stroke={color} strokeWidth={1.6} strokeDasharray="3 3"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.85 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {made.map((pr, k) => {
            const p = lerp(pr);
            const fresh = k === step;
            return (
              <motion.g key={`s${k}`} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }}
                transition={{ ...spring.pop, delay: fresh && !reduce ? 0.45 : 0 }}>
                <circle cx={p.x} cy={p.y} r={8} fill="none" stroke={color} strokeWidth={1.3} opacity={0.75} />
                <circle cx={p.x} cy={p.y} r={4.5} fill={color} stroke="var(--bg)" strokeWidth={1} />
              </motion.g>
            );
          })}
        </AnimatePresence>
      </svg>
      <span className="tiny muted" style={{ textAlign: "center" }}>
        <span style={{ color }}>●</span> rare class · <span style={{ color }}>◎</span> new synthetic point · <span style={{ color: other }}>●</span> common class
      </span>
    </div>
  );
}
