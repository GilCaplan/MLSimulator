import { motion } from "framer-motion";
import { spring } from "../../../design/motion";
import { classColor } from "../../../lib/colors";
import { pct } from "../../../lib/format";
import type { TryResult } from "../../../lib/types";
import { tint } from "../../charts/contrast";
import { ConfidenceRing } from "../textKit";
import { confidence, fmtValue, probRows } from "./tryKit";

const MAX_BARS = 8;

/** The model's answer, drawn: verdict, predicted class with probability bars (classification) or a number line (regression). */
export function AnswerView({ r, range, noun }: { r: TryResult; range?: [number, number] | null; noun: string }) {
  return r.task === "regression" ? <RegressionAnswer r={r} range={range} noun={noun} /> : <ClassAnswer r={r} />;
}

function ClassAnswer({ r }: { r: TryResult }) {
  const classes = (r.classes ?? []).map(String);
  const pred = String(r.prediction);
  const truth = r.truth !== undefined && r.truth !== null ? String(r.truth) : null;
  const conf = confidence(r);
  const color = classColor(pred, classes);
  const rows = probRows(r);
  const shown = rows.length > MAX_BARS ? [...rows.slice(0, MAX_BARS - 1), ...(truth && !rows.slice(0, MAX_BARS - 1).some((x) => x.label === truth) ? rows.filter((x) => x.label === truth) : [])] : rows;
  const hidden = rows.length - shown.length;

  return (
    <div className="col" style={{ gap: 14 }}>
      {truth !== null && (
        <Verdict good={!!r.correct} title={r.correct ? "Correct!" : "Oops"}
          text={r.correct ? <>It said <b style={{ color }}>{pred}</b> — and that's right.</> : <>It said <b style={{ color }}>{pred}</b>, but it's really <b style={{ color: classColor(truth, classes) }}>{truth}</b>.</>} />
      )}
      <div className="row" style={{ gap: 12 }}>
        {conf !== null && <ConfidenceRing value={conf} color={color} size={52} />}
        <div className="col" style={{ gap: 1, minWidth: 0 }}>
          <span className="eyebrow">The model says</span>
          <motion.b key={pred} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle}
            className="truncate" style={{ fontSize: 24, letterSpacing: "-0.02em", color }}>{pred}</motion.b>
          {conf !== null && <span className="tiny muted">{conf > 0.9 ? "very sure" : conf > 0.65 ? "fairly sure" : conf > 0.45 ? "unsure" : "really torn"} · {pct(conf, 0)}</span>}
        </div>
      </div>
      {shown.length > 0 && (
        <div className="col" style={{ gap: 7 }}>
          <span className="tiny faint">How sure it is about every answer</span>
          {shown.map((row, i) => {
            const c = classColor(row.label, classes);
            const isTrue = row.label === truth;
            return (
              <motion.div key={row.label} layout transition={spring.snappy} className="col" style={{ gap: 3 }}>
                <div className="row between" style={{ gap: 8 }}>
                  <span className="row small" style={{ gap: 6, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: c, flexShrink: 0 }} />
                    <span className="truncate" style={{ fontWeight: row.label === pred ? 680 : 500 }}>{row.label}</span>
                    {isTrue && <span className="badge success" style={{ height: 18, fontSize: 10.5, padding: "0 7px" }}>✓ real answer</span>}
                  </span>
                  <span className="small num muted">{pct(row.p, row.p < 0.01 && row.p > 0 ? 1 : 0)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--fill)", overflow: "hidden", outline: isTrue ? "1.5px solid var(--success)" : undefined, outlineOffset: 1 }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(row.p > 0 ? 1.5 : 0, row.p * 100)}%` }}
                    transition={{ ...spring.gentle, delay: 0.05 + i * 0.035 }} style={{ height: "100%", borderRadius: 4, background: c }} />
                </div>
              </motion.div>
            );
          })}
          {hidden > 0 && <span className="tiny faint">…and {hidden} less likely answer{hidden === 1 ? "" : "s"}</span>}
        </div>
      )}
      {!shown.length && <span className="tiny faint">This model gives a single answer without probabilities.</span>}
    </div>
  );
}

