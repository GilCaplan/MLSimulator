/* Small looping SVG sketches for the lab gallery cards — one per lab. Static when the user turned motion down. */
import { motion } from "framer-motion";
import { useMemo } from "react";
import { colorAt } from "../../lib/colors";
import { rng } from "./targets";
import { useMotionFull } from "./theme";

const W = 280, H = 128;

export function LabSketch({ id }: { id: string }) {
  const live = useMotionFull();
  let body;
  switch (id) {
    case "gan": body = <GanSketch live={live} />; break;
    case "vae": body = <VaeSketch live={live} />; break;
    case "transfer": body = <TransferSketch live={live} />; break;
    case "bandit": body = <BanditSketch live={live} />; break;
    case "gridworld": body = <GridSketch live={live} />; break;
    default: body = null;
  }
  return (
    <div className="lab-sketch" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">{body}</svg>
    </div>
  );
}

const loop = (duration: number, delay = 0) => ({ duration, delay, repeat: Infinity, ease: "easeInOut" as const, repeatType: "loop" as const });

function GanSketch({ live }: { live: boolean }) {
  const cx = W / 2, cy = H / 2, R = 42;
  const dots = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 24 }, (_, i) => {
      const k = i % 8, a = (2 * Math.PI * k) / 8;
      return { sx: cx + r.normal(10), sy: cy + r.normal(10), tx: cx + R * Math.cos(a) + r.normal(4), ty: cy + R * Math.sin(a) + r.normal(4), d: r.u() * 0.6 };
    });
  }, []);
  return (
    <g>
      {Array.from({ length: 8 }, (_, k) => {
        const a = (2 * Math.PI * k) / 8;
        return <circle key={k} cx={cx + R * Math.cos(a)} cy={cy + R * Math.sin(a)} r={9} fill="var(--text-3)" opacity={0.25} />;
      })}
      {dots.map((d, i) => live ? (
        <motion.circle key={i} r={3} fill="var(--accent)" initial={{ cx: d.sx, cy: d.sy }}
          animate={{ cx: [d.sx, d.sx, d.tx, d.tx, d.sx], cy: [d.sy, d.sy, d.ty, d.ty, d.sy] }}
          transition={{ ...loop(5, d.d), times: [0, 0.1, 0.55, 0.85, 1] }} />
      ) : <circle key={i} cx={d.tx} cy={d.ty} r={3} fill="var(--accent)" />)}
    </g>
  );
}

function VaeSketch({ live }: { live: boolean }) {
  const pts = useMemo(() => {
    const r = rng(9);
    const centres = [[70, 40], [210, 44], [96, 96], [186, 92], [140, 64]];
    return Array.from({ length: 50 }, (_, i) => {
      const c = i % 5;
      return { c, sx: 140 + r.normal(24), sy: 64 + r.normal(16), tx: centres[c][0] + r.normal(9), ty: centres[c][1] + r.normal(7), d: r.u() * 0.4 };
    });
  }, []);
  return (
    <g>
      {pts.map((p, i) => live ? (
        <motion.circle key={i} r={3.2} fill={colorAt(p.c)} opacity={0.9} initial={{ cx: p.sx, cy: p.sy }}
          animate={{ cx: [p.sx, p.tx, p.tx, p.sx], cy: [p.sy, p.ty, p.ty, p.sy] }}
          transition={{ ...loop(6, p.d), times: [0, 0.45, 0.85, 1] }} />
      ) : <circle key={i} cx={p.tx} cy={p.ty} r={3.2} fill={colorAt(p.c)} opacity={0.9} />)}
    </g>
  );
}

