import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const W = 220;
const H = 130;
const DUR = 5.2;

function rng(seed: number) {
  let s = seed;
  return () => { const x = Math.sin(++s * 12.9898) * 43758.5453; return x - Math.floor(x); };
}

/** Dots drift from a jumble into two coloured clusters, then a boundary sweeps between them. Loops. */
export function ClassificationArt({ active }: { active: boolean }) {
  const dots = useMemo(() => {
    const r = rng(11);
    return Array.from({ length: 18 }, (_, i) => {
      const cls = i % 2;
      const cx = cls ? 158 : 62;
      const cy = cls ? 48 : 84;
      const a = r() * Math.PI * 2;
      const d = 6 + r() * 26;
      return { cls, x0: 20 + r() * (W - 40), y0: 16 + r() * (H - 32), x1: cx + Math.cos(a) * d, y1: cy + Math.sin(a) * d * 0.8 };
    });
  }, []);
  const times = [0, 0.32, 0.86, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      <motion.line x1={88} y1={H + 4} x2={134} y2={-4} stroke="var(--text-2)" strokeWidth={2.2} strokeDasharray="5 5" strokeLinecap="round"
        animate={{ pathLength: [0, 0, 1, 1, 0], opacity: [0, 0, 1, 1, 0] }}
        transition={{ duration: DUR, times: [0, 0.34, 0.52, 0.86, 1], repeat: Infinity, ease: "easeInOut" }} />
      <motion.polygon points={`146,-40 ${W + 40},-40 ${W + 40},${H + 40} 76,${H + 40}`} fill="#FF375F"
        animate={{ opacity: [0, 0, active ? 0.12 : 0.07, active ? 0.12 : 0.07, 0] }}
        transition={{ duration: DUR, times: [0, 0.4, 0.55, 0.86, 1], repeat: Infinity }} />
      <motion.polygon points={`146,-40 -40,-40 -40,${H + 40} 76,${H + 40}`} fill="#0A84FF"
        animate={{ opacity: [0, 0, active ? 0.1 : 0.06, active ? 0.1 : 0.06, 0] }}
        transition={{ duration: DUR, times: [0, 0.4, 0.55, 0.86, 1], repeat: Infinity }} />
      {dots.map((d, i) => {
        const color = d.cls ? "#FF375F" : "#0A84FF";
        return (
          <motion.circle key={i} r={5.5} stroke="white" strokeWidth={1.4}
            initial={{ cx: d.x0, cy: d.y0, fill: "#8e8e93" }}
            animate={{ cx: [d.x0, d.x1, d.x1, d.x0], cy: [d.y0, d.y1, d.y1, d.y0], fill: ["#8e8e93", color, color, "#8e8e93"] }}
            transition={{ duration: DUR, times, repeat: Infinity, ease: [0.32, 0.72, 0, 1], delay: (i % 6) * 0.03 }} />
        );
      })}
    </svg>
  );
}

