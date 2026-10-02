import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Toggle } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, Stat, clamp, gauss, mean, pct, rng, useDone } from "./shared";

interface Order { id: string; t: number; disaster: boolean }

const XD: [number, number] = [15, 135];
const BAND = 5;
const C_MAE = C.teal, C_RMSE = C.purple;

/** 55 ordinary deliveries (≈ 25–40 min) and 6 disasters (80–130 min) where a courier problem struck. */
function makeOrders(): Order[] {
  const r = rng(42);
  const out: Order[] = [];
  for (let i = 0; i < 55; i++) out.push({ id: `o${i}`, t: clamp(Math.round(31.5 + 4.3 * gauss(r)), 22, 44), disaster: false });
  [84, 93, 101, 109, 118, 127].forEach((t, i) => out.push({ id: `d${i}`, t: t + Math.round(4 * (r() - 0.5)), disaster: true }));
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const maeAt = (ts: number[], c: number) => mean(ts.map((t) => Math.abs(t - c)));
const rmseAt = (ts: number[], c: number) => Math.sqrt(mean(ts.map((t) => (t - c) ** 2)));
const mins = (v: number) => `${v.toFixed(1)} min`;

export function RegressionMetricsDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const orders = useMemo(makeOrders, []);
  const [withDisasters, setWithDisasters] = useState(true);
  const [eta, setEta] = useState(62);

  const active = useMemo(() => orders.filter((o) => withDisasters || !o.disaster), [orders, withDisasters]);
  const ts = useMemo(() => active.map((o) => o.t), [active]);
  const med = median(ts), avg = mean(ts);
  const mae = maeAt(ts, eta), rmse = rmseAt(ts, eta);
  const within = ts.filter((t) => Math.abs(t - eta) <= BAND).length;

  const nearMed = Math.abs(eta - med) <= 1.5, nearAvg = Math.abs(eta - avg) <= 1.5;
  const zone = !withDisasters ? (nearMed || nearAvg ? "agree" : "nodis") : nearMed ? "median" : nearAvg ? "mean" : eta > avg ? "high" : eta < med ? "low" : "between";
  const caption = {
    median: <>Right on the <b>median ({med} min)</b>: the lowest MAE, and <b>{within} of {ts.length}</b> customers get an ETA within ±5 min. RMSE still grumbles (<b>{rmse.toFixed(1)}</b>) because the disasters are squared. <b>Absolute error aims at the typical order.</b></>,
    mean: <>Right on the <b>mean ({avg.toFixed(1)} min)</b>: the lowest RMSE. But the 6 disasters dragged it up, so only <b>{within} of {ts.length}</b> ETAs are within ±5 min. <b>Squared error chases the rare disasters.</b></>,
    between: <>Between the median and the mean, the two metrics pull in opposite directions: MAE wants you left (at the typical order), RMSE wants you right (towards the disasters).</>,
    high: <>Way past the typical delivery: most customers get an ETA that's far too pessimistic. Drag left: both errors fall, but they bottom out at <b>different places</b>.</>,
    low: <>Left of the median, more than half the orders arrive later than promised. Drag right until MAE bottoms out.</>,
    agree: <>Without the disasters, mean (<b>{avg.toFixed(1)}</b>) and median (<b>{med}</b>) almost coincide, so MAE and RMSE agree on the best line. Turn the disasters back on and watch only the mean jump.</>,
    nodis: <>Without the disasters, the mean barely differs from the median: both metrics now want the same ETA. Drag the line there.</>,
  }[zone];

  const shift = useMemo(() => {
    const all = orders.map((o) => o.t), typical = orders.filter((o) => !o.disaster).map((o) => o.t);
    return { mean: mean(all) - mean(typical), median: median(all) - median(typical) };
  }, [orders]);
  const set = (v: number) => setEta(clamp(Math.round(v * 2) / 2, XD[0], XD[1]));

  return (
    <DemoFrame
      controls={
        <>
          <Toggle label="🐢 Include the 6 disaster orders" checked={withDisasters} onChange={(v) => { setWithDisasters(v); done(); }}
            help="Deliveries that were an hour or more late because of a courier problem nobody could predict." />
          <span className="small faint">Drag the 🎯 line (or use ← →) to choose one ETA for every order</span>
          <span className="tiny muted" style={{ width: "100%", marginTop: -4 }}>
            The 6 disasters move the <b style={{ color: C_RMSE }}>mean by +{shift.mean.toFixed(1)} min</b> but the <b style={{ color: C_MAE }}>median by only +{shift.median}</b>.
          </span>
        </>
      }
      stats={
        <>
          <Stat label="MAE · average miss" value={mae} format={mins} color={C_MAE} sub={nearMed ? "✓ lowest possible" : `lowest: ${maeAt(ts, med).toFixed(1)} at the median`} emphasis={nearMed} />
          <Stat label="RMSE · squares big misses" value={rmse} format={mins} color={C_RMSE} sub={nearAvg ? "✓ lowest possible" : `lowest: ${rmseAt(ts, avg).toFixed(1)} at the mean`} emphasis={nearAvg} />
          <Stat label="ETAs within ±5 min" value={within / ts.length} format={pct} color={C.ok} sub={`${within} of ${ts.length} orders`} />
        </>
      }
      caption={caption}
      captionKey={zone}
    >
      <div className="inset col" style={{ padding: "12px 12px 8px", gap: 6 }}>
        <div className="row wrap between small" style={{ gap: 8, rowGap: 4 }}>
          <b>Delivery times</b>
          <Legend items={[
            { color: C.neg, label: "Order" },
            { color: C.pos, label: "Disaster", shape: "square" },
            { color: C.ok, label: "Within ±5 min of the ETA", shape: "square" },
            { color: C_MAE, label: "MAE", shape: "line" },
            { color: C_RMSE, label: "RMSE", shape: "dash" },
          ]} />
        </div>
        <Plot orders={orders} active={ts} withDisasters={withDisasters} eta={eta} med={med} avg={avg} onSet={set} done={done} />
      </div>
    </DemoFrame>
  );
}

