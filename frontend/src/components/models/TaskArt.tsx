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

/* ------------------------------------------------------------------ discover (unsupervised) art */

const GROUPS = [
  { cx: 54, cy: 46, color: "#0A84FF" },
  { cx: 160, cy: 40, color: "#FF375F" },
  { cx: 112, cy: 98, color: "#30D158" },
];

/** Grey dots drift together into three coloured groups; halos and centre marks appear, then it all relaxes. Loops. */
export function ClusteringArt({ active }: { active: boolean }) {
  const dots = useMemo(() => {
    const r = rng(23);
    return Array.from({ length: 27 }, (_, i) => {
      const g = GROUPS[i % 3];
      const a = r() * Math.PI * 2;
      const d = 4 + r() * 19;
      return { g, x0: 16 + r() * (W - 32), y0: 12 + r() * (H - 24), x1: g.cx + Math.cos(a) * d, y1: g.cy + Math.sin(a) * d * 0.85 };
    });
  }, []);
  const times = [0, 0.3, 0.84, 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      {GROUPS.map((g, i) => (
        <motion.ellipse key={`h${i}`} cx={g.cx} cy={g.cy} rx={30} ry={26} fill={g.color} stroke={g.color} strokeWidth={1.5} strokeDasharray="4 4"
          animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.6, 0.6, 1, 1, 0.8] }}
          transition={{ duration: DUR, times: [0, 0.3, 0.46, 0.84, 1], repeat: Infinity, ease: "easeOut", delay: i * 0.08 }}
          style={{ originX: `${g.cx}px`, originY: `${g.cy}px`, fillOpacity: active ? 0.14 : 0.09, strokeOpacity: 0.5 }} />
      ))}
      {dots.map((d, i) => (
        <motion.circle key={i} r={5} stroke="white" strokeWidth={1.3}
          initial={{ cx: d.x0, cy: d.y0, fill: "#8e8e93" }}
          animate={{ cx: [d.x0, d.x1, d.x1, d.x0], cy: [d.y0, d.y1, d.y1, d.y0], fill: ["#8e8e93", d.g.color, d.g.color, "#8e8e93"] }}
          transition={{ duration: DUR, times, repeat: Infinity, ease: [0.32, 0.72, 0, 1], delay: (i % 7) * 0.025 }} />
      ))}
      {GROUPS.map((g, i) => (
        <motion.g key={`c${i}`} animate={{ opacity: [0, 0, 1, 1, 0], scale: [0, 0, 1, 1, 0] }}
          transition={{ duration: DUR, times: [0, 0.38, 0.5, 0.84, 1], repeat: Infinity, delay: i * 0.1 }}
          style={{ originX: `${g.cx}px`, originY: `${g.cy}px` }}>
          <circle cx={g.cx} cy={g.cy} r={7} fill="var(--glass-strong)" stroke={g.color} strokeWidth={2} />
          <path d={`M${g.cx - 3.5} ${g.cy}h7M${g.cx} ${g.cy - 3.5}v7`} stroke={g.color} strokeWidth={2} strokeLinecap="round" />
        </motion.g>
      ))}
    </svg>
  );
}

