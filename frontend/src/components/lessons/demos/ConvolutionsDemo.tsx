import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Segmented } from "../../glass";
import { useSize } from "../../charts";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, MeterBar, Stat, clamp, pct, useDone } from "./shared";

type Shape = "plus" | "ell" | "box";
type FilterId = "vert" | "horiz" | "corner" | "blob";
type Speed = "slow" | "med" | "fast";

const N = 16; // image is N×N pixels
const K = 5; // shapes live in a K×K box
const LO = 1, HI = N - K - 1; // keep a 1-pixel margin so every edge stays detectable
const TRAIN = { x: 2, y: 2 }; // where the "pixel memory" model saw the shape during training
const CELLS = N * N;
const SPEEDS: Record<Speed, number> = { slow: 5, med: 26, fast: 140 }; // window positions per second

const SHAPES: Record<Shape, { label: string; px: string[] }> = {
  plus: { label: "➕ Plus", px: ["..#..", "..#..", "#####", "..#..", "..#.."] },
  ell: { label: "∟ L-shape", px: ["#....", "#....", "#....", "#....", "#####"] },
  box: { label: "▢ Square", px: ["#####", "#...#", "#...#", "#...#", "#####"] },
};

const FILTERS: Record<FilterId, { label: string; name: string; w: number[]; what: string }> = {
  vert: { label: "│ Vertical edge", name: "vertical-edge", w: [-1, 0, 1, -1, 0, 1, -1, 0, 1], what: "dark on the left, bright on the right" },
  horiz: { label: "─ Horizontal edge", name: "horizontal-edge", w: [-1, -1, -1, 0, 0, 0, 1, 1, 1], what: "dark above, bright below" },
  corner: { label: "└ Corner", name: "corner", w: [-1, 1, -1, -1, 1, 1, -1, -1, -1], what: "a line coming up and a line going right — a └ corner" },
  blob: { label: "● Blob", name: "blob", w: [1, 2, 1, 2, 4, 2, 1, 2, 1], what: "a cluster of bright pixels" },
};

/** Paint a shape into an N×N image (1 = bright pixel). */
function render(shape: Shape, x: number, y: number) {
  const img = new Float32Array(CELLS);
  SHAPES[shape].px.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "#") img[(y + r) * N + x + c] = 1; }));
  return img;
}

const px = (img: Float32Array, r: number, c: number) => (r < 0 || c < 0 || r >= N || c >= N ? 0 : img[r * N + c]);

/** Same-size convolution with zero padding, then ReLU (negative responses → 0, like a real conv layer). */
function convolve(img: Float32Array, w: number[]) {
  const out = new Float32Array(CELLS);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      let s = 0;
      for (let i = 0; i < 9; i++) s += w[i] * px(img, r + Math.floor(i / 3) - 1, c + (i % 3) - 1);
      out[r * N + c] = Math.max(0, s);
    }
  return out;
}

const argmax = (a: Float32Array, upto = a.length) => {
  let bi = 0;
  for (let i = 1; i < upto; i++) if (a[i] > a[bi]) bi = i;
  return bi;
};

