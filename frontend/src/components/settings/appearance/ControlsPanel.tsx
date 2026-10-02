import { useCallback, useState, type ReactNode } from "react";
import { useUI } from "../../../lib/store";
import { ReportResolved, Segmented, Slider, Toggle, type ResolvedInfo } from "../../glass";
import {
  BOOL_INFO, CHOICE_FIXTURES, CHOICE_INFO, NUMERIC_FIXTURES, NUMERIC_INFO, ORIENTATION_INFO, RENDERER_NAME,
  type ChoiceFixture, type NumericFixture, type RendererInfo,
} from "./controlFixtures";
import { Glyph } from "./Glyph";
import { OptionCard, SubHead } from "./shared";

/** Cards to pick one renderer (with a glyph + description). */
function RendererCards<T extends string>({ items, value, onChange, label }: { items: RendererInfo<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ap-grid cols-auto-150" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <OptionCard key={it.id} selected={value === it.id} onClick={() => onChange(it.id)} label={it.name}>
          <Glyph name={it.id} />
          <div className="col" style={{ gap: 2 }}>
            <span className="ap-card-title">{it.name}</span>
            <span className="ap-card-desc">{it.desc}</span>
          </div>
        </OptionCard>
      ))}
    </div>
  );
}

/** "✓ Slider" / "↪ Dropdown" badge with the reason the control differs from the plain preference. */
function ResolvedBadge({ info, extra }: { info: ResolvedInfo | null; extra?: string }) {
  if (!info) return <span className="badge">…</span>;
  const same = info.renderer === info.pref;
  return (
    <span className={`badge ${same ? "success" : "warning"}`} title={same ? "Shown exactly as you chose" : "Adjusted to fit this control"} data-resolved={info.renderer}>
      {same ? "✓" : "↪"} {RENDERER_NAME[info.renderer] ?? info.renderer}{extra && info.renderer === "slider" ? ` ${extra}` : ""}
    </span>
  );
}

/** A preview card around one real control; the control reports which renderer it actually used (and why). */
function ProbeCell({ title, note, extra, children }: { title: ReactNode; note: ReactNode; extra?: string; children: ReactNode }) {
  const [info, setInfo] = useState<ResolvedInfo | null>(null);
  const onReport = useCallback((i: ResolvedInfo) => {
    setInfo((cur) => (cur && cur.renderer === i.renderer && cur.reason === i.reason && cur.pref === i.pref ? cur : i));
  }, []);
  return (
    <div className="ap-preview-cell">
      <div className="ap-preview-cap">
        <div className="col" style={{ gap: 0, minWidth: 0 }}>
          <span className="small" style={{ fontWeight: 650 }}>{title}</span>
          <span className="tiny faint">{note}</span>
        </div>
        <ResolvedBadge info={info} extra={extra} />
      </div>
      {info?.reason && <span className="ap-why">↪ {info.reason}</span>}
      <div className="divider" style={{ margin: 0 }} />
      <ReportResolved onReport={onReport}>
        <div style={{ minWidth: 0 }}>{children}</div>
      </ReportResolved>
    </div>
  );
}

function NumericPreview({ f, valueBox }: { f: NumericFixture; valueBox: boolean }) {
  const [value, setValue] = useState(f.value);
  return (
    <ProbeCell title={f.label} note={f.note} extra={valueBox ? "+ box" : undefined}>
      <Slider label={f.label} help={f.help} value={value} onChange={setValue} min={f.min} max={f.max} step={f.step} log={f.log} integer={f.integer} format={f.format} />
    </ProbeCell>
  );
}

function ChoicePreview({ f }: { f: ChoiceFixture }) {
  const [value, setValue] = useState(f.value);
  return (
    <ProbeCell title={f.label} note={f.note}>
      <Segmented<string> value={value} onChange={setValue} options={f.options} size={f.size} kind={f.kind} />
    </ProbeCell>
  );
}

function BoolPreviews() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <>
      <ProbeCell title="With a label" note="Most settings">
        <Toggle checked={a} onChange={setA} label="Shuffle rows before splitting" help="Mixes the rows so the test set is a fair sample." />
      </ProbeCell>
      <ProbeCell title="Without a label" note="Inline in tables and toolbars">
        <div className="row" style={{ gap: 10 }}>
          <span className="small muted grow">Include this column</span>
          <Toggle checked={b} onChange={setB} />
        </div>
      </ProbeCell>
      <ProbeCell title="Disabled" note="Can't be changed right now">
        <Toggle checked={false} onChange={() => {}} disabled label="Use the GPU (not available)" />
      </ProbeCell>
    </>
  );
}

function Group({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="ap-group">
      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <h4>{title}</h4>
        {hint && <span className="tiny faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function ControlsPanel() {
  const c = useUI((s) => s.prefs.controls);
  const setControl = useUI((s) => s.setControl);
  return (
    <div className="col" style={{ gap: 0 }}>
      <Group title="🔢 Numbers" hint="Sizes, rates, counts: about 80 controls across the app">
        <RendererCards items={NUMERIC_INFO} value={c.numeric} onChange={(v) => setControl("numeric", v)} label="Number controls" />
        <div className="row between wrap" style={{ gap: 12, marginTop: 12, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--glass-strong)", border: "1px solid var(--hairline)" }}>
          <div className="col" style={{ gap: 1, minWidth: 0, flex: "1 1 240px" }}>
            <span className="small" style={{ fontWeight: 650 }}>Editable value box</span>
            <span className="tiny muted">Sliders show a small number field you can type into, instead of a read-only value.</span>
          </div>
          <Toggle fixedRenderer="switch" checked={c.valueBox} onChange={(v) => setControl("valueBox", v)} />
        </div>
        <SubHead hint="Try them: these are the real controls">Live preview</SubHead>
        <div className="ap-grid cols-auto-280">
          {NUMERIC_FIXTURES.map((f) => <NumericPreview key={f.key} f={f} valueBox={c.valueBox} />)}
        </div>
      </Group>

      <Group title="🔘 Choices" hint="Pick-one options: about 60 across the app (long lists always stay menus)">
        <RendererCards items={CHOICE_INFO} value={c.choice} onChange={(v) => setControl("choice", v)} label="Choice controls" />
        <SubHead hint="When options don't fit side by side">Direction</SubHead>
        <RendererCards items={ORIENTATION_INFO} value={c.orientation} onChange={(v) => setControl("orientation", v)} label="Direction" />
        <SubHead hint="Small toolbar switches only use segmented, chips or a menu">Live preview</SubHead>
        <div className="ap-grid cols-auto-280">
          {CHOICE_FIXTURES.map((f) => <ChoicePreview key={f.key} f={f} />)}
        </div>
      </Group>

      <Group title="💡 On / off" hint="Yes-or-no settings: about 35 across the app">
        <RendererCards items={BOOL_INFO} value={c.bool} onChange={(v) => setControl("bool", v)} label="On/off controls" />
        <SubHead>Live preview</SubHead>
        <div className="ap-grid cols-auto-280">
          <BoolPreviews />
        </div>
      </Group>
    </div>
  );
}
