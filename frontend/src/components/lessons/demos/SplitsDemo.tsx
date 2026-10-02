import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Segmented } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, MeterBar, Stat, gauss, mean, rng, useDone } from "./shared";

type Mode = "groups" | "time";
type GSplit = "random" | "group";
type TSplit = "random" | "time";

function shuffle<T>(xs: T[], r: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ================================================ groups: patients with repeat visits */

const N_PATIENTS = 16;
const patientColor = (p: number) => `hsl(${Math.round((p * 360) / N_PATIENTS + 8)} 72% 56%)`;
interface Visit { id: string; patient: number }

function makeVisits(): Visit[] {
  const r = rng(12);
  const out: Visit[] = [];
  for (let p = 0; p < N_PATIENTS; p++) {
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) out.push({ id: `v${p}-${k}`, patient: p });
  }
  return out;
}

function splitVisits(visits: Visit[], how: GSplit, seed: number): Set<string> {
  const r = rng(seed);
  if (how === "random") {
    const order = shuffle(visits, r);
    return new Set(order.slice(0, Math.round(visits.length * 0.25)).map((v) => v.id));
  }
  const testPatients = new Set(shuffle([...Array(N_PATIENTS).keys()], r).slice(0, 4));
  return new Set(visits.filter((v) => testPatients.has(v.patient)).map((v) => v.id));
}

/* ================================================ time: monthly sales with a growing trend */

interface Month { t: number; y: number }
const N_MONTHS = 36, N_FUTURE = 6, CUT = 29, BW = 1.2;

function makeSales(): Month[] {
  const r = rng(4);
  return Array.from({ length: N_MONTHS + N_FUTURE }, (_, t) => ({ t, y: 80 + 1.5 * t + 0.08 * t * t + 5 * Math.sin((2 * Math.PI * (t - 4)) / 12) + 3 * gauss(r) }));
}

/** A flexible smoother (like a tree or KNN): great between known points, flat beyond the last one. */
function smoother(train: Month[]) {
  return (t: number) => {
    let w = 0, s = 0;
    for (const p of train) { const k = Math.exp(-((p.t - t) ** 2) / (2 * BW * BW)); w += k; s += k * p.y; }
    return w ? s / w : 0;
  };
}
const ptsFmt = (v: number) => `${Math.round(v * 100)} pt${Math.round(v * 100) === 1 ? "" : "s"}`;
const forecastAcc = (f: (t: number) => number, pts: Month[]) => 1 - mean(pts.map((p) => Math.abs(p.y - f(p.t)) / p.y));

