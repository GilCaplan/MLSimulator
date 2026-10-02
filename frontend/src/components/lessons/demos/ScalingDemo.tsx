import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Toggle } from "../../glass";
import { useSize } from "../../charts";
import { ramp } from "../../../lib/colors";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Stat, gauss, mean, money, rng, useDone } from "./shared";

interface Apt { id: number; rooms: number; dist: number; rent: number; jitter: number }
const K = 5;
const MAX_D = 25000;

function makeApartments(): Apt[] {
  const r = rng(17);
  const out: Apt[] = [];
  for (let i = 0; i < 46; i++) {
    const rooms = 1 + Math.floor(r() * 5);
    const dist = 400 + r() * 24000;
    const rent = Math.round((650 + 520 * rooms - 0.034 * dist + 110 * gauss(r)) / 10) * 10;
    out.push({ id: i, rooms, dist, rent, jitter: r() - 0.5 });
  }
  return out;
}

const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1; };

/** K nearest neighbours of `q` (excluding itself), in raw units or standardized units. */
function neighbours(apts: Apt[], q: Apt, scaled: boolean, sR: number, sD: number) {
  const d = (a: Apt) => scaled ? Math.hypot((a.rooms - q.rooms) / sR, (a.dist - q.dist) / sD) : Math.hypot(a.rooms - q.rooms, a.dist - q.dist);
  const ranked = apts.filter((a) => a.id !== q.id).map((a) => ({ a, d: d(a) })).sort((x, y) => x.d - y.d).slice(0, K);
  return { list: ranked.map((x) => x.a), radius: ranked[K - 1].d };
}

export function ScalingDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const apts = useMemo(makeApartments, []);
  const sR = useMemo(() => sd(apts.map((a) => a.rooms)), [apts]);
  const sD = useMemo(() => sd(apts.map((a) => a.dist)), [apts]);
  const rentExt = useMemo(() => [Math.min(...apts.map((a) => a.rent)), Math.max(...apts.map((a) => a.rent))], [apts]);

  // Leave-one-out KNN error over every apartment, and a default query that shows the difference clearly.
  const overall = useMemo(() => {
    const miss = (scaled: boolean) => apts.map((q) => Math.abs(mean(neighbours(apts, q, scaled, sR, sD).list.map((a) => a.rent)) - q.rent));
    const raw = miss(false), std = miss(true);
    let best = 0, bestGain = -Infinity;
    apts.forEach((a, i) => { const g = raw[i] - std[i]; if (a.dist > 3000 && a.dist < 22000 && a.rooms >= 2 && a.rooms <= 4 && g > bestGain) { bestGain = g; best = a.id; } });
    return { raw: mean(raw), std: mean(std), best };
  }, [apts, sR, sD]);

  const [scaled, setScaled] = useState(false);
  const [qid, setQid] = useState<number | null>(null);
  const q = apts[qid ?? overall.best];
  const nb = useMemo(() => neighbours(apts, q, scaled, sR, sD), [apts, q, scaled, sR, sD]);
  const guess = mean(nb.list.map((a) => a.rent));
  const miss = Math.abs(guess - q.rent);
  const roomsSpan = [Math.min(...nb.list.map((a) => a.rooms)), Math.max(...nb.list.map((a) => a.rooms))];
  const kmPerRoom = (sD / sR / 1000).toFixed(0);

  const [wrapRef, { width: wrapW }] = useSize<HTMLDivElement>();
  const side = wrapW > 700;

  const caption = scaled
    ? <>Standardized, one room counts about as much as <b>{kmPerRoom} km</b>, so the neighbours have similar rooms <i>and</i> distance — the guess misses by only <b>{money(miss)}</b>.</>
    : <>Unscaled, "closest" just means "similar distance from the centre" — the 5 neighbours have <b>{roomsSpan[0] === roomsSpan[1] ? roomsSpan[0] : `${roomsSpan[0]} to ${roomsSpan[1]}`} rooms</b>, so the guess misses by <b>{money(miss)}</b>.</>;

  return (
    <DemoFrame
      controls={
        <>
          <Toggle label="Standardize features" checked={scaled} onChange={(v) => { setScaled(v); done(); }}
            help="Subtract each column's mean and divide by its spread, so rooms and metres speak the same language." />
          <span className="small faint">Click any apartment to make it the one we estimate</span>
        </>
      }
      stats={
        <>
          <Stat label="This apartment's real rent" value={q.rent} format={money} />
          <Stat label="KNN guess (avg of 5 neighbours)" value={guess} format={money} color={C.indigo} />
          <Stat label="Miss" value={miss} format={money} color={miss > 350 ? "var(--danger)" : C.ok} emphasis />
          <Stat label="Avg miss · all apartments" value={scaled ? overall.std : overall.raw} format={money} sub={scaled ? `was ${money(overall.raw)} unscaled` : "leave-one-out"} />
        </>
      }
      caption={caption}
      captionKey={`${scaled}`}
    >
      <div ref={wrapRef} style={{ display: "grid", gridTemplateColumns: side ? "1fr 210px" : "1fr", gap: 12 }}>
        <div className="inset" style={{ padding: "10px 12px 6px", minWidth: 0 }}>
          <AptChart apts={apts} q={q} nb={nb.list} radius={nb.radius} scaled={scaled} sR={sR} sD={sD} rentExt={rentExt} onPick={(id) => { setQid(id); done(); }} />
        </div>
        <div className="inset col" style={{ padding: 12, gap: 6 }}>
          <span className="small" style={{ fontWeight: 650 }}>The 5 "nearest" neighbours</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {[...nb.list].sort((a, b) => a.rooms - b.rooms || a.dist - b.dist).map((a) => (
              <motion.div key={a.id} layout initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={spring.snappy}
                className="row between small" style={{ gap: 6, padding: "5px 8px", borderRadius: 8, background: "var(--fill)" }}>
                <span className="row" style={{ gap: 2 }} title={`${a.rooms} rooms`}>
                  {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 2, background: i < a.rooms ? (a.rooms === q.rooms ? C.ok : C.warn) : "var(--fill-2)" }} />)}
                </span>
                <span className="num faint tiny">{(a.dist / 1000).toFixed(1)} km</span>
                <b className="num" style={{ minWidth: 48, textAlign: "right" }}>{money(a.rent)}</b>
              </motion.div>
            ))}
          </AnimatePresence>
          <span className="tiny faint" style={{ marginTop: 2 }}>
            Query: {q.rooms} room{q.rooms > 1 ? "s" : ""} · {(q.dist / 1000).toFixed(1)} km · {money(q.rent)}
          </span>
        </div>
      </div>
    </DemoFrame>
  );
}

