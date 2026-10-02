import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../design/motion";
import { compact } from "../../lib/format";
import { useProject } from "../../lib/store";
import type { NNArch, Task } from "../../lib/types";
import { Slider, Toggle } from "../glass";
import { convOutShape, resnetStages } from "./archLayers";
import { useIoShape } from "./meta";

const pctFmt = (v: number) => `${Math.round(v * 100)}%`;

/** cnn2d: flatten the feature maps vs. average each one (global average pooling), with the weight cost of each. */
export function GlobalPoolCard({ arch, onChange }: { arch: NNArch; onChange: (a: NNArch) => void }) {
  const task = useProject((s) => (s.project?.task ?? null) as Task | null);
  const { imageShape } = useIoShape(task);
  const on = !!arch.global_pool;
  const shape = convOutShape(arch, imageShape);
  const firstDense = arch.layers?.find((l) => l.type === "dense");
  const next = firstDense && firstDense.type === "dense" ? firstDense.units : 1;
  const flat = shape ? shape.reduce((a, b) => a * b, 1) : null;
  const pooled = shape ? shape[0] : null;
  return (
    <div className="inset col" style={{ padding: 14, gap: 12, borderLeft: "3px solid #BF5AF2" }}>
      <Toggle label={<>🎯 Global average pooling</>}
        help="Instead of unrolling every feature map into one long list, average each map into a single number: 'how much of this pattern is in the picture anywhere?'"
        checked={on} onChange={(global_pool) => onChange({ ...arch, global_pool })} />
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        <PoolPicture on={on} />
        <p className="small muted grow" style={{ lineHeight: 1.5 }}>
          {on
            ? <>Each filter's map is <b>averaged into one number</b>. The answer no longer depends on <i>where</i> a pattern appears — a star top-left counts the same as a star bottom-right — and it needs <b>far fewer weights</b>.</>
            : <>Every value of every map is <b>unrolled into one long list</b>. The dense layer learns a separate weight for each position, so a pattern in a new place looks brand new — and it costs lots of weights.</>}
        </p>
      </div>
      {flat !== null && pooled !== null && (
        <div className="row wrap small" style={{ gap: 8 }}>
          <Cost active={!on} label="Flatten" detail={`${shape!.join("×")} = ${flat.toLocaleString()} numbers`} weights={flat * next} />
          <Cost active={on} label="Average" detail={`${pooled} numbers`} weights={pooled * next} />
        </div>
      )}
    </div>
  );
}

function Cost({ active, label, detail, weights }: { active: boolean; label: string; detail: string; weights: number }) {
  return (
    <motion.div animate={{ opacity: active ? 1 : 0.5, scale: active ? 1 : 0.97 }} transition={spring.snappy}
      className="col" style={{ flex: "1 1 150px", padding: "8px 10px", borderRadius: 10, gap: 1, background: active ? "rgba(191,90,242,.12)" : "var(--fill)" }}>
      <span className="tiny" style={{ fontWeight: 650 }}>{label}{active && " ✓"}</span>
      <span className="tiny muted num">{detail}</span>
      <span className="num" style={{ fontWeight: 650 }}>{compact(weights)} <span className="tiny muted">weights into the next layer</span></span>
    </motion.div>
  );
}

/** Three little feature maps either unrolling into a long strip or collapsing into three dots. */
function PoolPicture({ on }: { on: boolean }) {
  const colors = ["#FF9F0A", "#BF5AF2", "#0A84FF"];
  return (
    <svg width={118} height={78} className="inset" style={{ flexShrink: 0, borderRadius: 12 }}>
      {colors.map((c, m) => (
        <g key={m}>
          {Array.from({ length: 9 }, (_, k) => {
            const gx = 8 + (k % 3) * 7 + m * 4, gy = 8 + Math.floor(k / 3) * 7 + m * 4;
            const fx = 8 + (m * 9 + k) * 3.7, fy = 64;
            const px = 80 + 0, py = 16 + m * 20;
            return (
              <motion.rect key={k} width={6} height={6} rx={1.2} fill={c}
                animate={on ? { x: [gx, px], y: [gy, py], opacity: [0.9, 0], scale: 1 } : { x: [gx, fx], y: [gy, fy], opacity: 0.9 }}
                transition={{ duration: 0.9, delay: k * 0.03, repeat: Infinity, repeatType: "reverse", repeatDelay: 1.2 }} />
            );
          })}
          <AnimatePresence>
            {on && (
              <motion.circle key="dot" cx={100} cy={19 + m * 20} r={6} fill={c} initial={{ scale: 0 }} animate={{ scale: [0, 0, 1] }} exit={{ scale: 0 }}
                transition={{ duration: 0.9, times: [0, 0.6, 1] }} />
            )}
          </AnimatePresence>
        </g>
      ))}
    </svg>
  );
}

