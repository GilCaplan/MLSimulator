import { AnimatePresence, motion, useAnimate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Toggle } from "../../glass";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, MeterBar, clamp, useDone } from "./shared";

const STAGES = [
  { icon: "🎫", label: "Booking", when: "3 weeks before" },
  { icon: "🧳", label: "Check-in", when: "2 h before" },
  { icon: "🛫", label: "Departure", when: "take-off" },
  { icon: "🛬", label: "Landing", when: "arrival" },
  { icon: "📝", label: "Delay report", when: "next day" },
];

const FEATURES: { name: string; at: number; leak?: boolean }[] = [
  { name: "airline", at: 0 },
  { name: "scheduled_hour", at: 0 },
  { name: "route", at: 0 },
  { name: "day_of_week", at: 0 },
  { name: "weather_forecast", at: 1 },
  { name: "airport_congestion", at: 1 },
  { name: "actual_arrival_time", at: 3, leak: true },
  { name: "carrier_delay_min", at: 4, leak: true },
  { name: "weather_delay_min", at: 4, leak: true },
  { name: "late_aircraft_min", at: 4, leak: true },
];

const posOf = (stage: number) => stage / (STAGES.length - 1);

export function LeakageDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [leaky, setLeaky] = useState(false);
  const [pos, setPos] = useState(posOf(2));
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  // Everything at or left of the marker is known at prediction time.
  const stage = Math.max(0, ...STAGES.map((_, i) => (posOf(i) <= pos + 0.02 ? i : 0)));
  const testScore = leaky ? 0.99 : 0.68;
  const liveScore = leaky ? (stage >= 4 ? 0.99 : 0.5) : stage === 0 ? 0.63 : 0.68;
  const gap = testScore - liveScore;
  const leakBites = gap > 0.3;

  // Shake the "real life" bar whenever the leak starts to bite.
  const [shakeRef, animateShake] = useAnimate<HTMLDivElement>();
  useEffect(() => {
    if (leakBites && shakeRef.current) animateShake(shakeRef.current, { x: [0, -9, 8, -6, 4, 0] }, { duration: 0.55, delay: 0.35 });
  }, [leakBites, animateShake, shakeRef]);

  const fromPointer = (clientX: number) => {
    const el = track.current;
    if (!el) return pos;
    const r = el.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1);
  };
  const snap = (p: number) => posOf(Math.round(p * (STAGES.length - 1)));

  const caption = leaky
    ? stage >= 4
      ? <>Once the delay report is filed every column is known and the model looks perfect — but the flight already happened. Drag the marker back to departure.</>
      : <>In testing the model scored <b>99%</b> by reading <code>carrier_delay_min</code>, filled in after landing. Predicting at <b>{STAGES[stage].label.toLowerCase()}</b>, that column is still blank — so it's a coin flip: <b>50%</b>.</>
    : stage === 0
      ? <>At booking the forecast and congestion aren't known yet, so the honest model drops a little to <b>63%</b> — but that number is real.</>
      : <>The honest model only uses columns known before take-off: <b>68%</b> in testing and <b>68%</b> in real life. Less shiny, totally trustworthy.</>;

  return (
    <DemoFrame
      controls={
        <>
          <Toggle label="Let the model use every column" checked={leaky} onChange={(v) => { setLeaky(v); done(); }} />
          <span className="small faint">Drag the 🔮 marker (or click a moment) to choose when you predict</span>
        </>
      }
      caption={caption}
      captionKey={`${leaky}-${leaky ? (stage >= 4 ? 4 : 0) : stage === 0 ? 0 : 1}`}
    >
      {/* ---------------- timeline */}
      <div className="inset" style={{ padding: "22px 50px 14px" }}>
        <div ref={track} style={{ position: "relative", height: 128, touchAction: "none", cursor: dragging ? "grabbing" : "pointer", userSelect: "none" }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDragging(true); setPos(fromPointer(e.clientX)); }}
          onPointerMove={(e) => dragging && setPos(fromPointer(e.clientX))}
          onPointerUp={(e) => { setDragging(false); setPos(snap(fromPointer(e.clientX))); done(); }}
          onPointerCancel={() => { setDragging(false); setPos((p) => snap(p)); }}>
          {/* rail: known part vs future */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 56, height: 6, borderRadius: 3, background: "repeating-linear-gradient(90deg, var(--fill-2) 0 8px, transparent 8px 14px)" }} />
          <div style={{ position: "absolute", left: 0, top: 56, height: 6, borderRadius: 3, width: `${pos * 100}%`, background: "var(--grad)", transition: dragging ? "none" : "width .45s var(--ease)" }} />
          {STAGES.map((s, i) => {
            const known = i <= stage;
            return (
              <div key={s.label} style={{ position: "absolute", left: `${posOf(i) * 100}%`, top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", width: 96, pointerEvents: "none" }}>
                <span style={{ fontSize: 20, filter: known ? "none" : "grayscale(1)", opacity: known ? 1 : 0.45, transition: "all .3s" }}>{s.icon}</span>
                <span className="tiny" style={{ fontWeight: 650, color: known ? "var(--text)" : "var(--text-3)", whiteSpace: "nowrap" }}>{s.label}</span>
                <span style={{ marginTop: 6, width: 14, height: 14, borderRadius: 7, background: known ? "var(--accent)" : "var(--glass-strong)", border: `2px solid ${known ? "var(--bg)" : "var(--fill-2)"}`, boxShadow: known ? "0 0 0 4px var(--accent-soft)" : "none", transition: "all .3s" }} />
                <span className="tiny faint" style={{ marginTop: 4, whiteSpace: "nowrap", fontSize: 10 }}>{s.when}</span>
              </div>
            );
          })}
          {/* the prediction-time marker: a knob on the rail + a label underneath */}
          <div style={{ position: "absolute", top: 46, left: `${pos * 100}%`, transform: "translateX(-50%)", transition: dragging ? "none" : "left .45s var(--ease)", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ width: 26, height: 26, borderRadius: 13, background: C.purple, border: "3px solid var(--bg)", boxShadow: `0 0 0 6px ${C.purple}33, 0 4px 14px ${C.purple}88`, transform: dragging ? "scale(1.15)" : "scale(1)", transition: "transform .2s" }} />
            <span style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: `6px solid ${C.purple}`, marginTop: 26 }} />
            <span className="tiny" style={{ background: C.purple, color: "var(--on-accent)", fontWeight: 700, padding: "3px 9px", borderRadius: 8, whiteSpace: "nowrap", boxShadow: `0 4px 12px ${C.purple}55`, transform: `translateX(${(0.5 - pos) * 60}%)` }}>🔮 predicting at {STAGES[stage].label.toLowerCase()}</span>
          </div>
        </div>
      </div>

      {/* ---------------- columns + scores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 }}>
        <div className="inset col" style={{ padding: 14, gap: 10 }}>
          <div className="row between small"><b>Columns</b><span className="tiny faint">lit = known by then</span></div>
          <div className="row wrap" style={{ gap: 6 }}>
            {FEATURES.map((f) => <Chip key={f.name} name={f.name} known={f.at <= stage} leak={!!f.leak} used={leaky || !f.leak} at={STAGES[f.at].label} />)}
          </div>
          <AnimatePresence initial={false}>
            {leaky && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="tiny" style={{ color: "var(--danger)", fontWeight: 560 }}>
                🚩 Leak detector: <code>carrier_delay_min</code> alone does 94% of the model's work.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <div className="inset col" style={{ padding: 14, gap: 14, justifyContent: "center" }}>
          <MeterBar label="Score in testing" value={testScore} color={leaky ? C.ok : C.indigo} note="test rows still carry every column" />
          <div ref={shakeRef}>
            <MeterBar label={`Score when predicting at ${STAGES[stage].label.toLowerCase()}`} value={liveScore} color={gap > 0.3 ? C.pos : C.indigo}
              note={gap > 0.3 ? "the future columns are empty — the model is guessing" : "only columns that exist at this moment"} />
          </div>
          <div style={{ minHeight: 26 }}>
            <AnimatePresence>
              {gap > 0.3 && (
                <motion.span key="gap" className="badge danger" initial={{ opacity: 0, scale: 0.6, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ ...spring.pop, delay: 0.5 }}>
                  ⚠ {Math.round(gap * 100)} points vanish in real life
                </motion.span>
              )}
              {gap <= 0.3 && !leaky && (
                <motion.span key="ok" className="badge success" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring.pop}>
                  ✓ honest: testing matches reality
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}

function Chip({ name, known, leak, used, at }: { name: string; known: boolean; leak: boolean; used: boolean; at: string }) {
  const dangerous = used && leak && !known; // the model relies on it, but it's still blank
  const color = leak ? C.pos : C.indigo;
  return (
    <span title={`${name} — known from ${at}`} className="mono" style={{
      fontSize: 11.5, padding: "4px 9px", borderRadius: 8, whiteSpace: "nowrap",
      background: known && used ? `${color}22` : "transparent",
      color: known && used ? "var(--text)" : "var(--text-3)",
      border: `1.5px ${known ? "solid" : "dashed"} ${dangerous ? C.pos : known && used ? `${color}88` : "var(--hairline)"}`,
      textDecoration: used ? "none" : "line-through",
      boxShadow: known && used ? `0 2px 10px ${color}22` : "none",
      transition: "all .35s var(--ease)",
    }}>
      {known ? (leak && used ? "⏱ " : "") : dangerous ? "∅ " : ""}{name}
    </span>
  );
}