function TransferSketch({ live }: { live: boolean }) {
  const curve = (top: number, speed: number) => {
    let d = "";
    for (let i = 0; i <= 24; i++) {
      const x = 24 + (i / 24) * (W - 48);
      const y = H - 18 - (H - 36 - top) * (1 - Math.exp(-speed * (i / 24)));
      d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  };
  const lines = [
    { d: curve(56, 2.2), c: "var(--text-3)", dash: "5 4" },
    { d: curve(30, 5), c: colorAt(1) },
    { d: curve(16, 4), c: colorAt(0) },
  ];
  return (
    <g>
      <line x1={24} x2={W - 24} y1={H - 18} y2={H - 18} stroke="var(--hairline)" />
      {lines.map((l, i) => live ? (
        <motion.path key={i} d={l.d} fill="none" stroke={l.c} strokeWidth={2.6} strokeLinecap="round" strokeDasharray={l.dash}
          initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1, 0] }} transition={{ ...loop(5, i * 0.25), times: [0, 0.5, 0.88, 1] }} />
      ) : <path key={i} d={l.d} fill="none" stroke={l.c} strokeWidth={2.6} strokeLinecap="round" strokeDasharray={l.dash} />)}
    </g>
  );
}

function BanditSketch({ live }: { live: boolean }) {
  const arms = [0.35, 0.8, 0.5, 0.2];
  const bw = 34, gap = 22, x0 = (W - (arms.length * bw + (arms.length - 1) * gap)) / 2;
  return (
    <g>
      {arms.map((v, i) => {
        const x = x0 + i * (bw + gap), hMax = 76, base = H - 18;
        const best = i === 1;
        return (
          <g key={i}>
            <rect x={x} y={base - hMax} width={bw} height={hMax} rx={8} fill="var(--fill-2)" />
            {live ? (
              <motion.rect x={x} width={bw} rx={8} fill={best ? "var(--accent)" : "var(--text-3)"}
                initial={{ y: base, height: 0 }}
                animate={{ y: [base, base - hMax * v, base - hMax * v, base], height: [0, hMax * v, hMax * v, 0] }}
                transition={{ ...loop(4.5, i * 0.2), times: [0, 0.5, 0.85, 1] }} />
            ) : <rect x={x} y={base - hMax * v} width={bw} height={hMax * v} rx={8} fill={best ? "var(--accent)" : "var(--text-3)"} />}
            <text x={x + bw / 2} y={base - hMax - 6} textAnchor="middle" fontSize={14}>🎰</text>
          </g>
        );
      })}
    </g>
  );
}

function GridSketch({ live }: { live: boolean }) {
  const cols = 7, rows = 3, s = 30, x0 = (W - cols * s) / 2, y0 = (H - rows * s) / 2;
  const route = [[0, 2], [1, 2], [2, 2], [2, 1], [3, 1], [4, 1], [4, 0], [5, 0], [6, 0]];
  const walls = [[1, 1], [3, 2], [3, 0], [5, 1], [5, 2]];
  const cx = (c: number) => x0 + c * s + s / 2, cy = (r: number) => y0 + r * s + s / 2;
  return (
    <g>
      {Array.from({ length: rows * cols }, (_, k) => {
        const c = k % cols, r = Math.floor(k / cols);
        const wall = walls.some(([wc, wr]) => wc === c && wr === r);
        return <rect key={k} x={x0 + c * s + 1.5} y={y0 + r * s + 1.5} width={s - 3} height={s - 3} rx={6} fill={wall ? "var(--text-3)" : "var(--fill-2)"} opacity={wall ? 0.5 : 1} />;
      })}
      <text x={cx(6)} y={cy(0) + 5} textAnchor="middle" fontSize={15}>⭐</text>
      <path d={route.map(([c, r], i) => `${i ? "L" : "M"}${cx(c)},${cy(r)}`).join("")} fill="none" stroke="var(--accent)" strokeOpacity={0.3} strokeWidth={3} strokeDasharray="3 5" />
      {live ? (
        <motion.circle r={8} fill="var(--accent)" initial={{ cx: cx(0), cy: cy(2) }}
          animate={{ cx: [...route.map(([c]) => cx(c)), cx(6)], cy: [...route.map(([, r]) => cy(r)), cy(0)] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }} />
      ) : <circle cx={cx(0)} cy={cy(2)} r={8} fill="var(--accent)" />}
    </g>
  );
}
