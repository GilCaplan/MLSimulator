import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../design/motion";
import { timeAgo } from "../../lib/format";
import { useJob, useProject } from "../../lib/store";
import type { RunResult } from "../../lib/types";
import { Glass, Spinner } from "../glass";
import { Leaderboard } from "./Leaderboard";
import { ChallengeCheck } from "../lessons/ChallengeCheck";
import { ModelDetail } from "./ModelDetail";
import { boardRows, primaryMetric, realModels, startTraining } from "./util";

/** Results view: dirty-banner, header actions, leaderboard and detail for the selected model. */
export function TrainResults({ result, onOptions }: { result: RunResult; onOptions: () => void }) {
  const dirty = useProject((s) => s.dirtySinceTrain);
  const history = useProject((s) => s.project?.history ?? []);
  const busy = useJob((s) => s.status === "running");
  const [metric, setMetric] = useState(primaryMetric(result.task));
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    setMetric(primaryMetric(result.task));
    setSelected(boardRows(result, primaryMetric(result.task)).find((r) => !r.baseline)?.key ?? null);
  }, [result]);
  const model = selected ? result.models[selected] : undefined;
  const run = history.findIndex((h) => h.job_id === result.job_id);
  const nModels = realModels(result).length;
  const calibrated = result.task === "classification" && result.options?.calibrate && result.options.calibrate !== "none" ? result.options.calibrate : null;

  const again = async () => {
    setStarting(true);
    await startTraining();
    setStarting(false);
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <AnimatePresence>
        {dirty && (
          <motion.div initial={{ opacity: 0, height: 0, y: -10 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle}>
            <Glass variant="strong" style={{ padding: "12px 16px", borderColor: "rgba(255,159,10,.5)" }}>
              <div className="row between wrap" style={{ gap: 12 }}>
                <span className="row" style={{ gap: 10 }}>
                  <motion.span animate={{ rotate: [0, 15, -10, 0] }} transition={{ repeat: Infinity, duration: 2.2, repeatDelay: 1 }} style={{ fontSize: 20 }}>🔁</motion.span>
                  <span><b>You changed some settings</b> <span className="muted">— train again to compare.</span></span>
                </span>
                <button className="btn gradient sm" onClick={again} disabled={starting || busy}>{starting ? <Spinner size={13} /> : "🚀"} Train again</button>
              </div>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="row between wrap" style={{ gap: 10, padding: "0 4px" }}>
        <span className="small muted">
          {run >= 0 ? `Run #${run + 1} · ${timeAgo(history[run].at)}` : "Latest run"} · {nModels} model{nModels === 1 ? "" : "s"}
          {result.options?.cv_folds ? ` · ${result.options.cv_folds}-fold CV` : ""}
          {calibrated ? ` · ${calibrated} calibration` : ""}
        </span>
        <span className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={onOptions}>⚙️ Options</button>
          {!dirty && <button className="btn sm primary" onClick={again} disabled={starting || busy}>{starting ? <Spinner size={13} /> : "↻"} Train again</button>}
        </span>
      </motion.div>

      <ChallengeCheck />

      <Leaderboard result={result} metric={metric} onMetric={setMetric} selected={selected} onSelect={setSelected} />
      {model && <ModelDetail result={result} model={model} />}
    </div>
  );
}
