import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { Segmented, Toggle } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, MeterBar, Stat, clamp, gauss, mean, rng, useDone } from "./shared";

/* ================================================ data: 120 days of shop sales + a leaky "customers" column */

const N_DAYS = 120, HORIZON = 14, BACKTEST = [28, 21, 14], T_MIN = 63, T_MAX = N_DAYS - HORIZON, BASKET = 2.4;
const WEEKDAY = [0.9, 0.93, 0.96, 1.0, 1.12, 1.32, 0.78]; // Mon … Sun
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Shop { sales: number[]; customers: number[] }

function makeShop(): Shop {
  const r = rng(34);
  const sales: number[] = [], customers: number[] = [];
  let wander = 0;
  for (let t = 0; t < N_DAYS; t++) {
    wander = 0.97 * wander + 5 * gauss(r); // slow ups and downs that only "yesterday" knows about
    const level = 210 + 0.9 * t + wander;
    const y = Math.max(40, level * WEEKDAY[t % 7] + 2 * gauss(r));
    sales.push(y);
    customers.push(Math.round((y / BASKET) * (1 + 0.015 * gauss(r)))); // counted at closing time — nearly proportional
  }
  return { sales, customers };
}

/* ================================================ tiny linear model on lags (+ optional customers) */

/** Solve the normal equations (with a whisper of ridge) for y ≈ X·w. */
function fit(X: number[][], y: number[]): number[] {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => Array(k + 1).fill(0));
  for (let i = 0; i < X.length; i++)
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a][b] += X[i][a] * X[i][b];
      A[a][k] += X[i][a] * y[i];
    }
  for (let a = 1; a < k; a++) A[a][a] += 1e-3 * X.length;
  for (let c = 0; c < k; c++) { // Gauss–Jordan with partial pivoting
    let p = c;
    for (let rr = c + 1; rr < k; rr++) if (Math.abs(A[rr][c]) > Math.abs(A[p][c])) p = rr;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-9;
    for (let j = c; j <= k; j++) A[c][j] /= d;
    for (let rr = 0; rr < k; rr++) if (rr !== c) { const f = A[rr][c]; for (let j = c; j <= k; j++) A[rr][j] -= f * A[c][j]; }
  }
  return A.map((row) => row[k]);
}

const features = (lag1: number, lag7: number, lag8: number, cust: number, useCust: boolean) => (useCust ? [1, lag1, lag7, lag8, cust] : [1, lag1, lag7, lag8]);
const predict = (w: number[], x: number[]) => x.reduce((s, v, i) => s + v * w[i], 0);

function train(shop: Shop, days: number[], useCust: boolean) {
  const X = days.map((t) => features(shop.sales[t - 1], shop.sales[t - 7], shop.sales[t - 8], shop.customers[t], useCust));
  return fit(X, days.map((t) => shop.sales[t]));
}

/** Multi-step forecast from day `from` for `h` days: lags come from its own guesses once inside the horizon.
 * `custFor(t)` is what the model is given for the customers column on day t. */
function forecast(shop: Shop, w: number[], from: number, h: number, useCust: boolean, custFor: (t: number) => number) {
  const known = (t: number, out: number[]) => (t < from ? shop.sales[t] : out[t - from]);
  const out: number[] = [];
  for (let t = from; t < from + h; t++) out.push(predict(w, features(known(t - 1, out), known(t - 7, out), known(t - 8, out), custFor(t), useCust)));
  return out;
}

const mae = (pred: number[], actual: number[]) => mean(pred.map((p, i) => Math.abs(p - actual[i])));

type Split = "time" | "random";

