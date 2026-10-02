import { create } from "zustand";
import type { TuneResult } from "../../lib/types";

/** Remembers the latest tuning run for this session so the Improve page can be revisited. */
interface TuneState {
  projectId: string | null;
  jobId: string | null;
  key: string | null;
  modelId: string | null;
  result: TuneResult | null;
  begin: (projectId: string, jobId: string, key: string, modelId: string) => void;
  finish: (jobId: string, result: TuneResult) => void;
  clear: () => void;
}

export const useTune = create<TuneState>((set, get) => ({
  projectId: null,
  jobId: null,
  key: null,
  modelId: null,
  result: null,
  begin: (projectId, jobId, key, modelId) => set({ projectId, jobId, key, modelId, result: null }),
  finish: (jobId, result) => get().jobId === jobId && set({ result }),
  clear: () => set({ jobId: null, key: null, modelId: null, result: null }),
}));
