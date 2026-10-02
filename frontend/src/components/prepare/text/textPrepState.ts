import type { PipelineSpec } from "../../../lib/types";
import { DEFAULT_TEXT, type TextSpec } from "../../data/text/textData";
import { patchPipeline } from "../state";

export type TextStageId = "textcol" | "words" | "seqlen" | "textsplit";

export const TEXT_STAGES: { id: TextStageId; icon: string; name: string }[] = [
  { id: "textcol", icon: "💬", name: "Text column" },
  { id: "words", icon: "🛍️", name: "Words" },
  { id: "seqlen", icon: "📏", name: "Sequence" },
  { id: "textsplit", icon: "✂️", name: "Split" },
];

export const textOf = (spec: PipelineSpec): TextSpec => ({ ...DEFAULT_TEXT, ...(spec.text ?? {}) });

/** Write part of the text settings (invalidates the prepared data). */
export function patchText(spec: PipelineSpec, patch: Partial<TextSpec>) {
  patchPipeline("text", { ...textOf(spec), ...patch });
}

export const compactCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n));

export function textStageState(id: TextStageId, spec: PipelineSpec, textCol: string | null, usesSeq: boolean): { state: string; active: boolean } {
  const t = textOf(spec);
  switch (id) {
    case "textcol": return { state: textCol ?? "choose", active: !!textCol };
    case "words": return { state: `${t.ngram_max === 2 ? "1+2" : "1"}-word · ${compactCount(t.max_features)}`, active: true };
    case "seqlen": return { state: `${t.max_len} words`, active: usesSeq };
    case "textsplit": {
      const te = Math.round(spec.split.test_size * 100), va = Math.round(spec.split.val_size * 100);
      return { state: `${100 - te - va}/${va}/${te}`, active: true };
    }
  }
}
