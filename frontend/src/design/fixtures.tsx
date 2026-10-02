/* Control fixtures: one per step-count bucket / label shape that the app actually uses. Rendered by the dev gallery
 * (/dev/gallery) and reusable by Settings → Appearance previews. Each fixture renders inside <section data-fixture="…">
 * with a badge showing the renderer it resolved to and why. */
import { useState, type ComponentProps, type ReactNode } from "react";
import { Field, ResolvedProbe, Segmented, Slider, Toggle } from "../components/glass";

type SliderProps = ComponentProps<typeof Slider>;
export interface SliderFixture { id: string; title: string; init: number; props: Omit<SliderProps, "value" | "onChange"> }

const pct = (v: number) => `${Math.round(v * 100)}%`;
const int = (v: number) => Math.round(v).toLocaleString();

export const SLIDER_FIXTURES: SliderFixture[] = [
  { id: "linear-3", title: "Linear, 3 steps", init: 0.5, props: { label: "Mix", min: 0, max: 1, step: 0.5, format: pct } },
  { id: "linear-11", title: "Linear, 11 steps", init: 0.3, props: { label: "Dropout", min: 0, max: 1, step: 0.1, format: (v) => v.toFixed(1) } },
  { id: "linear-21", title: "Linear, 21 steps", init: 0.6, props: { label: "Overlay strength", min: 0, max: 1, step: 0.05, format: pct } },
  { id: "linear-46", title: "Linear, 46 steps", init: 0.2, props: { label: "Test size", help: "Rows hidden from training to check the model honestly.", min: 0.05, max: 0.5, step: 0.01, format: pct } },
  { id: "linear-101", title: "Linear, 101 steps", init: 0.37, props: { label: "Subsample", min: 0, max: 1, step: 0.01, format: pct } },
  { id: "linear-191", title: "Linear, 191 steps", init: 1.5, props: { label: "Outlier factor", min: 0.05, max: 1.95, step: 0.01, format: (v) => `${v.toFixed(2)}×` } },
  { id: "int-15", title: "Integer 1–15", init: 5, props: { label: "Neighbours", min: 1, max: 15, integer: true } },
  { id: "int-20000", title: "Integer 1–20 000", init: 1234, props: { label: "Rows", min: 1, max: 20000, integer: true, format: int } },
  { id: "log-lr", title: "Log 1e-4 … 1", init: 0.003, props: { label: "Learning rate", help: "How big a step the model takes each update.", min: 1e-4, max: 1, log: true } },
  { id: "log-rows", title: "Log 50 … 20 000 (integer)", init: 1000, props: { label: "Samples", min: 50, max: 20000, log: true, integer: true, format: int } },
  { id: "log-pow2", title: "Log 2 … 512 (integer, powers of two)", init: 32, props: { label: "Batch size", min: 2, max: 512, log: true, integer: true } },
  { id: "unlabelled", title: "Unlabelled 0–10", init: 4, props: { min: 0, max: 10, step: 1 } },
  { id: "format-float", title: "Float, no step, with format", init: 1.7, props: { label: "Zoom", min: 0.5, max: 5, format: (v) => `${v.toFixed(1)}×` } },
  { id: "fixed", title: "fixedRenderer=\"slider\"", init: 0.5, props: { label: "Threshold", min: 0.05, max: 0.95, step: 0.05, format: (v) => v.toFixed(2), fixedRenderer: "slider" } },
];

export interface ChoiceFixture {
  id: string;
  title: string;
  options: { value: string; label: ReactNode; disabled?: boolean }[];
  init: string;
  size?: "sm" | "md";
  full?: boolean;
  /** how it is placed: bare, inside a Field, or at the right of a `row wrap between` toolbar */
  place?: "bare" | "field" | "toolbar";
  wide?: boolean;
}