/* ------------------------------------------------ "inferno"-style heat colours (theme-independent, like a real image) */
const STOPS: [number, [number, number, number]][] = [
  [0, [12, 9, 32]], [0.22, [66, 10, 104]], [0.45, [147, 38, 103]], [0.68, [221, 81, 58]], [0.86, [252, 165, 10]], [1, [250, 240, 160]],
];
const HEAT = Array.from({ length: 101 }, (_, k) => {
  const t = k / 100;
  const j = Math.max(1, STOPS.findIndex(([s]) => s >= t));
  const [s0, a] = STOPS[j - 1], [s1, b] = STOPS[j];
  const u = (t - s0) / (s1 - s0 || 1);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(",")})`;
});
const heat = (t: number) => HEAT[Math.round(clamp(t, 0, 1) * 100)];
const IMG_BG = "#141722", IMG_OFF = "#1d2130", IMG_ON = "#f2f3f7", UNPAINTED = "#262a3b";

export function ConvolutionsDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const [shape, setShape] = useState<Shape>("plus");
  const [filter, setFilter] = useState<FilterId>("vert");
  const [pos, setPos] = useState(TRAIN);
  const [idx, setIdx] = useState(0); // cells painted so far; the window sits on cell `idx`
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>("med");

  const img = useMemo(() => render(shape, pos.x, pos.y), [shape, pos]);
  const trainImg = useMemo(() => render(shape, TRAIN.x, TRAIN.y), [shape]);
  const w = FILTERS[filter].w;
  const fmap = useMemo(() => convolve(img, w), [img, w]);
  const scale = useMemo(() => Math.max(1e-6, ...convolve(trainImg, w)), [trainImg, w]); // strongest response in training

  // Sliding-window clock.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (t: number) => {
      acc += ((t - last) / 1000) * SPEEDS[speed];
      last = t;
      if (acc >= 1) {
        const n = Math.floor(acc);
        acc -= n;
        setIdx((i) => Math.min(CELLS, i + n));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);
  useEffect(() => { if (idx >= CELLS && playing) setPlaying(false); }, [idx, playing]);

  const finished = idx >= CELLS;
  const painted = Math.min(idx, CELLS);
  const best = painted ? argmax(fmap, painted) : -1;
  const pixelScore = useMemo(() => {
    let hit = 0, tot = 0;
    for (let i = 0; i < CELLS; i++) { hit += img[i] * trainImg[i]; tot += trainImg[i]; }
    return tot ? hit / tot : 0;
  }, [img, trainImg]);
  const convScore = best >= 0 ? clamp(fmap[best] / scale, 0, 1) : 0;
  const moved = Math.abs(pos.x - TRAIN.x) + Math.abs(pos.y - TRAIN.y);

  const move = (dx: number, dy: number) => { setPos((p) => ({ x: clamp(p.x + dx, LO, HI), y: clamp(p.y + dy, LO, HI) })); done(); };
  const togglePlay = () => {
    if (finished) { setIdx(0); setPlaying(true); } else setPlaying((p) => !p);
    done();
  };
  const step = () => { setPlaying(false); setIdx((i) => (i >= CELLS ? 0 : i + 1)); done(); };
  const pickFilter = (f: FilterId) => { setFilter(f); setIdx(0); setPlaying(true); done(); };

  const F = FILTERS[filter];
  const caption = moved === 0
    ? !finished
      ? <>The <b>3×3 {F.name} filter</b> slides across the picture. At each stop it multiplies its 9 weights with the 9 pixels underneath and adds them up — one number per position. Bright = “{F.what}” found here.</>
      : <>The finished <b>feature map</b> glows exactly where the shape has {F.what}. Now <b>drag the shape</b> (or use the arrows) away from its training spot and watch both models.</>
    : pixelScore < 0.5
      ? <>Moved {moved} px: the pixel-memory model only finds <b>{pct(pixelScore)}</b> of the pixels it memorised — to it this is a stranger. The convolution uses the <b>same 9 weights at every position</b> (weight sharing), so the glow simply moves with the shape and max pooling still finds it: <b>{pct(convScore)}</b>. That's <b>translation invariance</b>.</>
      : <>A small nudge already costs the pixel model: only <b>{pct(pixelScore)}</b> of its memorised pixels still light up. The convolution doesn't care where the pattern is — its strongest match is still <b>{pct(convScore)}</b>. Keep dragging.</>;
  const captionKey = moved === 0 ? `home-${finished}-${filter}` : `moved-${pixelScore < 0.5}`;

  return (
    <DemoFrame
      controls={
        <div className="col" style={{ gap: 10, width: "100%" }}>
          <div className="row wrap between" style={{ gap: 12, rowGap: 10 }}>
            <Segmented value={shape} onChange={(s) => { setShape(s); done(); }} options={(Object.keys(SHAPES) as Shape[]).map((k) => ({ value: k, label: SHAPES[k].label }))} />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm" style={{ minWidth: 92 }} onClick={togglePlay}>{finished ? "↻ Rescan" : playing ? "⏸ Pause" : "▶ Play"}</button>
              <button className="btn sm" onClick={step} title="Move the window one pixel">Step ›</button>
              <Segmented size="sm" value={speed} onChange={(s) => { setSpeed(s); done(); }} options={[
                { value: "slow", label: "🐢" }, { value: "med", label: "🚶" }, { value: "fast", label: "🐇" },
              ]} />
            </div>
          </div>
          <Segmented size="sm" value={filter} onChange={pickFilter} options={(Object.keys(FILTERS) as FilterId[]).map((k) => ({ value: k, label: FILTERS[k].label }))} />
        </div>
      }
      stats={
        <>
          <Stat label="Shape moved" value={moved} format={(v) => `${Math.round(v)} px`} sub="from its training spot" />
          <Stat key={`px-${pixelScore < 0.5}`} label="Pixel memory · match" value={pixelScore} color={pixelScore < 0.5 ? C.pos : C.ok} emphasis={pixelScore < 0.5} sub="memorised pixels still lit" />
          <Stat label="Conv + max pool · match" value={convScore} color={C.warn} sub={finished ? "strongest response anywhere" : "strongest so far…"} />
          <Stat label="Weights to learn" value={9} format={(v) => `${Math.round(v)}`} color={C.indigo} sub={`shared by all ${CELLS} positions`} />
        </>
      }
      caption={caption}
      captionKey={captionKey}
    >
      <ScanStage img={img} trainImg={trainImg} fmap={fmap} scale={scale} idx={idx} best={finished ? best : -1} w={w} onMove={move} onDrag={(x, y) => { setPos({ x: clamp(x, LO, HI), y: clamp(y, LO, HI) }); done(); }} pos={pos} />
      <Showdown pixelScore={pixelScore} convScore={convScore} moved={moved} finished={finished} />
    </DemoFrame>
  );
}

/* ------------------------------------------------ input image · filter maths · feature map */

function ScanStage({ img, trainImg, fmap, scale, idx, best, w, pos, onMove, onDrag }: {
  img: Float32Array; trainImg: Float32Array; fmap: Float32Array; scale: number; idx: number; best: number; w: number[];
  pos: { x: number; y: number }; onMove: (dx: number, dy: number) => void; onDrag: (x: number, y: number) => void;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const mid = width < 700 ? 112 : 164;
  const side = Math.min(272, Math.max(160, (width - mid - 2 * 12 - 4 * 12) / 2)); // inset padding included
  const s = Math.floor(side / N); // pixel size in CSS px
  const win = idx < CELLS ? idx : best; // where the window is drawn
  const r0 = win >= 0 ? Math.floor(win / N) : -1, c0 = win >= 0 ? win % N : -1;
  const patch = Array.from({ length: 9 }, (_, i) => (win >= 0 ? px(img, r0 + Math.floor(i / 3) - 1, c0 + (i % 3) - 1) : 0));
  const outside = Array.from({ length: 9 }, (_, i) => { const r = r0 + Math.floor(i / 3) - 1, c = c0 + (i % 3) - 1; return r < 0 || c < 0 || r >= N || c >= N; });
  const sum = patch.reduce((a, v, i) => a + v * w[i], 0);
  const out = Math.max(0, sum);

  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: `1fr ${mid}px 1fr`, gap: 12, alignItems: "stretch" }}>
      {width > 0 && (
        <>
          <div className="inset col" style={{ padding: 12, gap: 8, alignItems: "center", minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 650, alignSelf: "flex-start" }}>🖼 Input · {N}×{N} pixels</div>
            <ImageCanvas img={img} trainImg={trainImg} s={s} r0={r0} c0={c0} found={idx >= CELLS} pos={pos} onMove={onMove} onDrag={onDrag} />
            <div className="row" style={{ gap: 4 }}>
              {([["←", -1, 0], ["↑", 0, -1], ["↓", 0, 1], ["→", 1, 0]] as const).map(([l, dx, dy]) => (
                <button key={l} className="btn sm icon" aria-label={`Move shape ${l}`} onClick={() => onMove(dx, dy)}>{l}</button>
              ))}
              <button className="btn ghost sm" title="Back to where the pixel model saw it during training" onClick={() => onMove(TRAIN.x - pos.x, TRAIN.y - pos.y)}>↺ Home</button>
            </div>
            <span className="tiny faint" style={{ textAlign: "center" }}>Drag the shape · dashed ghost = training spot</span>
          </div>

          <div className="col" style={{ gap: 8, alignItems: "center", justifyContent: "center", minWidth: 0 }}>
            <span className="tiny muted" style={{ fontWeight: 600 }}>filter weights</span>
            <Grid3 cells={w.map((v) => ({ v, bg: v > 0 ? `${C.warn}${alphaHex(v / Math.max(...w))}` : v < 0 ? `${C.neg}${alphaHex(-v / Math.max(...w.map(Math.abs)))}` : "var(--fill)", text: String(v) }))} size={mid < 150 ? 28 : 36} />
            <span className="muted" style={{ fontSize: 15, lineHeight: 1 }}>×</span>
            <span className="tiny muted" style={{ fontWeight: 600 }}>pixels under window</span>
            <Grid3 cells={patch.map((v, i) => ({ v, bg: outside[i] ? "transparent" : v ? IMG_ON : IMG_OFF, text: outside[i] ? "" : String(v), dark: !!v, onImage: true, dashed: outside[i] }))} size={mid < 150 ? 28 : 36} />
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 15 }}>=</span>
              <motion.span key={`${win}-${out}`} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={spring.pop}
                className="num" style={{ fontWeight: 750, fontSize: 22, padding: "2px 12px", borderRadius: 10, background: heat(out / scale), color: out / scale > 0.7 ? "#1d1d1f" : "#fff", minWidth: 44, textAlign: "center" }}>
                {out}
              </motion.span>
            </div>
            <span className="tiny faint" style={{ textAlign: "center" }}>{win < 0 ? "press Play" : sum < 0 ? `sum ${sum} → ReLU → 0` : `row ${r0 + 1}, col ${c0 + 1}`}</span>
          </div>

          <div className="inset col" style={{ padding: 12, gap: 8, alignItems: "center", minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 650, alignSelf: "flex-start" }}>🔥 Feature map</div>
            <MapCanvas fmap={fmap} scale={scale} idx={idx} best={best} s={s} />
            <Legend items={[{ color: heat(1), label: "strong match", shape: "square" }, { color: heat(0.05), label: "nothing", shape: "square" }]} />
            <span className="tiny faint" style={{ textAlign: "center" }}>{idx >= CELLS ? "◯ = global max pool: the best match anywhere" : `${Math.min(idx, CELLS)} / ${CELLS} positions computed`}</span>
          </div>
        </>
      )}
    </div>
  );
}

const alphaHex = (a: number) => Math.round(clamp(0.25 + 0.75 * a, 0, 1) * 255).toString(16).padStart(2, "0");

function Grid3({ cells, size }: { cells: { v: number; bg: string; text: string; dark?: boolean; onImage?: boolean; dashed?: boolean }[]; size: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${size}px)`, gap: 3 }}>
      {cells.map((c, i) => (
        <div key={i} className="num" style={{
          height: size, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700,
          background: c.bg, color: c.dark ? "#1d1d1f" : c.onImage ? "rgba(255,255,255,.55)" : "var(--text)", border: c.dashed ? "1.5px dashed var(--hairline)" : "1px solid var(--hairline)",
          transition: "background .15s",
        }}>{c.text}</div>
      ))}
    </div>
  );
}

