import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Segmented } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, MeterBar, Stat, clamp, gauss, mean, ols, rng, useDone } from "./shared";

type Task = "delay" | "ontime";
type Model = "avg" | "line" | "smart";
type CModel = "always" | "fancy";

interface Bus { id: string; h: number; y: number }
const HX: [number, number] = [5, 23];
const YD: [number, number] = [0, 22];
const GRID = Array.from({ length: 121 }, (_, i) => HX[0] + (i / 120) * (HX[1] - HX[0]));
const MODEL_COLOR: Record<Model, string> = { avg: "#8E8E93", line: C.warn, smart: C.purple };

/** Two rush-hour humps (morning ~8:00, evening ~17:30) on top of a small all-day delay. */
const truth = (h: number) => 2 + 7.5 * Math.exp(-((h - 8.2) ** 2) / (2 * 1.3 ** 2)) + 8.5 * Math.exp(-((h - 17.4) ** 2) / (2 * 1.6 ** 2));

function makeBuses(): Bus[] {
  const r = rng(7);
  return Array.from({ length: 170 }, (_, i) => {
    const h = HX[0] + (HX[1] - HX[0]) * r();
    return { id: `b${i}`, h, y: clamp(truth(h) * (1 + 0.28 * gauss(r)) + 1.2 * gauss(r), 0, YD[1] - 0.3) };
  });
}

/** Kernel smoother: the prediction at hour h is a distance-weighted average of nearby buses. */
function smoother(buses: Bus[], bw = 0.9) {
  return (h: number) => {
    let w = 0, s = 0;
    for (const b of buses) { const k = Math.exp(-((b.h - h) ** 2) / (2 * bw * bw)); w += k; s += k * b.y; }
    return w ? s / w : 0;
  };
}

const fmtH = (h: number) => `${((Math.round(h) + 11) % 12) + 1}${Math.round(h) < 12 || Math.round(h) === 24 ? "am" : "pm"}`;
const mins = (v: number) => `${v.toFixed(2)} min`;

/* ------------------------------------------------ on-time classification (100 buses, 10 late) */
const LATE = new Set([3, 17, 28, 36, 49, 55, 64, 71, 86, 93]);
const FANCY_CATCHES = new Set([17, 49, 64, 86]); // the fancy model flags these late buses…
const FANCY_FALSE = new Set([22, 58]); // …and wrongly flags these punctual ones

