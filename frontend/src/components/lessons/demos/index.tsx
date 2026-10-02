import type { ComponentType } from "react";
import { AugmentationDemo } from "./AugmentationDemo";
import { BagOfWordsDemo } from "./BagOfWordsDemo";
import { BaselinesDemo } from "./BaselinesDemo";
import { CalibrationDemo } from "./CalibrationDemo";
import { ChoosingKDemo } from "./ChoosingKDemo";
import { ColdStartDemo } from "./ColdStartDemo";
import { ConvolutionsDemo } from "./ConvolutionsDemo";
import { CurseDemo } from "./CurseDemo";
import { FairnessDemo } from "./FairnessDemo";
import { FeaturesDemo } from "./FeaturesDemo";
import { ImbalanceDemo } from "./ImbalanceDemo";
import { LeakageDemo } from "./LeakageDemo";
import { MissingDemo } from "./MissingDemo";
import { OutliersDemo } from "./OutliersDemo";
import { OverfittingDemo } from "./OverfittingDemo";
import { PopularityBiasDemo } from "./PopularityBiasDemo";
import { RegressionMetricsDemo } from "./RegressionMetricsDemo";
import { RegularizationDemo } from "./RegularizationDemo";
import { ScalingDemo } from "./ScalingDemo";
import { ShortcutDemo } from "./ShortcutDemo";
import { SplitsDemo } from "./SplitsDemo";
import { ThresholdsDemo } from "./ThresholdsDemo";

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
  choosing_k: ChoosingKDemo,
  curse: CurseDemo,
  bag_of_words: BagOfWordsDemo,
  popularity_bias: PopularityBiasDemo,
  cold_start: ColdStartDemo,
  convolutions: ConvolutionsDemo,
  augmentation: AugmentationDemo,
  regularization: RegularizationDemo,
  regression_metrics: RegressionMetricsDemo,
  thresholds: ThresholdsDemo,
};
