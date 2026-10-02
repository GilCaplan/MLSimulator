import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import { Segmented, Slider, Toggle } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, MeterBar, Stat, clamp, pct, rng, useDone } from "./shared";

type Shape = "square" | "triangle" | "arrow";
type Dir = "left" | "up" | "right" | "down";

interface Aug { rot: number; dx: number; dy: number; flip: boolean; bright: number; cut: { x: number; y: number } | null }
interface Settings { rot: number; shift: number; flip: boolean; bright: number; cutout: boolean }

const SHAPES: Record<Shape, { label: string; chip: string; color: string; el: (fill: string, stroke?: string) => ReactNode }> = {
  square: { label: "■ Square", chip: "square", color: C.teal, el: (f, s) => <rect x={30} y={30} width={40} height={40} rx={3} fill={f} stroke={s} strokeWidth={2} /> },
  triangle: { label: "▲ Triangle", chip: "triangle", color: C.amber, el: (f, s) => <polygon points="50,27 74,73 26,73" fill={f} stroke={s} strokeWidth={2} strokeLinejoin="round" /> },
  arrow: { label: "⬅ Arrow", chip: "left arrow", color: "#FF6FA8", el: (f, s) => <polygon points="24,50 46,28 46,41 76,41 76,59 46,59 46,72" fill={f} stroke={s} strokeWidth={2} strokeLinejoin="round" /> },
};

const IMG_BG = "#161a26";
const N_VARIANTS = 12;
const N_TEST = 10;
const ARROW_TILT = 45; // beyond this, a "left" arrow points somewhere else
const REAL_SHIFT = 30; // real-world photos are off-centre by up to 30%

/** Which way does the left-pointing arrow point after a flip and a (clockwise) rotation? */
function arrowDir(rot: number, flip: boolean): Dir {
  const base = flip ? 0 : 180; // screen angle (y down): 0 = right, 180 = left
  const a = (((base + rot) % 360) + 360) % 360;
  if (a >= 315 || a < 45) return "right";
  if (a < 135) return "down";
  if (a < 225) return "left";
  return "up";
}

/** Fixed random draws per variant; the settings only scale them, so sliders morph images instead of reshuffling. */
function variant(seed: number, i: number, s: Settings): Aug {
  const r = rng(seed * 1009 + i * 31 + 7);
  const u = Array.from({ length: 7 }, r);
  return {
    rot: (2 * u[0] - 1) * s.rot,
    dx: (2 * u[1] - 1) * s.shift,
    dy: (2 * u[2] - 1) * s.shift,
    flip: s.flip && u[3] < 0.5,
    bright: 1 + (2 * u[4] - 1) * s.bright,
    cut: s.cutout && u[5] < 0.75 ? { x: 14 + 72 * u[6], y: 14 + 72 * r() } : null,
  };
}

/** Real-world test photos: any angle (arrows: tilted at most ±45° so they still point left) and off-centre by up to 30%. */
function testSet(shape: Shape) {
  const r = rng(shape === "arrow" ? 404 : 303);
  const maxRot = shape === "arrow" ? ARROW_TILT : 180;
  return Array.from({ length: N_TEST }, () => {
    const rot = (2 * r() - 1) * maxRot;
    const mag = r() * REAL_SHIFT, ang = r() * Math.PI * 2;
    return { rot, mag, dx: mag * Math.cos(ang), dy: mag * Math.sin(ang), u: r() };
  });
}

