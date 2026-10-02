import { AnimatePresence, motion } from "framer-motion";
import type { Catalog, DatasetSummary, Task } from "../../lib/types";
import { Segmented } from "../glass";
import { Designer } from "./designer/Designer";
import type { DesignState } from "./designer/model";
import { PresetsPanel } from "./PresetsPanel";
import { SamplesPanel } from "./SamplesPanel";
import { panelSwap } from "./shared";
import { UploadPanel } from "./UploadPanel";

/** The designer always builds an answer column; discovery projects design groups (classification) and hide it as truth. */
export const designTask = (task: string | null): Task => (task === "regression" ? "regression" : "classification");

export type SourceMode = "samples" | "upload" | "generate" | "presets";

export function SourcePicker({ mode, setMode, catalog, task, onLoaded, design, setDesign }: {
  mode: SourceMode;
  setMode: (m: SourceMode) => void;
  catalog: Catalog | null;
  /** the project's task (supervised or unsupervised) */
  task: string | null;
  onLoaded: (d: DatasetSummary) => void;
  design: DesignState;
  setDesign: (d: DesignState | ((d: DesignState) => DesignState)) => void;
}) {
  return (
    <div className="col" style={{ gap: 14 }}>
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="row center">
        <Segmented<SourceMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "samples", label: "📚 Samples" },
            { value: "upload", label: "📁 Upload" },
            { value: "generate", label: "🧪 Generate" },
            { value: "presets", label: "🧩 Toy shapes" },
          ]}
        />
      </motion.div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} {...panelSwap}>
          {mode === "upload" ? (
            <UploadPanel onLoaded={onLoaded} />
          ) : !catalog ? (
            <div className="col" style={{ gap: 12 }}>
              <div className="skeleton" style={{ height: 60 }} />
              <div className="skeleton" style={{ height: 220 }} />
            </div>
          ) : mode === "samples" ? (
            <SamplesPanel catalog={catalog} task={task} onLoaded={onLoaded} />
          ) : mode === "presets" ? (
            <PresetsPanel catalog={catalog} task={task} onLoaded={onLoaded} />
          ) : (
            <Designer design={design} setDesign={setDesign} task={designTask(task)} catalog={catalog} onCreated={onLoaded} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