function AptChart({ apts, q, nb, radius, scaled, sR, sD, rentExt, onPick }: {
  apts: Apt[]; q: Apt; nb: Apt[]; radius: number; scaled: boolean; sR: number; sD: number; rentExt: number[]; onPick: (id: number) => void;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const height = 290;
  const m = { l: 84, r: 22, t: 14, b: 34 };
  const plotH = height - m.t - m.b;
  // Unscaled, the rooms axis is squashed: next to 25,000 metres, 4 rooms is (almost) nothing.
  const band = scaled ? plotH : plotH * 0.16;
  const yMid = m.t + plotH / 2;
  const pxPerM = (width - m.l - m.r) / MAX_D;
  const pxPerRoom = band / 4.6;
  const sx = (d: number) => m.l + d * pxPerM;
  const sy = (rooms: number) => yMid + (3 - rooms) * pxPerRoom;
  const nbIds = new Set(nb.map((a) => a.id));
  const meanD = mean(apts.map((a) => a.dist));
  const rx = scaled ? radius * sD * pxPerM : radius * pxPerM;
  const ry = Math.min(4000, scaled ? radius * sR * pxPerRoom : radius * pxPerRoom);
  const xTicks = scaled ? [-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map((z) => ({ v: meanD + z * sD, label: `${z > 0 ? "+" : ""}${z}σ` })).filter((t) => t.v >= 0 && t.v <= MAX_D)
    : [0, 5000, 10000, 15000, 20000, 25000].map((v) => ({ v, label: v.toLocaleString() }));

  return (
    <div>
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 && (
        <svg width={width} height={height}>
          <defs><clipPath id="mlp-scl-clip"><rect x={m.l} y={m.t} width={width - m.l - m.r} height={plotH} /></clipPath></defs>
          <style>{`.mlp-apt{transition:transform .8s cubic-bezier(.32,.72,0,1)}.mlp-tick{transition:transform .8s cubic-bezier(.32,.72,0,1), opacity .4s}`}</style>
          {[1, 2, 3, 4, 5].map((r) => (
            <g key={r} className="mlp-tick" style={{ transform: `translateY(${sy(r)}px)` }}>
              <line x1={m.l} x2={width - m.r} stroke="var(--hairline)" />
              <text x={m.l - 8} y={3.5} textAnchor="end" fontSize={scaled ? 10 : 8} fill="var(--text-3)">{scaled ? `${r} room${r > 1 ? "s" : ""} · ${((r - 3) / sR) > 0 ? "+" : ""}${((r - 3) / sR).toFixed(1)}σ` : `${r} room${r > 1 ? "s" : ""}`}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={`${scaled}${t.label}`} x={sx(t.v)} y={height - m.b + 15} textAnchor={t.v >= MAX_D ? "end" : "middle"} fontSize={10} fill="var(--text-3)" style={{ animation: "mlpFadeIn .5s both" }}>{t.label}</text>
          ))}
          <style>{`@keyframes mlpFadeIn{from{opacity:0}to{opacity:1}}`}</style>
          <text x={(m.l + width - m.r) / 2} y={height - 3} textAnchor="middle" fontSize={11} fill="var(--text-2)">
            {scaled ? "Distance to centre (standardized)" : "Distance to centre (metres)"}
          </text>
          {!scaled && (
            <text x={m.l + 6} y={m.t + 12} fontSize={10.5} fill="var(--text-3)" style={{ animation: "mlpFadeIn .6s .3s both" }}>
              Rooms drawn ×1,000 taller than the model sees them — to KNN, 1 room ≈ 1 metre
            </text>
          )}
          <g clipPath="url(#mlp-scl-clip)">
            <motion.ellipse initial={false} cx={sx(q.dist)} cy={sy(q.rooms)} animate={{ rx, ry, cx: sx(q.dist), cy: sy(q.rooms) }} transition={spring.gentle}
              fill={C.purple} fillOpacity={0.1} stroke={C.purple} strokeOpacity={0.45} strokeDasharray="4 4" />
          </g>
          {nb.map((a) => (
            <motion.line key={`l${q.id}-${a.id}`} initial={{ pathLength: 0, opacity: 0, x1: sx(q.dist), y1: sy(q.rooms + q.jitter * 0.3), x2: sx(a.dist), y2: sy(a.rooms + a.jitter * 0.3) }}
              animate={{ pathLength: 1, opacity: 1, x1: sx(q.dist), y1: sy(q.rooms + q.jitter * 0.3), x2: sx(a.dist), y2: sy(a.rooms + a.jitter * 0.3) }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }} stroke={C.purple} strokeWidth={1.6} strokeOpacity={0.75} />
          ))}
          {apts.map((a) => {
            const isQ = a.id === q.id, isN = nbIds.has(a.id);
            const c = ramp((a.rent - rentExt[0]) / (rentExt[1] - rentExt[0]));
            return (
              <g key={a.id} className="mlp-apt" style={{ transform: `translate(${sx(a.dist)}px, ${sy(a.rooms + a.jitter * 0.3)}px)`, cursor: "pointer" }} onClick={() => onPick(a.id)}>
                <circle r={12} fill="transparent" />
                {(isQ || isN) && <circle r={isQ ? 10 : 8} fill="none" stroke={isQ ? "var(--text)" : C.purple} strokeWidth={isQ ? 2.4 : 1.8} />}
                <circle r={isQ ? 6.5 : 5} fill={c} stroke="white" strokeWidth={1} />
                <title>{`${a.rooms} rooms · ${(a.dist / 1000).toFixed(1)} km · ${money(a.rent)}/month`}</title>
              </g>
            );
          })}
        </svg>
      )}
    </div>
      <div className="row tiny faint" style={{ gap: 6, justifyContent: "flex-end", marginTop: 2 }}>
        <span>rent: {money(rentExt[0])}</span>
        <span style={{ width: 70, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.33)}, ${ramp(0.66)}, ${ramp(1)})` }} />
        <span>{money(rentExt[1])}</span>
      </div>
    </div>
  );
}
