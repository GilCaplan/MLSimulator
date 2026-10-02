import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Toggle } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, clamp, gauss, mean, r2, rng, useDone } from "./shared";

interface Ride { id: string; fare: number; card: 0 | 1; hour: number; day: number; late: 0 | 1; tip: number }
const FX: [number, number] = [0, 62];
const TY: [number, number] = [-1.5, 15];
const CARD = C.neg, CASH = C.warn;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function makeRides(): Ride[] {
  const r = rng(4);
  return Array.from({ length: 150 }, (_, i) => {
    const fare = clamp(Math.exp(2.7 + 0.55 * gauss(r)), 4, 60);
    const card = (r() < 0.66 ? 1 : 0) as 0 | 1;
    const hour = Math.floor(r() * 24), day = Math.floor(r() * 7);
    const late = (hour >= 22 || hour < 4 ? 1 : 0) as 0 | 1;
    // Card riders tip a share of the fare plus a late-night bonus; cash tips are never recorded → 0.
    const tip = card ? Math.max(0, 0.16 * fare + 1.7 * late + 0.45 * gauss(r) + 0.025 * fare * gauss(r)) : 0;
    return { id: `r${i}`, fare, card, hour, day, late, tip };
  });
}

/** Least squares via the normal equations (tiny ridge for stability), Gaussian elimination with pivoting. */
function lstsq(X: number[][], y: number[]) {
  const n = X[0].length;
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  X.forEach((row, k) => { for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] += row[i] * row[j]; A[i][n] += row[i] * y[k]; } });
  for (let i = 0; i < n; i++) A[i][i] += 1e-8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let rr = c + 1; rr < n; rr++) if (Math.abs(A[rr][c]) > Math.abs(A[p][c])) p = rr;
    [A[c], A[p]] = [A[p], A[c]];
    for (let rr = 0; rr < n; rr++) {
      if (rr === c || !A[c][c]) continue;
      const k = A[rr][c] / A[c][c];
      for (let j = c; j <= n; j++) A[rr][j] -= k * A[c][j];
    }
  }
  return A.map((row, i) => (row[i] ? row[n] / row[i] : 0));
}

const featuresOf = (d: { fare: number; card: number; late: number }, inter: boolean, late: boolean) =>
  [1, d.fare, d.card, ...(inter ? [d.fare * d.card] : []), ...(late ? [inter ? d.late * d.card : d.late] : [])];

const usd = (v: number) => `$${v.toFixed(2)}`;

export function FeaturesDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [inter, setInter] = useState(false);
  const [late, setLate] = useState(false);
  const rides = useMemo(makeRides, []);

  const fit = useMemo(() => {
    const y = rides.map((d) => d.tip);
    const w = lstsq(rides.map((d) => featuresOf(d, inter, late)), y);
    const predict = (d: { fare: number; card: number; late: number }) => featuresOf(d, inter, late).reduce((s, v, i) => s + v * w[i], 0);
    const preds = rides.map(predict);
    const resid = rides.map((d, i) => d.tip - preds[i]);
    return { predict, resid, r2: r2(y, preds), rmse: Math.sqrt(mean(resid.map((e) => e * e))) };
  }, [rides, inter, late]);

  const caption = !inter && late
    ? <><code>late_night</code> helps a little (R² <b>{fit.r2.toFixed(2)}</b>), but the lines are still parallel: cash riders' predicted tips keep climbing with the fare. The shape is wrong — try <code>fare × card</code>.</>
    : !inter
    ? <>With only <code>fare</code> and <code>paid_by_card</code>, a linear model can just draw <b>two parallel lines</b>: the same slope for everyone. So it predicts cash riders tip more on long trips (they record $0) and underestimates big card fares. R² = <b>{fit.r2.toFixed(2)}</b>.</>
    : !late
      ? <>Adding one hand-made column, <code>fare × card</code>, lets the same simple model draw a <b>fan</b>: tips grow with the fare for card riders and stay at $0 for cash. R² jumps to <b>{fit.r2.toFixed(2)}</b> — no fancier model needed.</>
      : <>Pulling <code>late_night</code> out of the raw timestamp adds another real pattern: card riders tip extra at night. Misses shrink to <b>{usd(fit.rmse)}</b> and R² reaches <b>{fit.r2.toFixed(2)}</b>. Good features beat fancy models.</>;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 22, rowGap: 10, width: "100%", alignItems: "center" }}>
          <span className="small muted" style={{ fontWeight: 560 }}>Linear model gets:</span>
          <span className="row wrap" style={{ gap: 6 }}>
            <FeatChip name="fare" on />
            <FeatChip name="paid_by_card" on />
            <FeatChip name="fare × card" on={inter} added />
            <FeatChip name={inter ? "late_night × card" : "late_night"} on={late} added />
          </span>
          <span className="row wrap" style={{ gap: 18, rowGap: 8, marginLeft: "auto" }}>
            <Toggle label="Add fare × card" checked={inter} onChange={(v) => { setInter(v); done(); }}
              help="A new column that equals the fare for card rides and 0 for cash. It lets a straight-line model give card riders their own slope." />
            <Toggle label="Add late night" checked={late} onChange={(v) => { setLate(v); done(); }}
              help="Derived from the pickup timestamp: 1 if the ride started between 10pm and 4am. With fare × card on, it is paired with card too, since cash tips are always recorded as $0." />
          </span>
        </div>
      }
      stats={
        <>
          <Stat label="R² · variance explained" value={fit.r2} format={(v) => v.toFixed(2)} color={fit.r2 > 0.8 ? C.ok : C.warn} emphasis sub="1.00 would be perfect" />
          <Stat label="Typical miss" value={fit.rmse} format={usd} sub="root-mean-square error per ride" />
          <Stat label="Model" value={0} format={() => "Linear"} color="var(--text-2)" sub="the same simple model every time" />
        </>
      }
      caption={caption}
      captionKey={`${inter}-${late}`}
    >
      <FeaturesBody rides={rides} predict={fit.predict} resid={fit.resid} inter={inter} late={late} />
    </DemoFrame>
  );
}