const opts = (labels: string[]) => labels.map((l, i) => ({ value: `o${i}`, label: l }));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const CHOICE_FIXTURES: ChoiceFixture[] = [
  { id: "n2", title: "2 options", options: opts(["Train", "Test"]), init: "o0" },
  {
    id: "n3-emoji", title: "3 options with emoji", init: "b",
    options: [{ value: "a", label: "🌲 Forest" }, { value: "b", label: <>📈 <b>Linear</b></> }, { value: "c", label: "🧠 Neural net" }],
  },
  { id: "n4-full", title: "4 options, full width", options: opts(["None", "Standard", "Min-max", "Robust"]), init: "o1", full: true, wide: true },
  { id: "n5", title: "5 options", options: opts(["Median", "Mean", "Most common", "Zero", "Drop rows"]), init: "o0", wide: true },
  {
    id: "n7-long", title: "7 options, ~44-char labels", init: "o2", wide: true,
    options: opts([
      "Classification — sort things into groups", "Regression — predict a number on a scale",
      "Clustering — find natural groups in data", "Anomaly detection — spot the odd ones out",
      "Dimensionality reduction — squash columns", "Recommendation — suggest what people like",
      "Text — understand words and short sentences",
    ]),
  },
  { id: "dyn-12", title: "Dynamic, 12 options", options: MONTHS.map((m) => ({ value: m, label: m })), init: "Mar", wide: true },
  {
    id: "disabled", title: "A disabled option", init: "random",
    options: [{ value: "random", label: "Random" }, { value: "group", label: "Group" }, { value: "time", label: "Time", disabled: true }],
  },
  { id: "toolbar-sm", title: "size=\"sm\" (toolbar)", options: opts(["Counts", "% of row"]), init: "o0", size: "sm" },
  { id: "in-field", title: "Inside Field", options: opts(["Median", "Mean", "Zero", "Drop rows"]), init: "o1", place: "field" },
  { id: "in-toolbar", title: "In a row wrap between toolbar", options: opts(["All", "Words", "Pairs"]), init: "o0", size: "sm", place: "toolbar", wide: true },
];

export interface ToggleFixture { id: string; title: string; init: boolean; props: Omit<ComponentProps<typeof Toggle>, "checked" | "onChange"> }
export const TOGGLE_FIXTURES: ToggleFixture[] = [
  { id: "labelled", title: "Labelled", init: true, props: { label: "Remove exact duplicates", help: "Copies can sit in both train and test." } },
  { id: "unlabelled", title: "Unlabelled", init: false, props: {} },
  { id: "disabled", title: "Disabled", init: true, props: { label: "Stratify the split", disabled: true } },
  { id: "long", title: "Long label", init: false, props: { label: "Balance the classes by oversampling the rare ones before training every model in this run" } },
];

/* ---------------------------------------------------------------- stateful fixture renderers */

export function FixtureFrame({ id, title, wide, children }: { id: string; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section data-fixture={id} className="col fixture" style={{ gap: 8, minWidth: 0, gridColumn: wide ? "1 / -1" : undefined }}>
      <div className="eyebrow">{title}</div>
      {children}
    </section>
  );
}

export function SliderFx({ fx }: { fx: SliderFixture }) {
  const [v, setV] = useState(fx.init);
  return (
    <FixtureFrame id={`slider:${fx.id}`} title={fx.title}>
      <ResolvedProbe>
        <Slider {...fx.props} value={v} onChange={setV} />
      </ResolvedProbe>
    </FixtureFrame>
  );
}

export function ChoiceFx({ fx }: { fx: ChoiceFixture }) {
  const [v, setV] = useState(fx.init);
  const seg = <Segmented<string> value={v} onChange={setV} options={fx.options} size={fx.size} full={fx.full} />;
  let body: ReactNode = seg;
  if (fx.place === "field") body = <Field label="Fill blank numbers with" help="Only matters when a column has gaps.">{seg}</Field>;
  if (fx.place === "toolbar") {
    body = (
      <div className="row wrap between" style={{ gap: 10 }}>
        <span className="row" style={{ gap: 8 }}><h4>Top words</h4><span className="badge">1,204</span></span>
        <div className="row" style={{ gap: 8 }}>
          {seg}
          <button className="btn sm">Export</button>
        </div>
      </div>
    );
  }
  return (
    <FixtureFrame id={`choice:${fx.id}`} title={fx.title} wide={fx.wide}>
      <ResolvedProbe>{body}</ResolvedProbe>
    </FixtureFrame>
  );
}

export function ToggleFx({ fx }: { fx: ToggleFixture }) {
  const [v, setV] = useState(fx.init);
  return (
    <FixtureFrame id={`toggle:${fx.id}`} title={fx.title}>
      <ResolvedProbe>
        <Toggle {...fx.props} checked={v} onChange={setV} />
      </ResolvedProbe>
    </FixtureFrame>
  );
}