/** A tilted 3-D cloud (with a wireframe box) flattens onto a 2-D map while neighbours stay neighbours. Loops. */
export function MapArt({ active }: { active: boolean }) {
  const pts = useMemo(() => {
    const r = rng(41);
    const cols = ["#0A84FF", "#BF5AF2", "#FF9F0A"];
    return Array.from({ length: 30 }, (_, i) => {
      const g = i % 3;
      // 3-D blob centres, projected obliquely; map positions keep the groups apart
      const c3 = [[-0.6, 0.4, -0.5], [0.5, -0.3, 0.6], [0.2, 0.6, 0.5]][g];
      const [x, y, z] = c3.map((c) => c + (r() - 0.5) * 0.55);
      const px = 110 + x * 62 + z * 26, py = 58 - y * 34 + z * 15;
      const mx = [62, 158, 112][g] + (r() - 0.5) * 34, my = [104, 100, 90][g] + (r() - 0.5) * 16;
      return { color: cols[g], px, py, mx, my, rz: 3.2 + (z + 1) * 1.6 };
    });
  }, []);
  const t = { duration: DUR, repeat: Infinity, ease: [0.32, 0.72, 0, 1] as const };
  const times = [0, 0.32, 0.82, 1];
  // oblique wireframe box around the cloud
  const box = "M58 28 L150 28 L176 44 L84 44 Z M58 28 L58 84 L84 100 L176 100 L176 44 M84 44 L84 100 M58 84 L150 84 L150 28 M150 84 L176 100";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      <motion.path d={box} fill="none" stroke="var(--text-3)" strokeWidth={1.1} strokeDasharray="3 3"
        animate={{ opacity: [0.7, 0.7, 0, 0, 0.7] }} transition={{ ...t, times: [0, 0.22, 0.38, 0.86, 1] }} />
      <motion.g animate={{ opacity: [0, 0, 1, 1, 0], y: [10, 10, 0, 0, 10] }} transition={{ ...t, times: [0, 0.26, 0.44, 0.84, 1] }}>
        <path d={`M24 ${H - 46} L${W - 24} ${H - 46} L${W - 8} ${H - 8} L8 ${H - 8} Z`} fill="var(--glass-strong)" stroke="var(--hairline)" />
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={24 + (8 - 24) * f} y1={H - 46 + 38 * f} x2={W - 24 + 16 * f} y2={H - 46 + 38 * f} stroke="var(--hairline)" />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line key={`v${f}`} x1={24 + (W - 48) * f} y1={H - 46} x2={8 + (W - 16) * f} y2={H - 8} stroke="var(--hairline)" />
        ))}
      </motion.g>
      {pts.map((p, i) => (
        <motion.circle key={i} fill={p.color} stroke="white" strokeWidth={1.1}
          initial={{ cx: p.px, cy: p.py, r: p.rz }}
          animate={{ cx: [p.px, p.mx, p.mx, p.px], cy: [p.py, p.my, p.my, p.py], r: [p.rz, 4.2, 4.2, p.rz], opacity: active ? 1 : 0.9 }}
          transition={{ ...t, times, delay: (i % 6) * 0.03 }} />
      ))}
      <motion.text x={W - 6} y={16} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--text-3)"
        animate={{ opacity: [1, 1, 0, 0, 1] }} transition={{ ...t, times: [0, 0.22, 0.32, 0.88, 1] }}>many columns</motion.text>
      <motion.text x={W - 6} y={16} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--accent)"
        animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ ...t, times: [0, 0.34, 0.46, 0.84, 1] }}>a 2-D map</motion.text>
    </svg>
  );
}

/** A calm crowd of dots breathes inside a dashed "normal" boundary; one far-off dot glows red. Loops. */
export function AnomalyArt({ active }: { active: boolean }) {
  const crowd = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: 30 }, () => {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      return { x: 84 + Math.cos(a) * d * 50, y: 68 + Math.sin(a) * d * 32, k: r() };
    });
  }, []);
  const ox = 186, oy = 30;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      <motion.ellipse cx={84} cy={68} rx={62} ry={42} fill="none" stroke="var(--success)" strokeWidth={1.6} strokeDasharray="5 5"
        animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.8, 0.8, 0] }}
        transition={{ duration: DUR, times: [0, 0.3, 0.85, 1], repeat: Infinity, ease: "easeInOut" }} />
      {crowd.map((c, i) => (
        <motion.circle key={i} cx={c.x} cy={c.y} r={4.6} fill="#64D2FF" stroke="white" strokeWidth={1.2}
          animate={{ cx: [c.x, c.x + (c.k - 0.5) * 6, c.x], cy: [c.y, c.y + (0.5 - c.k) * 5, c.y] }}
          transition={{ duration: 2.6 + c.k * 1.6, repeat: Infinity, ease: "easeInOut" }} />
      ))}
      <motion.line x1={146} y1={52} x2={ox - 8} y2={oy + 5} stroke="#FF453A" strokeWidth={1.4} strokeDasharray="3 3"
        animate={{ pathLength: [0, 0, 1, 1, 0], opacity: [0, 0, 0.8, 0.8, 0] }}
        transition={{ duration: DUR, times: [0, 0.35, 0.5, 0.85, 1], repeat: Infinity }} />
      <motion.circle cx={ox} cy={oy} fill="none" stroke="#FF453A" strokeWidth={2}
        animate={{ r: [7, 22], opacity: [active ? 0.9 : 0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }} />
      <circle cx={ox} cy={oy} r={11} fill="#FF453A" opacity={0.18} style={{ filter: "blur(3px)" }} />
      <motion.circle cx={ox} cy={oy} r={6} fill="#FF453A" stroke="white" strokeWidth={1.4}
        animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ originX: `${ox}px`, originY: `${oy}px` }} />
      <motion.g animate={{ opacity: [0, 0, 1, 1, 0], y: [4, 4, 0, 0, 4] }} transition={{ duration: DUR, times: [0, 0.45, 0.55, 0.85, 1], repeat: Infinity }}>
        <rect x={ox - 30} y={oy + 13} width={60} height={20} rx={10} fill="#FF453A" />
        <text x={ox} y={oy + 27} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="white">unusual!</text>
      </motion.g>
    </svg>
  );
}

