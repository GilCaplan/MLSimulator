import { motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { PipelineSpec } from "../../../lib/types";
import { Thumb } from "../../data/image/Thumb";
import { Note, StageCard, SubHead } from "../StageCard";
import { imageOf, patchImage, SIZES } from "./imageState";

export interface ImageCardProps {
  spec: PipelineSpec;
  datasetId: string;
  /** dataset image indices to preview */
  samples: number[];
  /** resolution the pictures are stored at */
  stored: number;
  open: boolean;
  onToggle: () => void;
  flash: boolean;
}

const BOX = 84;

/** Training resolution: the same picture at every size, with the detail-vs-speed trade-off. */
export function ResolutionCard({ spec, datasetId, samples, stored, open, onToggle, flash }: ImageCardProps) {
  const img = imageOf(spec);
  const c = img.grayscale ? 1 : 3;
  const i = samples[0] ?? 0;
  return (
    <StageCard id="resolution" icon="🔍" title="Resolution" open={open} onToggle={onToggle} flash={flash}
      summary={`${img.size}×${img.size}`}
      why="Every picture is resized to the same small square before the model sees it. Smaller is faster; bigger keeps fine detail."
      info="Each pixel (times each colour) becomes one input number. Going from 32×32 to 64×64 means four times as many numbers — roughly four times the training time — and the model needs more examples to make sense of them.">
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${SIZES.length}, minmax(0, 1fr))`, gap: 10 }}>
        {SIZES.map((s) => {
          const active = img.size === s;
          const upscaled = s > stored;
          const cost = (s / 32) ** 2;
          return (
            <motion.button key={s} onClick={() => patchImage(spec, { size: s })} whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} transition={spring.snappy}
              className="inset col" style={{ padding: 10, gap: 6, alignItems: "center", cursor: "pointer", color: "inherit", borderColor: active ? "var(--accent)" : "var(--hairline)", background: active ? "var(--accent-soft)" : "var(--fill)", boxShadow: active ? "0 0 0 3px var(--accent-soft)" : "none", transition: "border-color .2s, background .2s, box-shadow .2s" }}>
              <Thumb datasetId={datasetId} i={i} size={Math.min(s, stored)} box={BOX} grayscale={img.grayscale} style={{ width: "100%", maxWidth: BOX, height: "auto", aspectRatio: "1" }} />
              <b className="num" style={{ fontSize: 13.5 }}>{s}×{s}</b>
              <span className="tiny muted num">{(s * s * c).toLocaleString()} numbers</span>
              <div title="Relative training time" style={{ width: "100%", height: 5, borderRadius: 3, background: "var(--fill-2)", overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, cost * 25)}%` }} transition={spring.gentle}
                  style={{ height: "100%", borderRadius: 3, background: cost > 2 ? "var(--warning)" : "var(--success)" }} />
              </div>
              <span className="tiny faint num">{cost < 1 ? `${Math.round(1 / cost * 10) / 10}× faster` : cost === 1 ? "baseline speed" : `${cost.toFixed(cost < 3 ? 2 : 0)}× slower`}</span>
              {upscaled && <span className="badge" style={{ height: 18, fontSize: 10 }}>no new detail</span>}
            </motion.button>
          );
        })}
      </div>
      {img.size > stored ? (
        <Note icon="🔎" tone="warn">Your pictures are stored at <b>{stored}×{stored}</b>. Bigger sizes just stretch them — no extra detail, only extra work.</Note>
      ) : (
        <Note>Can you still recognise the picture at the smallest size? If <i>you</i> can, the model probably can too — and it will train much faster.</Note>
      )}
    </StageCard>
  );
}

