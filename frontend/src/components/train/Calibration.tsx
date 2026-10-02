import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../design/motion";
import type { ModelResult } from "../../lib/types";
import { useSize } from "../charts";
import { AnimatedNumber, InfoTip } from "../glass";

type Cal = NonNullable<ModelResult["calibration"]>;
type Bin = Cal["bins"][number];

const P = (v: number) => `${Math.round(v * 100)}%`;

/** Plain-language read of a reliability curve: is it honest, over- or under-confident, and the most telling example. */
export function calibrationStory(cal: Cal) {
  const total = cal.bins.reduce((a, b) => a + b.n, 0) || 1;
  const bias = cal.bins.reduce((a, b) => a + (b.p - b.freq) * b.n, 0) / total; // > 0: it says more than happens
  const worst = [...cal.bins].filter((b) => b.n >= 5).sort((a, b) => Math.abs(b.p - b.freq) * Math.sqrt(b.n) - Math.abs(a.p - a.freq) * Math.sqrt(a.n))[0];
  const verdict = cal.ece <= 0.03 ? { icon: "🎯", text: "Honest", cls: "success" } : cal.ece <= 0.08 ? { icon: "👌", text: "Slightly off", cls: "warning" } : { icon: "🎭", text: bias > 0 ? "Over-confident" : "Under-confident", cls: "danger" };
  const what = cal.label.startsWith("P(") ? `the chance of ${cal.label.slice(2, -1)}` : "its confidence";
  return { bias, worst, verdict, what };
}

/** Reliability diagram + ECE / Brier tiles with friendly explanations. */
export function Calibration({ cal, onCalibrate, calibrated }: { cal: Cal; onCalibrate?: () => void; calibrated?: string | null }) {
  const story = calibrationStory(cal);
  const { worst } = story;
  return (
    <div className="col" style={{ gap: 16 }}>
      <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 720 }}>
        <b style={{ color: "var(--text)" }}>When it says 70%, does it happen 70% of the time?</b> We grouped the test rows by the probability the model gave,
        then checked how often the answer really came true. An honest model's bars reach the dashed diagonal; shaded gaps show where it over- or under-promises.
      </p>
      <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
        <div style={{ flex: "2 1 360px", minWidth: 0 }}><ReliabilityDiagram cal={cal} /></div>
        <div className="col" style={{ gap: 10, flex: "1 1 220px", minWidth: 0 }}>
          <Tile label="Calibration error (ECE)" tip="Expected Calibration Error: the average gap between the probability the model states and how often it actually happens, weighted by how many rows fall in each bar. 0 means perfectly honest."
            value={<AnimatedNumber value={cal.ece * 100} format={(v) => `${v.toFixed(1)} pts`} />}
            sub={`On average its probabilities are off by ${(cal.ece * 100).toFixed(1)} percentage points.`}
            badge={<span className={`badge ${story.verdict.cls}`}>{story.verdict.icon} {story.verdict.text}</span>} />
          <Tile label="Brier score" tip="The average squared difference between the predicted probability and what happened (1 or 0). It rewards being both right and honest. 0 is perfect; always saying 50% scores 0.25."
            value={<AnimatedNumber value={cal.brier} format={(v) => v.toFixed(3)} />}
            sub={cal.brier < 0.1 ? "Low — sharp and honest probabilities." : cal.brier < 0.2 ? "Okay — room to sharpen." : "High — the probabilities aren't very trustworthy."} />
          {worst && Math.abs(worst.p - worst.freq) > 0.05 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.5 }} className="inset small" style={{ padding: "10px 12px", lineHeight: 1.5 }}>
              💬 When it gives <b>{story.what}</b> as about <b>{P(worst.p)}</b>, it actually happens <b style={{ color: "var(--danger)" }}>{P(worst.freq)}</b> of the time
              <span className="faint"> ({worst.n} rows)</span>.
            </motion.div>
          )}
        </div>
      </div>
      {cal.ece > 0.05 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.6 }}
          className="row wrap" style={{ gap: 12, padding: "12px 14px", borderRadius: 16, background: "rgba(255,159,10,.10)", border: "1px solid rgba(255,159,10,.35)" }}>
          <span style={{ fontSize: 22 }}>🩹</span>
          <span className="small grow" style={{ lineHeight: 1.55, minWidth: 220 }}>
            <b>These probabilities can't be taken at face value.</b>{" "}
            <span className="muted">
              {calibrated
                ? `It's already ${calibrated}-calibrated — try the other method, or check whether resampling (SMOTE, oversampling) changed the class mix it learned from.`
                : "Calibration re-maps the scores so “70%” really means 70%. Resampling (SMOTE, oversampling) is a common cause: the model learns a fake class mix."}
            </span>
          </span>
          {onCalibrate && !calibrated && <button className="btn sm primary" onClick={onCalibrate}>Turn on calibration →</button>}
        </motion.div>
      )}
    </div>
  );
}

function Tile({ label, tip, value, sub, badge }: { label: string; tip: string; value: React.ReactNode; sub: string; badge?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring.gentle} className="inset col" style={{ padding: 12, gap: 4 }}>
      <span className="row small muted" style={{ gap: 5 }}>{label}<InfoTip text={tip} /></span>
      <span className="row wrap" style={{ gap: 10 }}>
        <b style={{ fontSize: 24, letterSpacing: "-0.02em" }}>{value}</b>
        {badge}
      </span>
      <span className="tiny faint" style={{ lineHeight: 1.45 }}>{sub}</span>
    </motion.div>
  );
}

