import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { spring, stagger } from "../../design/motion";
import { api } from "../../lib/api";
import { isUnsupervised, toast } from "../../lib/store";
import type { Catalog, DatasetSummary, Point, Task } from "../../lib/types";
import { Scatter } from "../charts";
import { Glass, Slider, Spinner } from "../glass";
import { liftFlat, useDebounced, useLatest } from "./shared";
import { SectionTitle } from "./ui";

const PRESET_INFO: Record<string, { emoji: string; blurb: string }> = {
  moons: { emoji: "🌙", blurb: "Two interlocking half-circles. Straight lines can't split them." },
  circles: { emoji: "⭕", blurb: "A ring around a dot — needs a curved boundary." },
  blobs: { emoji: "🫧", blurb: "Round clouds of points. The easy warm-up." },
  spirals: { emoji: "🌀", blurb: "Two twisting arms. A real test for neural nets." },
  xor: { emoji: "✖️", blurb: "Four quadrants, opposite corners match. Linear models fail." },
  classification: { emoji: "🎛️", blurb: "Many features, some useful, some noise. Dial in imbalance." },
  regression: { emoji: "📐", blurb: "A straight-line relationship with noise." },
  friedman: { emoji: "〰️", blurb: "A famous curvy benchmark with 10 features (5 useless)." },
  sine: { emoji: "🌊", blurb: "One feature, a wavy answer. See who can follow the curve." },
};

interface PMeta { label: string; min: number; max: number; step?: number; log?: boolean; integer?: boolean; help?: string; format?: (v: number) => string }

const NOISE_MAX: Record<string, number> = { moons: 0.6, circles: 0.3, spirals: 0.8, xor: 0.5, regression: 100, friedman: 5, sine: 1 };

function paramMeta(preset: string, key: string): PMeta {
  switch (key) {
    case "n_samples": return { label: "Rows", min: 50, max: 20000, log: true, integer: true, format: (v) => v.toLocaleString() };
    case "noise": return { label: "Noise", min: 0, max: NOISE_MAX[preset] ?? 1, step: (NOISE_MAX[preset] ?? 1) / 100, help: "Random jitter. More noise = classes overlap / the curve gets fuzzy." };
    case "factor": return { label: "Inner circle size", min: 0.1, max: 0.9, step: 0.01, help: "How big the inner circle is compared to the outer one." };
    case "centers": return { label: "Number of blobs", min: 2, max: 8, integer: true };
    case "cluster_std": return { label: "Blob spread", min: 0.2, max: 4, step: 0.05, help: "Wider blobs overlap more." };
    case "n_features": return { label: "Features", min: preset === "regression" ? 1 : 2, max: 30, integer: true };
    case "n_informative": return { label: "Useful features", min: 1, max: 30, integer: true, help: "How many features actually carry signal; the rest are noise." };
    case "n_classes": return { label: "Classes", min: 2, max: 6, integer: true };
    case "minority_share": return { label: "Minority share", min: 0.02, max: 0.5, step: 0.01, format: (v) => `${Math.round(v * 100)}%`, help: "Share of the rarer class (2 classes only). Lower = more imbalanced, like fraud detection." };
    case "class_sep": return { label: "Class separation", min: 0.2, max: 3, step: 0.05, help: "Bigger = classes further apart = easier." };
    case "flip_y": return { label: "Label errors", min: 0, max: 0.3, step: 0.01, format: (v) => `${Math.round(v * 100)}%`, help: "Share of rows whose label is randomly wrong." };
    case "turns": return { label: "Spiral turns", min: 0.5, max: 3, step: 0.05 };
    default: return { label: key, min: 0, max: 10, step: 0.1 };
  }
}

type PreviewResp = { task: Task; points: Point[] };

function MiniPreview({ preset, params }: { preset: string; params: Record<string, number> }) {
  const { data } = useLatest<PreviewResp>(preset, () => api.presetPreview(preset, { ...params, n_samples: 240 }) as Promise<PreviewResp>);
  if (!data) return <div className="skeleton" style={{ height: 120 }} />;
  const cont = data.task === "regression";
  return <Scatter points={liftFlat(data.points, cont)} continuous={cont} height={120} radius={2.2} showLegend={false} />;
}

