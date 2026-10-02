import type { NNArch } from "../../lib/types";
import { archToLayers, type DiagramLayer } from "../nn/NetworkDiagram";

/** A diagram column plus a compact label for crowded diagrams. */
export type PreviewLayer = DiagramLayer & { short?: string };

/** Spatial size after a stack of conv layers ('same' padding; even kernels grow by one; optional pooling). */
export function convOutShape(arch: NNArch, imageShape: number[] | null): number[] | null {
  if (!imageShape || imageShape.length < 2) return null;
  const [c, h, w] = imageShape.length === 2 ? [1, imageShape[0], imageShape[1]] : imageShape;
  let shape = [c, h, w];
  for (const l of arch.layers ?? []) {
    if (l.type !== "conv") continue;
    let sp = shape.slice(1).map((s) => s + 2 * Math.floor(l.kernel / 2) - l.kernel + 1);
    const p = l.pool ?? 0;
    if (p >= 2 && Math.min(...sp) >= p) sp = sp.map((s) => Math.floor(s / p));
    shape = [l.filters, ...sp];
  }
  return shape;
}

/** Feature-map shape (C×H×W) at the end of each Tiny ResNet stage. */
export function resnetStages(arch: NNArch, imageShape: number[] | null) {
  const width = arch.width ?? 16;
  const stages = arch.stages ?? 3;
  const hw = imageShape ? (imageShape.length === 2 ? imageShape[0] : imageShape[1]) : 32;
  const out: { channels: number; size: number }[] = [];
  let size = hw;
  for (let s = 0; s < stages; s++) {
    if (s > 0) size = Math.floor((size + 1) / 2); // stride-2 3×3 conv with padding 1
    out.push({ channels: width * 2 ** s, size });
  }
  return out;
}

const dims = (shape: number[] | null) => (shape ? shape.join("×") : "");

/**
 * Like the foundation's archToLayers, but also understands image networks: an image-shaped input,
 * the global-average-pool step of a CNN, and the Tiny ResNet's stem → residual blocks → pool.
 */
export function previewLayers(arch: NNArch, nFeatures: number, nOut: number, imageShape: number[] | null): PreviewLayer[] {
  const isImage = !!imageShape && (arch.kind === "cnn2d" || arch.kind === "tiny_resnet");
  const input: PreviewLayer = isImage
    ? { label: `Image · ${dims(imageShape)}`, units: nFeatures, kind: "input", short: "Image" }
    : { label: `Input · ${nFeatures}`, units: nFeatures, kind: "input" };
  if (arch.kind === "tiny_resnet") {
    const width = arch.width ?? 16;
    const out: PreviewLayer[] = [input, { label: `Stem conv · ${width}`, units: width, kind: "conv", short: `Stem ${width}` }];
    resnetStages(arch, imageShape).forEach((st, s) => {
      for (let b = 0; b < (arch.blocks ?? 1); b++) {
        out.push({ label: `Res block ${s + 1}.${b + 1} · ${st.channels}`, units: st.channels, kind: "conv", short: `Res ${st.channels}` });
      }
    });
    const last = out[out.length - 1].units;
    out.push({ label: `Avg pool · ${last}`, units: last, kind: "dense", short: `Pool ${last}` });
    out.push({ label: `Output · ${nOut}`, units: nOut, kind: "output" });
    return out;
  }
  const base: PreviewLayer[] = archToLayers(arch, nFeatures, nOut);
  base[0] = input;
  if (arch.kind === "cnn2d" && arch.global_pool) {
    const lastConv = base.map((l) => l.kind).lastIndexOf("conv");
    if (lastConv > 0) {
      const ch = base[lastConv].units;
      base.splice(lastConv + 1, 0, { label: `Avg pool · ${ch}`, units: ch, kind: "dense", short: `Pool ${ch}` });
    }
  }
  return base;
}
