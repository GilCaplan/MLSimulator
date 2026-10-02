/** Dev-only gallery of every primitive × renderer. Route: /dev/gallery
 * Query params (applied to a scoped wrapper only, never to the app's own prefs):
 *   template, theme, background, shape, density, font, numeric, choice, bool, orientation, valueBox, w (px)
 *   all=1 → 5 templates × 2 themes as columns (default w 600). */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BarList, Histogram, LineChart } from "../components/charts";
import { ControlPrefsProvider, Field, Glass, InfoTip, Modal, NumberField, Select } from "../components/glass";
import { prefAttrs, prefVars, resolveTheme, type ResolvedTheme } from "../design/apply";
import { CHOICE_FIXTURES, ChoiceFx, FixtureFrame, SLIDER_FIXTURES, SliderFx, TOGGLE_FIXTURES, ToggleFx } from "../design/fixtures";
import { ENUMS, TEMPLATE_PRESETS, validatePrefs, type TemplateId, type UIPrefs } from "../design/prefs";
import { colorAt } from "../lib/colors";
import { useUI } from "../lib/store";

const PARAM_KEYS = ["template", "theme", "background", "shape", "density", "font", "numeric", "choice", "bool", "orientation", "valueBox", "w", "all"] as const;
type Params = Partial<Record<(typeof PARAM_KEYS)[number], string>>;

const readParams = (): Params => {
  const q = new URLSearchParams(window.location.search);
  const out: Params = {};
  for (const k of PARAM_KEYS) { const v = q.get(k); if (v !== null && v !== "") out[k] = v; }
  return out;
};

/** Prefs for a scoped frame: the app's prefs, overridden by the query params (and by `over`). */
function scopedPrefs(base: UIPrefs, p: Params, over: Partial<UIPrefs> = {}): UIPrefs {
  const template = (over.template ?? p.template ?? base.template) as TemplateId;
  const preset = TEMPLATE_PRESETS[template] ?? TEMPLATE_PRESETS.glass;
  return validatePrefs({
    ...base,
    template,
    background: p.background ?? (p.template || over.template ? preset.background : base.background),
    shape: p.shape ?? base.shape,
    density: p.density ?? base.density,
    font: p.font ?? base.font,
    theme: over.theme ?? p.theme ?? base.theme,
    controls: {
      ...base.controls,
      ...(p.numeric ? { numeric: p.numeric } : {}),
      ...(p.choice ? { choice: p.choice } : {}),
      ...(p.bool ? { bool: p.bool } : {}),
      ...(p.orientation ? { orientation: p.orientation } : {}),
      ...(p.valueBox ? { valueBox: p.valueBox === "1" || p.valueBox === "true" } : {}),
    },
  });
}

/** A frame carrying ALL the data-* attributes + inline accent/palette variables, so templates apply inside it. */
function Scope({ prefs, theme, width, children, label }: { prefs: UIPrefs; theme: ResolvedTheme; width?: number; children: ReactNode; label?: string }) {
  const style: CSSProperties = {
    ...(prefVars(prefs) as CSSProperties),
    position: "relative", width: width ?? "100%", flexShrink: 0, minWidth: 0,
    background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font)", fontSize: "var(--font-size)", letterSpacing: "var(--letter)",
    colorScheme: theme, borderRadius: 18, overflow: "hidden", isolation: "isolate",
  };
  const bgLayer = prefs.background === "gradient" || prefs.background === "dots" || prefs.background === "grid";
  return (
    <div {...prefAttrs(prefs, theme)} data-gallery-scope={label ?? ""} style={style}>
      {bgLayer && <div data-bg-layer aria-hidden className="bg-layer" style={{ position: "absolute", zIndex: 0 }} />}
      <ControlPrefsProvider value={prefs.controls}>
        <div style={{ position: "relative", zIndex: 1, padding: 18 }}>
          {label && <div className="row between" style={{ marginBottom: 12 }}><h3>{label}</h3><span className="badge mono">{describe(prefs)}</span></div>}
          {children}
        </div>
      </ControlPrefsProvider>
    </div>
  );
}

const describe = (p: UIPrefs) => `${p.controls.numeric} · ${p.controls.choice} · ${p.controls.bool} · ${p.controls.orientation}`;

const GRID: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 18, alignItems: "start" };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Glass pad style={{ marginBottom: 16 }}>
      <h3 style={{ marginBottom: 14 }}>{title}</h3>
      <div style={GRID}>{children}</div>
    </Glass>
  );
}

