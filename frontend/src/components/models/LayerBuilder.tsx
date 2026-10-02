import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { spring } from "../../design/motion";
import type { ConvLayer, DenseLayer, Layer, NNArch } from "../../lib/types";
import { InfoTip, Select, Slider, Toggle } from "../glass";
import { ACTIVATIONS } from "./meta";

/** Stable React keys for an array that can be reordered (so layout animations follow the moved item). */
function useStableIds(count: number) {
  const ids = useRef<string[]>([]);
  const counter = useRef(0);
  const fresh = () => `L${counter.current++}`;
  if (ids.current.length !== count) ids.current = Array.from({ length: count }, (_, i) => ids.current[i] ?? fresh());
  return { ids: ids.current, fresh, set: (next: string[]) => { ids.current = next; } };
}

const COLORS = { conv: "#FF9F0A", dense: "#0A84FF" };

export const MLP_PRESETS: { id: string; label: string; icon: string; layers: DenseLayer[] }[] = [
  { id: "tiny", label: "Tiny", icon: "🐣", layers: [{ type: "dense", units: 16, activation: "relu", dropout: 0, batchnorm: false }] },
  { id: "wide", label: "Wide", icon: "🦒", layers: [
    { type: "dense", units: 256, activation: "relu", dropout: 0.2, batchnorm: true },
    { type: "dense", units: 128, activation: "relu", dropout: 0.1, batchnorm: false },
  ] },
  { id: "deep", label: "Deep", icon: "🐙", layers: [
    { type: "dense", units: 128, activation: "gelu", dropout: 0.1, batchnorm: true },
    { type: "dense", units: 64, activation: "gelu", dropout: 0.1, batchnorm: true },
    { type: "dense", units: 64, activation: "gelu", dropout: 0.1, batchnorm: false },
    { type: "dense", units: 32, activation: "gelu", dropout: 0, batchnorm: false },
    { type: "dense", units: 16, activation: "gelu", dropout: 0, batchnorm: false },
  ] },
];

const CNN_PRESETS: { id: string; label: string; icon: string; layers: Layer[] }[] = [
  { id: "small", label: "Small", icon: "🐣", layers: [
    { type: "conv", filters: 8, kernel: 3, activation: "relu", pool: 2 },
    { type: "dense", units: 32, activation: "relu", dropout: 0.1 },
  ] },
  { id: "classic", label: "Classic", icon: "🏛️", layers: [
    { type: "conv", filters: 16, kernel: 3, activation: "relu", pool: 2 },
    { type: "conv", filters: 32, kernel: 3, activation: "relu", pool: 2 },
    { type: "dense", units: 64, activation: "relu", dropout: 0.25 },
  ] },
  { id: "deep", label: "Deep", icon: "🐙", layers: [
    { type: "conv", filters: 16, kernel: 3, activation: "relu", pool: 0, batchnorm: true },
    { type: "conv", filters: 32, kernel: 3, activation: "relu", pool: 2, batchnorm: true },
    { type: "conv", filters: 64, kernel: 3, activation: "relu", pool: 2, batchnorm: true },
    { type: "dense", units: 128, activation: "relu", dropout: 0.3 },
  ] },
];

const NEW_DENSE: DenseLayer = { type: "dense", units: 32, activation: "relu", dropout: 0, batchnorm: false };
const NEW_CONV: ConvLayer = { type: "conv", filters: 16, kernel: 3, activation: "relu", pool: 0, batchnorm: false };

