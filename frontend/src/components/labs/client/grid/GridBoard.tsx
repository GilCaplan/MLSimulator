import { motion } from "framer-motion";
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { spring } from "../../../../design/motion";
import { ARROW_DEG, CELLS, EMPTY, GOAL, N, PIT, WALL, confidence, maxQ, rc, type Cell, type World } from "./qlearn";

const GREEN = "var(--success)", RED = "var(--danger)";
const wash = (c: string, a: number) => `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;

/** Cell colour for a state value (max Q): green for good, red for bad, stronger = further from 0. */
function heat(v: number) {
  const t = Math.max(-1, Math.min(1, v / 10));
  if (Math.abs(t) < 0.004) return "transparent";
  return wash(t > 0 ? GREEN : RED, 0.08 + 0.6 * Math.abs(t) ** 0.75);
}

/** The editable 8×8 world with the value heatmap, best-action arrows, the robot and its trail. */
export function GridBoard({ world, Q, qVersion, robot, trail, showHeat, showArrows, animateRobot, robotTween, onCycle, onMoveStart, robotMood }: {
  world: World;
  Q: Float64Array;
  /** changes whenever Q changes (memo key) */
  qVersion: number;
  robot: number;
  trail: number[];
  showHeat: boolean;
  showArrows: boolean;
  animateRobot: boolean;
  /** seconds per move tween when animating */
  robotTween: number;
  onCycle: (cell: number) => void;
  onMoveStart: (cell: number) => void;
  robotMood: "normal" | "goal" | "pit";
}) {
  void qVersion;
  const board = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const downCell = useRef<number | null>(null);

  const cellAt = (e: RPointerEvent) => {
    const el = board.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = Math.floor(((e.clientX - r.left) / r.width) * N), row = Math.floor(((e.clientY - r.top) / r.height) * N);
    return c < 0 || c >= N || row < 0 || row >= N ? null : row * N + c;
  };

  const onDown = (e: RPointerEvent) => {
    const cell = cellAt(e);
    downCell.current = cell;
    if (cell === world.start) {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      setDragging(true);
    }
  };
  const onMove = (e: RPointerEvent) => {
    if (!dragging) return;
    const cell = cellAt(e);
    if (cell !== null && cell !== world.start && world.cells[cell] === EMPTY) onMoveStart(cell);
  };
  const onUp = (e: RPointerEvent) => {
    const cell = cellAt(e);
    if (dragging) setDragging(false);
    else if (cell !== null && cell === downCell.current && cell !== world.start) onCycle(cell);
    downCell.current = null;
  };

  const [rr, rcol] = rc(robot);
  const tween = animateRobot ? (robotTween > 0.12 ? spring.snappy : { duration: robotTween, ease: "linear" as const }) : { duration: 0 };
  const trailPts = trail.map((s) => { const [r, c] = rc(s); return `${c + 0.5},${r + 0.5}`; }).join(" ");

  return (
    <div ref={board} role="application" aria-label="Grid world: click a cell to cycle empty, wall, pit, goal; drag the house to move the start"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDragging(false)}
      style={{ position: "relative", containerType: "inline-size", width: "100%", maxWidth: 480, aspectRatio: "1 / 1", margin: "0 auto", touchAction: "none", userSelect: "none",
        borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--hairline)", background: "var(--glass-strong)", cursor: dragging ? "grabbing" : "pointer" }}>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${N}, 1fr)`, gridTemplateRows: `repeat(${N}, 1fr)` }}>
        {Array.from({ length: CELLS }, (_, s) => (
          <CellView key={s} type={world.cells[s]} isStart={s === world.start} value={maxQ(Q, s)} showHeat={showHeat} touched={!confidence(Q, s).untouched} />
        ))}
      </div>

      {/* arrows + trail overlay, in cell units */}
      <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {showArrows && Array.from({ length: CELLS }, (_, s) => {
          if (world.cells[s] !== EMPTY) return null;
          const { best, conf, untouched } = confidence(Q, s);
          if (untouched || conf < 0.02) return null;
          const [r, c] = rc(s);
          const len = 0.18 + 0.24 * conf;
          return (
            <g key={s} transform={`translate(${c + 0.5} ${r + 0.5}) rotate(${ARROW_DEG[best]})`} opacity={0.35 + 0.6 * conf}>
              <line x1={0} y1={len} x2={0} y2={-len + 0.06} stroke="var(--text)" strokeWidth={0.07} strokeLinecap="round" />
              <path d={`M ${-0.11 - 0.05 * conf} ${-len + 0.13} L 0 ${-len - 0.04} L ${0.11 + 0.05 * conf} ${-len + 0.13}`} fill="none" stroke="var(--text)" strokeWidth={0.07} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {trail.length > 1 && (
          <polyline points={trailPts} fill="none" stroke="var(--accent)" strokeWidth={0.09} strokeOpacity={0.75} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>

      {/* the robot */}
      <motion.div aria-hidden initial={false} animate={{ left: `${(rcol / N) * 100}%`, top: `${(rr / N) * 100}%` }} transition={tween}
        style={{ position: "absolute", width: `${100 / N}%`, height: `${100 / N}%`, display: "grid", placeItems: "center", pointerEvents: "none" }}>
        <span style={{ fontSize: "clamp(14px, 7.5cqw, 34px)", lineHeight: 1, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.35))",
          transform: robotMood === "pit" ? "scale(.7) rotate(-20deg)" : robotMood === "goal" ? "scale(1.15)" : "none", transition: animateRobot ? "transform .2s" : "none" }}>
          {robotMood === "pit" ? "😵" : "🤖"}
        </span>
      </motion.div>
    </div>
  );
}

function CellView({ type, isStart, value, showHeat, touched }: { type: Cell; isStart: boolean; value: number; showHeat: boolean; touched: boolean }) {
  let bg = "transparent", icon: string | null = null, tag: string | null = null;
  if (type === WALL) bg = "color-mix(in srgb, var(--text) 36%, transparent)";
  else if (type === PIT) { bg = wash(RED, 0.22); icon = "🕳️"; tag = "−10"; }
  else if (type === GOAL) { bg = wash(GREEN, 0.28); icon = "💎"; tag = "+10"; }
  else if (showHeat && touched) bg = heat(value);
  return (
    <div title={type === EMPTY && touched ? `value ${value.toFixed(2)}` : undefined}
      style={{ position: "relative", background: bg, boxShadow: "inset 0 0 0 0.5px var(--hairline)", display: "grid", placeItems: "center", transition: "background .25s" }}>
      {icon && <span style={{ fontSize: "clamp(11px, 6cqw, 28px)", lineHeight: 1 }}>{icon}</span>}
      {tag && <span className="num" style={{ position: "absolute", bottom: 1, right: 3, fontSize: "clamp(7px, 2.2cqw, 11px)", fontWeight: 700, color: "var(--text-2)" }}>{tag}</span>}
      {isStart && <span title="start — drag to move" style={{ position: "absolute", top: 1, left: 2, fontSize: "clamp(9px, 3.4cqw, 16px)", lineHeight: 1, cursor: "grab" }}>🏠</span>}
    </div>
  );
}