/* ------------------------------------------------------------------ language art */

const MESSAGES: { words: string[]; key: number[]; label: string; color: string }[] = [
  { words: ["the", "battery", "is", "not", "great"], key: [3, 4], label: "negative", color: "#FF375F" },
  { words: ["win", "a", "free", "prize", "now"], key: [0, 2, 3], label: "spam", color: "#FF9F0A" },
  { words: ["love", "this", "lamp", "so", "much"], key: [0], label: "positive", color: "#30D158" },
  { words: ["my", "parcel", "never", "arrived"], key: [1, 3], label: "shipping", color: "#0A84FF" },
];

/** A chat bubble types out a message, the telling words light up, then a label chip pops out. Cycles through messages. */
export function TextClassifyArt({ active }: { active: boolean }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setK((v) => (v + 1) % MESSAGES.length), 3600);
    return () => clearInterval(t);
  }, []);
  const msg = MESSAGES[k];
  // lay the words out in rows inside the bubble (≈6.3 px per character at 11.5 px)
  const BX = 10, BY = 22, BW = 128, PAD = 9, GAP = 4, CH = 19;
  const chips = useMemo(() => {
    let x = BX + PAD, y = BY + PAD;
    return msg.words.map((w) => {
      const wd = w.length * 6.3 + 12;
      if (x + wd > BX + BW - PAD) { x = BX + PAD; y += CH + GAP; }
      const c = { w, x, y, wd };
      x += wd + GAP;
      return c;
    });
  }, [msg]);
  const BH = chips[chips.length - 1].y + CH + PAD - BY;
  const midY = BY + BH / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      <path d={`M ${BX + 14} ${BY + BH} l -8 10 l 18 -10 z`} fill="var(--glass-strong)" stroke="var(--hairline)" />
      <rect x={BX} y={BY} width={BW} height={BH} rx={14} fill="var(--glass-strong)" stroke="var(--hairline)" />
      <AnimatePresence mode="wait">
        <motion.g key={k} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
          {chips.map((c, i) => {
            const isKey = msg.key.includes(i);
            return (
              <motion.g key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.1 + i * 0.13 }}>
                <motion.rect x={c.x} y={c.y} width={c.wd} height={CH} rx={6}
                  initial={{ fill: "rgba(142,142,147,0.16)" }}
                  animate={{ fill: isKey ? ["rgba(142,142,147,0.16)", "rgba(142,142,147,0.16)", msg.color] : "rgba(142,142,147,0.16)" }}
                  transition={{ duration: 1.6, times: [0, 0.75, 1], delay: 0.1 + i * 0.13 }} />
                <motion.text x={c.x + c.wd / 2} y={c.y + 13.2} textAnchor="middle" fontSize={11.5} fontWeight={600}
                  initial={{ fill: "var(--text)" }} animate={{ fill: isKey ? ["var(--text)", "var(--text)", "#ffffff"] : "var(--text)" }}
                  transition={{ duration: 1.6, times: [0, 0.75, 1], delay: 0.1 + i * 0.13 }}>{c.w}</motion.text>
              </motion.g>
            );
          })}
          {/* reading cursor sweeping across the words */}
          <motion.rect width={2} height={CH} rx={1} fill="var(--accent)"
            initial={{ x: chips[0].x, y: chips[0].y, opacity: 0 }}
            animate={{ x: chips.map((c) => c.x + c.wd + 1), y: chips.map((c) => c.y), opacity: [...chips.map(() => 1).slice(0, -1), 0] }}
            transition={{ duration: 0.13 * chips.length + 0.2, delay: 0.1, ease: "linear" }} />
          <motion.line x1={BX + BW + 6} y1={midY} x2={150} y2={midY} stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="3 3"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: 1.75, duration: 0.3 }} />
          <motion.g initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: active ? 1.06 : 1 }} transition={{ type: "spring", stiffness: 420, damping: 16, delay: 2 }}
            style={{ originX: "185px", originY: `${midY}px` }}>
            <rect x={151} y={midY - 15} width={68} height={30} rx={15} fill={msg.color} />
            <text x={185} y={midY + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="white">{msg.label}</text>
          </motion.g>
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}

