import type { PipelineSpec } from "../../../lib/types";
import { patchPipeline } from "../state";

export type ImageSpec = NonNullable<PipelineSpec["image"]>;
export type Augment = ImageSpec["augment"];
export type ImageStageId = "resolution" | "colour" | "augment" | "imgsplit";

export const SIZES: ImageSpec["size"][] = [16, 24, 32, 48, 64];

export const IMAGE_STAGES: { id: ImageStageId; icon: string; name: string }[] = [
  { id: "resolution", icon: "🔍", name: "Resolution" },
  { id: "colour", icon: "🎨", name: "Colour" },
  { id: "augment", icon: "🪄", name: "Augment" },
  { id: "imgsplit", icon: "✂️", name: "Split" },
];

export const DEFAULT_IMAGE: ImageSpec = { size: 32, grayscale: false, augment: {} };

export const imageOf = (spec: PipelineSpec): ImageSpec => ({ ...DEFAULT_IMAGE, ...(spec.image ?? {}), augment: { ...(spec.image?.augment ?? {}) } });

/** Write part of the image settings (augment is merged key by key). */
export function patchImage(spec: PipelineSpec, patch: Partial<Omit<ImageSpec, "augment">> & { augment?: Partial<Augment> }) {
  const cur = imageOf(spec);
  patchPipeline("image", { ...cur, ...patch, augment: { ...cur.augment, ...(patch.augment ?? {}) } });
}

export const augmentOn = (a: Augment) => Object.values(a).some((v) => !!v);

/** Short summary of the augmentation recipe for chips and badges. */
export function augmentSummary(a: Augment): string {
  const parts = [
    a.flip_h && "↔", a.flip_v && "↕", a.rotate ? `⟳${Math.round(a.rotate)}°` : "", a.shift ? `⇢${Math.round(a.shift * 100)}%` : "",
    a.brightness ? "☀" : "", a.cutout ? "▪" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "off";
}

export function imageStageState(id: ImageStageId, spec: PipelineSpec): { state: string; active: boolean } {
  const img = imageOf(spec);
  switch (id) {
    case "resolution": return { state: `${img.size}×${img.size}`, active: true };
    case "colour": return { state: img.grayscale ? "grey" : "RGB", active: true };
    case "augment": return { state: augmentSummary(img.augment), active: augmentOn(img.augment) };
    case "imgsplit": {
      const te = Math.round(spec.split.test_size * 100), va = Math.round(spec.split.val_size * 100);
      return { state: `${100 - te - va}/${va}/${te}`, active: true };
    }
  }
}

/** Augmentations that would change the answer for a built-in image set (so they teach the model something false). */
export const HARMFUL: Record<string, { keys: (keyof Augment)[]; why: string; rotateOver?: number }> = {
  arrows: { keys: ["flip_h", "flip_v"], rotateOver: 30, why: "Flipping an arrow that points left makes it point right — the picture now shows a different answer than its label!" },
  line_tilt: { keys: ["flip_h", "flip_v"], rotateOver: 0, why: "Flipping or rotating a tilted line changes its angle — exactly the number we're trying to predict!" },
  digits: { keys: ["flip_h", "flip_v"], rotateOver: 30, why: "A mirrored 2 or an upside-down 6 isn't the same digit any more." },
};

export function harmfulAugment(imageSet: string | undefined, a: Augment): string | null {
  const h = imageSet ? HARMFUL[imageSet] : undefined;
  if (!h) return null;
  if (h.keys.some((k) => !!a[k])) return h.why;
  if (h.rotateOver !== undefined && (a.rotate ?? 0) > h.rotateOver) return h.why;
  return null;
}