/** Tiny ResNet: width / stages / blocks / dropout sliders, a residual-block explainer and the stage pyramid. */
export function ResNetBuilder({ arch, onChange }: { arch: NNArch; onChange: (a: NNArch) => void }) {
  const task = useProject((s) => (s.project?.task ?? null) as Task | null);
  const { imageShape } = useIoShape(task);
  const set = (p: Partial<NNArch>) => onChange({ ...arch, ...p });
  const stages = resnetStages(arch, imageShape);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        <ResidualPicture />
        <p className="small muted grow" style={{ lineHeight: 1.55 }}>
          Each <b>residual block</b> runs the picture through two small conv layers, then <b>adds the original back on</b> via a
          skip connection. The block only has to learn a <i>correction</i>, so signals and learning flow easily through many layers —
          the trick behind most modern vision models.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 22px" }}>
        <Slider label="Width" help="How many filters the first stage has. Each later stage doubles it. Wider = more patterns, more weights."
          value={arch.width ?? 16} min={8} max={64} log integer onChange={(v) => set({ width: v })} />
        <Slider label="Stages" help="Each new stage halves the picture's size and doubles the filters — zooming out to see bigger parts."
          value={arch.stages ?? 3} min={1} max={4} integer onChange={(v) => set({ stages: v })} />
        <Slider label="Blocks per stage" help="How many residual blocks are stacked in each stage. More = deeper and slower."
          value={arch.blocks ?? 1} min={1} max={3} integer onChange={(v) => set({ blocks: v })} />
        <Slider label="Dropout" help="Randomly drops some of the final features while training to fight overfitting."
          value={arch.dropout ?? 0.1} min={0} max={0.5} step={0.05} format={pctFmt} onChange={(v) => set({ dropout: v })} />
      </div>

      <div className="col" style={{ gap: 8 }}>
        <span className="eyebrow">What each stage sees</span>
        <div className="inset row" style={{ padding: "12px 10px", gap: 6, alignItems: "flex-end", overflowX: "auto", minHeight: 112 }}>
          <AnimatePresence initial={false}>
            {stages.map((st, i) => {
              const box = Math.max(16, Math.min(64, st.size * 2));
              const depth = Math.min(8, 2 + Math.log2(st.channels / 8) * 1.4);
              return (
                <motion.div key={i} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring.snappy}
                  className="col" style={{ alignItems: "center", gap: 6, flex: "1 0 70px" }}>
                  <div style={{ position: "relative", width: box + depth * 3, height: box + depth * 3 }}>
                    {Array.from({ length: Math.round(depth) }, (_, k) => (
                      <motion.div key={k} layout style={{ position: "absolute", left: k * 3, bottom: k * 3, width: box, height: box, borderRadius: 5, background: "#FF9F0A", opacity: 0.25 + 0.75 * (k / Math.max(1, depth - 1)), border: "1px solid rgba(255,255,255,.5)" }} />
                    ))}
                  </div>
                  <span className="tiny num" style={{ fontWeight: 650 }}>{st.channels}×{st.size}×{st.size}</span>
                  <span className="tiny faint">Stage {i + 1}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <span className="tiny faint">Pictures shrink while the number of pattern detectors grows: early stages find edges, later ones find parts and whole shapes.</span>
      </div>
    </div>
  );
}

/** Points along the skip connection's curve (cubic Bézier M 18 60 C 18 14, 104 14, 104 52). */
const SKIP = Array.from({ length: 11 }, (_, k) => {
  const t = k / 10, u = 1 - t;
  const x = u ** 3 * 18 + 3 * u * u * t * 18 + 3 * u * t * t * 104 + t ** 3 * 104;
  const y = u ** 3 * 60 + 3 * u * u * t * 14 + 3 * u * t * t * 14 + t ** 3 * 52;
  return [x, y];
});

/** Animated residual block: the signal goes through two conv boxes and around them on the skip path, meeting at "+". */
function ResidualPicture() {
  const pulse = { duration: 1.8, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <svg width={132} height={92} className="inset" style={{ flexShrink: 0, borderRadius: 14 }}>
      <path d="M 10 60 H 122" stroke="var(--text-3)" strokeWidth={1.5} fill="none" />
      <path d="M 18 60 C 18 14, 104 14, 104 52" stroke="#BF5AF2" strokeWidth={1.8} strokeDasharray="4 3" fill="none" />
      <text x={61} y={18} textAnchor="middle" fontSize={9} fill="#BF5AF2" fontWeight={600}>skip</text>
      <circle cx={104} cy={60} r={8} fill="var(--glass-strong)" stroke="var(--text-2)" />
      <text x={104} y={64} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">+</text>
      <motion.circle r={3} fill="#0A84FF" animate={{ cx: [10, 96], cy: [60, 60], opacity: [0, 1, 1, 0] }} transition={pulse} />
      {[32, 64].map((x) => <rect key={x} x={x} y={49} width={28} height={22} rx={5} fill="#FF9F0A" />)}
      <text x={46} y={63.5} textAnchor="middle" fontSize={8} fill="white" fontWeight={700}>conv</text>
      <text x={78} y={63.5} textAnchor="middle" fontSize={8} fill="white" fontWeight={700}>conv</text>
      <motion.circle r={3} fill="#BF5AF2" animate={{ cx: SKIP.map((p) => p[0]), cy: SKIP.map((p) => p[1]), opacity: SKIP.map((_, i) => (i === 0 || i === SKIP.length - 1 ? 0 : 1)) }} transition={pulse} />
      <motion.circle r={3.4} fill="#30D158" animate={{ cx: [112, 124], cy: [60, 60], opacity: [0, 0, 1, 0] }} transition={{ ...pulse, times: [0, 0.75, 0.85, 1] }} />
    </svg>
  );
}
