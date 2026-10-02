import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../design/motion";
import type { VisionResult } from "../../lib/types";
import { EmptyState, InfoTip, Segmented, Slider } from "../glass";
import { HeatLegend, PixelCanvas, Thumb } from "./visionKit";

/** "What it looks at": gradient saliency for neural nets, the fixed pixel-importance map for classic models. */
export function VisionLooks({ vision, label }: { vision: VisionResult; label: string }) {
  if (vision.saliency?.length) return <Saliency vision={vision} />;
  if (vision.pixel_importance) return <PixelImportance vision={vision} label={label} />;
  return <EmptyState icon="🙈" title="No attention map for this model" text={vision.note ?? "This kind of model doesn't tell us which pixels it uses."} />;
}

function Saliency({ vision }: { vision: VisionResult }) {
  const [strength, setStrength] = useState(0.75);
  const [view, setView] = useState<"overlay" | "side">("overlay");
  const sal = vision.saliency!;
  const answers = useMemo(() => {
    const m = new Map<number, { true: string | number; pred: string | number; ok: boolean }>();
    for (const x of vision.correct) m.set(x.i, { true: x.true, pred: x.pred, ok: true });
    for (const x of vision.mistakes) m.set(x.i, { true: x.true, pred: x.pred, ok: false });
    return m;
  }, [vision]);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row between wrap" style={{ gap: 14, alignItems: "flex-end" }}>
        <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 560 }}>
          <b style={{ color: "var(--text)" }}>Where the network looked.</b> Bright spots are the pixels that, if you changed them slightly, would change its answer the most.
          A good model lights up <i>the thing itself</i> — the shape's edges and corners — and ignores the background, wherever the object sits.
          <span style={{ marginLeft: 6, verticalAlign: "middle" }}><InfoTip text="This is a gradient saliency map: we ask the network how much its answer changes for a tiny nudge to each pixel. It's a rough, noisy view of attention — but great for spotting a model that's looking at the wrong thing." /></span>
        </p>
        <div className="col" style={{ gap: 8, minWidth: 220 }}>
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: "overlay", label: "Overlay" }, { value: "side", label: "Side by side" }]} />
          {view === "overlay" && <Slider label="Heat strength" value={strength} min={0} max={1} step={0.05} onChange={setStrength} format={(v) => `${Math.round(v * 100)}%`} />}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${view === "side" ? 250 : 150}px, 1fr))`, gap: 14 }}>
        {sal.map((s, k) => {
          const a = answers.get(s.i);
          return (
            <motion.div key={s.i} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.gentle, delay: k * 0.05 }}
              className="inset col" style={{ padding: 8, gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: view === "side" ? "1fr 1fr" : "1fr", gap: 8 }}>
                <Thumb datasetId={vision.dataset_id} i={s.i} size="100%" px={192} heat={view === "overlay" ? s.heat : null} strength={strength} />
                {view === "side" && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring.gentle}
                    style={{ borderRadius: 14, overflow: "hidden", aspectRatio: "1 / 1" }}>
                    <PixelCanvas grid={s.heat} mode="heat" size="100%" smooth boost />
                  </motion.div>
                )}
              </div>
              {a && (
                <span className="tiny row" style={{ gap: 5, padding: "0 2px" }}>
                  <span style={{ color: a.ok ? "var(--success)" : "var(--danger)" }}>{a.ok ? "✓" : "✗"}</span>
                  <span className="truncate muted">{typeof a.pred === "number" ? `said ${a.pred.toFixed(1)} · truth ${Number(a.true).toFixed(1)}` : a.ok ? `${a.pred}` : `said ${a.pred} · truth ${a.true}`}</span>
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
      <HeatLegend />
    </div>
  );
}

function PixelImportance({ vision, label }: { vision: VisionResult; label: string }) {
  const pics = useMemo(() => [...vision.correct, ...vision.mistakes].slice(0, 8), [vision]);
  const [k, setK] = useState(0);
  const [strength, setStrength] = useState(0.7);
  useEffect(() => {
    if (pics.length < 2) return;
    const t = setInterval(() => setK((x) => (x + 1) % pics.length), 1700);
    return () => clearInterval(t);
  }, [pics.length]);
  const map = vision.pixel_importance!;
  const cur = pics[k];
  return (
    <div className="col" style={{ gap: 18 }}>
      <p className="small muted" style={{ lineHeight: 1.55, maxWidth: 720 }}>
        <b style={{ color: "var(--text)" }}>Where the {label} looks.</b> A classic model treats the picture as one long list of pixel numbers. It learns a <i>fixed</i> importance for
        every pixel <i>position</i> — so <b>notice it can't move its attention when the shape moves</b>. A shape in the corner lands on pixels it barely watches.
        That's exactly the problem convolutional networks solve: their filters slide over the whole picture.
      </p>
      <div className="row wrap" style={{ gap: 24, alignItems: "center" }}>
        <div className="col" style={{ gap: 8, alignItems: "center" }}>
          <div style={{ width: 200, borderRadius: 18, overflow: "hidden", boxShadow: "0 8px 26px rgba(0,0,0,0.18)" }}>
            <PixelCanvas grid={map} mode="heat" size={200} smooth />
          </div>
          <span className="tiny faint">Its pixel-importance map</span>
        </div>
        <motion.span animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ fontSize: 22 }} className="faint">→</motion.span>
        <div className="col" style={{ gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", width: 200, height: 200 }}>
            <AnimatePresence initial={false}>
              {cur && (
                <motion.div key={`${cur.i}-${k}`} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
                  style={{ position: "absolute", inset: 0 }}>
                  <Thumb datasetId={vision.dataset_id} i={cur.i} size={200} px={200} radius={18} />
                </motion.div>
              )}
            </AnimatePresence>
            <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", opacity: strength, pointerEvents: "none" }}>
              <PixelCanvas grid={map} mode="overlay" size={200} smooth />
            </div>
          </div>
          <span className="tiny faint">Same map on every picture — the shape moves, the attention doesn't</span>
        </div>
        <div className="col" style={{ gap: 10, minWidth: 200, flex: "1 1 200px" }}>
          <Slider label="Overlay strength" value={strength} min={0} max={1} step={0.05} onChange={setStrength} format={(v) => `${Math.round(v * 100)}%`} />
          <HeatLegend low="ignored" high="relied on" width={120} />
          <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
            {pics.map((p, j) => (
              <motion.button key={`${p.i}-${j}`} onClick={() => setK(j)} whileHover={{ scale: 1.08 }} transition={spring.pop}
                style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", borderRadius: 10, boxShadow: j === k ? "0 0 0 2px var(--accent)" : "none" }}>
                <Thumb datasetId={vision.dataset_id} i={p.i} size={36} px={64} radius={9} />
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