export function AugmentationDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [shape, setShape] = useState<Shape>("square");
  const [rot, setRot] = useState(30);
  const [shift, setShift] = useState(10);
  const [flip, setFlip] = useState(false);
  const [bright, setBright] = useState(0);
  const [cutout, setCutout] = useState(false);
  const [seed, setSeed] = useState(1);

  const settings: Settings = { rot, shift, flip, bright: bright / 100, cutout };
  const variants = Array.from({ length: N_VARIANTS }, (_, i) => variant(seed, i, settings));
  const isArrow = shape === "arrow";
  const broken = variants.map((v) => (isArrow ? arrowDir(v.rot, v.flip) : "left"));
  const nBroken = isArrow ? broken.filter((d) => d !== "left").length : 0;

  // Simulated real-world accuracy: how much of the test variety did training cover?
  const maxRot = isArrow ? ARROW_TILT : 180;
  const rotCov = clamp(rot / maxRot, 0, 1);
  const shiftCov = clamp(shift / REAL_SHIFT, 0, 1);
  const coverage = (rotCov + shiftCov) / 2;
  // For arrows, flips and big tilts teach the wrong label (fraction of training images that now lie).
  const badRot = isArrow && rot > ARROW_TILT ? (rot - ARROW_TILT) / rot : 0;
  const labelNoise = isArrow ? 1 - (1 - badRot) * (flip ? 0.5 : 1) : 0;
  const accOf = (c: number) => clamp(0.25 + 0.7 * c - 0.6 * labelNoise, 0.08, 0.97);
  const acc = accOf(coverage);
  const tests = useMemo(() => testSet(shape), [shape]);

  const nothing = rot === 0 && shift === 0 && !flip && bright === 0 && !cutout;
  const S = SHAPES[shape];
  const firstBad = broken.find((d) => d !== "left");
  const caption = nBroken > 0 || labelNoise > 0
    ? <>⚠️ {flip ? "Flipping" : "Rotating more than 45°"} turns a <b>left</b> arrow into {firstBad === "up" ? "an" : "a"} <b>{firstBad ?? "right"}</b> arrow — but the copy still carries the label “left”. Now the model is being taught <b>wrong answers</b>, and real-world accuracy sinks to <b>{pct(acc)}</b>. Only use changes that keep the answer the same.</>
    : nothing
      ? <>Every training photo is centred and upright — so that's all the model ever learns. Turn on <b>rotation</b> and <b>shift</b> and watch one photo multiply into many.</>
      : coverage >= 0.95
        ? <>Training variety now covers what the real world throws at it: <b>same one photo, same model</b>, and accuracy climbs from 25% to <b>{pct(acc)}</b>. Each copy keeps its label, so the model learns that angle and position <i>don't matter</i>.</>
        : <>Each copy is still a <b>{S.chip}</b> with the same label, so the model learns these changes don't change the answer. Training covers <b>{pct(coverage)}</b> of the real-world variety → <b>{pct(acc)}</b> accuracy. {isArrow ? "Try a tilt up to 45° and more shift." : "Widen the ranges."}</>;
  const captionKey = nBroken > 0 || labelNoise > 0 ? `bad-${flip}` : nothing ? "none" : coverage >= 0.95 ? "full" : `mid-${isArrow}`;

  return (
    <DemoFrame
      controls={
        <div className="col" style={{ gap: 12, width: "100%" }}>
          <div className="row wrap between" style={{ gap: 12, rowGap: 10 }}>
            <Segmented value={shape} onChange={(s) => { setShape(s); done(); }} options={(Object.keys(SHAPES) as Shape[]).map((k) => ({ value: k, label: SHAPES[k].label }))} />
            <button className="btn sm" onClick={() => { setSeed((s) => s + 1); done(); }} title="Draw new random variations">🎲 Reshuffle</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, rowGap: 10, alignItems: "end" }}>
            <Slider label="↻ Rotate" value={rot} min={0} max={180} step={5} format={(v) => `±${Math.round(v)}°`} onChange={(v) => { setRot(v); done(); }} />
            <Slider label="✥ Shift" value={shift} min={0} max={30} step={1} format={(v) => `±${Math.round(v)}%`} onChange={(v) => { setShift(v); done(); }} />
            <Slider label="☀ Brightness" value={bright} min={0} max={50} step={5} format={(v) => `±${Math.round(v)}%`} onChange={(v) => { setBright(v); done(); }} />
            <div className="col" style={{ gap: 8 }}>
              <Toggle label="⇋ Flip horizontally" checked={flip} onChange={(v) => { setFlip(v); done(); }} />
              <Toggle label="◩ Cutout" checked={cutout} onChange={(v) => { setCutout(v); done(); }} help="Black out a random square patch, so the model can't rely on any one part of the shape." />
            </div>
          </div>
        </div>
      }
      stats={
        <>
          <Stat label="Training variety covers" value={coverage} color={C.indigo} sub="of what it'll see in the real world" />
          <Stat key={`acc-${labelNoise > 0}`} label="Real-world accuracy" value={acc} color={labelNoise > 0 ? C.pos : acc > 0.8 ? C.ok : C.warn} emphasis={labelNoise > 0} sub="on rotated, off-centre photos" />
          <Stat label="No augmentation" value={0.25} color="var(--text-2)" sub="the same model, tidy photos only" />
          <Stat key={`bad-${nBroken > 0}`} label="Labels changed" value={nBroken} format={(v) => `${Math.round(v)} / ${N_VARIANTS}`} color={nBroken > 0 ? C.pos : C.ok} emphasis={nBroken > 0} sub="copies whose answer is now wrong" />
        </>
      }
      caption={caption}
      captionKey={captionKey}
    >
      <Gallery shape={shape} settings={settings} variants={variants} broken={broken} seed={seed} />
      <RealWorld shape={shape} tests={tests} rot={rot} shift={shift} maxRot={maxRot} rotCov={rotCov} shiftCov={shiftCov} acc={acc} accOf={accOf} labelNoise={labelNoise} />
    </DemoFrame>
  );
}