/* ------------------------------------------------------------------ recommendation art */

const POSTER_COLORS = ["#FF375F", "#0A84FF", "#30D158", "#FF9F0A", "#BF5AF2", "#64D2FF", "#5E5CE6"];

/** A tiny film poster: coloured card with a sun-and-hills picture on it. */
function Poster({ x, y, w, h, color, glow }: { x: number; y: number; w: number; h: number; color: string; glow?: boolean }) {
  return (
    <g>
      {glow && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={7} fill={color} opacity={0.22} />}
      <rect x={x} y={y} width={w} height={h} rx={4.5} fill={color} />
      <rect x={x} y={y} width={w} height={h * 0.45} rx={4.5} fill="white" opacity={0.18} />
      <circle cx={x + w * 0.7} cy={y + h * 0.3} r={w * 0.12} fill="white" opacity={0.85} />
      <path d={`M ${x + 2} ${y + h - 4} L ${x + w * 0.38} ${y + h * 0.55} L ${x + w * 0.62} ${y + h * 0.78} L ${x + w * 0.78} ${y + h * 0.64} L ${x + w - 2} ${y + h - 4} Z`} fill="white" opacity={0.55} />
    </g>
  );
}

function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
  }).join(" ");
  return <polygon points={pts} fill={fill} stroke="white" strokeWidth={0.8} strokeLinejoin="round" />;
}

/** A person stars a few posters, then a row of suggested posters slides in underneath — "you'll like these". Loops. */
export function RecommendArt({ active }: { active: boolean }) {
  const D = 5.6;
  const liked = [{ x: 58, c: POSTER_COLORS[0] }, { x: 90, c: POSTER_COLORS[1] }, { x: 122, c: POSTER_COLORS[4] }];
  const recs = [{ x: 58, c: POSTER_COLORS[3] }, { x: 96, c: POSTER_COLORS[2] }, { x: 134, c: POSTER_COLORS[6] }, { x: 172, c: POSTER_COLORS[5] }];
  const loop = { duration: D, repeat: Infinity, ease: [0.32, 0.72, 0, 1] as const };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      {/* the viewer */}
      <motion.g animate={{ y: [0, -2, 0, 0] }} transition={{ duration: D, times: [0, 0.1, 0.2, 1], repeat: Infinity }}>
        <circle cx={26} cy={30} r={10} fill="#5E5CE6" />
        <path d="M 8 62 Q 8 44 26 44 Q 44 44 44 62 Z" fill="#5E5CE6" opacity={0.85} />
        <circle cx={22.5} cy={29} r={1.4} fill="white" />
        <circle cx={29.5} cy={29} r={1.4} fill="white" />
        <path d="M 22 33.5 Q 26 36.5 30 33.5" stroke="white" strokeWidth={1.3} fill="none" strokeLinecap="round" />
      </motion.g>
      {/* posters they rated, each earning a star */}
      {liked.map((p, i) => (
        <g key={i}>
          <Poster x={p.x} y={14} w={26} h={36} color={p.c} />
          <motion.g style={{ originX: `${p.x + 24}px`, originY: "14px" }}
            animate={{ scale: [0, 0, 1.35, 1, 1, 0], opacity: [0, 0, 1, 1, 1, 0] }}
            transition={{ duration: D, times: [0, 0.06 + i * 0.08, 0.12 + i * 0.08, 0.16 + i * 0.08, 0.9, 1], repeat: Infinity }}>
            <Star cx={p.x + 24} cy={14} r={7} fill="#FFD60A" />
          </motion.g>
        </g>
      ))}
      {/* taste "thinking" dots */}
      {[0, 1, 2].map((k) => (
        <motion.circle key={k} cx={166 + k * 9} cy={32} r={2.6} fill="var(--text-3)"
          animate={{ opacity: [0, 0, 1, 0.3, 0, 0], y: [0, 0, -3, 0, 0, 0] }}
          transition={{ duration: D, times: [0, 0.34 + k * 0.03, 0.4 + k * 0.03, 0.46 + k * 0.03, 0.52, 1], repeat: Infinity }} />
      ))}
      {/* "for you" label + dashed hand-off line */}
      <motion.path d="M 40 66 Q 40 82 52 86" stroke="var(--accent)" strokeWidth={1.6} strokeDasharray="3 3" fill="none" strokeLinecap="round"
        animate={{ pathLength: [0, 0, 1, 1, 0], opacity: [0, 0, 1, 1, 0] }}
        transition={{ duration: D, times: [0, 0.44, 0.52, 0.9, 1], repeat: Infinity }} />
      <motion.text x={14} y={104} fontSize={9.5} fontWeight={700} fill="var(--accent)"
        animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ duration: D, times: [0, 0.46, 0.54, 0.9, 1], repeat: Infinity }}>
        For you
      </motion.text>
      {/* suggestions sliding in */}
      {recs.map((p, i) => (
        <motion.g key={i}
          animate={{ x: [60, 60, 0, 0, -20], opacity: [0, 0, 1, 1, 0] }}
          transition={{ ...loop, times: [0, 0.5 + i * 0.05, 0.62 + i * 0.05, 0.9, 1] }}>
          <Poster x={p.x} y={74} w={30} h={42} color={p.c} glow={active && i === 0} />
          {i === 0 && (
            <motion.g animate={{ scale: [1, 1.25, 1], rotate: [0, 20, 0] }} transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6 }}
              style={{ originX: `${p.x + 30}px`, originY: "74px" }}>
              <text x={p.x + 30} y={78} fontSize={12} textAnchor="middle">✨</text>
            </motion.g>
          )}
        </motion.g>
      ))}
    </svg>
  );
}

