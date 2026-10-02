import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { classColor } from "../../../lib/colors";
import { toast } from "../../../lib/store";
import type { Catalog, DatasetSummary, SyntheticPreview, Task } from "../../../lib/types";
import { ClassBars, Histogram, Scatter } from "../../charts";
import { Glass, InfoTip, NumberField, Slider, Spinner } from "../../glass";
import { liftFlat, uid, useDebounced, useLatest } from "../shared";
import { SectionTitle } from "../ui";
import { FeatureCard } from "./FeatureCard";
import { TargetCard } from "./TargetCard";
import { classLabels, defaultDesign, newFeature, toSpec, type DesignFeature, type DesignState } from "./model";

/** Problems that would make the backend reject the design (shown inline, block "Create"). */
function validate(d: DesignState) {
  const perFeature: Record<string, string> = {};
  const seen = new Map<string, number>();
  for (const f of d.features) seen.set(f.name.trim(), (seen.get(f.name.trim()) ?? 0) + 1);
  const tname = d.target.name.trim() || "target";
  for (const f of d.features) {
    const n = f.name.trim();
    if (!n) perFeature[f._id] = "Give this column a name.";
    else if ((seen.get(n) ?? 0) > 1) perFeature[f._id] = "Two columns can't share a name.";
    else if (n === tname) perFeature[f._id] = "Same name as the target column.";
    else if (f.dist === "categorical" && !(f.params.categories as string[] | undefined)?.filter((c) => c.trim()).length) perFeature[f._id] = "Add at least one category.";
  }
  let general: string | null = null;
  if (!d.features.length) general = "Add at least one feature.";
  else if (d.target.rule === "clusters" && !d.target.on.some((id) => d.features.find((f) => f._id === id && f.dist !== "categorical"))) general = "Pick at least one numeric feature to form clusters.";
  return { perFeature, general, ok: !general && Object.keys(perFeature).length === 0 };
}