/** Visual editor for MLP and CNN architectures: a stack of conv layers (CNNs) followed by dense layers. */
export function LayerBuilder({ arch, onChange }: { arch: NNArch; onChange: (a: NNArch) => void }) {
  const isCnn = arch.kind === "cnn1d" || arch.kind === "cnn2d";
  const layers = arch.layers ?? [];
  const convs = layers.filter((l): l is ConvLayer => l.type === "conv");
  const denses = layers.filter((l): l is DenseLayer => l.type === "dense");
  const convIds = useStableIds(convs.length);
  const denseIds = useStableIds(denses.length);

  const write = (c: ConvLayer[], d: DenseLayer[]) => onChange({ ...arch, layers: [...(isCnn ? c : []), ...d] });
  const presets = isCnn ? CNN_PRESETS : MLP_PRESETS;
  const applyPreset = (ls: Layer[]) => {
    convIds.set([]);
    denseIds.set([]);
    onChange({ ...arch, layers: structuredClone(ls) });
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="eyebrow">Presets</span>
        {presets.map((p) => (
          <motion.button key={p.id} whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }} className="btn sm" onClick={() => applyPreset(p.layers)}>
            <span>{p.icon}</span> {p.label}
          </motion.button>
        ))}
      </div>

      {isCnn && (
        <LayerList
          title="Convolution layers"
          color={COLORS.conv}
          explain={<>A <b>filter</b> is a tiny pattern detector that slides across the input and lights up wherever it spots its pattern — an edge, a bump, a stroke. <b>Pooling</b> then shrinks the result by keeping only the strongest signal in each small window, so later layers see the bigger picture.</>}
          ids={convIds}
          items={convs}
          min={1}
          onItems={(c) => write(c, denses)}
          make={() => ({ ...NEW_CONV, filters: Math.min(256, (convs[convs.length - 1]?.filters ?? 8) * 2) })}
          render={(l, set) => <ConvRow layer={l} onChange={set} />}
          addLabel="Add conv layer"
        />
      )}

      <LayerList
        title={isCnn ? "Dense layers" : "Hidden layers"}
        color={COLORS.dense}
        explain={isCnn
          ? <>After the filters have found patterns, fully-connected neurons combine them into a final answer.</>
          : <>Every neuron looks at <i>all</i> values from the layer before, weighs them up and passes on a signal. More neurons = more capacity; more layers = more steps of reasoning.</>}
        ids={denseIds}
        items={denses}
        min={isCnn ? 0 : 1}
        onItems={(d) => write(convs, d)}
        make={() => ({ ...NEW_DENSE, units: Math.max(4, Math.round((denses[denses.length - 1]?.units ?? 64) / 2)) })}
        render={(l, set) => <DenseRow layer={l} onChange={set} />}
        addLabel="Add dense layer"
      />
    </div>
  );
}

function LayerList<T extends Layer>({ title, color, explain, ids, items, min, onItems, make, render, addLabel }: {
  title: string;
  color: string;
  explain: React.ReactNode;
  ids: ReturnType<typeof useStableIds>;
  items: T[];
  min: number;
  onItems: (items: T[]) => void;
  make: () => T;
  render: (l: T, set: (patch: Partial<T>) => void) => React.ReactNode;
  addLabel: string;
}) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    const nid = [...ids.ids];
    [nid[i], nid[j]] = [nid[j], nid[i]];
    ids.set(nid);
    onItems(next);
  };
  const remove = (i: number) => {
    ids.set(ids.ids.filter((_, k) => k !== i));
    onItems(items.filter((_, k) => k !== i));
  };
  const add = () => {
    ids.set([...ids.ids, ids.fresh()]);
    onItems([...items, make()]);
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="col" style={{ gap: 3 }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
          <h4>{title}</h4>
          <span className="badge">{items.length}</span>
        </div>
        <p className="small muted" style={{ lineHeight: 1.5 }}>{explain}</p>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <AnimatePresence initial={false}>
          {items.map((l, i) => (
            <motion.div
              key={ids.ids[i]}
              layout
              initial={{ opacity: 0, scale: 0.94, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
              transition={spring.snappy}
              className="inset"
              style={{ padding: "10px 12px 12px", borderLeft: `3px solid ${color}`, overflow: "hidden" }}
            >
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="small" style={{ fontWeight: 650 }}>Layer {i + 1}</span>
                <span className="row" style={{ gap: 2 }}>
                  <button className="btn ghost sm icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn ghost sm icon" title="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="btn ghost sm icon danger" title="Remove layer" disabled={items.length <= min} onClick={() => remove(i)}>✕</button>
                </span>
              </div>
              {render(l, (patch) => onItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x))))}
            </motion.div>
          ))}
        </AnimatePresence>
        <motion.button layout whileTap={{ scale: 0.97 }} className="btn sm" style={{ alignSelf: "flex-start", borderStyle: "dashed" }} disabled={items.length >= 8} onClick={add}>
          + {addLabel}
        </motion.button>
      </div>
    </div>
  );
}

