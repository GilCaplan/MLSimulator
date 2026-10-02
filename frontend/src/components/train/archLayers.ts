import type { NNArch } from "../../lib/types";
import { archToLayers, type DiagramLayer } from "../nn/NetworkDiagram";

/** [channels, height, width] from either a 3-item image shape or a 2-item [h, w]. */
export function imageDims(shape: number[] | null | undefined): { c: number; h: number; w: number } | null {
  if (!shape || shape.length < 2) return null;
  if (shape.length === 2) return { c: 1, h: shape[0], w: shape[1] };
  return { c: shape[0], h: shape[1], w: shape[2] };
}

export const imageLabel = (shape: number[] | null | undefined) => {
  const d = imageDims(shape);
  return d ? `${d.w}×${d.h} ${d.c === 1 ? "grey" : "colour"}` : null;
};

/**
 * Diagram layers for any architecture. Extends the foundation `archToLayers` with the Tiny ResNet
 * (stem → residual stages → global pool) and a friendly "Image · 32×32×3" input label for image models.
 */
export function diagramLayers(arch: NNArch | null | undefined, nFeatures: number, nOut: number, imageShape?: number[] | null): DiagramLayer[] {
  const d = imageDims(imageShape);
  const inputLabel = d ? `Image · ${d.w}×${d.h}${d.c === 3 ? "×3" : ""}` : null;
  if (arch?.kind === "tiny_resnet") {
    const width = arch.width ?? 16, stages = arch.stages ?? 3, blocks = arch.blocks ?? 1;
    const out: DiagramLayer[] = [{ label: inputLabel ?? `Input · ${nFeatures}`, units: nFeatures, kind: "input" }];
    out.push({ label: `Stem conv · ${width}`, units: width, kind: "conv" });
    for (let s = 0; s < stages; s++) {
      const w = width * 2 ** s;
      for (let b = 0; b < blocks; b++) out.push({ label: `Res block · ${w}${b === 0 && s > 0 ? " ↓½" : ""}`, units: w, kind: "conv" });
    }
    out.push({ label: `Avg pool · ${width * 2 ** (stages - 1)}`, units: width * 2 ** (stages - 1), kind: "dense" });
    out.push({ label: `Output · ${nOut}`, units: nOut, kind: "output" });
    return out;
  }
  const layers = archToLayers(arch, nFeatures, nOut);
  if (inputLabel) layers[0] = { ...layers[0], label: inputLabel };
  if (arch?.kind === "cnn2d" && arch.global_pool) {
    const firstDense = layers.findIndex((l, i) => i > 0 && l.kind !== "conv");
    const lastConv = layers[firstDense - 1];
    if (firstDense > 0 && lastConv?.kind === "conv") layers.splice(firstDense, 0, { label: `Avg pool · ${lastConv.units}`, units: lastConv.units, kind: "dense" });
  }
  return layers;
}

/**
 * Weight snapshots only cover the linear (dense) layers, which sit at the end of the network. Pad the front with
 * empty matrices so the real weights colour the last connections instead of the first ones.
 */
export function alignWeights(weights: number[][][] | undefined, layers: DiagramLayer[]): number[][][] | undefined {
  if (!weights?.length) return weights;
  const edges = layers.length - 1;
  if (weights.length >= edges) return weights;
  return [...Array.from({ length: edges - weights.length }, () => [] as number[][]), ...weights];
}