/** Predicted probability (x) vs observed frequency (y): bars per bin, gap shading against the diagonal, counts strip below. */
export function ReliabilityDiagram({ cal, height = 290 }: { cal: Cal; height?: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<Bin | null>(null);
  const strip = 38;
  const m = { l: 40, r: 10, t: 10, b: 34 + strip };
  const W = Math.max(0, width - m.l - m.r), H = height - m.t - m.b;
  const sx = (v: number) => m.l + v * W;
  const sy = (v: number) => m.t + (1 - v) * H;
  const maxN = Math.max(1, ...cal.bins.map((b) => b.n));
  const stripTop = height - strip + 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div ref={ref} style={{ width: "100%", height, position: "relative" }}>
      {width > 0 && (
        <svg width={width} height={height} onMouseLeave={() => setHover(null)}>
          <defs>
            <pattern id="cal-gap" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgba(255,69,58,.14)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,69,58,.45)" strokeWidth="2" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{P(t)}</text>
              <text x={sx(t)} y={m.t + H + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{P(t)}</text>
            </g>
          ))}
          <text x={m.l + W / 2} y={m.t + H + 28} textAnchor="middle" fontSize={11} fill="var(--text-2)">What the model said ({cal.label})</text>
          <text transform={`translate(11 ${m.t + H / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--text-2)">How often it happened</text>

          {cal.bins.map((b, i) => {
            const x0 = sx(b.lo) + 2, w = Math.max(2, sx(b.hi) - sx(b.lo) - 4);
            const op = 0.35 + 0.55 * Math.sqrt(b.n / maxN);
            const gapTop = sy(Math.max(b.p, b.freq)), gapH = Math.abs(sy(b.p) - sy(b.freq));
            const on = hover === b;
            return (
              <g key={i} onMouseEnter={() => setHover(b)} style={{ cursor: "default" }}>
                <rect x={x0 - 2} y={m.t} width={w + 4} height={H + strip + 34} fill="transparent" />
                <motion.rect x={x0} width={w} rx={4} fill="var(--accent)" fillOpacity={on ? Math.min(1, op + 0.2) : op}
                  initial={{ y: sy(0), height: 0 }} animate={{ y: sy(b.freq), height: Math.max(0, sy(0) - sy(b.freq)) }} transition={{ ...spring.gentle, delay: 0.05 * i }} />
                <motion.rect x={x0} width={w} y={gapTop} height={gapH} fill="url(#cal-gap)" stroke="rgba(255,69,58,.55)" strokeWidth={1} rx={3}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + 0.05 * i }} />
                {/* counts strip */}
                <motion.rect x={x0} width={w} rx={2} fill="var(--text-3)" fillOpacity={on ? 0.7 : 0.4}
                  initial={{ y: height - 4, height: 0 }} animate={{ y: height - 4 - (strip - 12) * (b.n / maxN), height: (strip - 12) * (b.n / maxN) }} transition={{ ...spring.gentle, delay: 0.05 * i }} />
              </g>
            );
          })}
          <line x1={m.l} x2={width - m.r} y1={stripTop} y2={stripTop} stroke="var(--hairline)" />
          <text x={m.l - 6} y={height - 8} textAnchor="end" fontSize={9.5} fill="var(--text-3)">rows</text>

          <motion.line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--text-2)" strokeWidth={1.5} strokeDasharray="5 5"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
          <text x={sx(0.06)} y={sy(0.06) - 8} fontSize={10} fill="var(--text-2)" transform={`rotate(${-Math.atan2(H, W) * 180 / Math.PI} ${sx(0.06)} ${sy(0.06) - 8})`}>perfectly calibrated</text>

          <motion.path d={cal.bins.map((b, i) => `${i ? "L" : "M"}${sx(b.p).toFixed(1)},${sy(b.freq).toFixed(1)}`).join("")} fill="none" stroke="var(--accent-2)" strokeWidth={2.2}
            strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.3 }} />
          {cal.bins.map((b, i) => (
            <motion.circle key={`d${i}`} cx={sx(b.p)} cy={sy(b.freq)} r={hover === b ? 5.5 : 3.8} fill="var(--accent-2)" stroke="white" strokeWidth={1.5}
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.pop, delay: 0.4 + 0.05 * i }} />
          ))}
        </svg>
      )}
      <AnimatePresence>
        {hover && (
          <motion.div key={hover.lo} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            className="glass small" style={{ position: "absolute", pointerEvents: "none", left: Math.min(Math.max(0, sx(hover.p) - 90), Math.max(0, width - 190)), top: 4, width: 180, padding: "8px 10px", borderRadius: 12, lineHeight: 1.45, zIndex: 3 }}>
            <b>Said {P(hover.lo)}–{P(hover.hi)}</b> <span className="faint">(avg {P(hover.p)})</span><br />
            Happened <b style={{ color: Math.abs(hover.p - hover.freq) > 0.1 ? "var(--danger)" : "var(--success)" }}>{P(hover.freq)}</b> of the time
            <br /><span className="faint">{hover.n.toLocaleString()} test rows</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