export function SplitsDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [mode, setMode] = useState<Mode>("groups");
  const [gsplit, setGSplit] = useState<GSplit>("random");
  const [tsplit, setTSplit] = useState<TSplit>("random");
  const [seed, setSeed] = useState(3);

  /* ---------- groups */
  const visits = useMemo(makeVisits, []);
  const g = useMemo(() => {
    const test = splitVisits(visits, gsplit, seed);
    const inTest = new Set<number>(), inTrain = new Set<number>();
    for (const v of visits) (test.has(v.id) ? inTest : inTrain).add(v.patient);
    const both = new Set([...inTest].filter((p) => inTrain.has(p)));
    const testVisits = visits.filter((v) => test.has(v.id));
    const leakedShare = testVisits.filter((v) => both.has(v.patient)).length / Math.max(1, testVisits.length);
    // A model that memorises patients looks great on visits from people it has already seen.
    const said = 0.75 + 0.21 * leakedShare;
    return { test, both, said, real: 0.74, nTest: testVisits.length };
  }, [visits, gsplit, seed]);

  /* ---------- time */
  const sales = useMemo(makeSales, []);
  const t = useMemo(() => {
    const data = sales.slice(0, N_MONTHS), future = sales.slice(N_MONTHS);
    const testIdx = tsplit === "time"
      ? new Set(data.filter((p) => p.t >= CUT).map((p) => p.t))
      : new Set(shuffle(data.slice(1, -1).map((p) => p.t), rng(seed + 40)).slice(0, N_MONTHS - CUT));
    const train = data.filter((p) => !testIdx.has(p.t)), test = data.filter((p) => testIdx.has(p.t));
    const f = smoother(train);
    const final = smoother(data); // after validation you retrain on everything, then forecast
    return {
      testIdx,
      curve: Array.from({ length: (N_MONTHS + N_FUTURE - 1) * 2 + 1 }, (_, i) => f(i / 2)),
      said: forecastAcc(f, test),
      real: forecastAcc(final, future),
    };
  }, [sales, tsplit, seed]);

  const said = mode === "groups" ? g.said : t.said;
  const real = mode === "groups" ? g.real : t.real;
  const gap = said - real;
  const honest = gap < 0.05;

  const caption = mode === "groups"
    ? gsplit === "random"
      ? <><b>{g.both.size} patients</b> appear on both sides (ringed). The model has already met them, so the test is partly a <b>memory test</b>: it reports <b>{Math.round(g.said * 100)}%</b>, but on brand-new patients it gets <b>{Math.round(g.real * 100)}%</b>.</>
      : <>Every patient's visits stay together, so the test patients are true strangers. The score drops to <b>{Math.round(g.said * 100)}%</b> — and that's exactly what you get on new patients. Lower, but <b>honest</b>.</>
    : tsplit === "random"
      ? <>Test months are sprinkled between training months, so the model only has to <b>fill gaps</b> between neighbours it already knows: <b>{Math.round(t.said * 100)}%</b>. The real job — forecasting months that haven't happened — goes worse: <b>{Math.round(t.real * 100)}%</b>.</>
      : <>Train on the past, test on the most recent months. Now the model has to <b>extrapolate</b> like it will in real life, and its score of <b>{Math.round(t.said * 100)}%</b> is a fair preview of the next six months (<b>{Math.round(t.real * 100)}%</b>).</>;

  const curSplit = mode === "groups" ? gsplit : tsplit;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 14, rowGap: 10, width: "100%", justifyContent: "space-between" }}>
          <Segmented value={mode} onChange={(m) => { setMode(m); done(); }} options={[
            { value: "groups", label: "👥 Repeat patients" },
            { value: "time", label: "📅 Sales over time" },
          ]} />
          <div className="row" style={{ gap: 8 }}>
            {mode === "groups" ? (
              <Segmented size="sm" value={gsplit} onChange={(s) => { setGSplit(s); done(); }} options={[
                { value: "random", label: "🎲 Random split" },
                { value: "group", label: "🧷 Keep patients together" },
              ]} />
            ) : (
              <Segmented size="sm" value={tsplit} onChange={(s) => { setTSplit(s); done(); }} options={[
                { value: "random", label: "🎲 Random split" },
                { value: "time", label: "⏩ Past → future" },
              ]} />
            )}
            <button className="btn ghost sm" title="Draw a different split" onClick={() => { setSeed((s) => s + 1); done(); }}>↻ Reshuffle</button>
          </div>
        </div>
      }
      stats={mode === "groups" ? (
        <>
          <Stat key={`both-${g.both.size > 0}`} label="Patients on both sides" value={g.both.size} format={(v) => `${Math.round(v)} / ${N_PATIENTS}`} color={g.both.size ? C.pos : C.ok} emphasis={g.both.size > 0} sub={g.both.size ? "the model has seen them before" : "test patients are strangers"} />
          <Stat label="Visits in test" value={g.nTest} format={(v) => String(Math.round(v))} sub={`of ${visits.length} visits`} />
          <Stat label="Over-promise" value={Math.max(0, gap)} format={ptsFmt} color={honest ? C.ok : C.pos} sub="test score − real score" />
        </>
      ) : (
        <>
          <Stat label="Test months" value={N_MONTHS - CUT} format={(v) => String(Math.round(v))} sub={tsplit === "time" ? "the most recent ones" : "scattered through the years"} />
          <Stat label="Model has to…" value={0} format={() => (tsplit === "time" ? "forecast" : "fill gaps")} color={tsplit === "time" ? C.ok : C.warn} sub={tsplit === "time" ? "just like in real life" : "an easier job than real life"} />
          <Stat label="Over-promise" value={Math.max(0, gap)} format={ptsFmt} color={honest ? C.ok : C.pos} sub="test score − real score" />
        </>
      )}
      caption={caption}
      captionKey={`${mode}-${curSplit}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {mode === "groups"
            ? <Bins visits={visits} test={g.test} both={g.both} />
            : <Timeline sales={sales} testIdx={t.testIdx} curve={t.curve} byTime={tsplit === "time"} />}
        </motion.div>
      </AnimatePresence>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div className="inset" style={{ padding: 14 }}>
          <MeterBar label="🧪 Test score said" value={said} color={honest ? C.indigo : C.ok} note={mode === "groups" ? "accuracy on the held-out visits" : "forecast accuracy on the held-out months"} />
        </div>
        <div className="inset" style={{ padding: 14 }}>
          <MeterBar label={mode === "groups" ? "🏥 On brand-new patients" : "🔮 The next 6 months, for real"} value={real} color={honest ? C.indigo : C.pos}
            note={honest ? "✓ the test told the truth" : `⚠ ${Math.round(gap * 100)} points the test promised but didn't deliver`} />
        </div>
      </div>
    </DemoFrame>
  );
}