/* ------------------------------------------------ one image, rendered as a little "photo" */

function Photo({ shape, aug, size, ghosts }: { shape: Shape; aug: Aug; size: number; ghosts?: { rot: number; shift: number } }) {
  const S = SHAPES[shape];
  const id = `vg-${shape}-${size}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block", borderRadius: size > 120 ? 14 : 9, filter: `brightness(${aug.bright.toFixed(3)})`, transition: "filter .45s", boxShadow: "0 4px 14px rgba(0,0,0,.18)" }}>
      <defs>
        <radialGradient id={id} cx="50%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#262c3f" />
          <stop offset="100%" stopColor={IMG_BG} />
        </radialGradient>
      </defs>
      <rect width={100} height={100} fill={`url(#${id})`} />
      {ghosts && (ghosts.shift > 0 || ghosts.rot > 0) && (
        <g pointerEvents="none">
          {ghosts.shift > 0 && (
            <motion.rect initial={false} animate={{ x: 50 - 26 - ghosts.shift, y: 50 - 26 - ghosts.shift, width: 52 + 2 * ghosts.shift, height: 52 + 2 * ghosts.shift }}
              transition={spring.gentle} fill="none" stroke="rgba(255,255,255,.35)" strokeDasharray="3 3" strokeWidth={0.8} rx={4} />
          )}
          {ghosts.rot > 0 && [-1, 1].map((sgn) => (
            <motion.g key={sgn} initial={false} animate={{ rotate: sgn * ghosts.rot }} transition={spring.gentle} opacity={0.32}>
              {S.el("none", "rgba(255,255,255,.75)")}
            </motion.g>
          ))}
        </g>
      )}
      <motion.g initial={false} animate={{ x: aug.dx, y: aug.dy, rotate: aug.rot }} transition={spring.gentle}>
        <motion.g initial={false} animate={{ scaleX: aug.flip ? -1 : 1 }} transition={spring.snappy}>
          {S.el(S.color)}
        </motion.g>
      </motion.g>
      <AnimatePresence>
        {aug.cut && (
          <motion.rect key="cut" initial={{ opacity: 0, x: aug.cut.x - 13, y: aug.cut.y - 13 }} animate={{ opacity: 1, x: aug.cut.x - 13, y: aug.cut.y - 13 }} exit={{ opacity: 0 }}
            transition={spring.gentle} width={26} height={26} fill="#05060a" stroke="rgba(255,255,255,.12)" strokeWidth={0.6} />
        )}
      </AnimatePresence>
    </svg>
  );
}

