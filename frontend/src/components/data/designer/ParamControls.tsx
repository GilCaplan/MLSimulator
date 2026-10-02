import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../../design/motion";
import { colorAt } from "../../../lib/colors";
import { Field, NumberField, Slider } from "../../glass";
import { normProbs, PARAM_META } from "./model";

/** Controls for one distribution's parameters. */
export function ParamControls({ dist, params, onChange }: { dist: string; params: Record<string, any>; onChange: (p: Record<string, any>) => void }) {
  if (dist === "categorical") return <CategoryEditor params={params} onChange={onChange} />;
  const meta = PARAM_META[dist] || {};
  const keys = Object.keys(meta).length ? Object.keys(meta) : Object.keys(params);
  const numbers = keys.filter((k) => meta[k]?.kind === "number");
  const sliders = keys.filter((k) => meta[k]?.kind !== "number");
  const set = (k: string, v: number) => onChange({ ...params, [k]: v });
  return (
    <div className="col" style={{ gap: 10 }}>
      {numbers.length > 0 && (
        <div className="row" style={{ gap: 10 }}>
          {numbers.map((k) => (
            <div key={k} className="col grow" style={{ gap: 4 }}>
              <span className="tiny muted">{meta[k]?.label ?? k}</span>
              <NumberField value={Number(params[k] ?? 0)} step={dist === "int_uniform" ? 1 : 0.1} onChange={(v) => set(k, dist === "int_uniform" ? Math.round(v) : v)} style={{ width: "100%" }} />
            </div>
          ))}
        </div>
      )}
      {sliders.map((k) => {
        const m = meta[k] ?? { label: k, kind: "slider", min: 0, max: 10 };
        return (
          <Slider key={k} label={<span className="small">{m.label}</span>} help={m.help} value={Number(params[k] ?? m.min ?? 0)}
            min={m.min ?? 0} max={m.max ?? 10} step={m.step} log={m.log} integer={m.integer} onChange={(v) => set(k, v)} />
        );
      })}
    </div>
  );
}

/** Editable category chips, each with a probability slider. */
function CategoryEditor({ params, onChange }: { params: Record<string, any>; onChange: (p: Record<string, any>) => void }) {
  const cats: string[] = params.categories ?? [];
  const probs: number[] = cats.map((_, i) => Number(params.probs?.[i] ?? 1 / Math.max(1, cats.length)));
  const shares = normProbs(probs);
  const set = (c: string[], p: number[]) => onChange({ ...params, categories: c, probs: p });
  const rename = (i: number, v: string) => set(cats.map((c, j) => (j === i ? v : c)), probs);
  const reweigh = (i: number, v: number) => set(cats, probs.map((p, j) => (j === i ? v : p)));
  const remove = (i: number) => set(cats.filter((_, j) => j !== i), probs.filter((_, j) => j !== i));
  const add = () => {
    let n = cats.length + 1, name = `cat_${n}`;
    while (cats.includes(name)) name = `cat_${++n}`;
    set([...cats, name], [...probs, 1 / Math.max(1, cats.length)]);
  };
  return (
    <Field label={<span className="small">Categories &amp; how common each is</span>}>
      <div className="col" style={{ gap: 8 }}>
        <AnimatePresence initial={false}>
          {cats.map((c, i) => (
            <motion.div key={i} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.snappy}
              className="row" style={{ gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: colorAt(i), flexShrink: 0 }} />
              <input className="input" value={c} onChange={(e) => rename(i, e.target.value)} style={{ width: 84, height: 28, fontSize: 12.5, padding: "0 8px" }} />
              <input type="range" className="slider" min={0} max={1000} value={Math.round(Math.min(1, probs[i]) * 1000)} style={{ ["--pct" as any]: `${Math.min(1, probs[i]) * 100}%`, flex: 1, minWidth: 40 }}
                onChange={(e) => reweigh(i, Math.max(0.001, Number(e.target.value) / 1000))} />
              <span className="num tiny muted" style={{ width: 32, textAlign: "right" }}>{Math.round(shares[i] * 100)}%</span>
              <button className="btn ghost sm icon" disabled={cats.length <= 1} onClick={() => remove(i)} title="Remove category">✕</button>
            </motion.div>
          ))}
        </AnimatePresence>
        <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={add} disabled={cats.length >= 20}>＋ Add category</button>
      </div>
    </Field>
  );
}