/* ------------------------------------------------ groups visual: dots fly into Train / Test bins */

function Bins({ visits, test, both }: { visits: Visit[]; test: Set<string>; both: Set<number> }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const cell = width < 700 ? 19 : 22, r = cell * 0.32, gutter = 14;
  const trainW = Math.max(0, (width - gutter) * 0.66), testX = trainW + gutter, testW = Math.max(0, width - testX);
  const colsTrain = Math.max(1, Math.floor((trainW - 20) / cell)), colsTest = Math.max(1, Math.floor((testW - 20) / cell));
  const trainVisits = visits.filter((v) => !test.has(v.id)), testVisits = visits.filter((v) => test.has(v.id));
  const rows = Math.max(Math.ceil(trainVisits.length / colsTrain), Math.ceil(testVisits.length / colsTest), 3);
  const top = 36, height = top + rows * cell + 14;
  const pos = new Map<string, [number, number]>();
  trainVisits.forEach((v, i) => pos.set(v.id, [10 + (i % colsTrain) * cell + cell / 2, top + Math.floor(i / colsTrain) * cell + cell / 2]));
  testVisits.forEach((v, i) => pos.set(v.id, [testX + 10 + (i % colsTest) * cell + cell / 2, top + Math.floor(i / colsTest) * cell + cell / 2]));

  return (
    <div className="inset col" style={{ padding: 12, gap: 10 }}>
      <div className="row wrap between small" style={{ gap: 8, rowGap: 6 }}>
        <b>16 patients · each dot is one hospital visit</b>
        <Legend items={[{ color: "var(--text-3)", label: "Visit (colour = patient)" }, { color: C.pos, label: "Patient on both sides", shape: "ring" }]} />
      </div>
      <div className="row wrap" style={{ gap: 5 }}>
        {Array.from({ length: N_PATIENTS }, (_, p) => (
          <motion.span key={p} initial={false} animate={{ scale: both.has(p) ? 1.08 : 1 }} transition={spring.pop} title={`Patient ${p + 1}${both.has(p) ? " — in train AND test" : ""}`}
            className="tiny" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px 2px 3px", borderRadius: 10, fontWeight: 650,
              background: both.has(p) ? `${C.pos}1f` : "var(--fill)", boxShadow: both.has(p) ? `0 0 0 1.5px ${C.pos}` : "none", transition: "background .3s, box-shadow .3s" }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: patientColor(p) }} />P{p + 1}
          </motion.span>
        ))}
      </div>
      <div ref={ref} style={{ width: "100%", height }}>
        {width > 0 && (
          <svg width={width} height={height}>
            <style>{`.mlp-vis{transition:transform .85s cubic-bezier(.34,1.18,.64,1)}.mlp-vis .ring{transition:opacity .35s}`}</style>
            {[{ x: 0, w: trainW, label: "🏋️ Train · 75%", c: C.neg }, { x: testX, w: testW, label: "🧪 Test · 25%", c: C.warn }].map((b) => (
              <g key={b.label}>
                <rect x={b.x + 0.5} y={0.5} width={Math.max(0, b.w - 1)} height={height - 1} rx={12} fill={b.c} fillOpacity={0.06} stroke={b.c} strokeOpacity={0.35} strokeDasharray="5 4" />
                <text x={b.x + 12} y={22} fontSize={12} fontWeight={700} fill={b.c}>{b.label}</text>
              </g>
            ))}
            {visits.map((v, i) => {
              const [x, y] = pos.get(v.id) ?? [0, 0];
              const leak = both.has(v.patient);
              return (
                <g key={v.id} className="mlp-vis" style={{ transform: `translate(${x}px, ${y}px)`, transitionDelay: `${(i % 24) * 12}ms` }}>
                  <circle className="ring" r={r + 3.2} fill="none" stroke={C.pos} strokeWidth={2} opacity={leak ? 0.95 : 0} />
                  <circle r={r} fill={patientColor(v.patient)} stroke="var(--glass-strong)" strokeWidth={1} />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------ time visual: monthly sales, cut line, forecast */

function Timeline({ sales, testIdx, curve, byTime }: { sales: Month[]; testIdx: Set<number>; curve: number[]; byTime: boolean }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 250;
  const m = { l: 36, r: 10, t: 24, b: 26 };
  const total = N_MONTHS + N_FUTURE;
  const ys = sales.map((p) => p.y);
  const yLo = Math.floor((Math.min(...ys) - 8) / 10) * 10, yHi = Math.ceil((Math.max(...ys) + 8) / 10) * 10;
  const sx = (t: number) => m.l + ((t + 0.5) / total) * (width - m.l - m.r);
  const sy = (y: number) => height - m.b - ((y - yLo) / (yHi - yLo)) * (height - m.t - m.b);
  const path = curve.map((y, i) => `${i ? "L" : "M"}${sx(i / 2).toFixed(1)},${sy(y).toFixed(1)}`).join("");
  const cutX = sx(CUT - 0.5), futX = sx(N_MONTHS - 0.5);
  const yTicks = [yLo, (yLo + yHi) / 2, yHi].map((v) => Math.round(v));

  return (
    <div className="inset col" style={{ padding: 12, gap: 6 }}>
      <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
        <b>📈 Monthly sales · 3 years of history</b>
        <Legend items={[{ color: C.neg, label: "Train month" }, { color: C.warn, label: "Test month", shape: "ring" }, { color: C.purple, label: "Model", shape: "line" }, { color: "var(--text-3)", label: "What really happened next", shape: "ring" }]} />
      </div>
      <div ref={ref} style={{ width: "100%", height }}>
        {width > 0 && (
          <svg width={width} height={height}>
            <defs>
              <pattern id="mlp-split-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={6} stroke="var(--text-3)" strokeOpacity={0.25} strokeWidth={2} />
              </pattern>
            </defs>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" />
                <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{v}</text>
              </g>
            ))}
            {[0, 12, 24, 36].map((t) => <text key={t} x={sx(t)} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--text-3)">{`Year ${t / 12 + 1}`}</text>)}
            {/* the real future */}
            <rect x={futX} y={m.t - 16} width={width - m.r - futX} height={height - m.b - m.t + 16} fill="url(#mlp-split-hatch)" rx={6} />
            <text x={(futX + width - m.r) / 2} y={m.t - 5} textAnchor="middle" fontSize={9.5} fontWeight={650} fill="var(--text-2)">next 6 months</text>
            {/* random test months: soft columns */}
            {sales.slice(0, N_MONTHS).map((p) => (
              <rect key={`b${p.t}`} x={sx(p.t - 0.5)} width={sx(1) - sx(0)} y={m.t} height={height - m.b - m.t} fill={C.warn}
                style={{ opacity: !byTime && testIdx.has(p.t) ? 0.1 : 0, transition: "opacity .45s" }} />
            ))}
            {/* past → future: shaded test block + animated cut line */}
            <motion.rect initial={false} animate={{ opacity: byTime ? 1 : 0, width: byTime ? futX - cutX : 0 }} transition={spring.gentle}
              x={cutX} y={m.t} height={height - m.b - m.t} fill={C.warn} fillOpacity={0.1} />
            <motion.g initial={false} animate={{ opacity: byTime ? 1 : 0, y: byTime ? 0 : -14 }} transition={spring.gentle}>
              <line x1={cutX} x2={cutX} y1={m.t - 16} y2={height - m.b} stroke={C.warn} strokeWidth={2} strokeDasharray="5 4" />
              <text x={cutX - 6} y={m.t - 5} textAnchor="end" fontSize={10} fontWeight={700} fill={C.neg}>← train on the past</text>
              <text x={cutX + 6} y={m.t + 10} fontSize={10} fontWeight={700} fill={C.warn}>test →</text>
            </motion.g>
            <motion.path initial={false} animate={{ d: path }} transition={{ type: "spring", stiffness: 110, damping: 20 }}
              fill="none" stroke={C.purple} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 6px ${C.purple}55)` }} />
            {sales.map((p) => {
              const future = p.t >= N_MONTHS, isTest = testIdx.has(p.t);
              const col = future ? "var(--text-3)" : isTest ? C.warn : C.neg;
              return (
                <circle key={p.t} cx={sx(p.t)} cy={sy(p.y)} r={isTest ? 5 : 4.2} strokeWidth={isTest || future ? 2 : 1.2}
                  style={{ fill: isTest || future ? "var(--glass-strong)" : col, stroke: isTest || future ? col : "var(--glass-strong)", transition: "fill .4s, stroke .4s, r .4s" }} />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
