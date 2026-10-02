import { useEffect } from "react";
import { api } from "../../../lib/api";
import type { RunResult, SavedModel } from "../../../lib/types";
import { useSaved } from "../util";

/* `useSaved` (components/train/util.ts) only remembers saves made in this browser session. The library records which
 * run and model each saved model came from (job_id + key), so we rebuild the "✓ saved" marks for a run from it. */

type Stored = SavedModel & { job_id?: string; key?: string };
const inflight = new Map<string, Promise<void>>();
/** ids saved during this session — never dropped by a sync that may have started before the save finished */
const justSaved = new Set<string>();

/** Record a save made from this browser (marks it in `useSaved` too). */
export function noteSaved(jobId: string, key: string, id: string) {
  justSaved.add(id);
  useSaved.getState().mark(jobId, key, id);
}

/** Re-read the library and refresh the saved marks for one run (deduplicated while a request is in flight). */
export function syncSaved(jobId: string): Promise<void> {
  const running = inflight.get(jobId);
  if (running) return running;
  const p = api.library()
    .then((list) => {
      const prefix = `${jobId}:`;
      const next: Record<string, string> = {};
      const ids = new Set(list.map((m) => m.id));
      // keep other runs' marks, and this run's marks that still exist (or were saved after this request started)
      for (const [k, v] of Object.entries(useSaved.getState().saved)) if (!k.startsWith(prefix) || ids.has(v) || justSaved.has(v)) next[k] = v;
      // newest last, so the most recent copy of a model wins
      for (const m of [...(list as Stored[])].sort((a, b) => a.created_at - b.created_at)) {
        if (m.job_id === jobId && m.key) next[`${prefix}${m.key}`] = m.id;
      }
      useSaved.setState({ saved: next });
    })
    .catch(() => { /* offline or library unavailable: keep the session marks */ })
    .finally(() => inflight.delete(jobId));
  inflight.set(jobId, p);
  return p;
}

/** Keep the saved marks of a run in step with the library (once per mount / run). */
export function useSavedSync(jobId: string | null | undefined) {
  useEffect(() => { if (jobId) syncSaved(jobId); }, [jobId]);
}

/** How many of a run's real models are saved. */
export function useSavedCount(result: RunResult | null | undefined): number {
  return useSaved((s) => {
    if (!result) return 0;
    let n = 0;
    for (const m of Object.values(result.models)) if (!m.baseline && s.saved[`${result.job_id}:${m.key}`]) n++;
    return n;
  });
}
