import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Segmented, Slider, Toggle } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, gauss, mean, rng, useDone } from "./shared";

type Mode = "calibration" | "slices";
interface Patient { z: number; y: 0 | 1 }

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const N_BINS = 10;
const MIN_N = 15; // bins with fewer patients are too noisy to draw

/** Patients after surgery: true ICU risk ~15% on average; the base model's score is a noisy read of that risk. */
function makePatients(n: number, seed: number): Patient[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const truth = -2.1 + 1.25 * gauss(r);
    const y = (r() < sigmoid(truth) ? 1 : 0) as 0 | 1;
    return { z: truth + 0.35 * gauss(r), y };
  });
}

/** Oversampling the ICU cases k extra times multiplies the odds by (1+k) and makes the model a bit overconfident. */
const distort = (z: number, k: number) => z * (1 + 0.05 * k) + Math.log(1 + k);

/** Platt scaling: fit p = σ(a + b·logit) on held-out patients with a few Newton steps. */
function platt(zs: number[], ys: number[]) {
  let a = 0, b = 1;
  for (let it = 0; it < 25; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (let i = 0; i < zs.length; i++) {
      const p = sigmoid(a + b * zs[i]), e = p - ys[i], w = Math.max(1e-6, p * (1 - p));
      ga += e; gb += e * zs[i]; haa += w; hab += w * zs[i]; hbb += w * zs[i] * zs[i];
    }
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    a -= (hbb * ga - hab * gb) / det;
    b -= (haa * gb - hab * ga) / det;
  }
  return { a, b };
}

function evaluate(p: number[], y: number[]) {
  const bins = Array.from({ length: N_BINS }, () => ({ n: 0, sp: 0, sy: 0 }));
  let brier = 0;
  p.forEach((v, i) => {
    const b = bins[Math.min(N_BINS - 1, Math.floor(v * N_BINS))];
    b.n++; b.sp += v; b.sy += y[i];
    brier += (v - y[i]) ** 2;
  });
  const out = bins.map((b) => ({ n: b.n, pred: b.n ? b.sp / b.n : 0, actual: b.n ? b.sy / b.n : 0 }));
  const ece = out.reduce((s, b) => s + (b.n / p.length) * Math.abs(b.pred - b.actual), 0);
  return { bins: out, ece, brier: brier / p.length, beds: 100 * mean(p), needed: 100 * mean(y) };
}

/* ------------------------------------------------ error slices */
const SLICES = [
  { name: "Orthopedic", icon: "🦴", n: 820, acc: 0.93, recall: 0.81 },
  { name: "General", icon: "🩺", n: 1150, acc: 0.92, recall: 0.79 },
  { name: "Cardiac", icon: "🫀", n: 260, acc: 0.71, recall: 0.42, fixAcc: 0.87, fixRecall: 0.76 },
  { name: "Neuro", icon: "🧠", n: 340, acc: 0.89, recall: 0.74 },
  { name: "Vascular", icon: "🩸", n: 430, acc: 0.9, recall: 0.77 },
];