export function BaselinesDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [task, setTask] = useState<Task>("delay");
  const [model, setModel] = useState<Model>("avg");
  const [cmodel, setCModel] = useState<CModel>("always");
  const buses = useMemo(makeBuses, []);

  const fits = useMemo(() => {
    const ys = buses.map((b) => b.y);
    const avg = mean(ys);
    const { a, b } = ols(buses.map((p) => p.h), ys);
    const ks = smoother(buses);
    const fns: Record<Model, (h: number) => number> = { avg: () => avg, line: (h) => a + b * h, smart: ks };
    const mae = (f: (h: number) => number) => mean(buses.map((p) => Math.abs(p.y - f(p.h))));
    return {
      fns,
      curves: { avg: GRID.map(fns.avg), line: GRID.map(fns.line), smart: GRID.map(fns.smart) } as Record<Model, number[]>,
      mae: { avg: mae(fns.avg), line: mae(fns.line), smart: mae(fns.smart) } as Record<Model, number>,
      avg,
    };
  }, [buses]);

  const lift = 1 - fits.mae[model] / fits.mae.avg;

  // Classification numbers.
  const cls = useMemo(() => {
    let correct = 0, caught = 0;
    for (let i = 0; i < 100; i++) {
      const late = LATE.has(i);
      const says = cmodel === "fancy" && (FANCY_CATCHES.has(i) || FANCY_FALSE.has(i));
      if (says === late) correct++;
      if (late && says) caught++;
    }
    return { acc: correct / 100, caught };
  }, [cmodel]);

  const caption = task === "delay"
    ? model === "avg"
      ? <>The dumbest possible model: always guess the average delay of <b>{fits.avg.toFixed(1)} min</b>. It's off by <b>{mins(fits.mae.avg)}</b> on a typical bus. That's the bar every real model has to clear.</>
      : model === "line"
        ? <>A straight line through the hour looks “scientific”, but the humps cancel out: it only beats the average by <b>{Math.round(lift * 100)}%</b>. Without the baseline you'd never notice it learned almost nothing.</>
        : <>The smart model follows both rush hours and cuts the typical error to <b>{mins(fits.mae.smart)}</b> — <b>{Math.round(lift * 100)}% better</b> than the baseline. <i>Now</i> it's a real result.</>
    : cmodel === "always"
      ? <>90 of 100 buses are on time, so a “model” that just says <b>“on time”</b> for every bus already scores <b>90% accuracy</b> — while catching zero late buses.</>
      : <>The fancy model scores <b>92%</b>. Sounds great — until you remember the do-nothing baseline gets <b>90%</b>. It catches only <b>{cls.caught} of 10</b> late buses.</>;

  return (
    <DemoFrame
      controls={
        <div className="row wrap" style={{ gap: 14, rowGap: 10, width: "100%", justifyContent: "space-between" }}>
          <Segmented value={task} onChange={(t) => { setTask(t); done(); }} options={[
            { value: "delay", label: "⏱ How late? (minutes)" },
            { value: "ontime", label: "✅ On time or late?" },
          ]} />
          {task === "delay" ? (
            <Segmented size="sm" value={model} onChange={(m) => { setModel(m); done(); }} options={[
              { value: "avg", label: "Always the average" },
              { value: "line", label: "Straight line" },
              { value: "smart", label: "Smart model" },
            ]} />
          ) : (
            <Segmented size="sm" value={cmodel} onChange={(m) => { setCModel(m); done(); }} options={[
              { value: "always", label: "Always “on time”" },
              { value: "fancy", label: "Fancy model" },
            ]} />
          )}
        </div>
      }
      stats={task === "delay" ? (
        <>
          <Stat key={`avg-${model === "avg"}`} label="Always the average · error" value={fits.mae.avg} format={mins} color={MODEL_COLOR.avg} emphasis={model === "avg"} sub="typical miss per bus" />
          <Stat key={`line-${model === "line"}`} label="Straight line · error" value={fits.mae.line} format={mins} color={MODEL_COLOR.line} emphasis={model === "line"} sub="typical miss per bus" />
          <Stat key={`smart-${model === "smart"}`} label="Smart model · error" value={fits.mae.smart} format={mins} color={MODEL_COLOR.smart} emphasis={model === "smart"} sub="typical miss per bus" />
        </>
      ) : (
        <>
          <Stat key="c-acc" label="Accuracy" value={cls.acc} color={cmodel === "fancy" ? C.indigo : "#8E8E93"} sub={cmodel === "fancy" ? "fancy model" : "say “on time” every time"} />
          <Stat key="c-caught" label="Late buses caught" value={cls.caught} format={(v) => `${Math.round(v)} / 10`} color={cls.caught ? C.warn : C.pos} sub="the ones riders care about" />
          <Stat key="c-err" label="Errors vs baseline" value={(1 - cls.acc) * 100} format={(v) => `${Math.round(v)} vs 10`} sub="mistakes per 100 buses" />
        </>
      )}
      caption={caption}
      captionKey={task === "delay" ? model : `c-${cmodel}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={task} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          {task === "delay"
            ? <DelayBody buses={buses} fits={fits} model={model} lift={lift} />
            : <OnTimeBody cmodel={cmodel} acc={cls.acc} />}
        </motion.div>
      </AnimatePresence>
    </DemoFrame>
  );
}

/* ------------------------------------------------ regression view */

function DelayBody({ buses, fits, model, lift }: {
  buses: Bus[];
  fits: { fns: Record<Model, (h: number) => number>; curves: Record<Model, number[]>; mae: Record<Model, number> };
  model: Model; lift: number;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const side = width > 760;
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: side ? "1.7fr 1fr" : "1fr", gap: 12 }}>
      <div className="inset col" style={{ padding: 12, gap: 6, minWidth: 0 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <b>🚌 Bus delays across the day</b>
          <Legend items={[{ color: "var(--text-3)", label: "One bus" }, { color: MODEL_COLOR.avg, label: "Baseline", shape: "dash" }, ...(model !== "avg" ? [{ color: MODEL_COLOR[model], label: "Model", shape: "line" as const }] : [])]} />
        </div>
        <DelayPlot buses={buses} fn={fits.fns[model]} curve={fits.curves[model]} baseline={fits.curves.avg[0]} color={MODEL_COLOR[model]} />
      </div>
      <div className="inset col" style={{ padding: 14, gap: 14, justifyContent: "center" }}>
        <MeterBar label="Beats the baseline by" value={Math.max(0, lift)} color={lift > 0.2 ? C.ok : lift > 0.005 ? C.warn : "#8E8E93"}
          note={model === "avg" ? "this IS the baseline — 0% by definition" : lift < 0.1 ? "barely moved the needle" : "a genuine improvement"} />
        <div className="col" style={{ gap: 8 }}>
          {(["avg", "line", "smart"] as Model[]).map((m) => (
            <ErrBar key={m} label={{ avg: "Always the average", line: "Straight line", smart: "Smart model" }[m]} value={fits.mae[m]} max={fits.mae.avg} color={MODEL_COLOR[m]} active={m === model} />
          ))}
          <span className="tiny faint">average miss in minutes — shorter is better</span>
        </div>
      </div>
    </div>
  );
}

function ErrBar({ label, value, max, color, active }: { label: string; value: number; max: number; color: string; active: boolean }) {
  return (
    <div className="row" style={{ gap: 8, opacity: active ? 1 : 0.55, transition: "opacity .3s" }}>
      <span className="tiny" style={{ width: 104, flexShrink: 0, fontWeight: active ? 700 : 500 }}>{label}</span>
      <div style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--fill)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(value / max) * 100}%`, background: color, borderRadius: 5 }} />
      </div>
      <span className="tiny num" style={{ width: 52, textAlign: "right", fontWeight: 650 }}>{value.toFixed(2)}</span>
    </div>
  );
}