const grid = { display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: "10px 16px", alignItems: "end" } as const;

function DenseRow({ layer, onChange }: { layer: DenseLayer; onChange: (p: Partial<DenseLayer>) => void }) {
  return (
    <div style={grid}>
      <Slider label="Neurons" help="How many neurons this layer has. More can learn richer patterns, but also memorize noise."
        value={layer.units} min={1} max={512} log integer onChange={(units) => onChange({ units })} />
      <ActivationField value={layer.activation} onChange={(activation) => onChange({ activation })} />
      <Slider label="Dropout" help="Randomly switches off this share of neurons while training, so the network can't lean on any single one. Helps against overfitting."
        value={layer.dropout ?? 0} min={0} max={0.7} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(dropout) => onChange({ dropout })} />
      <div style={{ paddingBottom: 2 }}>
        <Toggle label="Batch norm" help="Re-centres the values flowing between layers. Usually makes training faster and steadier."
          checked={!!layer.batchnorm} onChange={(batchnorm) => onChange({ batchnorm })} />
      </div>
    </div>
  );
}

function ConvRow({ layer, onChange }: { layer: ConvLayer; onChange: (p: Partial<ConvLayer>) => void }) {
  return (
    <div style={grid}>
      <Slider label="Filters" help="How many different patterns this layer looks for."
        value={layer.filters} min={1} max={256} log integer onChange={(filters) => onChange({ filters })} />
      <ActivationField value={layer.activation} onChange={(activation) => onChange({ activation })} />
      <Slider label="Kernel size" help="How wide each filter's window is. 3 is the classic choice."
        value={layer.kernel} min={1} max={7} integer onChange={(kernel) => onChange({ kernel })} />
      <div className="col" style={{ gap: 6 }}>
        <span className="row" style={{ gap: 6, fontWeight: 560, fontSize: 13 }}>
          Pooling <InfoTip text="Shrink the output by keeping the strongest value in each 2- or 3-wide window. 'Off' keeps full detail." />
        </span>
        <div className="inset row" style={{ padding: 3, gap: 2, borderRadius: 10 }}>
          {[0, 2, 3].map((p) => {
            const active = (layer.pool ?? 0) === p;
            return (
              <button key={p} onClick={() => onChange({ pool: p })} style={{ flex: 1, height: 26, border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: active ? 650 : 500, background: active ? "var(--glass-strong)" : "transparent", boxShadow: active ? "0 1px 4px rgba(0,0,0,.12)" : "none", transition: "background .15s" }}>
                {p === 0 ? "Off" : `${p}×`}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <Toggle label="Batch norm" help="Re-centres the values flowing between layers. Usually makes training faster and steadier."
          checked={!!layer.batchnorm} onChange={(batchnorm) => onChange({ batchnorm })} />
      </div>
    </div>
  );
}

export function ActivationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <span className="row" style={{ gap: 6, fontWeight: 560, fontSize: 13 }}>
        Activation <InfoTip text="The little bend each neuron applies to its signal — without it, stacked layers would just be one straight line. 'relu' is a solid default." />
      </span>
      <Select value={value} options={ACTIVATIONS} onChange={onChange} style={{ width: "100%" }} />
    </div>
  );
}
