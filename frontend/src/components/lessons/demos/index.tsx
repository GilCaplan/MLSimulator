import type { ComponentType } from "react";
import { AugmentationDemo } from "./AugmentationDemo";
import { BaselinesDemo } from "./BaselinesDemo";
import { CalibrationDemo } from "./CalibrationDemo";
import { ConvolutionsDemo } from "./ConvolutionsDemo";
import { FairnessDemo } from "./FairnessDemo";
import { FeaturesDemo } from "./FeaturesDemo";
import { ImbalanceDemo } from "./ImbalanceDemo";
import { LeakageDemo } from "./LeakageDemo";
import { MissingDemo } from "./MissingDemo";
import { OutliersDemo } from "./OutliersDemo";
import { OverfittingDemo } from "./OverfittingDemo";
import { ScalingDemo } from "./ScalingDemo";
import { ShortcutDemo } from "./ShortcutDemo";
import { SplitsDemo } from "./SplitsDemo";

/** Props every interactive lesson demo receives. Call `onDone` once the learner has meaningfully interacted. */
export interface DemoProps { onDone?: () => void }

/**
 * Map from lesson `demo` id → component. Every demo is a self-contained client-side simulation
 * (seeded random data, no backend calls) sized for a ~600–1000px wide panel.
 */
export const DEMOS: Record<string, ComponentType<DemoProps>> = {
  missing: MissingDemo,
  outliers: OutliersDemo,
  leakage: LeakageDemo,
  scaling: ScalingDemo,
  imbalance: ImbalanceDemo,
  overfitting: OverfittingDemo,
  shortcut: ShortcutDemo,
  fairness: FairnessDemo,
  baselines: BaselinesDemo,
  splits: SplitsDemo,
  features: FeaturesDemo,
  calibration: CalibrationDemo,
  convolutions: ConvolutionsDemo,
  augmentation: AugmentationDemo,
};