export function CalibrationDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [mode, setMode] = useState<Mode>("calibration");
  const [k, setK] = useState(3);
  const [calib, setCalib] = useState(false);
  const [byProc, setByProc] = useState(false);
  const [fixed, setFixed] = useState(false);

  const data = useMemo(() => ({ cal: makePatients(3000, 21), test: makePatients(6000, 22) }), []);
  const res = useMemo(() => {
    const zTest = data.test.map((p) => distort(p.z, k));
    let probs = zTest.map(sigmoid);
    if (calib) {
      const { a, b } = platt(data.cal.map((p) => distort(p.z, k)), data.cal.map((p) => p.y));
      probs = zTest.map((z) => sigmoid(a + b * z));
    }
    return evaluate(probs, data.test.map((p) => p.y));
  }, [data, k, calib]);
  // Ranking quality: oversampling and calibration are both monotone remaps, so this never moves.
  const auc = useMemo(() => {
    const s = data.test.map((p) => ({ z: p.z, y: p.y })).sort((a, b) => a.z - b.z);
    let pos = 0, rankSum = 0;
    s.forEach((p, i) => { if (p.y) { pos++; rankSum += i + 1; } });
    const neg = s.length - pos;
    return (rankSum - (pos * (pos + 1)) / 2) / Math.max(1, pos * neg);
  }, [data]);

  const slices = SLICES.map((s) => ({ ...s, a: fixed && s.fixAcc ? s.fixAcc : s.acc, r: fixed && s.fixRecall ? s.fixRecall : s.recall }));
  const total = slices.reduce((s, x) => s + x.n, 0);
  const overall = slices.reduce((s, x) => s + x.n * x.a, 0) / total;

  const over = res.beds - res.needed;
  const caption = mode === "calibration"
    ? calib
      ? <>Calibration remaps the scores so that “30%” really means 3 in 10. The bars sit on the diagonal again: plan <b>{Math.round(res.beds)}</b> ICU beds per 100 patients and about <b>{Math.round(res.needed)}</b> will be needed.</>
      : k < 0.25
        ? <>Trained on the real mix of patients, the model's probabilities are honest: the bars hug the diagonal. Now slide up the oversampling.</>
        : <>Oversampling ICU cases {k.toFixed(1)}× taught the model that ICU is common, so every bar falls <b>below</b> the diagonal — it's <b>over-confident</b>. Trust its numbers and you'd staff <b>{Math.round(res.beds)}</b> beds for <b>{Math.round(res.needed)}</b> patients.</>
    : !byProc
      ? <>One overall accuracy of <b>{Math.round(overall * 100)}%</b> looks healthy. But averages hide things — break it down by procedure.</>
      : fixed
        ? <>After digging into cardiac errors and adding the missing signal (ejection fraction, bypass time), the weak slice catches up. That's <b>error analysis</b>: find where it fails, then fix the cause.</>
        : <>Sliced by procedure, <b>cardiac</b> patients stand out: <b>{Math.round(SLICES[2].acc * 100)}%</b> accuracy and only <b>{Math.round(SLICES[2].recall * 100)}%</b> of ICU cases caught. It's a small group, so the overall number barely showed it.</>;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 18, rowGap: 12, width: "100%", alignItems: "center" }}>
          <Segmented value={mode} onChange={(m) => { setMode(m); done(); }} options={[
            { value: "calibration", label: "📏 Can we trust 30%?" },
            { value: "slices", label: "🔍 Where does it fail?" },
          ]} />
          {mode === "calibration" ? (
            <>
              <div style={{ flex: "1 1 220px", maxWidth: 320 }}>
                <Slider label="Oversampling of ICU cases" value={k} min={0} max={5} step={0.1} onChange={(v) => { setK(v); done(); }} format={(v) => `${v.toFixed(1)}×`}
                  help="Copying the rare ICU patients during training (to fight imbalance) shifts the model's probabilities upward." />
              </div>
              <Toggle label="Calibrate" checked={calib} onChange={(v) => { setCalib(v); done(); }}
                help="Platt scaling: a tiny logistic model, fitted on held-out patients, that remaps scores to honest probabilities. It doesn't change the ranking." />
            </>
          ) : (
            <>
              <Toggle label="Break down by procedure" checked={byProc} onChange={(v) => { setByProc(v); if (!v) setFixed(false); done(); }} />
              <Toggle label="Fix the cardiac slice" checked={fixed} disabled={!byProc} onChange={(v) => { setFixed(v); done(); }}
                help="Add the features cardiac surgeons actually look at, then retrain." />
            </>
          )}
        </div>
      }
      stats={mode === "calibration" ? (
        <>
          <Stat key={`ece-${res.ece > 0.05}`} label="ECE · calibration error" value={res.ece} format={(v) => `${(v * 100).toFixed(1)}%`} color={res.ece > 0.05 ? C.pos : C.ok} emphasis={res.ece > 0.05} sub="avg gap from the diagonal" />
          <Stat label="Brier score" value={res.brier} format={(v) => v.toFixed(3)} sub="lower is better" />
          <Stat label="ICU beds you'd prepare" value={res.beds} format={(v) => `${Math.round(v)} / 100`} color={over > 5 ? C.warn : C.ok} sub="sum of predicted probabilities" />
          <Stat label="Patients who need ICU" value={res.needed} format={(v) => `${Math.round(v)} / 100`} color={C.pos} sub="what actually happens" />
        </>
      ) : (
        <>
          <Stat label="Overall accuracy" value={overall} sub={`${total.toLocaleString()} patients`} />
          <Stat key={`card-${byProc && !fixed}`} label="Cardiac accuracy" value={byProc ? slices[2].a : overall} format={(v) => (byProc ? `${Math.round(v * 100)}%` : "?")} color={byProc ? (slices[2].a < 0.8 ? C.pos : C.ok) : "var(--text-3)"} emphasis={byProc && !fixed} sub="the slice that matters" />
          <Stat label="Cardiac ICU cases caught" value={byProc ? slices[2].r : 0} format={(v) => (byProc ? `${Math.round(v * 100)}%` : "?")} color={byProc ? (slices[2].r < 0.6 ? C.pos : C.ok) : "var(--text-3)"} sub="recall in that slice" />
        </>
      )}
      caption={caption}
      captionKey={mode === "calibration" ? `c-${calib}-${k < 0.25}` : `s-${byProc}-${fixed}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {mode === "calibration" ? <CalibrationBody res={res} auc={auc} /> : <SliceBars slices={slices} overall={overall} byProc={byProc} />}
        </motion.div>
      </AnimatePresence>
    </DemoFrame>
  );
}

/* ------------------------------------------------ reliability diagram + bed strip */

function CalibrationBody({ res, auc }: { res: ReturnType<typeof evaluate>; auc: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const side = width > 760;
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: side ? "1.35fr 1fr" : "1fr", gap: 12 }}>
      <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <b>Reliability diagram</b>
          <Legend items={[{ color: C.indigo, label: "Actual ICU rate", shape: "square" }, { color: "var(--text-3)", label: "Perfectly honest", shape: "dash" }]} />
        </div>
        <Reliability bins={res.bins} />
      </div>
      <div className="inset col" style={{ padding: 14, gap: 10 }}>
        <div className="row between small"><b>🛏 Staffing for 100 patients</b></div>
        <BedStrip beds={res.beds} needed={res.needed} />
        <Legend items={[{ color: C.pos, label: "Needs an ICU bed", shape: "square" }, { color: C.warn, label: "Prepared, stays empty", shape: "ring" }]} />
        <span className="tiny faint">Hospitals plan beds and nurses by adding up predicted probabilities — so they only work if the probabilities are honest.</span>
        <div className="divider" style={{ margin: "4px 0" }} />
        <div className="row between" style={{ gap: 10, alignItems: "baseline" }}>
          <span className="small" style={{ fontWeight: 600 }}>Ranking quality (AUC)</span>
          <span className="num" style={{ fontWeight: 700, fontSize: 18, color: C.indigo }}>{auc.toFixed(2)}</span>
        </div>
        <span className="tiny faint">Never moves: oversampling and calibration both keep who is riskier than whom. Only the <i>meaning</i> of the numbers changes.</span>
      </div>
    </div>
  );
}

function Reliability({ bins }: { bins: { n: number; pred: number; actual: number }[] }) {
  const [ref, { width: w }] = useSize<HTMLDivElement>();
  const m = { l: 34, r: 18, t: 10, b: 32 };
  const plotW = Math.max(0, Math.min(w, 380) - m.l - m.r);
  const height = plotW + m.t + m.b;
  const sx = (v: number) => m.l + v * plotW;
  const sy = (v: number) => m.t + (1 - v) * plotW;
  const maxN = Math.max(1, ...bins.map((b) => b.n));
  const cw = plotW / N_BINS;
  const pts = bins.map((b, i) => ({ ...b, i })).filter((b) => b.n >= MIN_N);
  const path = pts.map((b, j) => `${j ? "L" : "M"}${sx(b.pred).toFixed(1)},${sy(b.actual).toFixed(1)}`).join("");
  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      {w > 0 && (
        <svg width={plotW + m.l + m.r} height={height}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={sx(0)} x2={sx(1)} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{Math.round(v * 100)}%</text>
              <text x={sx(v)} y={height - m.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-3)">{Math.round(v * 100)}%</text>
            </g>
          ))}
          <text x={sx(0.5)} y={height - 3} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">model says (predicted ICU chance)</text>
          <text transform={`translate(10 ${sy(0.5)}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">actually went to ICU</text>
          {bins.map((b, i) => {
            const bw = Math.max(3, (cw - 4) * Math.sqrt(b.n / maxN));
            const x = sx(i / N_BINS) + (cw - bw) / 2;
            const h = b.n >= MIN_N ? b.actual * plotW : 0;
            const below = b.n >= MIN_N && b.actual < b.pred - 0.03;
            return (
              <g key={i}>
                {/* the gap to the ideal: where the bar should have reached */}
                <motion.rect initial={false} animate={{ x, width: bw, y: sy(Math.max(b.pred, b.actual)), height: Math.abs(b.pred - b.actual) * plotW, opacity: b.n >= MIN_N ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 24, bounce: 0 }} fill={below ? C.pos : C.indigo} fillOpacity={0.12} stroke={below ? C.pos : "none"} strokeOpacity={0.5} strokeDasharray="3 3" rx={3} />
                <motion.rect initial={false} animate={{ x, width: bw, y: sy(0) - h, height: h, opacity: b.n >= MIN_N ? 1 : 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 24, bounce: 0 }} fill={C.indigo} fillOpacity={0.85} rx={3}>
                  <title>{`${b.n} patients · predicted ${(b.pred * 100).toFixed(0)}% · actual ${(b.actual * 100).toFixed(0)}%`}</title>
                </motion.rect>
              </g>
            );
          })}
          <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="6 5" />
          <text x={sx(0.97)} y={sy(0.97) + 16} textAnchor="end" fontSize={9.5} fill="var(--text-3)" transform={`rotate(-45 ${sx(0.97)} ${sy(0.97) + 16})`}>honest</text>
          <motion.path initial={false} animate={{ d: path }} transition={{ type: "spring", stiffness: 140, damping: 22 }} fill="none" stroke={C.purple} strokeWidth={2.4} strokeLinejoin="round" />
          {pts.map((b) => (
            <motion.circle key={b.i} initial={false} animate={{ cx: sx(b.pred), cy: sy(b.actual) }} transition={{ type: "spring", stiffness: 140, damping: 22 }} r={4} fill={C.purple} stroke="var(--glass-strong)" strokeWidth={1.5} />
          ))}
        </svg>
      )}
    </div>
  );
}