function OtherFixtures() {
  const [sel, setSel] = useState("c7");
  const [n, setN] = useState(42);
  const [txt, setTxt] = useState("Iris flowers");
  const [open, setOpen] = useState(false);
  const many = Array.from({ length: 30 }, (_, i) => ({ value: `c${i}`, label: `Column ${i + 1} — ${["sepal", "petal", "width", "length", "ratio"][i % 5]}` }));
  return (
    <>
      <FixtureFrame id="select:30" title="Select, 30 options">
        <Select value={sel} onChange={setSel} options={many} style={{ width: "100%" }} />
      </FixtureFrame>
      <FixtureFrame id="numberfield" title="NumberField">
        <div className="row" style={{ gap: 8 }}><NumberField value={n} onChange={setN} min={0} max={100} /><span className="faint small">0–100</span></div>
      </FixtureFrame>
      <FixtureFrame id="field-help" title="Field with help">
        <Field label="Project name" help="Shown on the projects page." right={<span className="faint tiny">{txt.length}/40</span>}>
          <input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} />
        </Field>
      </FixtureFrame>
      <FixtureFrame id="modal" title="Modal">
        <div><button className="btn" onClick={() => setOpen(true)}>Open modal</button></div>
        <Modal open={open} onClose={() => setOpen(false)} title="Delete project?" footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" onClick={() => setOpen(false)}>Delete</button></>}>
          <p className="muted">This removes the project and its trained models.</p>
        </Modal>
      </FixtureFrame>
    </>
  );
}

function SurfaceFixtures() {
  return (
    <>
      <FixtureFrame id="buttons" title="Buttons" wide>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn">Default</button>
          <button className="btn primary">Primary</button>
          <button className="btn gradient">Gradient</button>
          <button className="btn ghost">Ghost</button>
          <button className="btn danger">Danger</button>
          <button className="btn sm">Small</button>
          <button className="btn lg">Large</button>
          <button className="btn icon" aria-label="Settings">⚙︎</button>
          <button className="btn sm icon" aria-label="Close">✕</button>
          <button className="btn primary" disabled>Disabled</button>
        </div>
      </FixtureFrame>
      <FixtureFrame id="badges" title="Badges">
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge">Plain</span><span className="badge accent">Accent</span><span className="badge success">Success</span>
          <span className="badge warning">Warning</span><span className="badge danger">Danger</span>
        </div>
      </FixtureFrame>
      <FixtureFrame id="inset" title=".inset">
        <div className="inset" style={{ padding: 12 }}>
          <div className="row between"><span className="small muted">Accuracy</span><b className="num">94.2%</b></div>
          <div className="small faint">An inner well inside a glass panel.</div>
        </div>
      </FixtureFrame>
      <FixtureFrame id="tile" title=".tile.selected">
        <div className="row" style={{ gap: 10 }}>
          <div className="glass pad tile selected" style={{ flex: 1, padding: 14 }}><b>🌲 Forest</b><div className="tiny faint">selected</div></div>
          <div className="glass pad tile" style={{ flex: 1, padding: 14 }}><b>📈 Linear</b><div className="tiny faint">not selected</div></div>
        </div>
      </FixtureFrame>
      <FixtureFrame id="table" title=".table" wide>
        <div className="inset" style={{ overflow: "auto", maxWidth: "100%" }}>
          <table className="table">
            <thead><tr><th>Model</th><th>Accuracy</th><th>F1</th><th>Time</th></tr></thead>
            <tbody>
              <tr><td>🌲 Random forest</td><td className="num">0.962</td><td className="num">0.958</td><td className="num">0.41 s</td></tr>
              <tr><td>📈 Logistic regression</td><td className="num">0.947</td><td className="num">0.944</td><td className="num">0.05 s</td></tr>
              <tr><td>🧠 Neural network</td><td className="num">0.955</td><td className="num">0.951</td><td className="num">2.30 s</td></tr>
            </tbody>
          </table>
        </div>
      </FixtureFrame>
      <FixtureFrame id="text" title="Type">
        <div className="col" style={{ gap: 4 }}>
          <h2>Prepare your data</h2>
          <p className="muted">Body text with an <a href="#x">inline link</a> and an info tip <InfoTip text="Help text in a tooltip." /></p>
          <span className="gradient-text" style={{ fontWeight: 700 }}>Gradient text</span>
        </div>
      </FixtureFrame>
    </>
  );
}