/** A weekly-rhythm line draws itself up to "now", then a dashed forecast continues it inside a widening band. Loops. */
export function ForecastArt({ active }: { active: boolean }) {
  const D = 5.4;
  const NOW = 136;
  const y = (i: number) => 82 - i * 0.9 - [0, -6, 4, 10, 18, 30, 14][i % 7] * 0.9;
  const hist = Array.from({ length: 22 }, (_, i) => ({ x: 12 + i * 5.9, y: y(i) }));
  const fut = Array.from({ length: 14 }, (_, k) => ({ x: NOW + k * 5.9, y: y(22 + k), w: 3 + k * 1.6 }));
  const d = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
  const band = `${d(fut.map((p) => ({ x: p.x, y: p.y - p.w })))}${fut.slice().reverse().map((p) => `L${p.x.toFixed(1)},${(p.y + p.w).toFixed(1)}`).join("")}Z`;
  const loop = { duration: D, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: "visible" }}>
      <rect x={NOW} y={6} width={W - NOW - 6} height={H - 16} rx={8} fill="var(--accent-soft)" opacity={active ? 0.9 : 0.55} />
      <motion.path d={band} fill="#FF9F0A" animate={{ opacity: [0, 0, active ? 0.28 : 0.18, active ? 0.28 : 0.18, 0] }} transition={{ ...loop, times: [0, 0.5, 0.7, 0.9, 1] }} />
      <motion.path d={d(hist)} fill="none" stroke="var(--accent)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"
        animate={{ pathLength: [0, 1, 1, 1, 0], opacity: [1, 1, 1, 1, 0] }} transition={{ ...loop, times: [0, 0.42, 0.5, 0.9, 1] }} />
      <motion.line x1={NOW} x2={NOW} y1={4} y2={H - 8} stroke="var(--text-2)" strokeWidth={1.5} strokeDasharray="3 3"
        animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ ...loop, times: [0, 0.4, 0.46, 0.9, 1] }} />
      <motion.text x={NOW - 4} y={H - 2} fontSize={9.5} fontWeight={700} textAnchor="end" fill="var(--text-2)"
        animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ ...loop, times: [0, 0.4, 0.46, 0.9, 1] }}>now</motion.text>
      <motion.text x={NOW + 6} y={18} fontSize={9.5} fontWeight={700} fill="#E08A00"
        animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ ...loop, times: [0, 0.55, 0.62, 0.9, 1] }}>next?</motion.text>
      <motion.path d={d([hist[hist.length - 1], ...fut])} fill="none" stroke="#FF9F0A" strokeWidth={2.4} strokeDasharray="4 3" strokeLinecap="round"
        animate={{ pathLength: [0, 0, 1, 1, 0], opacity: [0, 0, 1, 1, 0] }} transition={{ ...loop, times: [0, 0.48, 0.74, 0.9, 1] }} />
    </svg>
  );
}