/** Dots pop in along a noisy trend, then a line swings from flat into the best fit with residuals. Loops. */
export function RegressionArt({ active }: { active: boolean }) {
  const pts = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 14 }, (_, i) => {
      const x = 20 + (i / 13) * (W - 40) + (r() - 0.5) * 8;
      const fit = H - 22 - (x - 20) * 0.45;
      return { x, y: fit + (r() - 0.5) * 30, fit };
    });
  }, []);
  const mid = H / 2 + 6;
  const yL = H - 22, yR = H - 22 - (W - 40) * 0.45;
  const t = { duration: DUR, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      {pts.map((p, i) => (
        <motion.line key={`r${i}`} x1={p.x} x2={p.x} y1={p.y} stroke="#BF5AF2" strokeWidth={1.4} strokeDasharray="2 2"
          animate={{ y2: [mid, mid, p.fit, p.fit, mid], opacity: [0, 0, active ? 0.8 : 0.5, active ? 0.8 : 0.5, 0] }}
          transition={{ ...t, times: [0, 0.4, 0.62, 0.88, 1] }} />
      ))}
      <motion.line x1={14} x2={W - 14} stroke="var(--accent)" strokeWidth={3} strokeLinecap="round"
        animate={{ y1: [mid, mid, yL + 3, yL + 3, mid], y2: [mid, mid, yR - 3, yR - 3, mid], opacity: [0, 1, 1, 1, 0] }}
        transition={{ ...t, times: [0, 0.3, 0.62, 0.88, 1] }} />
      {pts.map((p, i) => (
        <motion.circle key={i} cx={p.x} cy={p.y} r={5.5} fill="#5E5CE6" stroke="white" strokeWidth={1.4}
          animate={{ scale: [0, 1, 1, 1, 0], opacity: [0, 1, 1, 1, 0] }}
          transition={{ ...t, times: [0, 0.05 + i * 0.014, 0.5, 0.9, 1] }}
          style={{ originX: `${p.x}px`, originY: `${p.y}px` }} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ vision art */

const PIXEL_ART: { label: string; color: string; rows: string[] }[] = [
  { label: "star", color: "#FF9F0A", rows: ["...##...", "...##...", "########", ".######.", "..####..", ".##..##.", ".#....#.", "........"] },
  { label: "heart", color: "#FF375F", rows: ["........", ".##..##.", "########", "########", ".######.", "..####..", "...##...", "........"] },
  { label: "smiley", color: "#30D158", rows: ["..####..", ".#....#.", "#.#..#.#", "#......#", "#.#..#.#", "#..##..#", ".#....#.", "..####.."] },
];

/** Cycles through a few pictures: pixels pop in, a scan line sweeps, then a label chip pops out. */
export function ImageClassifyArt({ active }: { active: boolean }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setK((v) => (v + 1) % PIXEL_ART.length), 3400);
    return () => clearInterval(t);
  }, []);
  const art = PIXEL_ART[k];
  const S = 10, X0 = 34, Y0 = 25;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      <rect x={X0 - 7} y={Y0 - 7} width={8 * S + 14} height={8 * S + 14} rx={10} fill="var(--glass-strong)" stroke="var(--hairline)" />
      <AnimatePresence mode="wait">
        <motion.g key={k} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.25 }}>
          {art.rows.flatMap((row, r) => [...row].map((ch, c) => (ch === "#" ? (
            <motion.rect key={`${r}-${c}`} x={X0 + c * S + 0.5} y={Y0 + r * S + 0.5} width={S - 1} height={S - 1} rx={1.6} fill={art.color}
              initial={{ opacity: 0, scale: 0 }} animate={{ opacity: active ? 1 : 0.85, scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22, delay: (r + c) * 0.025 }} />
          ) : null)))}
          <motion.rect x={X0 - 4} width={8 * S + 8} height={3} rx={1.5} fill="var(--accent)"
            initial={{ y: Y0 - 3, opacity: 0 }} animate={{ y: [Y0 - 3, Y0 + 8 * S], opacity: [0, 0.9, 0.9, 0] }}
            transition={{ duration: 0.9, delay: 0.6, ease: "easeInOut" }} />
          <motion.line x1={X0 + 8 * S + 10} y1={Y0 + 4 * S} x2={150} y2={Y0 + 4 * S} stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="3 3"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 1.45, duration: 0.3 }} />
          <motion.g initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 16, delay: 1.7 }}>
            <rect x={150} y={Y0 + 4 * S - 15} width={68} height={30} rx={15} fill={art.color} />
            <text x={184} y={Y0 + 4 * S + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="white">{art.label}</text>
          </motion.g>
          <motion.text x={184} y={Y0 + 4 * S + 30} textAnchor="middle" fontSize={10} fill="var(--text-3)" fontWeight={600}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>
            {[96, 91, 88][k]}% sure
          </motion.text>
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}

const DOT_SETS = [
  [[0.5, 0.5], [0.22, 0.25], [0.78, 0.75]],
  [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  [[0.22, 0.2], [0.5, 0.2], [0.78, 0.2], [0.35, 0.5], [0.65, 0.5], [0.22, 0.8], [0.5, 0.8], [0.78, 0.8]],
];

/** A picture fills with dots, gets scanned, then the model answers with a number. Cycles. */
export function ImageNumberArt({ active }: { active: boolean }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setK((v) => (v + 1) % DOT_SETS.length), 3400);
    return () => clearInterval(t);
  }, []);
  const dots = DOT_SETS[k];
  const X0 = 27, Y0 = 18, S = 94;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      <rect x={X0} y={Y0} width={S} height={S} rx={12} fill="var(--glass-strong)" stroke="var(--hairline)" />
      <AnimatePresence mode="wait">
        <motion.g key={k} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {dots.map(([dx, dy], i) => (
            <motion.circle key={i} cx={X0 + 8 + dx * (S - 16)} cy={Y0 + 8 + dy * (S - 16)} r={8} fill={active ? "#5E5CE6" : "#7d7be8"}
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 520, damping: 18, delay: 0.1 + i * 0.08 }} />
          ))}
          <motion.rect y={Y0 + 3} width={3} height={S - 6} rx={1.5} fill="var(--accent)"
            initial={{ x: X0, opacity: 0 }} animate={{ x: [X0 + 2, X0 + S - 5], opacity: [0, 0.9, 0.9, 0] }}
            transition={{ duration: 0.9, delay: 0.85, ease: "easeInOut" }} />
          <motion.path d={`M ${X0 + S + 10} ${Y0 + S / 2} L 146 ${Y0 + S / 2}`} stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="3 3"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.6, duration: 0.3 }} />
          <motion.g initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 15, delay: 1.85 }}>
            <circle cx={180} cy={Y0 + S / 2} r={25} fill="url(#ina-grad)" />
            <text x={180} y={Y0 + S / 2 + 8} textAnchor="middle" fontSize={23} fontWeight={800} fill="white">{(dots.length + [0.1, -0.2, 0.3][k]).toFixed(1)}</text>
          </motion.g>
        </motion.g>
      </AnimatePresence>
      <defs>
        <linearGradient id="ina-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5E5CE6" /><stop offset="1" stopColor="#BF5AF2" /></linearGradient>
      </defs>
    </svg>
  );
}
