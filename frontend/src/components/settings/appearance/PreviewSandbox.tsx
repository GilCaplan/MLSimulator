import { useEffect, useMemo, useRef, useState } from "react";
import { resolveTheme, type ResolvedTheme } from "../../../design/apply";
import { colorAt } from "../../../lib/colors";
import { useUI } from "../../../lib/store";
import { BarList, LineChart, useSize, type Series } from "../../charts";
import { Field, Glass, NumberField, Segmented, Slider, Toggle } from "../../glass";
import { scopeProps, type PreviewWidth } from "./shared";

/** Layout height of an element including padding (ResizeObserver contentRect excludes it). */
function useOuterHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  return [ref, h] as const;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function FakeWizard() {
  const [test, setTest] = useState(0.2);
  const [scaling, setScaling] = useState<"none" | "standard" | "minmax" | "robust">("standard");
  const [shuffle, setShuffle] = useState(true);
  const [seed, setSeed] = useState(42);
  const series: Series[] = useMemo(() => {
    const curve = (k: number, top: number, wob: number) =>
      Array.from({ length: 24 }, (_, i) => ({ x: i + 1, y: top - (top - 0.45) * Math.exp(-i / k) + Math.sin(i * 1.7) * wob }));
    return [
      { name: "Random forest", color: colorAt(0), points: curve(3, 0.95, 0.006) },
      { name: "Neural network", color: colorAt(1), points: curve(6, 0.92, 0.012) },
      { name: "Logistic regression", color: colorAt(2), points: curve(2, 0.86, 0.004), dashed: true },
    ];
  }, []);
  const rows = [
    { m: "🌲 Random forest", acc: 0.953, t: "1.2 s", s: <span className="badge success">Best</span> },
    { m: "🧠 Neural network", acc: 0.927, t: "4.8 s", s: <span className="badge accent">Good</span> },
    { m: "📏 Logistic regression", acc: 0.861, t: "0.1 s", s: <span className="badge warning">Simple</span> },
  ];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row between wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <div className="col" style={{ gap: 4, minWidth: 0 }}>
          <span className="eyebrow">Step 3 of 6 · Prepare</span>
          <h2>Get the data ready</h2>
          <p className="muted" style={{ maxWidth: 520 }}>Hold some rows back for a fair test, and put every number on the same scale.</p>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="badge success">✓ Data loaded</span>
          <span className="badge accent">150 rows</span>
          <span className="badge warning">2 tips</span>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}>
        <Glass className="col" style={{ gap: 14 }}>
          <h3>Split &amp; scale</h3>
          <Slider label="Test size" help="How much of the data is held back to grade the models." value={test} onChange={setTest} min={0.05} max={0.5} step={0.01} format={pct} />
          <Field label="Scaling" help="Puts every column on a similar range.">
            <Segmented
              value={scaling}
              onChange={setScaling}
              options={[{ value: "none", label: "None" }, { value: "standard", label: "Standard" }, { value: "minmax", label: "Min-max" }, { value: "robust", label: "Robust" }]}
            />
          </Field>
          <Toggle checked={shuffle} onChange={setShuffle} label="Shuffle rows first" />
          <Field label="Random seed" help="Same seed, same split: makes results repeatable.">
            <NumberField value={seed} onChange={setSeed} min={0} max={9999} />
          </Field>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost sm">Reset</button>
            <div className="grow" />
            <button className="btn sm">Preview</button>
            <button className="btn primary sm">Apply</button>
          </div>
        </Glass>
        <Glass className="col" style={{ gap: 12 }}>
          <div className="row between">
            <h3>Training curves</h3>
            <span className="badge">accuracy</span>
          </div>
          <LineChart series={series} height={150} yDomain={[0.4, 1]} />
          <BarList labels={["petal length", "petal width", "sepal length"]} values={[0.46, 0.41, 0.09]} format={(v) => v.toFixed(2)} height={16} />
        </Glass>
        <Glass style={{ gridColumn: "1 / -1", padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr><th>Model</th><th>Accuracy</th><th>Training time</th><th>Verdict</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.m}>
                  <td style={{ fontWeight: 600 }}>{r.m}</td>
                  <td className="num">{pct(r.acc)}</td>
                  <td className="num muted">{r.t}</td>
                  <td>{r.s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Glass>
      </div>
      <div className="glass row between wrap" style={{ padding: "10px 12px 10px 18px", borderRadius: "var(--r-xl)", gap: 10 }}>
        <span className="small muted">✓ Ready: 3 models will train on 120 rows</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn">← Back</button>
          <button className="btn gradient">Next: Train →</button>
        </div>
      </div>
    </div>
  );
}

function Pane({ theme, width, avail, label }: { theme: ResolvedTheme; width: PreviewWidth; avail: number; label?: string }) {
  const prefs = useUI((s) => s.prefs);
  const [leafRef, h] = useOuterHeight<HTMLDivElement>();
  const scale = avail > 0 ? Math.min(1, avail / width) : 0.5;
  return (
    <div className="ap-pane bg-swatch" {...scopeProps(prefs, theme, { width: width * scale, flex: "0 0 auto", height: h ? h * scale : 420 })}>
      {label && <span className="badge ap-pane-label">{label}</span>}
      {/* the only transformed element: a leaf wrapper around the fake page */}
      <div ref={leafRef} className="ap-pane-leaf" style={{ width, transform: `scale(${scale})` }}>
        <FakeWizard />
      </div>
    </div>
  );
}

/** A fake wizard page rendered with the current prefs at 600 / 1000 / 1400 px, optionally light and dark side by side. */
export function PreviewSandbox({ width, setWidth }: { width: PreviewWidth; setWidth: (w: PreviewWidth) => void }) {
  const prefs = useUI((s) => s.prefs);
  const [both, setBoth] = useState(false);
  const [ref, { width: avail }] = useSize<HTMLDivElement>();
  const themes: ResolvedTheme[] = both ? ["light", "dark"] : [resolveTheme(prefs.theme)];
  const gap = 12;
  const paneAvail = both ? (avail - gap) / 2 : avail;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <span className="small muted">Window width</span>
          <Segmented<string>
            fixedRenderer="segmented"
            size="sm"
            value={String(width)}
            onChange={(v) => setWidth(Number(v) as PreviewWidth)}
            options={[{ value: "600", label: "600 px" }, { value: "1000", label: "1000 px" }, { value: "1400", label: "1400 px" }]}
          />
          <span className="tiny faint">{paneAvail > 0 && paneAvail < width ? `shown at ${Math.round((paneAvail / width) * 100)}%` : "actual size"}</span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="small">Light &amp; dark side by side</span>
          <Toggle fixedRenderer="switch" checked={both} onChange={setBoth} />
        </div>
      </div>
      <div ref={ref} className="ap-sandbox" style={{ justifyContent: "center" }}>
        {themes.map((t) => (
          <Pane key={t} theme={t} width={width} avail={paneAvail} label={both ? (t === "light" ? "☀️ Light" : "🌙 Dark") : undefined} />
        ))}
      </div>
    </div>
  );
}
