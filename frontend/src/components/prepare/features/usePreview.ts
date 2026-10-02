import { useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import type { ColumnSummary, FeatureStep } from "../../../lib/types";
import { incomplete } from "./featureOps";

export interface FeaturePreview {
  /** summaries of the new columns, by name */
  cols: Record<string, ColumnSummary>;
  /** server-side error per step index (into the full steps list) */
  errors: Record<number, string>;
  loading: boolean;
  /** request failed for a non-validation reason (network etc.) */
  failed: boolean;
}

const STEP_RE = /^Feature step (\d+) \([^)]*\):\s*/;

/**
 * Debounced live preview of engineered features. Only complete steps are sent; when the backend rejects one,
 * its message is attached to that step and the steps before it are previewed on their own so they keep their charts.
 */
export function useFeaturePreview(datasetId: string | null, steps: FeatureStep[], delay = 300): FeaturePreview {
  const [state, setState] = useState<FeaturePreview>({ cols: {}, errors: {}, loading: false, failed: false });
  const seq = useRef(0);
  const key = JSON.stringify(steps);

  useEffect(() => {
    const ready = steps.map((s, i) => ({ s, i })).filter(({ s }) => !incomplete(s));
    if (!datasetId || !ready.length) {
      setState({ cols: {}, errors: {}, loading: false, failed: false });
      return;
    }
    const my = ++seq.current;
    setState((st) => ({ ...st, loading: true }));
    const t = setTimeout(async () => {
      try {
        const res = await api.previewFeatures(datasetId, ready.map((r) => r.s));
        if (my !== seq.current) return;
        if (res.ok) {
          setState({ cols: byName(res.columns), errors: {}, loading: false, failed: false });
          return;
        }
        const msg = res.error || "This step can't be computed.";
        const m = STEP_RE.exec(msg);
        const bad = m ? Math.min(ready.length, Math.max(1, Number(m[1]))) - 1 : ready.length - 1;
        const errors = { [ready[bad].i]: msg.replace(STEP_RE, "") };
        let cols: Record<string, ColumnSummary> = {};
        if (bad > 0) {
          const ok = await api.previewFeatures(datasetId, ready.slice(0, bad).map((r) => r.s)).catch(() => null);
          if (my !== seq.current) return;
          if (ok?.ok) cols = byName(ok.columns);
        }
        setState({ cols, errors, loading: false, failed: false });
      } catch {
        if (my === seq.current) setState((st) => ({ ...st, loading: false, failed: true }));
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, key, delay]);

  return state;
}

const byName = (cols: ColumnSummary[]) => Object.fromEntries(cols.map((c) => [c.name, c]));