/** RGB vs greyscale: a colour picture is really three stacked pictures. */
export function ColourCard({ spec, datasetId, samples, stored, open, onToggle, flash }: ImageCardProps) {
  const img = imageOf(spec);
  const px = img.size * img.size;
  const shown = samples.slice(0, 3);
  const opts: { grey: boolean; title: string; blurb: string }[] = [
    { grey: false, title: "🎨 Colour (RGB)", blurb: `3 channels — ${(px * 3).toLocaleString()} numbers per picture` },
    { grey: true, title: "⚫ Greyscale", blurb: `1 channel — ${px.toLocaleString()} numbers per picture` },
  ];
  return (
    <StageCard id="colour" icon="🎨" title="Colour" open={open} onToggle={onToggle} flash={flash}
      summary={img.grayscale ? "greyscale" : "RGB"}
      why="Keep the three colour channels, or squash them into one brightness channel — a third of the numbers."
      info="Greyscale is a good idea when colour doesn't help the answer (shapes, digits, arrows…). If colour matters — ripe vs unripe fruit — keep RGB.">
      <ChannelFilters />
      <div className="row wrap" style={{ gap: 12 }}>
        {opts.map((o) => {
          const active = img.grayscale === o.grey;
          return (
            <motion.button key={String(o.grey)} onClick={() => patchImage(spec, { grayscale: o.grey })} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}
              className="inset col" style={{ flex: "1 1 240px", padding: 12, gap: 10, cursor: "pointer", color: "inherit", textAlign: "left", borderColor: active ? "var(--accent)" : "var(--hairline)", background: active ? "var(--accent-soft)" : "var(--fill)", boxShadow: active ? "0 0 0 3px var(--accent-soft)" : "none", transition: "border-color .2s, background .2s, box-shadow .2s" }}>
              <div className="row between">
                <b style={{ fontSize: 13.5 }}>{o.title}</b>
                {active && <span className="badge accent">✓ chosen</span>}
              </div>
              <div className="row" style={{ gap: 8 }}>
                {shown.map((i) => <Thumb key={i} datasetId={datasetId} i={i} size={Math.min(img.size, stored)} box={58} grayscale={o.grey} />)}
              </div>
              <span className="tiny muted num">{o.blurb}</span>
            </motion.button>
          );
        })}
      </div>
      {shown[0] !== undefined && (
        <div className="col" style={{ gap: 8 }}>
          <SubHead info="Your screen mixes red, green and blue light to make every colour. The model receives those three layers separately.">What the model actually receives</SubHead>
          <div className="row wrap" style={{ gap: 14, alignItems: "center" }}>
            <Thumb datasetId={datasetId} i={shown[0]} size={Math.min(img.size, stored)} box={64} grayscale={img.grayscale} />
            <span className="faint" style={{ fontSize: 18 }}>=</span>
            {img.grayscale ? (
              <div className="col" style={{ gap: 4, alignItems: "center" }}>
                <Thumb datasetId={datasetId} i={shown[0]} size={Math.min(img.size, stored)} box={64} grayscale />
                <span className="tiny muted">brightness</span>
              </div>
            ) : (
              (["r", "g", "b"] as const).map((ch, k) => (
                <motion.div key={ch} className="col" style={{ gap: 4, alignItems: "center" }} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.gentle, delay: k * 0.1 }}>
                  <Thumb datasetId={datasetId} i={shown[0]} size={Math.min(img.size, stored)} box={64} style={{ filter: `url(#mlp-ch-${ch})` }} />
                  <span className="tiny muted">{ch === "r" ? "red" : ch === "g" ? "green" : "blue"}</span>
                </motion.div>
              ))
            )}
            <span className="tiny faint" style={{ maxWidth: 200, lineHeight: 1.45 }}>
              {img.grayscale ? `One ${img.size}×${img.size} grid of brightness values.` : `Three ${img.size}×${img.size} grids stacked — the "3" in 3×${img.size}×${img.size}.`}
            </span>
          </div>
        </div>
      )}
    </StageCard>
  );
}

/** SVG colour-matrix filters that keep only one channel (shown in its own colour). */
function ChannelFilters() {
  const m = { r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" };
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      {(Object.keys(m) as (keyof typeof m)[]).map((k) => (
        <filter key={k} id={`mlp-ch-${k}`} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={m[k]} /></filter>
      ))}
    </svg>
  );
}
