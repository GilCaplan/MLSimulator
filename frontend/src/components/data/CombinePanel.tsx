import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { Catalog, DatasetSummary, SyntheticPreview, SyntheticSpec } from "../../lib/types";
import { Glass, InfoTip, Slider, Spinner } from "../glass";
import { FeatureCard } from "./designer/FeatureCard";
import { newFeature, stripId, type DesignFeature } from "./designer/model";
import { uid, useDebounced, useLatest } from "./shared";
import { Disclosure, SectionTitle } from "./ui";

const PREVIEW_TARGET = "__preview_target__";

/** Add synthetic columns and/or jittered copies of rows to the current dataset. */
export function CombinePanel({ dataset, target, catalog, onLoaded }: { dataset: DatasetSummary; target: string | null; catalog: Catalog | null; onLoaded: (d: DatasetSummary) => void }) {
  const [open, setOpen] = useState(false);
  const [features, setFeatures] = useState<DesignFeature[]>([]);
  const [addRows, setAddRows] = useState(0);
  const [jitter, setJitter] = useState(0.05);
  const [busy, setBusy] = useState(false);

  const existing = useMemo(() => new Set(dataset.columns.map((c) => c.name)), [dataset]);
  const problems = useMemo(() => {
    const out: Record<string, string> = {};
    const count = new Map<string, number>();
    for (const f of features) count.set(f.name.trim(), (count.get(f.name.trim()) ?? 0) + 1);
    for (const f of features) {
      const n = f.name.trim();
      if (!n) out[f._id] = "Give this column a name.";
      else if (existing.has(n)) out[f._id] = "The dataset already has a column with this name.";
      else if ((count.get(n) ?? 0) > 1) out[f._id] = "Two new columns can't share a name.";
    }
    return out;
  }, [features, existing]);
  const valid = Object.keys(problems).length === 0;

  const spec: SyntheticSpec | null = features.length && valid
    ? { n_samples: Math.min(400, Math.max(50, dataset.n_rows)), seed: 7, features: features.map(stripId), target: { name: PREVIEW_TARGET, task: "regression", rule: { type: "random" } } }
    : null;
  const dSpec = useDebounced(spec, 200);
  const { data: preview, loading } = useLatest<SyntheticPreview>(dSpec ? JSON.stringify(dSpec) : null, () => api.syntheticPreview(dSpec!));
  const colPreview = new Map((preview?.columns ?? []).map((c) => [c.name, c]));

  const add = () => {
    let i = 1, name = "synthetic_1";
    const taken = new Set([...existing, ...features.map((f) => f.name)]);
    while (taken.has(name)) name = `synthetic_${++i}`;
    setFeatures((fs) => [...fs, newFeature(name)]);
    setOpen(true);
  };

  const combine = async () => {
    setBusy(true);
    try {
      const d = await api.compose(dataset.id, { add_features: features.map(stripId), add_rows: addRows, jitter, target });
      toast.success(`New dataset: ${d.n_rows.toLocaleString()} rows × ${d.n_cols} columns.`);
      setFeatures([]);
      setAddRows(0);
      onLoaded(d);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const nothing = !features.length && !addRows;
  const maxRows = Math.min(100000, Math.max(1000, dataset.n_rows * 3));

  return (
    <Glass animate_in>
      <Disclosure open={open} onToggle={setOpen} title={<span className="row" style={{ gap: 8, fontSize: 15, fontWeight: 650 }}>🧬 Add synthetic data to this dataset</span>}
        right={<InfoTip text="Experiment! Add a pure-noise column to see whether models get distracted, or pad a tiny dataset with slightly wiggled copies of real rows." />}>
        <div className="col" style={{ gap: 18 }}>
          <div>
            <SectionTitle title={<span style={{ fontSize: 14 }}>Extra columns</span>} sub="New random columns. They carry no signal about the target — a good test of whether a model can ignore noise."
              right={<button className="btn sm primary" onClick={add} disabled={!catalog || features.length >= 20}>＋ Add column</button>} />
            {catalog && (
              <motion.div layout className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                <AnimatePresence initial={false}>
                  {features.map((f, i) => (
                    <FeatureCard key={f._id} feature={f} index={dataset.n_cols + i} distributions={catalog.distributions} preview={colPreview.get(f.name.trim())}
                      problem={problems[f._id]} onChange={(nf) => setFeatures((fs) => fs.map((x) => (x._id === nf._id ? nf : x)))}
                      onDuplicate={() => setFeatures((fs) => [...fs, { ...structuredClone(f), _id: uid(), name: `${f.name}_copy` }])}
                      onRemove={() => setFeatures((fs) => fs.filter((x) => x._id !== f._id))} />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
            {!features.length && <p className="small faint">No extra columns yet.</p>}
          </div>

          <div className="inset col" style={{ padding: 14, gap: 14 }}>
            <SectionTitle title={<span style={{ fontSize: 14 }}>Extra rows</span>} sub="Copies of random real rows with a little noise added to the numbers (the target is kept as-is)." />
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
              <Slider label="Rows to add" value={addRows} min={0} max={maxRows} integer format={(v) => `+${Math.round(v).toLocaleString()}`} onChange={setAddRows} />
              <Slider label="Wiggle" help="How much each copied number is nudged, as a share of that column's typical spread. 0 = exact duplicates."
                value={jitter} min={0} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={setJitter} />
            </div>
            {addRows > 0 && (
              <p className="tiny faint">
                ⚠️ Copies of real rows can end up in both the training and the test set, which makes scores look better than they really are. Use this to explore, not to report results.
              </p>
            )}
          </div>

          <div className="row between">
            <span className="small muted num">
              Result: {(dataset.n_rows + addRows).toLocaleString()} rows × {dataset.n_cols + features.length} columns
              {loading && <Spinner size={12} color="var(--accent)" />}
            </span>
            <button className="btn gradient" disabled={nothing || !valid || busy} onClick={combine}>
              {busy ? <Spinner size={14} /> : "🧬"} Create combined dataset
            </button>
          </div>
        </div>
      </Disclosure>
    </Glass>
  );
}