function FeatChip({ name, on, added }: { name: string; on: boolean; added?: boolean }) {
  return (
    <motion.span layout className="mono" initial={false} animate={{ opacity: on ? 1 : 0.5, scale: on ? 1 : 0.96 }} transition={spring.snappy}
      style={{ fontSize: 11.5, padding: "4px 9px", borderRadius: 8, whiteSpace: "nowrap", fontWeight: 600,
        background: on ? (added ? `${C.purple}22` : "var(--accent-soft)") : "transparent",
        border: `1.5px ${on ? "solid" : "dashed"} ${on ? (added ? `${C.purple}88` : "var(--accent)") : "var(--hairline)"}`,
        color: on ? "var(--text)" : "var(--text-3)" }}>
      {added && on ? "✨ " : ""}{name}
    </motion.span>
  );
}

function FeaturesBody({ rides, predict, resid, inter, late }: {
  rides: Ride[]; predict: (d: { fare: number; card: number; late: number }) => number; resid: number[]; inter: boolean; late: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const side = width > 760;
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: side ? "1.6fr 1fr" : "1fr", gap: 12 }}>
      <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <b>🚕 Tip vs fare · 150 NYC rides</b>
          <Legend items={[{ color: CARD, label: "Card" }, { color: CASH, label: "Cash (tip not recorded)" }, ...(late ? [{ color: "var(--text-2)", label: "Late night", shape: "ring" as const }] : [])]} />
        </div>
        <TipPlot rides={rides} predict={predict} late={late} inter={inter} />
        <ResidStrip resid={resid} rides={rides} />
      </div>
      <div className="col" style={{ gap: 12 }}>
        <TimestampChip active={late} />
        <div className="inset col" style={{ padding: 14, gap: 8 }}>
          <b className="small">What the model can draw</b>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${inter}-${late}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
              className="small muted" style={{ lineHeight: 1.55 }}>
              {!inter ? <>One shared slope, shifted up for card{late ? " and for nights" : ""}: <span className="mono tiny">tip = a + b·fare + c·card{late ? " + e·late" : ""}</span></>
                : <>Card riders get their own slope: <span className="mono tiny">… + d·(fare × card)</span>{late && <> and card rides at night get a bonus: <span className="mono tiny">+ e·(late × card)</span></>}</>}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function TipPlot({ rides, predict, late, inter }: { rides: Ride[]; predict: (d: { fare: number; card: number; late: number }) => number; late: boolean; inter: boolean }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 240;
  const m = { l: 30, r: 10, t: 8, b: 24 };
  const sx = (f: number) => m.l + ((f - FX[0]) / (FX[1] - FX[0])) * (width - m.l - m.r);
  const sy = (t: number) => height - m.b - ((clamp(t, TY[0], TY[1]) - TY[0]) / (TY[1] - TY[0])) * (height - m.t - m.b);
  const lines = [
    { key: "card-day", card: 1, late: 0, color: CARD, dash: undefined },
    { key: "cash-day", card: 0, late: 0, color: CASH, dash: undefined },
    { key: "card-night", card: 1, late: 1, color: CARD, dash: "6 4" },
    { key: "cash-night", card: 0, late: 1, color: CASH, dash: "6 4" },
  ];
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          {[0, 5, 10, 15].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? "var(--text-3)" : "var(--hairline)"} strokeOpacity={v === 0 ? 0.5 : 1} />
              <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">${v}</text>
            </g>
          ))}
          {[10, 20, 30, 40, 50, 60].map((f) => <text key={f} x={sx(f)} y={height - 7} textAnchor="middle" fontSize={10} fill="var(--text-3)">${f}</text>)}
          {rides.map((d) => (
            <g key={d.id} style={{ transform: `translate(${sx(d.fare)}px, ${sy(d.tip)}px)` }}>
              <circle r={3.6} fill={d.card ? CARD : CASH} fillOpacity={0.7} />
              <circle r={6} fill="none" stroke="var(--text-2)" strokeWidth={1.2} style={{ opacity: late && d.late && d.card ? 0.8 : 0, transition: "opacity .4s" }} />
            </g>
          ))}
          {lines.map((l) => {
            const a = predict({ fare: FX[0] + 2, card: l.card, late: l.late }), b = predict({ fare: FX[1] - 2, card: l.card, late: l.late });
            const visible = l.late === 0 || (late && !(inter && l.card === 0)); // with late × card, cash nights equal cash days
            return (
              <motion.line key={l.key} initial={false} transition={{ type: "spring", stiffness: 120, damping: 20 }}
                animate={{ x1: sx(FX[0] + 2), x2: sx(FX[1] - 2), y1: sy(a), y2: sy(b), opacity: visible ? 1 : 0 }}
                stroke={l.color} strokeWidth={3} strokeLinecap="round" strokeDasharray={l.dash} style={{ filter: `drop-shadow(0 2px 5px ${l.color}66)` }} />
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Each ride's miss (actual − predicted) as a dot on a ±$6 strip: the tighter, the better. */
function ResidStrip({ resid, rides }: { resid: number[]; rides: Ride[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 40, R = 6;
  const sx = (e: number) => 30 + ((clamp(e, -R, R) + R) / (2 * R)) * (width - 40);
  const jit = useMemo(() => { const r = rng(9); return rides.map(() => r()); }, [rides]);
  return (
    <div className="col" style={{ gap: 2 }}>
      <div className="row between tiny faint"><span>misses per ride (actual − predicted)</span><span>−$6 … +$6</span></div>
      <div ref={ref} style={{ width: "100%", height }}>
        {width > 0 && (
          <svg width={width} height={height}>
            <style>{`.mlp-rs{transition:transform .8s cubic-bezier(.32,.72,0,1)}`}</style>
            <rect x={30} y={4} width={width - 40} height={height - 8} rx={8} fill="var(--fill)" />
            <line x1={sx(0)} x2={sx(0)} y1={2} y2={height - 2} stroke="var(--text-3)" strokeDasharray="2 3" />
            {resid.map((e, i) => (
              <circle key={rides[i].id} className="mlp-rs" r={2.6} fill={rides[i].card ? CARD : CASH} fillOpacity={0.65}
                style={{ transform: `translate(${sx(e)}px, ${8 + jit[i] * (height - 16)}px)` }} />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

/** A raw timestamp turning into usable columns. Cycles through a few example rides. */
const EXAMPLES = [
  { date: "2024-03-15", hour: 23, min: 42, day: 4 },
  { date: "2024-03-18", hour: 8, min: 5, day: 0 },
  { date: "2024-03-23", hour: 1, min: 17, day: 5 },
  { date: "2024-03-20", hour: 14, min: 30, day: 2 },
];

function TimestampChip({ active }: { active: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((k) => (k + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(id);
  }, []);
  const ex = EXAMPLES[i];
  const isLate = ex.hour >= 22 || ex.hour < 4;
  const derived = [
    { k: "hour", v: String(ex.hour) },
    { k: "weekday", v: DAYS[ex.day] },
    { k: "late_night", v: isLate ? "1 🌙" : "0", hot: true },
  ];
  return (
    <div className="inset col" style={{ padding: 14, gap: 10 }}>
      <div className="row between small"><b>Feature engineering</b><span className="tiny faint">from one raw column</span></div>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={i} className="mono" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.snappy}
            style={{ fontSize: 11.5, padding: "4px 9px", borderRadius: 8, background: "var(--fill)", whiteSpace: "nowrap" }}>
            pickup: {ex.date} {String(ex.hour).padStart(2, "0")}:{String(ex.min).padStart(2, "0")}
          </motion.span>
        </AnimatePresence>
        <motion.span animate={{ x: active ? [0, 4, 0] : 0, opacity: active ? 1 : 0.4 }} transition={{ duration: 1.2, repeat: active ? Infinity : 0 }} style={{ color: C.purple, fontWeight: 700 }}>→</motion.span>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {derived.map((d, k) => (
          <motion.span key={d.k} className="mono" initial={false}
            animate={{ opacity: active ? 1 : 0.35, scale: active ? 1 : 0.92, y: active ? 0 : 4 }} transition={{ ...spring.pop, delay: active ? k * 0.08 : 0 }}
            style={{ fontSize: 11.5, padding: "4px 9px", borderRadius: 8, whiteSpace: "nowrap", fontWeight: 600,
              background: active ? (d.hot ? `${C.purple}26` : "var(--accent-soft)") : "transparent",
              border: `1.5px ${active ? "solid" : "dashed"} ${active ? (d.hot ? `${C.purple}88` : "var(--accent)") : "var(--hairline)"}` }}>
            {d.k}: <motion.b key={`${d.k}${i}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} style={{ display: "inline-block" }}>{d.v}</motion.b>
          </motion.span>
        ))}
      </div>
      <span className="tiny faint">{active ? "the model now knows when the ride happened" : "turn on “late night” to derive these"}</span>
    </div>
  );
}