function ChartFixtures() {
  const series = useMemo(() => [0, 1, 2].map((s) => ({
    name: ["Train", "Validation", "Test"][s], color: colorAt(s),
    points: Array.from({ length: 30 }, (_, i) => ({ x: i + 1, y: 1 - Math.exp(-(i + 1) / (6 + 3 * s)) * 0.9 + Math.sin(i / 3 + s) * 0.01 })),
  })), []);
  const hist = useMemo(() => {
    const edges = Array.from({ length: 21 }, (_, i) => 4 + i * 0.2);
    return { edges, counts: edges.slice(1).map((_, i) => Math.round(30 * Math.exp(-((i - 9) ** 2) / 18))) };
  }, []);
  return (
    <>
      <FixtureFrame id="chart:line" title="LineChart, 3 series" wide>
        <LineChart series={series} height={200} xLabel="Epoch" yLabel="Accuracy" />
      </FixtureFrame>
      <FixtureFrame id="chart:bars" title="BarList">
        <BarList labels={["petal_length", "petal_width", "sepal_length", "sepal_width"]} values={[0.44, 0.42, 0.1, 0.04]} colors={[0, 1, 2, 3].map(colorAt)} format={(v) => `${Math.round(v * 100)}%`} />
      </FixtureFrame>
      <FixtureFrame id="chart:hist" title="Histogram">
        <Histogram data={hist} />
      </FixtureFrame>
    </>
  );
}

function Fixtures() {
  return (
    <>
      <Group title="Numbers (Slider)">{SLIDER_FIXTURES.map((fx) => <SliderFx key={fx.id} fx={fx} />)}</Group>
      <Group title="Choices (Segmented)">{CHOICE_FIXTURES.map((fx) => <ChoiceFx key={fx.id} fx={fx} />)}</Group>
      <Group title="On / off (Toggle)">{TOGGLE_FIXTURES.map((fx) => <ToggleFx key={fx.id} fx={fx} />)}</Group>
      <Group title="Inputs"><OtherFixtures /></Group>
      <Group title="Surfaces"><SurfaceFixtures /></Group>
      <Group title="Charts"><ChartFixtures /></Group>
    </>
  );
}

/** Quick switches for the query params (outside the scoped frame; uses the app's own prefs). */
function ParamBar({ params, set }: { params: Params; set: (k: keyof Params, v: string) => void }) {
  const pick = (k: keyof Params, values: readonly string[]) => (
    <label className="row small" style={{ gap: 6 }} key={k}>
      <span className="faint">{k}</span>
      <Select value={params[k] ?? ""} onChange={(v) => set(k, v)} options={[{ value: "", label: "(app)" }, ...values.map((v) => ({ value: v, label: v }))]} style={{ height: 28, fontSize: 12 }} />
    </label>
  );
  return (
    <div className="glass row wrap" style={{ gap: 12, padding: "10px 14px", marginBottom: 16, borderRadius: 16 }}>
      <b>Gallery</b>
      {pick("template", ENUMS.template)}
      {pick("theme", ["light", "dark"])}
      {pick("background", ENUMS.background)}
      {pick("numeric", ENUMS.numeric)}
      {pick("choice", ENUMS.choice)}
      {pick("bool", ENUMS.bool)}
      {pick("orientation", ENUMS.orientation)}
      {pick("density", ENUMS.density)}
      {pick("shape", ENUMS.shape)}
      {pick("w", ["600", "1000", "1400"])}
      {pick("all", ["1"])}
    </div>
  );
}

export function DevGallery() {
  const base = useUI((s) => s.prefs);
  const [params, setParams] = useState<Params>(readParams);
  useEffect(() => {
    const on = () => setParams(readParams());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const set = (k: keyof Params, v: string) => {
    const next = { ...params, [k]: v || undefined };
    const q = new URLSearchParams();
    for (const [kk, vv] of Object.entries(next)) if (vv) q.set(kk, vv);
    window.history.replaceState({}, "", `${window.location.pathname}${q.toString() ? `?${q}` : ""}`);
    setParams(next);
  };
  const width = params.w ? Math.max(280, Number(params.w) || 0) : undefined;

  let body: ReactNode;
  if (params.all === "1") {
    const themes: ResolvedTheme[] = params.theme === "light" || params.theme === "dark" ? [params.theme] : ["light", "dark"];
    body = (
      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        {ENUMS.template.flatMap((t) => themes.map((th) => {
          const p = scopedPrefs(base, params, { template: t, theme: th });
          return <Scope key={`${t}-${th}`} prefs={p} theme={th} width={width ?? 600} label={`${t} · ${th}`}><Fixtures /></Scope>;
        }))}
      </div>
    );
  } else {
    const p = scopedPrefs(base, params);
    const theme = params.theme === "light" || params.theme === "dark" ? params.theme : resolveTheme(p.theme);
    body = <Scope prefs={p} theme={theme} width={width} label={`${p.template} · ${theme}`}><Fixtures /></Scope>;
  }
  return (
    <div className="scroll" style={{ height: "100%", padding: "16px 22px 60px" }} data-dev-gallery>
      <ParamBar params={params} set={set} />
      {body}
    </div>
  );
}