const IDENTITY: Aug = { rot: 0, dx: 0, dy: 0, flip: false, bright: 1, cut: null };

function Gallery({ shape, settings, variants, broken, seed }: { shape: Shape; settings: Settings; variants: Aug[]; broken: Dir[]; seed: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const big = width < 700 ? 150 : 190;
  const cols = width > 860 ? 6 : 4;
  const gridW = width - big - 12 - 28 - 24; // minus gap and inset paddings
  const cell = Math.max(64, Math.floor((gridW - (cols - 1) * 8) / cols));
  const photo = Math.min(cell - 8, 118);
  const S = SHAPES[shape];
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: `${big + 28}px 1fr`, gap: 12 }}>
      {width > 0 && (
        <>
          <div className="inset col" style={{ padding: 14, gap: 10, alignItems: "center" }}>
            <span className="small" style={{ fontWeight: 650, alignSelf: "flex-start" }}>📸 The training photo</span>
            <Photo shape={shape} aug={IDENTITY} size={big} ghosts={{ rot: settings.rot, shift: settings.shift }} />
            <LabelChip text={S.chip} color={S.color} />
            <span className="tiny faint" style={{ textAlign: "center" }}>Ghosts show the range of angles and positions being drawn from.</span>
          </div>
          <div className="inset col" style={{ padding: 12, gap: 10, minWidth: 0 }}>
            <div className="row between small" style={{ gap: 8 }}>
              <b>🔄 What the model sees while training</b>
              <span className="tiny faint">1 photo → endless variations</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
              {variants.map((v, i) => {
                const dir = broken[i];
                const bad = shape === "arrow" && dir !== "left";
                return (
                  <motion.div key={`${seed}-${i}`} initial={{ opacity: 0, scale: 0.7, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ...spring.pop, delay: i * 0.03 }}
                    title={bad ? `Label changed: this “left arrow” now points ${dir}!` : undefined}
                    className="col" style={{ alignItems: "center", gap: 5, position: "relative", padding: 4, borderRadius: 12, background: bad ? `${C.pos}1f` : "transparent", boxShadow: bad ? `0 0 0 1.5px ${C.pos} inset` : "none", transition: "background .3s, box-shadow .3s" }}>
                    <Photo shape={shape} aug={v} size={photo} />
                    <LabelChip text={S.chip} color={S.color} small struck={bad} />
                    <AnimatePresence>
                      {bad && (
                        <motion.div initial={{ opacity: 0, scale: 0.6, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring.pop}
                          style={{ position: "absolute", top: photo - 14, left: 2, right: 2, padding: "2px 4px", borderRadius: 7, background: C.pos, color: "var(--on-accent)", fontSize: photo < 90 ? 9 : 10, fontWeight: 700, lineHeight: 1.2, textAlign: "center", boxShadow: "0 3px 10px rgba(255,55,95,.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {photo < 100 ? `⚠️ left → ${dir}!` : `⚠️ label changed: left → ${dir}!`}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LabelChip({ text, color, small, struck }: { text: string; color: string; small?: boolean; struck?: boolean }) {
  return (
    <span className="row" style={{ gap: 5, padding: small ? "1px 7px" : "3px 10px", borderRadius: 999, background: "var(--fill)", fontSize: small ? 10.5 : 12, fontWeight: 600, whiteSpace: "nowrap", color: struck ? C.pos : "var(--text)", textDecoration: struck ? "line-through" : "none" }}>
      <span style={{ width: small ? 6 : 8, height: small ? 6 : 8, borderRadius: 4, background: color }} />
      {text}
    </span>
  );
}

/* ------------------------------------------------ test on the real world */

function RealWorld({ shape, tests, rot, shift, maxRot, rotCov, shiftCov, acc, accOf, labelNoise }: {
  shape: Shape; tests: ReturnType<typeof testSet>; rot: number; shift: number; maxRot: number; rotCov: number; shiftCov: number;
  acc: number; accOf: (c: number) => number; labelNoise: number;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const wide = width > 760;
  const thumb = wide ? 50 : 44;
  return (
    <div ref={ref} className="inset" style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: wide ? "1fr 1.15fr" : "1fr", gap: wide ? 20 : 12 }}>
      <div className="col" style={{ gap: 12, minWidth: 0 }}>
        <b className="small">🌍 Test on the real world</b>
        <RangeBar label="Angles" trained={Math.min(rot, maxRot)} trainedRaw={rot} world={maxRot} unit="°" color={C.teal} cov={rotCov} />
        <RangeBar label="Off-centre" trained={Math.min(shift, REAL_SHIFT)} trainedRaw={shift} world={REAL_SHIFT} unit="%" color={C.indigo} cov={shiftCov} />
        <MeterBar label="Accuracy on real-world photos" value={acc} color={labelNoise > 0 ? C.pos : acc > 0.8 ? C.ok : C.warn} height={22}
          note={labelNoise > 0 ? `≈${pct(labelNoise)} of training copies now carry the wrong label.` : "25% ≈ blind guessing · rises as training variety covers the real world."} />
      </div>
      <div className="col" style={{ gap: 8, minWidth: 0 }}>
        <div className="row between small" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Photos from the field</span>
          <span className="tiny faint">{shape === "arrow" ? "tilted ≤ 45°, off-centre ≤ 30%" : "any angle, off-centre ≤ 30%"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, rowGap: 8 }}>
          {tests.map((t, i) => {
            const c = (Math.abs(t.rot) <= rot ? 0.5 : 0) + (t.mag <= shift ? 0.5 : 0);
            const ok = t.u < accOf(c);
            return (
              <div key={`${shape}-${i}`} className="col" style={{ alignItems: "center", gap: 3, position: "relative" }}>
                <Photo shape={shape} aug={{ rot: t.rot, dx: t.dx, dy: t.dy, flip: false, bright: 1, cut: null }} size={thumb} />
                <motion.span key={String(ok)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop}
                  title={ok ? "Recognised" : "Missed"} style={{ position: "absolute", top: -5, right: 0, width: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, color: "var(--on-accent)", background: ok ? C.ok : C.pos, boxShadow: "0 2px 6px rgba(0,0,0,.25)" }}>
                  {ok ? "✓" : "✕"}
                </motion.span>
                <span className="tiny faint num" style={{ fontSize: 9.5 }}>{Math.round(t.rot)}°</span>
              </div>
            );
          })}
        </div>
        <span className="tiny faint">Brightness and cutout help with lighting and partly hidden objects — this test only checks angle and position.</span>
      </div>
    </div>
  );
}

function RangeBar({ label, trained, trainedRaw, world, unit, color, cov }: { label: string; trained: number; trainedRaw: number; world: number; unit: string; color: string; cov: number }) {
  const over = trainedRaw > world;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between tiny" style={{ gap: 8 }}>
        <span style={{ fontWeight: 600 }}>{label}: trained ±{Math.round(trainedRaw)}{unit} <span className="faint">· world ±{world}{unit}</span></span>
        <span className="num" style={{ fontWeight: 700, color }}>{pct(cov)} covered</span>
      </div>
      <div style={{ position: "relative", height: 14, borderRadius: 7, background: "repeating-linear-gradient(135deg, var(--fill) 0 6px, var(--fill-2) 6px 12px)", overflow: "hidden" }}>
        <motion.div initial={false} animate={{ left: `${50 - (trained / world) * 50}%`, width: `${(trained / world) * 100}%` }} transition={spring.gentle}
          style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 7, background: `linear-gradient(90deg, ${color}aa, ${color}, ${color}aa)` }} />
        <div style={{ position: "absolute", left: "50%", top: 2, bottom: 2, width: 2, marginLeft: -1, borderRadius: 1, background: "var(--text-2)" }} />
      </div>
      {over && <span className="tiny" style={{ color: C.pos }}>Past ±{world}{unit} the arrow no longer points left.</span>}
    </div>
  );
}
