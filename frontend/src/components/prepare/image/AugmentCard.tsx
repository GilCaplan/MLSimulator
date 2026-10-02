import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { useProject, useUI } from "../../../lib/store";
import { Slider, Toggle } from "../../glass";
import { Note, StageCard, SubHead } from "../StageCard";
import type { ImageCardProps } from "./ResolutionColourCards";
import { augmentOn, augmentSummary, harmfulAugment, imageOf, patchImage, type Augment } from "./imageState";

const PRESETS: { id: string; icon: string; label: string; augment: Augment }[] = [
  { id: "off", icon: "⭕", label: "Off", augment: {} },
  { id: "gentle", icon: "🌱", label: "Gentle", augment: { flip_h: true, rotate: 10, shift: 0.08 } },
  { id: "strong", icon: "💪", label: "Strong", augment: { flip_h: true, rotate: 25, shift: 0.15, brightness: 0.3, cutout: true } },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Augmentation: random, answer-preserving changes applied to training pictures (neural networks only). */
export function AugmentCard({ spec, datasetId, samples, stored, open, onToggle, flash, imageSet }: ImageCardProps & { imageSet?: string }) {
  const img = imageOf(spec);
  const a = img.augment;
  const on = augmentOn(a);
  const set = (patch: Partial<Augment>) => patchImage(spec, { augment: patch });
  const harmful = harmfulAugment(imageSet, a);
  const registry = useProject((s) => s.registry);
  const models = useProject((s) => s.project?.models ?? []);
  const lineup = Array.from(new Set(models.map((m) => m.model_id))).map((id) => registry.find((r) => r.id === id)).filter((s) => !!s);
  return (
    <StageCard id="augment" icon="🪄" title="Augmentation" open={open} onToggle={onToggle} flash={flash}
      summary={augmentSummary(a)}
      why={<>Teach the model what <i>doesn't</i> change the answer: show it slightly flipped, turned, shifted or darker copies of each picture.</>}
      info="Every time a training picture is used, it's randomly altered a little. The model can't memorise exact pixels any more, so it learns the real pattern — a powerful cure for overfitting with few pictures. Validation and test pictures are never altered.">
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="eyebrow" style={{ marginRight: 4 }}>Presets</span>
        {PRESETS.map((p) => (
          <motion.button key={p.id} whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }} className="btn sm"
            onClick={() => patchImage(spec, { augment: { flip_h: false, flip_v: false, rotate: 0, shift: 0, brightness: 0, cutout: false, ...p.augment } })}>
            <span>{p.icon}</span> {p.label}
          </motion.button>
        ))}
      </div>

      <div className="row wrap" style={{ gap: 22, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 14, flex: "1 1 280px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 22px" }}>
            <Toggle label="↔ Flip left–right" help="Mirror half of the pictures. Fine for cats; wrong for text or arrows." checked={!!a.flip_h} onChange={(v) => set({ flip_h: v })} />
            <Toggle label="↕ Flip upside-down" help="Turn half of the pictures upside-down. Only if 'upside-down' means the same thing (e.g. satellite photos)." checked={!!a.flip_v} onChange={(v) => set({ flip_v: v })} />
            <Toggle label="▪ Cutout" help="Hide a random square of each picture, so the model learns to use more than one clue." checked={!!a.cutout} onChange={(v) => set({ cutout: v })} />
          </div>
          <Slider label="⟳ Rotate up to" help="Turn each picture by a random angle between −x° and +x°." value={a.rotate ?? 0} min={0} max={45} integer format={(v) => `±${Math.round(v)}°`} onChange={(v) => set({ rotate: v })} />
          <Slider label="⇢ Shift up to" help="Slide each picture by up to this share of its width, in any direction." value={a.shift ?? 0} min={0} max={0.3} step={0.01} format={pct} onChange={(v) => set({ shift: v })} />
          <Slider label="☀ Brightness" help="Make pictures randomly darker or brighter by up to this much." value={a.brightness ?? 0} min={0} max={0.5} step={0.05} format={(v) => `±${pct(v)}`} onChange={(v) => set({ brightness: v })} />
        </div>
        <div className="col" style={{ gap: 8, flex: "1 1 260px" }}>
          <SubHead info="An approximate, instant preview drawn by your browser. After you run the preparation, the real variants made by the pipeline appear in the results.">Live preview</SubHead>
          <LivePreview datasetId={datasetId} i={samples[0] ?? 0} size={Math.min(img.size, stored)} augment={a} grayscale={img.grayscale} />
          <span className="tiny faint">{on ? "Original on the left, then random training variants — new ones every couple of seconds." : "Augmentation is off — every training picture is shown exactly as it is."}</span>
        </div>
      </div>

      {harmful && <Note icon="⚠️" tone="warn"><b>Careful:</b> {harmful} Only use changes that keep the answer the same.</Note>}
      <Note icon="🧠">
        Augmentation only applies to <b>neural networks</b>, while they train — classic models learn from the original pictures.
        {lineup.length > 0 && (
          <span className="row wrap" style={{ gap: 5, marginTop: 6 }}>
            {lineup.map((s) => <span key={s!.id} className={`badge ${s!.nn ? (on ? "success" : "") : ""}`} style={{ opacity: s!.nn ? 1 : 0.6 }}>{s!.emoji} {s!.label}{s!.nn ? (on ? " ✓" : "") : " · not used"}</span>)}
          </span>
        )}
      </Note>
    </StageCard>
  );
}