function evaluate(shop: Shop, today: number, useCust: boolean, split: Split) {
  const hist = Array.from({ length: today - 8 }, (_, i) => i + 8); // days with a full week of lags, before today
  // --- the test you'd run on your own data
  let testDays: number[], testLines: { from: number; pred: number[] }[], testMae: number;
  if (split === "time") {
    // backtest: pretend "today" was 4, 3 and 2 weeks ago, forecast 14 days ahead from each, average the misses
    testLines = BACKTEST.map((back) => {
      const cut = today - back;
      const w = train(shop, hist.filter((t) => t < cut), useCust);
      // the test rows still carry the true customers column — that's the leak
      return { from: cut, pred: forecast(shop, w, cut, HORIZON, useCust, (t) => shop.customers[t]) };
    });
    testDays = Array.from({ length: BACKTEST[0] }, (_, i) => today - BACKTEST[0] + i);
    testMae = mean(testLines.map((l) => mae(l.pred, shop.sales.slice(l.from, l.from + HORIZON))));
  } else {
    const r = rng(today * 13 + 5);
    const test = new Set(hist.filter(() => r() < 0.2));
    testDays = hist.filter((t) => test.has(t));
    const w = train(shop, hist.filter((t) => !test.has(t)), useCust);
    // every test day scored one step ahead, with yesterday's TRUE sales (and the true customers)
    const pred = testDays.map((t) => predict(w, features(shop.sales[t - 1], shop.sales[t - 7], shop.sales[t - 8], shop.customers[t], useCust)));
    testLines = [];
    testMae = mae(pred, testDays.map((t) => shop.sales[t]));
  }

  // --- the real world: retrain on everything up to today, forecast the next 14 days.
  // Nobody knows tomorrow's customers yet, so the model can only be given today's count.
  const wAll = train(shop, hist, useCust);
  const custFill = Math.round(mean(shop.customers.slice(0, today))); // the usual fill-in for a missing column: its average so far
  const future = forecast(shop, wAll, today, HORIZON, useCust, () => custFill);
  const realMae = mae(future, shop.sales.slice(today, today + HORIZON));

  // does the forecast still go up and down with the week like reality does?
  const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
  const swing = sd(future) / Math.max(1e-6, sd(shop.sales.slice(today, today + HORIZON)));

  return { testDays, testLines, testMae, future, realMae, custFill, swing };
}

/* ================================================ the demo */

const err = (v: number) => `±${Math.round(v)}`;

export function NoPeekingDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const shop = useMemo(makeShop, []);
  const [today, setToday] = useState(84);
  const [useCust, setUseCust] = useState(false);
  const [split, setSplit] = useState<Split>("time");
  const ev = useMemo(() => evaluate(shop, today, useCust, split), [shop, today, useCust, split]);

  const ratio = ev.realMae / Math.max(1e-6, ev.testMae);
  const lied = ratio > 1.5;
  const calm = ratio < 0.67; // honest test, unusually easy real stretch
  const scale = Math.max(40, ev.realMae * 1.15, ev.testMae * 1.15);
  const peeking = useCust || split === "random";

  const caption = useCust
    ? <>The test rows still carry <code>customers</code>, which is almost the answer itself (sales ≈ {BASKET} × customers), so the test misses by only <b>{err(ev.testMae)}</b>.
      But on day {today} nobody knows tomorrow's customers yet — the model can only be handed the usual average ({ev.custFill}), so its forecast goes flat and misses by <b>{err(ev.realMae)}</b>.
      The test lied because it peeked at a column that only exists <i>after</i> the day ends.</>
    : split === "random"
      ? <>Random split: every test day sits between training days and is scored <b>one step ahead</b> with the <i>true</i> sales of the days before — <b>{err(ev.testMae)}</b>.
        A real forecast runs 14 days ahead on its own guesses and misses by <b>{err(ev.realMae)}</b>.{lied ? " The test lied by letting the model peek at numbers it won't have." : " On this particular day the gap is small — drag the today line and it usually opens up to about 2×."}</>
      : <>Honest setup: pretend "today" was 2, 3 and 4 weeks ago, forecast 14 days ahead from each with only columns known in advance, and average the misses: <b>{err(ev.testMae)}</b>. The real next 14 days: <b>{err(ev.realMae)}</b>.
        {calm ? " Reality was calmer than usual this time — but the test never flattered you." : " This test tells the truth — drag the today line and it holds up."}</>;

  return (
    <DemoFrame
      controls={
        <>
          <Toggle label="Use the customers column (known only after the day ends)" checked={useCust} onChange={(v) => { setUseCust(v); done(); }} />
          <Segmented size="sm" value={split} onChange={(s) => { setSplit(s); done(); }} options={[
            { value: "time", label: "⏩ Time split" },
            { value: "random", label: "🎲 Random split" },
          ]} />
        </>
      }
      stats={
        <>
          <Stat label="Test error" value={ev.testMae} format={err} color={lied ? C.ok : C.indigo} sub="what your test reports" />
          <Stat label="Real-world error" value={ev.realMae} format={err} color={lied ? C.pos : C.indigo} emphasis={lied} sub="next 14 days, for real" />
          <Stat label="Reality ÷ test" value={ratio} format={(v) => `${v.toFixed(1)}×`} color={lied ? C.pos : C.ok} sub={lied ? "the test over-promised" : "≈ 1 means an honest test"} />
          <Stat label="Weekly swing kept" value={ev.swing} format={(v) => `${Math.round(v * 100)}%`} color={ev.swing < 0.4 ? C.pos : undefined} sub={ev.swing < 0.4 ? "the forecast went flat" : "forecast's ups & downs vs reality's"} />
        </>
      }
      caption={caption}
      captionKey={`${useCust}-${split}`}
    >
      <SalesChart shop={shop} today={today} setToday={setToday} onRelease={done} ev={ev} split={split} useCust={useCust} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div className="inset" style={{ padding: 14 }}>
          <MeterBar label="🧪 Your test score (avg miss)" value={ev.testMae} max={scale} format={err} color={lied ? C.ok : C.indigo}
            note={split === "time" ? "14-day forecasts from 2, 3 and 4 weeks ago" : "random 20% of past days, one step ahead"} />
        </div>
        <div className="inset" style={{ padding: 14 }}>
          <MeterBar label="🌍 Real-world score (avg miss)" value={ev.realMae} max={scale} format={err} color={lied ? C.pos : C.indigo}
            note={lied ? `⚠ ${ratio.toFixed(1)}× worse than the test promised` : peeking ? "close this time — move the today line" : "✓ the test told the truth"} />
        </div>
      </div>
    </DemoFrame>
  );
}

