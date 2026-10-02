/* Builder modal state and the project-level actions on custom metrics (save, duplicate, delete, rank by). */
import { useEffect, useState } from "react";
import { create } from "zustand";
import { toast, useProject } from "../../lib/store";
import type { CustomMetric } from "../../lib/types";
import { customKey, newMetricId } from "./custom";

type Kind = CustomMetric["kind"];

interface BuilderState {
  open: boolean;
  editing: CustomMetric | null;
  kind: Kind;
  /** mounted <MetricBuilderHost/>s; only the first renders the modal */
  hosts: number[];
  openNew: (kind?: Kind) => void;
  openEdit: (cm: CustomMetric) => void;
  close: () => void;
}

export const useMetricBuilder = create<BuilderState>((set) => ({
  open: false,
  editing: null,
  kind: "formula",
  hosts: [],
  openNew: (kind = "formula") => set({ open: true, editing: null, kind }),
  openEdit: (cm) => set({ open: true, editing: cm, kind: cm.kind }),
  close: () => set({ open: false }),
}));

let hostSeq = 0;
/** True for exactly one mounted host, so the builder modal never opens twice. */
export function useIsBuilderHost(): boolean {
  const [id] = useState(() => ++hostSeq);
  const first = useMetricBuilder((s) => s.hosts[0] === id);
  useEffect(() => {
    useMetricBuilder.setState((s) => ({ hosts: [...s.hosts, id] }));
    return () => useMetricBuilder.setState((s) => ({ hosts: s.hosts.filter((h) => h !== id) }));
  }, [id]);
  return first;
}

/** Add or replace a custom metric on the project; `select` makes it the ranking metric. */
export function saveMetric(cm: CustomMetric, select: boolean) {
  useProject.getState().update((p) => {
    const list = p.custom_metrics ?? [];
    const exists = list.some((m) => m.id === cm.id);
    return {
      custom_metrics: exists ? list.map((m) => (m.id === cm.id ? cm : m)) : [...list, cm],
      ...(select ? { rank_metric: customKey(cm.id) } : {}),
    };
  });
}

export function duplicateMetric(cm: CustomMetric) {
  const copy: CustomMetric = { ...cm, id: newMetricId(), name: `${cm.name} (copy)`, created_at: Date.now() / 1000, costs: cm.costs ? { ...cm.costs, matrix: cm.costs.matrix?.map((r) => [...r]) } : undefined };
  saveMetric(copy, false);
  toast.success(`Made a copy: “${copy.name}”.`);
  return copy;
}

export function deleteMetric(cm: CustomMetric) {
  const key = customKey(cm.id);
  const wasRanking = useProject.getState().project?.rank_metric === key;
  useProject.getState().update((p) => ({
    custom_metrics: (p.custom_metrics ?? []).filter((m) => m.id !== cm.id),
    rank_metric: p.rank_metric === key ? null : p.rank_metric,
  }));
  toast.info(`Deleted “${cm.name}”.${wasRanking ? " Ranking went back to the default score." : ""}`);
}

export function rankBy(metric: string | null) {
  useProject.getState().update(() => ({ rank_metric: metric }));
}