interface Variant { flipH: boolean; flipV: boolean; rot: number; dx: number; dy: number; bright: number; cut: { x: number; y: number } | null }

function roll(a: Augment): Variant {
  const r = (m: number) => (Math.random() * 2 - 1) * m;
  return {
    flipH: !!a.flip_h && Math.random() < 0.5,
    flipV: !!a.flip_v && Math.random() < 0.5,
    rot: r(a.rotate ?? 0),
    dx: r(a.shift ?? 0) * 100,
    dy: r(a.shift ?? 0) * 100,
    bright: 1 + r(a.brightness ?? 0),
    cut: a.cutout ? { x: Math.random() * 75, y: Math.random() * 75 } : null,
  };
}

/** Original + 5 CSS-transformed variants that re-roll every 2.2 s. */
function LivePreview({ datasetId, i, size, augment, grayscale }: { datasetId: string; i: number; size: number; augment: Augment; grayscale: boolean }) {
  const reduce = useUI((s) => s.reduceMotion);
  const key = JSON.stringify(augment);
  const [variants, setVariants] = useState<Variant[]>(() => Array.from({ length: 5 }, () => roll(augment)));
  useEffect(() => {
    setVariants(Array.from({ length: 5 }, () => roll(augment)));
    if (reduce || !augmentOn(augment)) return;
    const t = setInterval(() => setVariants(Array.from({ length: 5 }, () => roll(augment))), 2200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduce]);
  const src = api.imageUrl(datasetId, i, size);
  const box = 64;
  const tile = (v: Variant | null, k: number) => (
    <div key={k} className="col" style={{ gap: 3, alignItems: "center" }}>
      <div style={{ width: box, height: box, borderRadius: 10, overflow: "hidden", position: "relative", background: "var(--fill-2)", boxShadow: k === 0 ? "0 0 0 2px var(--accent)" : "0 1px 4px rgba(0,0,0,.12)" }}>
        <motion.img src={src} alt="" draggable={false} width={box} height={box}
          animate={v ? { rotate: v.rot, x: (v.dx / 100) * box, y: (v.dy / 100) * box, scaleX: v.flipH ? -1 : 1, scaleY: v.flipV ? -1 : 1 } : {}}
          transition={spring.gentle}
          style={{ display: "block", imageRendering: size <= 48 ? "pixelated" : "auto", filter: `${grayscale ? "grayscale(1) " : ""}brightness(${v?.bright ?? 1})`, transition: "filter .5s", transformOrigin: "50% 50%" }} />
        {v?.cut && (
          <motion.div layout animate={{ left: `${v.cut.x}%`, top: `${v.cut.y}%` }} transition={spring.gentle}
            style={{ position: "absolute", width: "25%", height: "25%", background: "rgba(128,128,128,.92)" }} />
        )}
      </div>
      <span className="tiny faint">{k === 0 ? "original" : `variant ${k}`}</span>
    </div>
  );
  return (
    <div className="inset row wrap" style={{ padding: 10, gap: 8, justifyContent: "flex-start" }}>
      {tile(null, 0)}
      {augmentOn(augment) && variants.map((v, k) => tile(v, k + 1))}
    </div>
  );
}