const TOP = 26, STRIP = 118, AXIS = TOP + STRIP + 6, PILL1 = AXIS + 22, PILL2 = PILL1 + 26, LOSS_T = PILL2 + 30, LOSS_H = 118, H = LOSS_T + LOSS_H + 22;
const M = { l: 34, r: 16 };
const LOSS_MAX = 100;
const R = 4.4;

function Plot({ orders, active, withDisasters, eta, med, avg, onSet, done }: {
  orders: Order[]; active: number[]; withDisasters: boolean; eta: number; med: number; avg: number; onSet: (v: number) => void; done: () => void;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [dragging, setDragging] = useState(false);
  const knob = useRef<HTMLDivElement>(null);
  const sx = (t: number) => M.l + ((t - XD[0]) / (XD[1] - XD[0])) * (width - M.l - M.r);
  const fromX = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return eta;
    return XD[0] + ((clientX - r.left - M.l) / (r.width - M.l - M.r)) * (XD[1] - XD[0]);
  };

  // Beeswarm: place each dot as close to the strip's centre line as possible without overlapping.
  const placed = useMemo(() => {
    if (!width) return new Map<string, number>();
    const pos = new Map<string, number>();
    const done: { x: number; y: number }[] = [];
    const d = 2 * R + 1.2, mid = TOP + STRIP / 2;
    for (const o of [...orders].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))) {
      const x = sx(o.t);
      let y = mid;
      for (let k = 0; k < 40; k++) {
        const cand = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (d * 0.87);
        if (done.every((p) => (p.x - x) ** 2 + (p.y - cand) ** 2 >= d * d)) { y = cand; break; }
      }
      y = clamp(y, TOP + R, TOP + STRIP - R);
      done.push({ x, y });
      pos.set(o.id, y);
    }
    return pos;
  }, [orders, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const curves = useMemo(() => {
    const cs = Array.from({ length: 241 }, (_, i) => XD[0] + i * 0.5);
    return { cs, mae: cs.map((c) => maeAt(active, c)), rmse: cs.map((c) => rmseAt(active, c)) };
  }, [active]);
  const sy = (v: number) => LOSS_T + LOSS_H - (Math.min(v, LOSS_MAX * 1.05) / LOSS_MAX) * LOSS_H;
  const line = (ys: number[]) => ys.map((v, i) => `${i ? "L" : "M"}${sx(curves.cs[i]).toFixed(1)},${sy(v).toFixed(1)}`).join("");

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    setDragging(true);
    onSet(fromX(e.clientX));
    knob.current?.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { onSet(eta - step); done(); e.preventDefault(); }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { onSet(eta + step); done(); e.preventDefault(); }
  };
  const tr = dragging ? { duration: 0 } : spring.snappy;
  const mae = maeAt(active, eta), rmse = rmseAt(active, eta);
  const pillLeft = (t: number) => clamp(sx(t), 60, width - 60);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: H, touchAction: "none", userSelect: "none", cursor: dragging ? "grabbing" : "ew-resize" }}
      onPointerDown={onDown}
      onPointerMove={(e) => dragging && onSet(fromX(e.clientX))}
      onPointerUp={() => { setDragging(false); done(); }}
      onPointerCancel={() => setDragging(false)}>
      {width > 0 && (
        <>
          <svg width={width} height={H} style={{ position: "absolute", inset: 0 }} aria-hidden>
            {/* ±5 min band */}
            <motion.rect initial={false} animate={{ x: sx(eta - BAND) }} transition={tr} y={TOP - 4} width={sx(XD[0] + 2 * BAND) - sx(XD[0])} height={STRIP + 8} rx={6} fill={C.ok} fillOpacity={0.14} stroke={C.ok} strokeOpacity={0.45} strokeDasharray="3 3" />
            {/* minutes axis */}
            <line x1={M.l} x2={width - M.r} y1={AXIS} y2={AXIS} stroke="var(--hairline)" strokeWidth={1.5} />
            {[15, 30, 45, 60, 75, 90, 105, 120, 135].map((t) => (
              <g key={t}>
                <line x1={sx(t)} x2={sx(t)} y1={AXIS} y2={AXIS + 4} stroke="var(--text-3)" />
                <text x={sx(t)} y={AXIS + 15} textAnchor="middle" fontSize={10} fill="var(--text-3)">{t}</text>
              </g>
            ))}
            {/* median / mean guides */}
            {[{ t: med, c: C_MAE }, { t: avg, c: C_RMSE }].map((g, i) => (
              <motion.line key={i} initial={false} animate={{ x1: sx(g.t), x2: sx(g.t) }} transition={spring.gentle} y1={TOP - 4} y2={LOSS_T + LOSS_H} stroke={g.c} strokeOpacity={0.55} strokeDasharray="2 4" strokeWidth={1.5} />
            ))}
            {/* dots */}
            <AnimatePresence initial={false}>
              {orders.filter((o) => withDisasters || !o.disaster).map((o) => {
                const x = sx(o.t), y = placed.get(o.id) ?? TOP + STRIP / 2;
                const inBand = Math.abs(o.t - eta) <= BAND;
                return (
                  <motion.g key={o.id} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0, y: -14 }} transition={spring.pop} style={{ transformOrigin: `${x}px ${y}px` }}>
                    {o.disaster
                      ? <rect x={x - R - 0.6} y={y - R - 0.6} width={2 * R + 1.2} height={2 * R + 1.2} rx={1.5} transform={`rotate(45 ${x} ${y})`} fill={C.pos} fillOpacity={inBand ? 1 : 0.75} stroke="var(--bg)" strokeWidth={1} />
                      : <circle cx={x} cy={y} r={R} fill={C.neg} fillOpacity={inBand ? 1 : 0.38} stroke={inBand ? "var(--bg)" : "none"} strokeWidth={1.2} style={{ transition: "fill-opacity .25s" }} />}
                  </motion.g>
                );
              })}
            </AnimatePresence>
            {/* loss curves */}
            <line x1={M.l} x2={width - M.r} y1={LOSS_T + LOSS_H} y2={LOSS_T + LOSS_H} stroke="var(--hairline)" />
            {[25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={M.l} x2={width - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--hairline)" strokeDasharray="2 4" />
                <text x={M.l - 5} y={sy(v) + 3} textAnchor="end" fontSize={9.5} fill="var(--text-3)">{v}</text>
              </g>
            ))}
            <text x={width - M.r} y={LOSS_T - 8} textAnchor="end" fontSize={10.5} fontWeight={600} fill="var(--text-2)">error if every ETA = the line (min)</text>
            <motion.path initial={false} animate={{ d: line(curves.mae) }} transition={spring.gentle} fill="none" stroke={C_MAE} strokeWidth={2.4} strokeLinejoin="round" />
            <motion.path initial={false} animate={{ d: line(curves.rmse) }} transition={spring.gentle} fill="none" stroke={C_RMSE} strokeWidth={2.4} strokeDasharray="6 4" strokeLinejoin="round" />
            {/* the prediction line */}
            <motion.line initial={false} animate={{ x1: sx(eta), x2: sx(eta) }} transition={tr} y1={TOP - 8} y2={LOSS_T + LOSS_H} stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" />
            <motion.circle initial={false} animate={{ cx: sx(eta), cy: sy(mae) }} transition={tr} r={5} fill={C_MAE} stroke="var(--bg)" strokeWidth={1.5} />
            <motion.circle initial={false} animate={{ cx: sx(eta), cy: sy(rmse) }} transition={tr} r={5} fill={C_RMSE} stroke="var(--bg)" strokeWidth={1.5} />
            <text x={(M.l + width - M.r) / 2} y={H - 4} textAnchor="middle" fontSize={10.5} fill="var(--text-2)">delivery time / predicted ETA (minutes)</text>
          </svg>

          {/* draggable handle (keyboard accessible) */}
          <motion.div ref={knob} role="slider" tabIndex={0} aria-label="Predicted ETA in minutes" aria-valuemin={XD[0]} aria-valuemax={XD[1]} aria-valuenow={eta} aria-valuetext={`${eta} minutes`}
            onKeyDown={onKey} initial={false} animate={{ left: clamp(sx(eta), 52, width - 52) }} transition={tr}
            style={{ position: "absolute", top: 0, transform: "translateX(-50%)", padding: "2px 9px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-contrast)", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
              boxShadow: dragging ? "0 0 0 5px var(--accent-soft), 0 6px 16px color-mix(in srgb, var(--accent) 45%, transparent)" : "0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent)", cursor: "grab", outline: "none" }}>
            🎯 ETA {eta % 1 ? eta.toFixed(1) : eta} min
          </motion.div>

          {/* optimum markers: click to snap the line there */}
          {[{ t: med, c: C_MAE, top: PILL1, text: `median ${med % 1 ? med.toFixed(1) : med} · best for MAE` }, { t: avg, c: C_RMSE, top: PILL2, text: `mean ${avg.toFixed(1)} · best for RMSE` }].map((p) => (
            <motion.button key={p.top} initial={false} animate={{ left: pillLeft(p.t) }} transition={spring.gentle}
              onPointerDown={(e) => e.stopPropagation()} onClick={() => { onSet(p.t); done(); }} title="Move the ETA line here"
              style={{ position: "absolute", top: p.top, transform: "translateX(-50%)", border: `1.5px solid ${p.c}`, background: "var(--glass-strong)", color: "var(--text)", borderRadius: 999,
                padding: "1px 9px", fontSize: 11, fontWeight: 650, whiteSpace: "nowrap", cursor: "pointer", boxShadow: `0 2px 8px ${p.c}33` }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, background: p.c, marginRight: 5, verticalAlign: 1 }} />{p.text}
            </motion.button>
          ))}
        </>
      )}
    </div>
  );
}