function DelayPlot({ buses, fn, curve, baseline, color }: { buses: Bus[]; fn: (h: number) => number; curve: number[]; baseline: number; color: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 260;
  const m = { l: 34, r: 8, t: 10, b: 24 };
  const sx = (h: number) => m.l + ((h - HX[0]) / (HX[1] - HX[0])) * (width - m.l - m.r);
  const sy = (y: number) => height - m.b - ((y - YD[0]) / (YD[1] - YD[0])) * (height - m.t - m.b);
  const path = curve.map((y, i) => `${i ? "L" : "M"}${sx(GRID[i]).toFixed(1)},${sy(clamp(y, YD[0], YD[1])).toFixed(1)}`).join("");
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          <style>{`.mlp-res{transition:transform .8s cubic-bezier(.32,.72,0,1)}`}</style>
          {/* rush hour bands */}
          {[[7, 9.5], [16, 19]].map(([a, b]) => (
            <g key={a}>
              <rect x={sx(a)} y={m.t} width={sx(b) - sx(a)} height={height - m.t - m.b} fill={C.warn} opacity={0.07} rx={6} />
              <text x={(sx(a) + sx(b)) / 2} y={m.t + 12} textAnchor="middle" fontSize={9.5} fontWeight={650} fill={C.warn}>rush hour</text>
            </g>
          ))}
          {[0, 5, 10, 15, 20].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" />
              <text x={m.l - 6} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-3)">{v}</text>
            </g>
          ))}
          <text transform={`translate(10 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">delay (min)</text>
          {[6, 9, 12, 15, 18, 21].map((h) => <text key={h} x={sx(h)} y={height - 7} textAnchor="middle" fontSize={10} fill="var(--text-3)">{fmtH(h)}</text>)}
          {/* residual sticks: one hairline per bus from its dot to the model (CSS scaleY, so they glide) */}
          {buses.map((b) => {
            const p = fn(b.h), top = sy(Math.max(b.y, p)), h = Math.abs(sy(b.y) - sy(p));
            return <rect key={`r${b.id}`} className="mlp-res" x={-0.6} y={0} width={1.2} height={1} fill={color} opacity={0.35}
              style={{ transform: `translate(${sx(b.h)}px, ${top}px) scaleY(${Math.max(0.01, h)})`, transformOrigin: "0 0" }} />;
          })}
          {buses.map((b) => <circle key={b.id} cx={sx(b.h)} cy={sy(b.y)} r={3.1} fill="var(--text-3)" fillOpacity={0.75} />)}
          <line x1={m.l} x2={width - m.r} y1={sy(baseline)} y2={sy(baseline)} stroke={MODEL_COLOR.avg} strokeWidth={1.6} strokeDasharray="6 5" />
          <motion.path initial={false} animate={{ d: path }} transition={{ type: "spring", stiffness: 110, damping: 20 }}
            fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 6px ${color}66)` }} />
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------ classification view */

function OnTimeBody({ cmodel, acc }: { cmodel: CModel; acc: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 }}>
      <div className="inset col" style={{ padding: 14, gap: 10 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <b>100 buses this morning</b>
          <Legend items={[{ color: C.ok, label: "On time", shape: "square" }, { color: C.pos, label: "Late", shape: "square" }, { color: C.indigo, label: "Model says late", shape: "ring" }]} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(20, 1fr)", gap: 4 }}>
          {Array.from({ length: 100 }, (_, i) => {
            const late = LATE.has(i);
            const flagged = cmodel === "fancy" && (FANCY_CATCHES.has(i) || FANCY_FALSE.has(i));
            return (
              <motion.div key={i} initial={false} animate={{ scale: flagged ? 1.12 : 1 }} transition={{ ...spring.pop, delay: flagged ? (i % 20) * 0.015 : 0 }}
                title={`${late ? "late" : "on time"}${flagged ? " · model says late" : ""}`}
                style={{
                  aspectRatio: "1", borderRadius: 4, background: late ? C.pos : `${C.ok}88`,
                  boxShadow: flagged ? `0 0 0 2px var(--glass-strong), 0 0 0 4px ${C.indigo}` : "none", transition: "box-shadow .35s",
                }} />
            );
          })}
        </div>
      </div>
      <div className="inset col" style={{ padding: 14, gap: 14, justifyContent: "center" }}>
        <MeterBar label="Baseline: always “on time”" value={0.9} color="#8E8E93" note="no model at all — just the most common answer" />
        <MeterBar label={cmodel === "fancy" ? "Fancy model" : "Fancy model (pick it above)"} value={cmodel === "fancy" ? acc : 0} color={C.indigo} dim={cmodel !== "fancy"}
          note={cmodel === "fancy" ? "only 2 points above doing nothing" : " "} />
        <div style={{ minHeight: 26 }}>
          <AnimatePresence>
            {cmodel === "fancy" && (
              <motion.span key="b" className="badge warning" initial={{ opacity: 0, scale: 0.6, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ ...spring.pop, delay: 0.3 }}>
                92% sounds great · baseline is already 90%
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
