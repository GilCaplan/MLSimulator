import { useEffect, useRef, useState } from "react";
import { useProject } from "../../lib/store";
import type { DatasetSummary, Point } from "../../lib/types";

let idCounter = 0;
export const uid = (prefix = "f") => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** Make a freshly created / loaded dataset the project's dataset and reset everything downstream of it. */
export function adoptDataset(d: DatasetSummary, target?: string | null) {
  const s = useProject.getState();
  s.setDataset(d);
  s.setProfile(null);
  s.setReport(null);
  const names = d.columns.map((c) => c.name);
  const t = target && names.includes(target) ? target : d.target_hint ?? names[names.length - 1] ?? null;
  s.update({ dataset_id: d.id, target: t, pipeline: null, prepared_id: null });
}

/** Debounced copy of a value (compared by JSON so fresh-but-equal objects don't retrigger). */
export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return v;
}

/**
 * Run an async loader whenever `key` changes; keeps the previous data while the next request is in flight
 * and drops stale responses.
 */
export function useLatest<T>(key: string | null, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    if (key === null) return;
    const my = ++seq.current;
    setLoading(true);
    loader.current()
      .then((d) => { if (my === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (my === seq.current) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [key]);
  return { data, error, loading };
}

/**
 * A 2-D projection of one-feature data collapses onto a line (y = 0). For regression we then plot the
 * feature against the target instead, which is far more telling (e.g. the sine wave).
 */
export function liftFlat(points: Point[], continuous: boolean): Point[] {
  if (!points.length || !continuous) return points;
  const y0 = points[0].y;
  if (!points.every((p) => p.y === y0)) return points;
  return points.map((p) => ({ ...p, y: Number(p.label) }));
}

export const isIdentifier = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);

/** Animated swap for the source picker panels. */
export const panelSwap = {
  initial: { opacity: 0, y: 12, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" },
  transition: { duration: 0.26, ease: [0.32, 0.72, 0, 1] as const },
};
