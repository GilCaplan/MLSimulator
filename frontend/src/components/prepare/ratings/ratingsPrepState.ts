import type { DatasetProfile, PipelineSpec } from "../../../lib/types";
import { patchPipeline } from "../state";

export type RecsysSpec = NonNullable<PipelineSpec["recsys"]>;
export const DEFAULT_RECSYS: RecsysSpec = { min_user: 5, min_item: 2, positive: 4, test_k: 3, split: "leave_last_out" };

export type RatingsStageId = "filters" | "liked" | "heldout";

export const RATINGS_STAGES: { id: RatingsStageId; icon: string; name: string }[] = [
  { id: "filters", icon: "🧹", name: "Filters" },
  { id: "liked", icon: "💚", name: "Liked =" },
  { id: "heldout", icon: "⏳", name: "Held-out" },
];

export const recsysOf = (spec: PipelineSpec | null | undefined): RecsysSpec => ({ ...DEFAULT_RECSYS, ...(spec?.recsys ?? {}) });

/** Write part of the recommender settings (invalidates the prepared data). */
export function patchRecsys(spec: PipelineSpec, patch: Partial<RecsysSpec>) {
  patchPipeline("recsys", { ...recsysOf(spec), ...patch });
}

export function ratingsStageState(id: RatingsStageId, spec: PipelineSpec): { state: string; active: boolean } {
  const r = recsysOf(spec);
  switch (id) {
    case "filters": return { state: `≥${r.min_user} per person · ≥${r.min_item} per item`, active: r.min_user > 1 || r.min_item > 1 };
    case "liked": return { state: `${r.positive}★ and up`, active: true };
    case "heldout": return { state: `last ${r.test_k} · ${r.split === "random" ? "random" : "most recent"}`, active: true };
  }
}

/** Estimated number of people with fewer than `min` ratings, read off the profile's per-person histogram. */
export function usersBelow(profile: DatasetProfile | null, min: number): number | null {
  const counts = profile?.per_user, edges = profile?.per_user_edges;
  if (!counts?.length || !edges?.length) return null;
  let n = 0;
  counts.forEach((c, k) => {
    const lo = edges[k], hi = edges[k + 1];
    if (hi <= min) n += c;
    else if (lo < min) n += c * ((min - lo) / (hi - lo || 1));
  });
  return Math.round(n);
}

/** Exact number of items with fewer than `min` ratings (the profile's long tail holds every item's count). */
export function itemsBelow(profile: DatasetProfile | null, min: number): number | null {
  const lt = profile?.long_tail;
  if (!lt?.length) return null;
  return lt.filter((v) => v < min).length;
}