/* ------------------------------------------------ the chart: sales, the draggable today line, the 14-day forecast */

function SalesChart({ shop, today, setToday, onRelease, ev, split, useCust }: {
  shop: Shop; today: number; setToday: (t: number) => void; onRelease: () => void;
  ev: ReturnType<typeof evaluate>; split: Split; useCust: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const H = 250, stripH = 56, gap = 14, total = H + gap + stripH;
  const m = { l: 38, r: 10, t: 30, b: 24 };
  const ys = shop.sales;
  const yLo = Math.floor((Math.min(...ys, ...ev.future) - 15) / 50) * 50, yHi = Math.ceil((Math.max(...ys, ...ev.future) + 10) / 50) * 50;
  const sx = (t: number) => m.l + ((t + 0.5) / N_DAYS) * (width - m.l - m.r);
  const sy = (y: number) => H - m.b - ((y - yLo) / (yHi - yLo)) * (H - m.t - m.b);
  const todayX = sx(today - 0.5);
  const testSet = new Set(ev.testDays);

  const dayFrom = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return today;
    const t = ((clientX - r.left - m.l) / (width - m.l - m.r)) * N_DAYS;
    return clamp(Math.round(t), T_MIN, T_MAX);
  };

  const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");
  const past = line(ys.slice(0, today).map((y, t) => [t, y]));
  const fut = line(ys.slice(today - 1).map((y, i) => [today - 1 + i, y]));
  const fc = line([[today - 1, ys[today - 1]], ...ev.future.map((y, i) => [today + i, y] as [number, number])]);
  const testPaths = ev.testLines.map((l) => line(l.pred.map((y, i) => [l.from + i, y])));

  // customers strip
  const cMax = Math.max(...shop.customers) * 1.05;
  const stripTop = H + gap;
  const barW = Math.max(1, (width - m.l - m.r) / N_DAYS - 1);
  const yTicks = [yLo, (yLo + yHi) / 2, yHi];

  return (
    <div className="inset col" style={{ padding: 12, gap: 6 }}>
      <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
        <b>🛒 Daily sales · drag the 📍 today line</b>
        <Legend items={[
          { color: C.neg, label: "Known sales" },
          { color: C.warn, label: "Test days", shape: "ring" },
          { color: C.purple, label: "Forecast", shape: "line" },
          { color: "var(--text-3)", label: "The future (unknown)", shape: "dash" },
        ]} />
      </div>
      <div className="tiny faint">Model: a straight-line mix of yesterday's sales, the same day last week and the day before that{useCust ? <>, <b style={{ color: C.warn }}>plus today's customers</b></> : ""}.</div>
      <div ref={ref} style={{ width: "100%", height: total }}>
        {width > 0 && (
          <svg ref={svgRef} width={width} height={total} style={{ display: "block", touchAction: "none", cursor: dragging ? "grabbing" : "ew-resize", userSelect: "none" }}
            onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setDragging(true); setToday(dayFrom(e.clientX)); }}
            onPointerMove={(e) => dragging && setToday(dayFrom(e.clientX))}
            onPointerUp={() => { setDragging(false); onRelease(); }}
            onPointerCancel={() => setDragging(false)}>
            <defs>
              <pattern id="mlp-peek-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={6} stroke="var(--text-3)" strokeOpacity={0.22} strokeWidth={2} />
              </pattern>
            </defs>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" />
                <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{Math.round(v)}</text>
              </g>
            ))}
            {[0, 28, 56, 84, 112].map((t) => <text key={t} x={sx(t)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text-3)">day {t}</text>)}

            {/* the future: greyed out */}
            <rect x={todayX} y={m.t - 6} width={Math.max(0, width - m.r - todayX)} height={total - m.t + 6} fill="url(#mlp-peek-hatch)" />
            <rect x={todayX} y={m.t - 6} width={Math.max(0, width - m.r - todayX)} height={total - m.t + 6} fill="var(--text-3)" fillOpacity={0.06} />
            <text x={Math.min(width - m.r - 4, todayX + 8)} y={m.t + 8} fontSize={10} fontWeight={650} fill="var(--text-2)" textAnchor={todayX > width - 110 ? "end" : "start"}>future →</text>

            {/* time split: the held-out block */}
            {split === "time" && (
              <rect x={sx(today - BACKTEST[0] - 0.5)} y={m.t} width={sx(today - 0.5) - sx(today - BACKTEST[0] - 0.5)} height={H - m.b - m.t} fill={C.warn} fillOpacity={0.1} />
            )}

            <path d={fut} fill="none" stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="4 4" />
            <path d={past} fill="none" stroke={C.neg} strokeWidth={1.8} strokeLinejoin="round" />
            {testPaths.map((d, i) => <path key={i} d={d} fill="none" stroke={C.warn} strokeWidth={1.6} strokeOpacity={0.55 + 0.2 * i} strokeDasharray="5 3" />)}
            {ys.map((y, t) => {
              const isFut = t >= today, isTest = testSet.has(t);
              if (isFut && t >= today + HORIZON) return null;
              return (
                <circle key={t} cx={sx(t)} cy={sy(y)} r={isTest ? 3.6 : 2.4}
                  style={{ fill: isTest || isFut ? "var(--glass-strong)" : C.neg, stroke: isTest ? C.warn : isFut ? "var(--text-3)" : "none", strokeWidth: 1.6, transition: "fill .3s, stroke .3s" }} />
              );
            })}
            {/* the 14-day forecast */}
            <motion.path initial={false} animate={{ d: fc }} transition={dragging ? { duration: 0 } : { type: "spring", stiffness: 160, damping: 24 }}
              fill="none" stroke={C.purple} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 6px ${C.purple}55)` }} />

            {/* customers strip */}
            <text x={m.l} y={stripTop - 2} fontSize={10} fontWeight={650} fill={useCust ? C.warn : "var(--text-3)"}>
              👥 customers (counted at closing time){useCust ? " — used by the model" : ""}
            </text>
            {shop.customers.map((cst, t) => {
              const h = (cst / cMax) * (stripH - 8);
              const isFut = t >= today;
              if (isFut && t >= today + HORIZON) return null;
              return isFut
                ? <rect key={t} x={sx(t) - barW / 2} y={stripTop + stripH - h} width={barW} height={h} fill="none" stroke="var(--text-3)" strokeOpacity={0.5} strokeDasharray="2 2" />
                : <rect key={t} x={sx(t) - barW / 2} y={stripTop + stripH - h} width={barW} height={h} rx={1} fill={useCust ? C.warn : "var(--text-3)"} fillOpacity={useCust ? 0.75 : 0.35} />;
            })}
            {useCust && (() => {
              const h = (ev.custFill / cMax) * (stripH - 8);
              return (
                <g>
                  <line x1={sx(today) - barW / 2} x2={sx(today + HORIZON - 1) + barW / 2} y1={stripTop + stripH - h} y2={stripTop + stripH - h} stroke={C.pos} strokeWidth={2.2} />
                  <text x={width - m.r - 2} y={stripTop + 9} fontSize={9.5} fontWeight={700} fill={C.pos} textAnchor="end" stroke="var(--glass-strong)" strokeWidth={3} paintOrder="stroke">unknown → filled with {ev.custFill}</text>
                </g>
              );
            })()}

            {/* the draggable today line */}
            <line x1={todayX} x2={todayX} y1={m.t - 8} y2={total} stroke={C.purple} strokeWidth={2} />
            <g transform={`translate(${clamp(todayX, m.l + 50, width - m.r - 50)}, ${m.t - 16})`}>
              <rect x={-50} y={-11} width={100} height={20} rx={10} fill={C.purple} style={{ filter: `drop-shadow(0 3px 8px ${C.purple}66)` }} />
              <text x={0} y={3} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="white">📍 today · {DAY_NAMES[today % 7]} {today}</text>
            </g>
            <circle cx={todayX} cy={H - m.b} r={dragging ? 8 : 6.5} fill={C.purple} stroke="white" strokeWidth={2.5} style={{ transition: "r .15s" }} />
          </svg>
        )}
      </div>
      <AnimatePresence initial={false}>
        {useCust && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.snappy}
            className="tiny" style={{ color: "var(--danger)", fontWeight: 560 }}>
            🚩 After today the customers bars are empty: the number only exists once the shop has closed. The model is handed the column's usual average instead, so its forecast flattens.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
