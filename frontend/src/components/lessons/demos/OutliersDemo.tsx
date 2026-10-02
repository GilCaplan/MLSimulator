import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Toggle } from "../../glass";
import { niceTicks, useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, MorphBars, Stat, clamp, clipLine, gauss, money, ols, r2, rng, useDone } from "./shared";

interface Car { id: string; age: number; price: number; typo?: string }

function makeCars(n: number, seed: number): Car[] {
  const r = rng(seed);
  const out: Car[] = [];
  for (let i = 0; i < n; i++) {
    const age = clamp(6 + 3 * gauss(r), 0.6, 15);
    const price = Math.round(40000 * Math.exp(-0.16 * age + 0.3 * gauss(r)) / 50) * 50;
    out.push({ id: `c${i}`, age, price: Math.max(1200, price) });
  }
  return out;
}

const TYPOS: Car[] = [
  { id: "t0", age: 3.4, price: 0, typo: "$0" },
  { id: "t1", age: 12.2, price: 1, typo: "$1" },
  { id: "t2", age: 8.6, price: 2_000_000_000, typo: "$2,000,000,000" },
];

const LOG_TICKS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
const ty = (price: number, log: boolean) => (log ? Math.log10(1 + price) : price);

function fmtR2(v: number) {
  if (v >= -1) return v.toFixed(2);
  const a = Math.abs(v);
  if (a >= 1e6) return `−${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `−${Math.round(a / 1e3)}k`;
  return `−${Math.round(a)}`;
}

export function OutliersDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [typos, setTypos] = useState(true);
  const [log, setLog] = useState(false);
  const [wrapRef, { width: wrapW }] = useSize<HTMLDivElement>();
  const cars = useMemo(() => makeCars(52, 11), []);
  const market = useMemo(() => makeCars(420, 99).map((c) => c.price), []);

  const fit = useMemo(() => {
    const used = typos ? [...cars, ...TYPOS] : cars;
    const { a, b } = ols(used.map((c) => c.age), used.map((c) => ty(c.price, log)));
    const preds = cars.map((c) => a + b * c.age);
    const score = r2(cars.map((c) => ty(c.price, log)), preds);
    const dollars = preds.map((p) => (log ? Math.pow(10, p) - 1 : p));
    const mae = cars.reduce((s, c, i) => s + Math.abs(c.price - dollars[i]), 0) / cars.length;
    return { a, b, score, mae, n: used.length };
  }, [cars, typos, log]);

  const hist = useMemo(() => {
    const bins = 18;
    const lo = log ? 3 : 0, hi = log ? 5 : 75000;
    const counts = new Array(bins).fill(0);
    for (const p of market) {
      const v = log ? Math.log10(p) : p;
      counts[clamp(Math.floor(((v - lo) / (hi - lo)) * bins), 0, bins - 1)]++;
    }
    const edges = Array.from({ length: bins + 1 }, (_, i) => lo + ((hi - lo) * i) / bins);
    return { counts, edges };
  }, [market, log]);

  const clean = useMemo(() => ols(cars.map((c) => c.age), cars.map((c) => ty(c.price, log))), [cars, log]);

  const flip = (which: "typos" | "log", v: boolean) => { (which === "typos" ? setTypos : setLog)(v); done(); };

  const caption = !log
    ? typos
      ? <>Three typos — a free car and a <b>$2 billion</b> hatchback — yank the line almost vertical. It now misses a normal car by <b>{money(fit.mae)}</b> on average.</>
      : <>Typos removed: the line follows the real trend (older → cheaper) and misses by about <b>{money(fit.mae)}</b>. But the histogram shows prices have a long tail.</>
    : typos
      ? <>Logs soften the giant typo, but the $0 and $1 cars still drag the line down. Remove impossible values first — then take the log.</>
      : <>On a log scale the long tail tucks in: the histogram becomes a tidy bell, and every car's error counts in proportion (R² <b>{fit.score.toFixed(2)}</b>).</>;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 22, rowGap: 10 }}>
          <Toggle label="Include typos" checked={typos} onChange={(v) => flip("typos", v)} />
          <Toggle label="Log scale" checked={log} onChange={(v) => flip("log", v)} help="Plot and predict log(price) instead of price, so a 10% miss on a cheap car counts as much as on an expensive one." />
        </div>
      }
      stats={
        <>
          <Stat label="R² on the real cars" value={fit.score} format={fmtR2} color={fit.score < 0 ? "var(--danger)" : C.ok} sub="1 = perfect · below 0 = worse than guessing the average" />
          <Stat label="Typical miss per car" value={fit.mae} format={money} color={fit.mae > 20000 ? "var(--danger)" : undefined} />
          <Stat label="Rows the line learned from" value={fit.n} format={(v) => String(Math.round(v))} sub={typos ? "52 real + 3 typos" : "52 real listings"} />
        </>
      }
      caption={caption}
      captionKey={`${typos}-${log}`}
    >
      <div ref={wrapRef} style={{ display: "grid", gridTemplateColumns: wrapW > 680 ? "1.75fr 1fr" : "1fr", gap: 12 }}>
        <div className="inset" style={{ padding: "12px 12px 6px", minWidth: 0 }}>
          <div className="row between small" style={{ marginBottom: 4 }}>
            <b>Price vs age</b>
            <Legend items={[{ color: C.indigo, label: "Listing" }, { color: C.pos, label: "Typo", shape: "ring" }, { color: C.warn, label: "Best-fit line", shape: "line" }]} />
          </div>
          <CarScatter cars={cars} typos={typos} log={log} a={fit.a} b={fit.b} ghost={typos ? clean : null} />
        </div>
        <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
          <div className="row between small"><b>All 420 listings' prices</b><span className="faint tiny">{log ? "log scale" : "dollars"}</span></div>
          <div style={{ flex: 1, minHeight: 150, display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%" }}>
              <MorphBars counts={hist.counts} height={170} color={log ? C.ok : C.indigo} />
            </div>
          </div>
          <HistAxis log={log} />
          <p className="tiny muted" style={{ marginTop: 4 }}>
            {log ? "A balanced hump: cheap and pricey cars sit evenly either side." : "Most cars are cheap; a long tail of pricey ones stretches right."}
          </p>
        </div>
      </div>
    </DemoFrame>
  );
}

function HistAxis({ log }: { log: boolean }) {
  const ticks = log ? [1000, 3000, 10000, 30000, 100000] : [0, 25000, 50000, 75000];
  const pos = (v: number) => (log ? (Math.log10(v) - 3) / 2 : v / 75000);
  return (
    <div style={{ position: "relative", height: 14 }}>
      {ticks.map((t) => (
        <span key={`${log}-${t}`} className="tiny faint num" style={{ position: "absolute", left: `${pos(t) * 100}%`, transform: `translateX(${pos(t) === 0 ? "0" : pos(t) === 1 ? "-100%" : "-50%"})`, animation: "mlpFadeIn .4s both" }}>
          {money(t)}
        </span>
      ))}
    </div>
  );
}

function CarScatter({ cars, typos, log, a, b, ghost }: { cars: Car[]; typos: boolean; log: boolean; a: number; b: number; ghost: { a: number; b: number } | null }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 260;
  const m = { l: 50, r: 14, t: 26, b: 30 };
  const maxP = Math.max(...cars.map((c) => c.price));
  const minP = Math.min(...cars.map((c) => c.price));
  const dx: [number, number] = [0, 16];
  const dy: [number, number] = log ? [Math.log10(minP * 0.6), Math.log10(maxP * 1.6)] : [0, Math.ceil((maxP * 1.12) / 10000) * 10000];
  const W = Math.max(0, width);
  const sx = (v: number) => m.l + ((v - dx[0]) / (dx[1] - dx[0])) * (W - m.l - m.r);
  const sy = (v: number) => height - m.b - ((v - dy[0]) / (dy[1] - dy[0])) * (height - m.t - m.b);
  const yTicks = log ? LOG_TICKS.filter((t) => Math.log10(t) >= dy[0] && Math.log10(t) <= dy[1]) : niceTicks(dy[0], dy[1], 5);
  const seg = clipLine(a, b, dx[0], dx[1], dy[0], dy[1]);
  const all = [...cars, ...TYPOS];
  const gseg = ghost ? clipLine(ghost.a, ghost.b, dx[0], dx[1], dy[0], dy[1]) : null;

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {W > 0 && (
        <svg width={W} height={height} style={{ overflow: "visible" }}>
          <defs><clipPath id="mlp-out-clip"><rect x={m.l} y={m.t - 6} width={W - m.l - m.r} height={height - m.t - m.b + 12} /></clipPath></defs>
          {yTicks.map((t) => {
            const y = sy(log ? Math.log10(t) : t);
            return (
              <g key={`${log}-${t}`} style={{ animation: "mlpFadeIn .5s both" }}>
                <line x1={m.l} x2={W - m.r} y1={y} y2={y} stroke="var(--hairline)" />
                <text x={m.l - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{money(t)}</text>
              </g>
            );
          })}
          {[0, 4, 8, 12, 16].map((t) => (
            <text key={t} x={sx(t)} y={height - m.b + 15} textAnchor="middle" fontSize={10} fill="var(--text-3)">{t}</text>
          ))}
          <text x={(m.l + W - m.r) / 2} y={height - 2} textAnchor="middle" fontSize={11} fill="var(--text-2)">Car age (years)</text>
          <style>{`.mlp-car{transition:transform .9s cubic-bezier(.32,.72,0,1), opacity .5s}@keyframes mlpFadeIn{from{opacity:0}to{opacity:1}}`}</style>
          {all.map((c) => {
            const v = ty(c.price, log);
            const off = v > dy[1] ? "up" : v < dy[0] ? "down" : null;
            const y = off === "up" ? m.t - 8 : off === "down" ? height - m.b : sy(v);
            const shown = !c.typo || typos;
            return (
              <g key={c.id} className="mlp-car" style={{ transform: `translate(${sx(c.age)}px, ${y}px) scale(${shown ? 1 : 0})`, opacity: shown ? 1 : 0 }}>
                {c.typo ? (
                  <>
                    <circle r={8} fill="none" stroke={C.pos} strokeWidth={1.4} opacity={0.7} />
                    <circle r={4.5} fill={C.pos} />
                    <text x={off === "up" ? 12 : 9} y={off === "up" ? 4 : -9} fontSize={10.5} fontWeight={650} fill={C.pos}>
                      {off === "up" ? `↑ off the chart: ${c.typo}` : off === "down" ? `↓ ${c.typo}` : c.typo}
                    </text>
                  </>
                ) : (
                  <circle r={4} fill={C.indigo} fillOpacity={0.72} stroke="var(--bg)" strokeOpacity={0.7} strokeWidth={0.8} />
                )}
              </g>
            );
          })}
          <g clipPath="url(#mlp-out-clip)">
            {gseg && (
              <g style={{ animation: "mlpFadeIn .6s both" }}>
                <line x1={sx(gseg.x1)} y1={sy(gseg.y1)} x2={sx(gseg.x2)} y2={sy(gseg.y2)} stroke="var(--text-3)" strokeWidth={1.6} strokeDasharray="5 5" />
                <text x={sx(gseg.x1) + 4} y={sy(gseg.y1) - 8} textAnchor="start" fontSize={10} fill="var(--text-3)">line without typos</text>
              </g>
            )}
            {seg && (
              <motion.line initial={false} animate={{ x1: sx(seg.x1), y1: sy(seg.y1), x2: sx(seg.x2), y2: sy(seg.y2) }} transition={spring.gentle}
                stroke={C.warn} strokeWidth={3} strokeLinecap="round" style={{ filter: `drop-shadow(0 2px 6px ${C.warn}66)` }} />
            )}
          </g>
        </svg>
      )}
    </div>
  );
}
