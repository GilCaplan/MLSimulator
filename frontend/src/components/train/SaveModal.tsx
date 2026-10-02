import { useMemo } from "react";
import { useProject } from "../../lib/store";
import type { ModelResult, RunResult } from "../../lib/types";
import { SaveModelModal } from "./save/SaveModelModal";

/**
 * Per-model "Save to library" dialog (used by the unsupervised / recommender / forecasting detail views).
 * It is the shared "Save a model" dialog (save/SaveModelModal.tsx), opened with this model preselected.
 */
export function SaveModal({ open, onClose, jobId, model }: { open: boolean; onClose: () => void; jobId: string; model: ModelResult }) {
  const current = useProject((s) => s.result);
  const result = useMemo<RunResult>(() => current?.job_id === jobId && current.models[model.key] ? current : {
    // not the project's latest run: a one-model stand-in is enough for the dialog
    job_id: jobId, task: (current?.task ?? "classification"), prepared_id: current?.prepared_id ?? "", models: { [model.key]: model },
    failures: {}, leaderboard: [], coach: [], classes: current?.classes ?? null, feature_names: [], options: current?.options ?? { cv_folds: 0, seed: 42 },
  } as RunResult, [current, jobId, model]);
  return <SaveModelModal open={open} onClose={onClose} result={result} preselect={model.key} />;
}