export function Designer({ design, setDesign, task, catalog, onCreated }: {
  design: DesignState;
  setDesign: (d: DesignState | ((d: DesignState) => DesignState)) => void;
  task: Task;
  catalog: Catalog;
  onCreated: (d: DatasetSummary) => void;
}) {
  const [creating, setCreating] = useState(false);
  const v = validate(design);
  const spec = useMemo(() => toSpec(design, task), [design, task]);
  const previewSpec = useDebounced({ ...spec, name: undefined, n_samples: Math.min(spec.n_samples, 400) }, 200);
  const { data: preview, error, loading } = useLatest<SyntheticPreview>(v.ok ? JSON.stringify(previewSpec) : null, () => api.syntheticPreview(previewSpec));
  const colPreview = useMemo(() => new Map((preview?.columns ?? []).map((c) => [c.name, c])), [preview]);

  const patchFeature = (f: DesignFeature) => setDesign((d) => ({ ...d, features: d.features.map((x) => (x._id === f._id ? f : x)) }));
  const addFeature = () => setDesign((d) => {
    let i = d.features.length + 1, name = `feature_${i}`;
    const names = new Set(d.features.map((f) => f.name));
    while (names.has(name)) name = `feature_${++i}`;
    const f = newFeature(name);
    return { ...d, features: [...d.features, f], target: { ...d.target, weights: { ...d.target.weights, [f._id]: 0.5 }, on: [...d.target.on, f._id] } };
  });
  const duplicate = (src: DesignFeature) => setDesign((d) => {
    const names = new Set(d.features.map((f) => f.name));
    let name = `${src.name}_copy`, i = 2;
    while (names.has(name)) name = `${src.name}_copy${i++}`;
    const f: DesignFeature = { ...structuredClone(src), _id: uid(), name };
    const idx = d.features.findIndex((x) => x._id === src._id);
    const features = [...d.features.slice(0, idx + 1), f, ...d.features.slice(idx + 1)];
    return { ...d, features, target: { ...d.target, weights: { ...d.target.weights, [f._id]: d.target.weights[src._id] ?? 0 }, on: d.target.on.includes(src._id) ? [...d.target.on, f._id] : d.target.on } };
  });
  const remove = (id: string) => setDesign((d) => {
    const { [id]: _, ...weights } = d.target.weights;
    return { ...d, features: d.features.filter((f) => f._id !== id), target: { ...d.target, weights, on: d.target.on.filter((x) => x !== id) } };
  });

  const create = async () => {
    setCreating(true);
    try {
      const d = await api.synthetic(spec);
      toast.success(`Created “${d.name}” with ${d.n_rows.toLocaleString()} rows.`);
      onCreated(d);
    } catch (e) {
      toast.error(e);
    } finally {
      setCreating(false);
    }
  };

  const labels = classLabels(design.target);
  const continuous = task === "regression";
  const scatter = preview ? liftFlat(preview.scatter, continuous) : [];

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* ------------------------------------------------ basics */}
      <Glass animate_in>
        <SectionTitle icon="🧪" title="Design your own dataset" sub="Invent features, decide how they shape the answer, and watch the data appear live." />
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18, alignItems: "end" }}>
          <Slider label="Rows" help="How many examples to generate. More rows = easier learning, slower training." value={design.n_samples} min={50} max={20000} log integer
            format={(n) => n.toLocaleString()} onChange={(n) => setDesign((d) => ({ ...d, n_samples: n }))} />
          <div className="col" style={{ gap: 6 }}>
            <span className="row" style={{ gap: 6, fontWeight: 560, fontSize: 13 }}>Random seed <InfoTip text="Same seed = exactly the same data every time. Shuffle for a fresh draw." /></span>
            <div className="row" style={{ gap: 8 }}>
              <NumberField value={design.seed} min={0} step={1} onChange={(s) => setDesign((d) => ({ ...d, seed: Math.round(s) }))} style={{ flex: 1, width: "100%" }} />
              <motion.button className="btn icon" whileTap={{ rotate: 180, scale: 0.9 }} transition={spring.pop} title="Shuffle"
                onClick={() => setDesign((d) => ({ ...d, seed: Math.floor(Math.random() * 100000) }))}>🎲</motion.button>
            </div>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontWeight: 560, fontSize: 13 }}>Dataset name</span>
            <input className="input" value={design.name} onChange={(e) => setDesign((d) => ({ ...d, name: e.target.value }))} />
          </div>
        </div>
      </Glass>

      {/* ------------------------------------------------ features */}
      <Glass animate_in>
        <SectionTitle icon="🧱" title={<>Features <span className="badge" style={{ marginLeft: 4 }}>{design.features.length}</span></>}
          help="Features are the columns your model gets to look at. Each one is drawn from a distribution — the shape of its histogram."
          right={
            <div className="row" style={{ gap: 8 }}>
              {loading && <Spinner size={14} color="var(--accent)" />}
              <button className="btn sm primary" onClick={addFeature} disabled={design.features.length >= 40}>＋ Add feature</button>
            </div>
          } />
        <motion.div layout className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
          <AnimatePresence initial={false}>
            {design.features.map((f, i) => (
              <FeatureCard key={f._id} feature={f} index={i} distributions={catalog.distributions} preview={colPreview.get(f.name.trim())}
                problem={v.perFeature[f._id]} onChange={patchFeature} onDuplicate={() => duplicate(f)}
                onRemove={design.features.length > 1 ? () => remove(f._id) : undefined} />
            ))}
          </AnimatePresence>
        </motion.div>
      </Glass>

      {/* ------------------------------------------------ target + preview */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <Glass animate_in>
          <SectionTitle icon="🎯" title="The answer (target)" help="The column your models will learn to predict, and the hidden rule that produces it." />
          <TargetCard target={design.target} features={design.features} task={task} functions={catalog.functions}
            error={design.target.rule === "expression" ? error : null} onChange={(t) => setDesign((d) => ({ ...d, target: t }))} />
        </Glass>
        <Glass animate_in style={{ position: "sticky", top: 0 }}>
          <SectionTitle icon="👀" title="Live preview" sub={`A quick sample of ${Math.min(design.n_samples, 400)} rows`}
            right={loading ? <Spinner size={16} color="var(--accent)" /> : null} />
          {(error || v.general) && design.target.rule !== "expression" && (
            <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>⚠️ {v.general ?? error}</div>
          )}
          {preview ? (
            <motion.div className="col" style={{ gap: 16, opacity: loading ? 0.7 : 1, transition: "opacity .2s" }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{task === "classification" ? "How many of each class" : "Spread of the answer"}</div>
                {preview.target.kind === "classes" ? (
                  <ClassBars labels={labels} height={130}
                    after={labels.map((l) => { const b = (preview.target as Extract<SyntheticPreview["target"], { kind: "classes" }>).balance; const i = b.labels.indexOf(l); return i >= 0 ? b.counts[i] : 0; })}
                    colors={labels.map((l) => classColor(l, labels))} />
                ) : (
                  <Histogram data={preview.target.histogram} color="var(--accent-2)" height={110} />
                )}
              </div>
              <div>
                <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                  <span className="eyebrow">Bird's-eye view</span>
                  <InfoTip text="All features squashed onto a flat map (PCA) so you can see them at once. Each dot is a row, coloured by its answer. Clear colour patches = easy to learn." />
                </div>
                <Scatter points={scatter} classes={continuous ? undefined : labels} continuous={continuous} height={230} radius={3} />
              </div>
            </motion.div>
          ) : (
            <div className="col" style={{ gap: 12 }}>
              <div className="skeleton" style={{ height: 120 }} />
              <div className="skeleton" style={{ height: 220 }} />
            </div>
          )}
        </Glass>
      </div>

      {/* ------------------------------------------------ create */}
      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button className="btn ghost" onClick={() => setDesign(defaultDesign(task))}>↺ Start over</button>
        <motion.button className="btn gradient lg" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} disabled={!v.ok || creating || !!(error && design.target.rule === "expression")} onClick={create}>
          {creating ? <Spinner size={16} /> : "✨"} Create dataset · {design.n_samples.toLocaleString()} rows
        </motion.button>
      </motion.div>
    </div>
  );
}