/** Crisp, HiDPI-aware canvas sized in CSS pixels. */
function useCanvas(size: number, draw: (g: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || size <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size * dpr)) { c.width = Math.round(size * dpr); c.height = Math.round(size * dpr); }
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    draw(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, ...deps]);
  return ref;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function ImageCanvas({ img, trainImg, s, r0, c0, found, pos, onMove, onDrag }: {
  img: Float32Array; trainImg: Float32Array; s: number; r0: number; c0: number; found: boolean;
  pos: { x: number; y: number }; onMove: (dx: number, dy: number) => void; onDrag: (x: number, y: number) => void;
}) {
  const size = s * N;
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const ref = useCanvas(size, (g) => {
    g.fillStyle = IMG_BG;
    roundRect(g, 0, 0, size, size, 8);
    g.fill();
    const gap = s > 10 ? 1 : 0.5;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const on = img[r * N + c] > 0, ghost = trainImg[r * N + c] > 0;
        g.fillStyle = on ? IMG_ON : ghost ? "#3a3f57" : IMG_OFF;
        g.fillRect(c * s + gap, r * s + gap, s - 2 * gap, s - 2 * gap);
      }
    // training-spot ghost box
    g.setLineDash([4, 3]);
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 1.2;
    g.strokeRect(TRAIN.x * s + 0.5, TRAIN.y * s + 0.5, K * s - 1, K * s - 1);
    g.setLineDash([]);
    // sliding window
    if (r0 >= 0) {
      g.strokeStyle = found ? C.ok : C.amber;
      g.lineWidth = 2.5;
      g.shadowColor = found ? C.ok : C.amber;
      g.shadowBlur = 8;
      roundRect(g, (c0 - 1) * s + 1, (r0 - 1) * s + 1, 3 * s - 2, 3 * s - 2, 4);
      g.stroke();
      g.shadowBlur = 0;
    }
  }, [img, trainImg, r0, c0, found]);

  const cellAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return { c: Math.floor(((e.clientX - b.left) / b.width) * N), r: Math.floor(((e.clientY - b.top) / b.height) * N) };
  };
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const { r, c } = cellAt(e);
    const inside = c >= pos.x && c < pos.x + K && r >= pos.y && r < pos.y + K;
    grab.current = inside ? { dx: c - pos.x, dy: r - pos.y } : { dx: 2, dy: 2 };
    if (!inside) onDrag(c - 2, r - 2);
  };
  const onMoveP = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!grab.current) return;
    const { r, c } = cellAt(e);
    const nx = c - grab.current.dx, ny = r - grab.current.dy;
    if (nx !== pos.x || ny !== pos.y) onDrag(nx, ny);
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (d[e.key]) { e.preventDefault(); onMove(...d[e.key]); }
  };
  return (
    <canvas ref={ref} tabIndex={0} aria-label="Input image — drag the shape or use arrow keys" onPointerDown={onDown} onPointerMove={onMoveP}
      onPointerUp={() => (grab.current = null)} onPointerCancel={() => (grab.current = null)} onKeyDown={onKey}
      style={{ width: size, height: size, borderRadius: 8, cursor: "grab", touchAction: "none", outline: "none", boxShadow: "0 6px 20px rgba(0,0,0,.18)" }} />
  );
}