export function PresetsPanel({ catalog, task, onLoaded }: { catalog: Catalog; task: string | null; onLoaded: (d: DatasetSummary) => void }) {
  // discovery projects: the category-style shapes (blobs, moons…) — their answer column becomes the hidden truth
  const want = task && isUnsupervised(task) ? "classification" : task;
  const entries = Object.entries(catalog.presets).filter(([, p]) => !want || p.task === want);
  const [sel, setSel] = useState<string | null>(null);
  const [state, setState] = useState<{ preset: string | null; params: Record<string, number> }>({ preset: null, params: {} });
  const [busy, setBusy] = useState(false);
  const params = state.params;
  const setParams = (fn: (p: Record<string, number>) => Record<string, number>) => setState((s) => ({ ...s, params: fn(s.params) }));
  const choose = (name: string | null) => {
    setSel(name);
    setState({ preset: name, params: name ? { ...catalog.presets[name].params } : {} });
  };

  const d = useDebounced(state, 200);
  const key = sel && d.preset === sel ? JSON.stringify(d) : null;
  const big = useLatest<PreviewResp>(key, () => api.presetPreview(d.preset!, d.params) as Promise<PreviewResp>);

  const use = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const ds = await api.preset(sel, params);
      toast.success(`Created “${ds.name}” with ${ds.n_rows.toLocaleString()} rows.`);
      onLoaded(ds);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const shownKeys = sel ? Object.keys(catalog.presets[sel].params).filter((k) => !(k === "minority_share" && (params.n_classes ?? 2) > 2)) : [];
  const cont = big.data?.task === "regression";

  return (
    <div className="col" style={{ gap: 16 }}>
      <Glass>
        <SectionTitle icon="🧩" title="Classic toy datasets" sub="Famous shapes that show off what different models can and can't learn." />
        <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {entries.map(([name, p]) => {
            const info = PRESET_INFO[name] ?? { emoji: "✨", blurb: "" };
            const active = sel === name;
            return (
              <motion.button
                key={name}
                variants={{ hidden: { opacity: 0, y: 12, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: spring.gentle } }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => choose(active ? null : name)}
                className="inset col"
                style={{ padding: 12, gap: 6, textAlign: "left", cursor: "pointer", alignItems: "stretch", borderColor: active ? "var(--accent)" : "var(--hairline)", boxShadow: active ? "0 0 0 3px var(--accent-soft)" : undefined, transition: "border-color .2s, box-shadow .2s" }}
              >
                <MiniPreview preset={name} params={p.params} />
                <div className="row" style={{ gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{info.emoji}</span>
                  <b style={{ fontSize: 13.5 }}>{p.label}</b>
                </div>
                <span className="tiny muted" style={{ lineHeight: 1.4 }}>{info.blurb}</span>
              </motion.button>
            );
          })}
        </motion.div>
      </Glass>

      <AnimatePresence mode="wait">
        {sel && (
          <motion.div key={sel} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={spring.gentle}>
            <Glass>
              <SectionTitle icon={PRESET_INFO[sel]?.emoji} title={catalog.presets[sel].label} sub="Tweak the knobs and watch the data reshape."
                right={big.loading ? <Spinner size={16} color="var(--accent)" /> : null} />
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 22, alignItems: "start" }}>
                <div className="col" style={{ gap: 14 }}>
                  {shownKeys.map((k) => {
                    const m = paramMeta(sel, k);
                    const max = k === "n_informative" ? Math.max(1, params.n_features ?? m.max) : m.max;
                    return (
                      <Slider key={k} label={m.label} help={m.help} value={params[k] ?? m.min} min={m.min} max={max} step={m.step} log={m.log} integer={m.integer} format={m.format}
                        onChange={(v) => setParams((p) => ({ ...p, [k]: v }))} />
                    );
                  })}
                </div>
                <div className="inset" style={{ padding: 10 }}>
                  {big.data ? (
                    <Scatter points={liftFlat(big.data.points, cont)} continuous={cont} height={300} radius={3} />
                  ) : <div className="skeleton" style={{ height: 300 }} />}
                  {(params.n_samples ?? 0) > 500 && <div className="tiny faint" style={{ marginTop: 6 }}>Preview shows 500 of {Math.round(params.n_samples).toLocaleString()} rows.</div>}
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
                <motion.button className="btn gradient lg" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} disabled={busy} onClick={use}>
                  {busy ? <Spinner size={16} /> : "✨"} Use this dataset
                </motion.button>
              </div>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
