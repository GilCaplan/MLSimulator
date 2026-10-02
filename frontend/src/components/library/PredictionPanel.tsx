import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../design/motion";
import { classColor, ramp } from "../../lib/colors";
import { fmt, pct } from "../../lib/format";
import type { PredictResponse, SavedModel } from "../../lib/types";
import { BarList, Gauge } from "../charts";
import { AnimatedNumber, InfoTip, Spinner } from "../glass";
import { Swap } from "./shared";

/** The answer side of the playground: big prediction, confidence and per-class bars (or a value on a track). */
export function PredictionPanel({ model, result, warming, busy, targetRange }: {
  model: SavedModel;
  result: PredictResponse | null;
  warming: boolean;
  busy: boolean;
  targetRange: [number, number] | null;
}) {
  if (!result) {
    return (
      <div className="col center" style={{ minHeight: 280, gap: 14, textAlign: "center" }}>
        <motion.div animate={{ scale: [1, 1.12, 1], rotate: [0, 8, -8, 0] }} transition={{ repeat: Infinity, duration: 2.2 }} style={{ fontSize: 40 }}>
          {model.family === "torch" ? "🧠" : "⚙️"}
        </motion.div>
        <div className="row" style={{ gap: 8 }}>
          <Spinner size={15} color="var(--accent)" />
          <b>{warming ? "Warming up the model…" : "Thinking…"}</b>
        </div>
        <span className="small muted" style={{ maxWidth: 260 }}>The first answer takes a moment while the model loads into memory. After that it's instant.</span>
      </div>
    );
  }

  const header = (
    <div className="row between">
      <span className="eyebrow">The model says</span>
      <AnimatePresence>
        {busy && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="row tiny faint" style={{ gap: 6 }}>
            <Spinner size={11} /> updating
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );

  const pred = result.predictions[0];

  if (model.task === "classification") {
    const classes = result.classes ?? model.classes ?? [];
    const probs = result.probabilities?.[0];
    const idx = classes.map(String).indexOf(String(pred));
    const p = probs && idx >= 0 ? probs[idx] : null;
    const color = classColor(String(pred), classes);
    return (
      <div className="col" style={{ gap: 16 }}>
        {header}
        <div className="col center" style={{ gap: 4, textAlign: "center" }}>
          <span className="small muted">Predicted <b>{model.target}</b></span>
          <Swap k={String(pred)}>
            <div style={{ fontSize: 46, fontWeight: 760, letterSpacing: "-0.035em", color, lineHeight: 1.1, textShadow: `0 6px 28px ${color}55`, wordBreak: "break-word" }}>{String(pred)}</div>
          </Swap>
        </div>
        {p !== null && (
          <div className="col center" style={{ gap: 0 }}>
            <Gauge value={p} label="confidence" color={color} size={190} />
            <span className="tiny muted row" style={{ gap: 6 }}>
              How sure the model is about this answer
              <InfoTip text="This is the model's own probability for its answer. Well-trained models that say 90% should be right about 9 times out of 10 — but treat it as a hint, not a promise." />
            </span>
          </div>
        )}
        {probs && (
          <div className="inset" style={{ padding: 14 }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <span className="small" style={{ fontWeight: 600 }}>Chance of each answer</span>
              <span className="tiny faint">adds up to 100%</span>
            </div>
            <BarList labels={classes.map(String)} values={probs} max={1} colors={classes.map((c) => classColor(String(c), classes))} format={(v) => pct(v, 1)} />
          </div>
        )}
      </div>
    );
  }

  const v = Number(pred);
  const t = targetRange ? (v - targetRange[0]) / (targetRange[1] - targetRange[0] || 1) : 0.5;
  return (
    <div className="col" style={{ gap: 18 }}>
      {header}
      <div className="col center" style={{ gap: 4, textAlign: "center", padding: "10px 0" }}>
        <span className="small muted">Predicted <b>{model.target}</b></span>
        <motion.div style={{ fontSize: 52, fontWeight: 760, letterSpacing: "-0.035em", lineHeight: 1.1 }} animate={{ color: ramp(Math.max(0, Math.min(1, t))) }} transition={{ duration: 0.4 }}>
          <AnimatedNumber value={v} format={(x) => fmt(x, 3)} duration={0.5} />
        </motion.div>
      </div>
      {targetRange && (
        <div className="inset" style={{ padding: "16px 16px 12px" }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="small" style={{ fontWeight: 600 }}>Where this lands</span>
            <InfoTip text="The bar spans the range of true values the model saw in its test data. The dot shows where this prediction sits." />
          </div>
          <div style={{ position: "relative", height: 14, borderRadius: 7, background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.33)}, ${ramp(0.66)}, ${ramp(1)})`, opacity: 0.9 }}>
            <motion.div
              animate={{ left: `${Math.max(0, Math.min(1, t)) * 100}%` }}
              transition={spring.snappy}
              style={{ position: "absolute", top: "50%", width: 24, height: 24, marginLeft: -12, marginTop: -12, borderRadius: 12, background: "white", boxShadow: "0 2px 10px rgba(0,0,0,0.3)", border: `3px solid ${ramp(Math.max(0, Math.min(1, t)))}` }}
            />
          </div>
          <div className="row between tiny faint num" style={{ marginTop: 8 }}>
            <span>{fmt(targetRange[0])}</span>
            <span>{t < 0 ? "below anything it has seen" : t > 1 ? "above anything it has seen" : `${Math.round(t * 100)}% of the way up`}</span>
            <span>{fmt(targetRange[1])}</span>
          </div>
        </div>
      )}
    </div>
  );
}
