/* Pref-aware control primitives. Each reads the user's control preferences (or a scoped ControlPrefsProvider) and picks a
 * renderer via resolve.ts; call sites keep the same props. */
export { Tooltip, InfoTip } from "./Tooltip";
export { Field } from "./Field";
export { NumberField } from "./NumberField";
export { Select } from "./Select";
export { Slider } from "./Slider";
export { Segmented } from "./Choice";
export { Toggle } from "./Bool";
export {
  ControlPrefsContext, ControlPrefsProvider, useControlPrefs,
  ResolvedReportContext, ReportResolved, useReportResolved, type ResolvedInfo,
} from "./context";
export {
  resolveNumeric, resolveChoice, resolveBool, enumerateSteps, nodeText, labelChars, estimateSegmentedWidth, segmentedOverflows,
  MAX_DROPDOWN, CHOICE_CAPS,
  type NumericCtx, type ResolvedNumeric, type ChoiceCtx, type ResolvedChoice,
} from "./resolve";
export { niceStep, logSeries, coarsen, defaultFormat, defaultStep } from "./steps";
export { ResolvedProbe, ResolvedBadge } from "./Probe";
