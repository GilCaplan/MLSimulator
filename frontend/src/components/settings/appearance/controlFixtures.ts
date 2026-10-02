/* Picker copy and live-preview fixtures for Settings → Appearance → Controls. */
import type { BoolRenderer, ChoiceRenderer, NumericRenderer, Orientation } from "../../../design/prefs";

export interface RendererInfo<T extends string> { id: T; name: string; desc: string }

export const NUMERIC_INFO: RendererInfo<NumericRenderer>[] = [
  { id: "slider", name: "Slider", desc: "Drag along a track. Quick and visual." },
  { id: "stepper", name: "Stepper", desc: "− value + buttons. One precise step at a time." },
  { id: "number", name: "Number box", desc: "Type the exact number you want." },
  { id: "dropdown", name: "Dropdown", desc: "Pick from a list of sensible values." },
];

export const CHOICE_INFO: RendererInfo<ChoiceRenderer>[] = [
  { id: "segmented", name: "Segmented", desc: "Joined buttons with a sliding highlight." },
  { id: "dropdown", name: "Dropdown", desc: "A compact menu. Best for long lists." },
  { id: "radio", name: "Radio list", desc: "Round buttons, every option visible." },
  { id: "chips", name: "Chips", desc: "Pill buttons that wrap onto new lines." },
  { id: "cards", name: "Cards", desc: "Big, easy-to-hit cards for form choices." },
];

export const BOOL_INFO: RendererInfo<BoolRenderer>[] = [
  { id: "switch", name: "Switch", desc: "The iPhone-style on/off switch." },
  { id: "checkbox", name: "Checkbox", desc: "A classic tick box next to the label." },
  { id: "yesno", name: "Yes / No", desc: "Two buttons. Very explicit." },
];

export const ORIENTATION_INFO: RendererInfo<Orientation>[] = [
  { id: "auto", name: "Auto", desc: "A row when it fits; otherwise wraps or becomes a menu." },
  { id: "horizontal", name: "Horizontal", desc: "Prefer a row, wrapping into chips if needed." },
  { id: "vertical", name: "Vertical", desc: "Stack options in a single column." },
];

export const RENDERER_NAME: Record<string, string> = {
  slider: "Slider", stepper: "Stepper", number: "Number box", dropdown: "Dropdown", segmented: "Segmented", radio: "Radio list",
  chips: "Chips", cards: "Cards", stacked: "Stacked", switch: "Switch", checkbox: "Checkbox", yesno: "Yes / No",
};

export interface NumericFixture {
  key: string;
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
  integer?: boolean;
  format?: (v: number) => string;
  note: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sci = (v: number) => (v < 0.01 ? v.toExponential(0).replace("e-", "e−") : String(Number(v.toPrecision(2))));

export const NUMERIC_FIXTURES: NumericFixture[] = [
  { key: "test", label: "Test size", help: "How much of the data is held back to grade the models.", value: 0.2, min: 0.05, max: 0.5, step: 0.01, format: pct, note: "5–50%, 1% steps" },
  { key: "lr", label: "Learning rate", help: "How big a step the network takes each update.", value: 0.01, min: 1e-4, max: 1, log: true, format: sci, note: "1e−4…1, log scale" },
  { key: "rows", label: "Rows", help: "How many rows to generate.", value: 1000, min: 50, max: 20000, log: true, integer: true, format: (v) => Math.round(v).toLocaleString(), note: "50…20,000, log, whole numbers" },
  { key: "k", label: "Neighbours", help: "How many nearby points vote on each prediction.", value: 5, min: 1, max: 15, integer: true, note: "1…15, whole numbers" },
];

export interface ChoiceFixture {
  key: string;
  label: string;
  note: string;
  size: "sm" | "md";
  kind?: "form" | "toolbar";
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
}

export const CHOICE_FIXTURES: ChoiceFixture[] = [
  {
    key: "scaling", label: "Scaling", note: "4 short options (form)", size: "md", value: "standard",
    options: [{ value: "none", label: "None" }, { value: "standard", label: "Standard" }, { value: "minmax", label: "Min-max" }, { value: "robust", label: "Robust" }],
  },
  {
    key: "long", label: "Show models", note: "7 long labels (form)", size: "md", value: "all",
    options: [
      { value: "all", label: "🗂️ All · every saved model" },
      { value: "classification", label: "🏷️ Classification · predicts a category" },
      { value: "regression", label: "📈 Regression · predicts a number" },
      { value: "image", label: "🖼️ Images · learns from pictures" },
      { value: "text", label: "💬 Text · reads words and sentences" },
      { value: "discover", label: "🫧 Discover · finds hidden groups" },
      { value: "recommend", label: "🎬 Recommenders · suggests what you'll like" },
    ],
  },
  {
    key: "toolbar", label: "Confusion matrix shows", note: "2 options (toolbar, small)", size: "sm", kind: "toolbar", value: "counts",
    options: [{ value: "counts", label: "Counts" }, { value: "pct", label: "% of row" }],
  },
];
