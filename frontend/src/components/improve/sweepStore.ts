import { create } from "zustand";
import type { SweepResult } from "../../lib/types";

export type SweepModel = "kmeans" | "gmm" | "agglomerative";

/** Remembers the latest k sweep for this session so the Refine page can be revisited. */
interface SweepState {
  projectId: string | null;
  jobId: string | null;
  modelId: SweepModel;
  kMin: number;
  kMax: number;
  result: SweepResult | null;
  begin: (projectId: string, jobId: string, modelId: SweepModel, kMin: number, kMax: number) => void;
  finish: (jobId: string, result: SweepResult) => void;
}

export const useSweep = create<SweepState>((set, get) => ({
  projectId: null,
  jobId: null,
  modelId: "kmeans",
  kMin: 2,
  kMax: 10,
  result: null,
  begin: (projectId, jobId, modelId, kMin, kMax) => set({ projectId, jobId, modelId, kMin, kMax, result: null }),
  finish: (jobId, result) => get().jobId === jobId && set({ result }),
}));
