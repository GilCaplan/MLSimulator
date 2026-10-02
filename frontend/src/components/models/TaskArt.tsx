import { motion } from "framer-motion";
import { useMemo } from "react";

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