function BedStrip({ beds, needed }: { beds: number; needed: number }) {
  const nb = Math.round(beds), nn = Math.round(needed);
  const slots = Math.max(40, Math.ceil(Math.max(nb, nn) / 10) * 10);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
      {Array.from({ length: slots }, (_, i) => {
        const need = i < nn, prepared = i < nb;
        return (
          <div key={i} title={need ? (prepared ? "needs ICU" : "needs ICU — no bed prepared!") : prepared ? "bed prepared, stays empty" : ""} style={{
            height: 16, borderRadius: 4, boxSizing: "border-box",
            background: need ? (prepared ? C.pos : `${C.pos}55`) : "transparent",
            border: `1.5px ${prepared ? "solid" : "dashed"} ${need ? C.pos : prepared ? C.warn : "var(--hairline)"}`,
            opacity: need || prepared ? 1 : 0.6,
            transition: `background .35s ${i * 8}ms, border-color .35s ${i * 8}ms`,
          }} />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------ error slices */

function SliceBars({ slices, overall, byProc }: { slices: { name: string; icon: string; n: number; a: number; r: number }[]; overall: number; byProc: boolean }) {
  const H = 190, lo = 0.3; // bars start at 30% so differences are visible; labelled on the axis
  const y = (v: number) => ((v - lo) / (1 - lo)) * H;
  const cols = byProc ? slices : [{ name: "All patients", icon: "🏥", n: slices.reduce((s, x) => s + x.n, 0), a: overall, r: slices.reduce((s, x) => s + x.n * x.r, 0) / slices.reduce((s, x) => s + x.n, 0) }];
  return (
    <div className="inset col" style={{ padding: "12px 14px", gap: 10 }}>
      <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
        <b>{byProc ? "Performance by procedure type" : "Overall performance"}</b>
        <Legend items={[{ color: C.indigo, label: "Accuracy", shape: "square" }, { color: C.teal, label: "ICU cases caught", shape: "square" }, { color: "var(--text-3)", label: "Overall accuracy", shape: "dash" }]} />
      </div>
      <div style={{ position: "relative", height: H + 44, paddingLeft: 34 }}>
        {[0.4, 0.6, 0.8, 1].map((v) => (
          <div key={v} style={{ position: "absolute", left: 34, right: 0, bottom: 44 + y(v), borderTop: "1px solid var(--hairline)" }}>
            <span className="tiny faint" style={{ position: "absolute", left: -34, top: -8 }}>{Math.round(v * 100)}%</span>
          </div>
        ))}
        <motion.div initial={false} animate={{ bottom: 44 + y(overall) }} transition={spring.gentle}
          style={{ position: "absolute", left: 34, right: 0, borderTop: "2px dashed var(--text-3)", zIndex: 1, pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 34, right: 0, bottom: 0, top: 0, display: "flex", gap: 10 }}>
          <AnimatePresence initial={false}>
            {cols.map((s, i) => {
              const weak = byProc && s.a < 0.8;
              return (
                <motion.div key={s.name} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ ...spring.gentle, delay: byProc ? i * 0.05 : 0 }}
                  style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: H, width: "100%", justifyContent: "center", borderRadius: 10, background: weak ? `${C.pos}14` : "transparent", boxShadow: weak ? `0 0 0 1.5px ${C.pos}66 inset` : "none", transition: "background .3s, box-shadow .3s", paddingTop: 4 }}>
                    {[{ v: s.a, c: weak ? C.pos : C.indigo }, { v: s.r, c: C.teal }].map((b, j) => (
                      <div key={j} style={{ width: "34%", maxWidth: 38, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                        <motion.div initial={false} animate={{ height: Math.max(2, y(b.v)) }} transition={{ type: "spring", stiffness: 140, damping: 22, bounce: 0 }}
                          style={{ width: "100%", borderRadius: "5px 5px 2px 2px", background: `linear-gradient(180deg, ${b.c}, ${b.c}bb)`, display: "flex", justifyContent: "center", overflow: "hidden" }}>
                          <span className="tiny num" style={{ fontWeight: 700, color: "white", marginTop: 4, textShadow: "0 1px 2px rgba(0,0,0,.25)" }}>{Math.round(b.v * 100)}</span>
                        </motion.div>
                      </div>
                    ))}
                  </div>
                  <div className="col" style={{ alignItems: "center", height: 44, justifyContent: "center", gap: 0 }}>
                    <span className="tiny" style={{ fontWeight: 650, whiteSpace: "nowrap", color: weak ? C.pos : "var(--text)" }}>{s.icon} {s.name}</span>
                    <span className="tiny faint">n = {s.n.toLocaleString()}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
