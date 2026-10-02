import { motion } from "framer-motion";
import { spring } from "../../../design/motion";
import type { PipelineSpec } from "../../../lib/types";
import { SplitBar } from "../../charts";
import { NumberField, Slider } from "../../glass";
import { patchPipeline } from "../state";
import { Note, StageCard, SubHead } from "../StageCard";
import { SPLIT_COLORS } from "../SplitScaleCards";

/** Train / validation / test split for pictures (classes are kept in proportion automatically). */
export function ImageSplitCard({ spec, nImages, isClf, open, onToggle, flash }: {
  spec: PipelineSpec;
  nImages: number;
  isClf: boolean;
  open: boolean;
  onToggle: () => void;
  flash: boolean;
}) {
  const sp = spec.split;
  const test = Math.round(nImages * sp.test_size), val = Math.round(nImages * sp.val_size);
  const setTest = (v: number) => patchPipeline("split", { test_size: v, val_size: Math.min(sp.val_size, Math.round((0.8 - v) * 100) / 100) });
  const setVal = (v: number) => patchPipeline("split", { val_size: Math.min(v, Math.round((0.8 - sp.test_size) * 100) / 100) });
  const te = Math.round(sp.test_size * 100), va = Math.round(sp.val_size * 100);
  return (
    <StageCard id="imgsplit" icon="✂️" title="Split train / validation / test" open={open} onToggle={onToggle} flash={flash}
      summary={`${100 - te - va}/${va}/${te}`}
      why="Hide some pictures from the model — a final exam it never gets to study for — to check it really learned."
      info="Training pictures are what the model learns from. Validation pictures are checked while training (to stop at the right moment). Test pictures stay locked away until the very end, so the final score shows how the model does on pictures it has never seen.">
      <div className="inset" style={{ padding: 14 }}>
        <SplitBar parts={[
          { label: "Train", value: Math.max(0, nImages - test - val), color: SPLIT_COLORS.train },
          { label: "Validation", value: val, color: SPLIT_COLORS.val },
          { label: "Test (locked away)", value: test, color: SPLIT_COLORS.test },
        ]} />
        {nImages > 0 && <div className="tiny faint" style={{ marginTop: 8 }}>Estimated from {nImages.toLocaleString()} pictures.</div>}
      </div>
      <div className="row wrap" style={{ gap: 20 }}>
        <div style={{ flex: "1 1 220px" }}>
          <Slider label="Test size" help="Share of pictures kept for the final exam. 15–25% is typical." value={sp.test_size} min={0.05} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={setTest} />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <Slider label="Validation size" help="Share of pictures used to check progress while training — neural networks use it to stop at their best epoch." value={sp.val_size} min={0} max={0.4} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={setVal} />
        </div>
      </div>
      <div className="row wrap between" style={{ gap: 16 }}>
        {isClf && <Note icon="⚖️">Every class keeps the same share in each split automatically, so the test set gets a fair mix.</Note>}
        <div className="row" style={{ gap: 10 }}>
          <SubHead info="The random seed decides which pictures land where. Same seed = same split every time, so results are reproducible.">Shuffle seed</SubHead>
          <NumberField value={sp.seed} min={0} max={1e6} onChange={(v) => patchPipeline("split", { seed: Math.round(v) })} width={84} />
          <motion.button className="btn sm ghost" whileTap={{ rotate: 180 }} transition={spring.snappy} title="New random seed" onClick={() => patchPipeline("split", { seed: Math.floor(Math.random() * 10000) })}>🎲</motion.button>
        </div>
      </div>
    </StageCard>
  );
}