function MapCanvas({ fmap, scale, idx, best, s }: { fmap: Float32Array; scale: number; idx: number; best: number; s: number }) {
  const size = s * N;
  const ref = useCanvas(size, (g) => {
    g.fillStyle = IMG_BG;
    roundRect(g, 0, 0, size, size, 8);
    g.fill();
    const gap = s > 10 ? 1 : 0.5;
    for (let i = 0; i < CELLS; i++) {
      const r = Math.floor(i / N), c = i % N;
      g.fillStyle = i < idx ? heat(fmap[i] / scale) : UNPAINTED;
      g.fillRect(c * s + gap, r * s + gap, s - 2 * gap, s - 2 * gap);
    }
    const mark = (i: number, color: string, round: boolean) => {
      const r = Math.floor(i / N), c = i % N;
      g.strokeStyle = color;
      g.lineWidth = 2.5;
      g.shadowColor = color;
      g.shadowBlur = 8;
      g.beginPath();
      if (round) g.arc(c * s + s / 2, r * s + s / 2, s * 0.95, 0, Math.PI * 2);
      else g.roundRect(c * s + 1, r * s + 1, s - 2, s - 2, 3);
      g.stroke();
      g.shadowBlur = 0;
    };
    if (idx < CELLS) mark(idx, C.amber, false);
    else if (best >= 0) mark(best, C.ok, true);
  }, [fmap, scale, idx, best]);
  return <canvas ref={ref} aria-label="Feature map" style={{ width: size, height: size, borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.18)" }} />;
}

/* ------------------------------------------------ pixel model vs convolution */

function Showdown({ pixelScore, convScore, moved, finished }: { pixelScore: number; convScore: number; moved: number; finished: boolean }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const wide = width > 720;
  return (
    <div ref={ref} className="inset" style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: wide ? "1.4fr 1fr" : "1fr", gap: wide ? 18 : 10, alignItems: "center" }}>
      <div className="col" style={{ gap: 10, minWidth: 0 }}>
        <div className="row between small" style={{ gap: 8 }}>
          <b>🥊 Pixel model vs convolution</b>
          <span className="tiny faint">{moved === 0 ? "shape is at its training spot" : `shape moved ${moved} px`}</span>
        </div>
        <MeterBar label="📍 Pixel memory (one weight per pixel)" value={pixelScore} color={pixelScore < 0.5 ? C.pos : C.neg} height={20}
          note="Remembers which exact pixels were bright during training." />
        <MeterBar label="🔦 Convolution + global max pool" value={convScore} color={C.warn} height={20}
          note={finished ? "Same 9 weights everywhere, then “did it fire anywhere?”" : "Still scanning — the max so far."} />
      </div>
      <div className="tiny muted" style={{ lineHeight: 1.55 }}>
        A pixel model learns <i>“pixel 37 is bright”</i>. Move the shape and different pixels light up, so its evidence vanishes.
        A convolution learns a <i>pattern</i> and checks for it <b>at every position</b> — then pooling keeps only the strongest response, wherever it was.
      </div>
    </div>
  );
}