/** Big ✓ / ✗ banner. */
export function Verdict({ good, title, text }: { good: boolean; title: string; text: React.ReactNode }) {
  const c = good ? "var(--success)" : "var(--danger)";
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={spring.pop}
      className="row" style={{ gap: 12, padding: "10px 14px", borderRadius: "var(--r-md)", background: tint(c, 13), border: `1px solid ${tint(c, 40)}` }}>
      <motion.span initial={{ scale: 0, rotate: good ? -40 : 40 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.08 }}
        style={{ width: 34, height: 34, borderRadius: 17, background: c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
        {good ? "✓" : "✗"}
      </motion.span>
      <span className="col" style={{ gap: 1, minWidth: 0 }}>
        <b style={{ fontSize: 17, color: c }}>{title}</b>
        <span className="small" style={{ color: "var(--text-2)" }}>{text}</span>
      </span>
    </motion.div>
  );
}

function RegressionAnswer({ r, range, noun }: { r: TryResult; range?: [number, number] | null; noun: string }) {
  const pred = Number(r.prediction);
  const truth = r.truth !== undefined && r.truth !== null ? Number(r.truth) : null;
  const err = truth !== null ? pred - truth : null;
  const vals = [pred, ...(truth !== null ? [truth] : []), ...(range ? range : [])].filter(Number.isFinite);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const padAmt = (hi - lo || Math.abs(hi) || 1) * 0.08;
  lo -= padAmt; hi += padAmt;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const span = range ? range[1] - range[0] : Math.abs(truth ?? pred) || 1;
  const rel = err !== null ? Math.abs(err) / (span || 1) : null;
  const relTruth = err !== null && truth ? Math.abs(err) / Math.abs(truth) : null;
  // judged against the spread of real values, and (when meaningful) against the value itself
  const tone = rel === null ? null : rel < 0.05 && (relTruth === null || relTruth < 0.1) ? "good" : rel < 0.15 ? "ok" : "bad";

  return (
    <div className="col" style={{ gap: 16 }}>
      {err !== null && tone && (
        <Verdict good={tone !== "bad"} title={tone === "good" ? "Spot on!" : tone === "ok" ? "Close" : "Way off"}
          text={<>Off by <b className="num">{fmtValue(Math.abs(err))}</b> — it guessed {err > 0 ? "too high" : "too low"}{truth ? ` (${pct(Math.abs(err) / Math.abs(truth), 1)} of the real value)` : ""}.</>} />
      )}
      <div className="row wrap" style={{ gap: 18 }}>
        <div className="col" style={{ gap: 1 }}>
          <span className="eyebrow">The model says</span>
          <motion.b key={pred} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="num" style={{ fontSize: 26, letterSpacing: "-0.02em", color: "var(--accent)" }}>{fmtValue(pred)}</motion.b>
        </div>
        {truth !== null && (
          <div className="col" style={{ gap: 1 }}>
            <span className="eyebrow">Really</span>
            <b className="num" style={{ fontSize: 26, letterSpacing: "-0.02em", color: "var(--success)" }}>{fmtValue(truth)}</b>
          </div>
        )}
      </div>
      <div style={{ position: "relative", height: 64, margin: "0 10px" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 30, height: 6, borderRadius: 3, background: "var(--fill)" }} />
        {range && (
          <div title={`values seen across the test ${noun}s`} style={{ position: "absolute", top: 29, height: 8, borderRadius: 4, left: at(range[0]), width: `calc(${at(range[1])} - ${at(range[0])})`, background: "var(--fill-2)", boxShadow: "inset 0 0 0 1px var(--hairline)" }} />
        )}
        {truth !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, left: at(Math.min(pred, truth)), width: `calc(${at(Math.max(pred, truth))} - ${at(Math.min(pred, truth))})` }} transition={spring.gentle}
            style={{ position: "absolute", top: 30, height: 6, background: tint("var(--danger)", 55), borderRadius: 3 }} />
        )}
        <Marker left={at(pred)} color="var(--accent)" label={`said ${fmtValue(pred)}`} above />
        {truth !== null && <Marker left={at(truth)} color="var(--success)" label={`really ${fmtValue(truth)}`} />}
      </div>
      {range && <span className="tiny faint" style={{ marginTop: -10, textAlign: "center" }}>grey band = the real values across the test {noun}s (<span className="num">{fmtValue(range[0])}</span> to <span className="num">{fmtValue(range[1])}</span>)</span>}
    </div>
  );
}

function Marker({ left, color, label, above }: { left: string; color: string; label: string; above?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1, left }} transition={spring.gentle}
      style={{ position: "absolute", top: 0, bottom: 0, width: 0 }}>
      <span style={{ position: "absolute", top: 26, left: -7, width: 14, height: 14, borderRadius: 7, background: color, boxShadow: "0 0 0 3px var(--glass-strong)" }} />
      <span className="tiny num" style={{ position: "absolute", top: above ? 4 : 46, left: 0, transform: "translateX(-50%)", whiteSpace: "nowrap", fontWeight: 650, color }}>{label}</span>
    </motion.div>
  );
}
