import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { stagger } from "../../design/motion";
import type { FeatureStep, PipelineSpec, SavedModel } from "../../lib/types";
import { SplitBar } from "../charts";
import { Glass, InfoTip } from "../glass";
import { NetworkDiagram, archToLayers } from "../nn/NetworkDiagram";
import { SectionTitle, rise, specFor, useRegistry } from "./shared";

const OVER: Record<string, string> = { random: "random copies", smote: "SMOTE", borderline_smote: "Borderline-SMOTE", adasyn: "ADASYN", svm_smote: "SVM-SMOTE" };
const UNDER: Record<string, string> = { random: "random removal", nearmiss: "NearMiss", cluster_centroids: "Cluster centroids" };
const CLEAN: Record<string, string> = { none: "", tomek: "Tomek links", enn: "Edited nearest neighbours (ENN)" };
const IMPUTE_NUM: Record<string, string> = { median: "the middle value (median)", mean: "the average", most_frequent: "the most common value", zero: "zero", drop_rows: "dropping those rows" };
const SCALE: Record<string, [string, string]> = {
  none: ["No scaling", "Numbers were used as they are."],
  standard: ["Standardised", "Every number was shifted and stretched so it averages 0 with a spread of 1."],
  minmax: ["Min–max scaled", "Every number was squeezed into the 0…1 range."],
  robust: ["Robust scaled", "Scaled using the median and quartiles, so outliers don't distort it."],
};

const PART: Record<string, string> = { year: "year", month: "month", day: "day of month", weekday: "weekday", hour: "hour", dayofyear: "day of year", is_weekend: "weekend?" };

/** One engineered feature in plain words: its new column name and how it is computed. */
export function describeFeature(f: FeatureStep): { name: string; how: string; icon: string } {
  const a = f.a ?? f.column ?? "?", b = f.b ?? "?";
  switch (f.op) {
    case "date_parts": return { icon: "📅", name: (f.parts ?? []).map((p) => `${f.column}_${p}`).join(", ") || `${f.column} parts`, how: `${(f.parts ?? []).map((p) => PART[p] ?? p).join(", ")} taken from the date “${f.column}”${f.drop_source ? " (the raw date is then dropped)" : ""}` };
    case "ratio": return { icon: "➗", name: f.name ?? `${a}_per_${b}`, how: `${a} ÷ ${b}` };
    case "product": return { icon: "✖️", name: f.name ?? `${a}_x_${b}`, how: `${a} × ${b}` };
    case "difference": return { icon: "➖", name: f.name ?? `${a}_minus_${b}`, how: `${a} − ${b}` };
    case "log": return { icon: "📉", name: f.name ?? `log_${a}`, how: `log(1 + ${a}) — tames very large values` };
    case "power": return { icon: "⤴️", name: f.name ?? `${a}_pow`, how: `${a} to the power ${f.p ?? 2}` };
    case "bin": return { icon: "🗂️", name: f.name ?? `${a}_bin`, how: `${a} sorted into ${f.bins ?? 4} buckets` };
    case "formula": return { icon: "🧮", name: f.name ?? "formula", how: f.expr ?? "custom formula" };
    default: return { icon: "✨", name: f.name ?? String(f.op), how: String(f.op) };
  }
}

interface Step { icon: string; title: string; text: ReactNode; extra?: ReactNode; off?: boolean }

function pipelineSteps(p: PipelineSpec, m: SavedModel): Step[] {
  const steps: Step[] = [];
  const nIn = m.input_schema.length;
  steps.push({
    icon: "🎯",
    title: `Predict “${m.target}”`,
    text: <>A {m.task} problem using {nIn} input{nIn === 1 ? "" : "s"}{p.drop_columns?.length ? <> (ignored: {p.drop_columns.join(", ")})</> : null}.</>,
  });
  if (p.dedupe?.enabled) {
    steps.push({ icon: "👯", title: "Remove duplicate rows", text: "Exact copies of a row were dropped first, so the same example can't sit in both the training and the test rows (that would flatter the score)." });
  }
  const feats = p.features ?? [];
  if (feats.length) {
    steps.push({
      icon: "✨",
      title: `Engineer ${feats.length} new feature${feats.length === 1 ? "" : "s"}`,
      text: "New columns were computed from the raw ones — often the single biggest boost for a simple model.",
      extra: (
        <div className="col" style={{ gap: 5, marginTop: 6 }}>
          {feats.map((f, i) => {
            const d = describeFeature(f);
            return (
              <div key={i} className="inset row" style={{ gap: 8, padding: "6px 10px", alignItems: "flex-start" }}>
                <span>{d.icon}</span>
                <span className="col" style={{ gap: 1, minWidth: 0 }}>
                  <b className="mono" style={{ fontSize: 12 }}>{d.name}</b>
                  <span className="tiny muted" style={{ lineHeight: 1.4 }}>= {d.how}</span>
                </span>
              </div>
            );
          })}
        </div>
      ),
    });
  }
  steps.push({
    icon: "🩹",
    title: "Fill in missing values",
    text: p.impute?.numeric === "drop_rows"
      ? "Rows with missing numbers were dropped."
      : <>Gaps in numbers were filled with {IMPUTE_NUM[p.impute?.numeric] ?? p.impute?.numeric}; gaps in categories with {p.impute?.categorical === "constant" ? "a “missing” label" : "the most common category"}.</>,
  });
  steps.push({
    icon: "🔤",
    title: p.encode?.method === "ordinal" ? "Categories → numbers (ordinal)" : "Categories → yes/no columns (one-hot)",
    text: p.encode?.method === "ordinal"
      ? "Each category got its own number."
      : <>Each category became its own 0/1 column (up to {p.encode?.max_categories ?? 20} per input; rarer ones were grouped).</>,
  });
  steps.push({
    icon: "🚫",
    title: p.outliers?.enabled ? "Remove outliers" : "Outliers kept",
    off: !p.outliers?.enabled,
    text: p.outliers?.enabled
      ? p.outliers.method === "iqr"
        ? <>Rows far outside the typical range (beyond {p.outliers.factor}× the inter-quartile range) were removed from training.</>
        : <>Rows more than {p.outliers.factor} standard deviations from the average were removed from training.</>
      : "Every row was kept, even unusual ones.",
  });
  const test = p.split?.test_size ?? 0.2, val = p.split?.val_size ?? 0;
  steps.push({
    icon: "✂️",
    title: p.split?.method === "group" ? "Split by group into train / validation / test" : p.split?.method === "time" ? "Split by time: past → train, future → test" : "Split into train / validation / test",
    text: <>
      The model learned from {Math.round((1 - test - val) * 100)}% of the rows and was graded on {Math.round(test * 100)}% it never saw
      {p.split?.method === "group" && p.split.group_column
        ? <>. Rows were kept together by <b>{p.split.group_column}</b>: every {p.split.group_column} sits entirely on one side, so the test really is about new ones.</>
        : p.split?.method === "time" && p.split.time_column
          ? <>. Rows were ordered by <b>{p.split.time_column}</b>: it learned from the past and was tested on the most recent rows — just like real life.</>
          : <>{p.split?.stratify && m.task === "classification" ? ", picked at random while keeping the class mix the same in each part" : ", picked at random"}.</>}
    </>,
    extra: (
      <div style={{ marginTop: 8, maxWidth: 420 }}>
        <SplitBar parts={[
          { label: "Train", value: Math.round((1 - test - val) * 100), color: "#0A84FF" },
          ...(val > 0 ? [{ label: "Validation", value: Math.round(val * 100), color: "#BF5AF2" }] : []),
          { label: "Test", value: Math.round(test * 100), color: "#FF9F0A" },
        ]} />
      </div>
    ),
  });
  const sc = SCALE[p.scale?.method ?? "none"] ?? SCALE.none;
  steps.push({ icon: "📏", title: sc[0], text: sc[1], off: p.scale?.method === "none" });
  const fs = p.feature_select ?? { method: "none", k: 10 };
  steps.push({
    icon: "🔍",
    title: fs.method === "none" ? "All features used" : "Keep only the most useful features",
    off: fs.method === "none",
    text: fs.method === "none" ? "No features were filtered out."
      : fs.method === "kbest" ? `Kept the ${fs.k} features most related to the target (statistical test).`
      : fs.method === "mutual_info" ? `Kept the ${fs.k} features sharing the most information with the target.`
      : fs.method === "variance" ? `Dropped features that barely change${fs.threshold != null ? ` (variance below ${fs.threshold})` : ""}.`
      : `Kept the features a quick helper model found most important${fs.k ? ` (up to ${fs.k})` : ""}.`,
  });
  if (m.task === "classification") {
    const r = { ...{ mode: "none", over: "smote", under: "random", clean: "none", k_neighbors: 5 }, ...((p.resample ?? {}) as Partial<PipelineSpec["resample"]>) } as PipelineSpec["resample"];
    const clean = CLEAN[r.clean ?? "none"];
    const parts: string[] = [];
    if (r.mode === "oversample" || r.mode === "middle" || r.mode === "custom") parts.push(`created extra examples of rarer classes with ${OVER[r.over] ?? r.over}`);
    if (r.mode === "undersample" || r.mode === "middle" || r.mode === "custom") parts.push(`trimmed common classes with ${UNDER[r.under] ?? r.under}`);
    if (clean) parts.push(`cleaned the class borders with ${clean}`);
    steps.push({
      icon: "⚖️",
      title: r.mode === "none" ? "Classes left as they were" : "Balance the classes",
      off: r.mode === "none" && !clean,
      text: r.mode === "none" && !clean ? "No resampling — the training data kept its natural class mix."
        : <>Training data only: {parts.join(", then ")}.{r.mode === "custom" && r.target_counts ? <> Targets: {Object.entries(r.target_counts).map(([k, v]) => `${k} → ${v}`).join(", ")}.</> : null}</>,
    });
  } else {
    steps.push({
      icon: "📈",
      title: p.target_transform === "log1p" ? "Target log-transformed" : "Target used as-is",
      off: p.target_transform !== "log1p",
      text: p.target_transform === "log1p" ? "The model learned on log(1 + target) to tame very large values; predictions are converted back automatically." : "No transformation of the target.",
    });
  }
  return steps;
}

/** "Recipe": the model's settings, its network (if any) and the data-prep steps that feed it. */
export function Recipe({ model }: { model: SavedModel }) {
  const registry = useRegistry();
  const spec = specFor(registry, model.model_id);
  const arch = model.nn_arch ?? (model.family === "torch" ? spec?.default_arch : null);
  const params = spec
    ? spec.params.map((hp) => ({ name: hp.name, label: hp.label, help: hp.help, value: model.params?.[hp.name] ?? hp.default, changed: model.params?.[hp.name] !== undefined && model.params[hp.name] !== hp.default }))
    : Object.entries(model.params ?? {}).map(([k, v]) => ({ name: k, label: k, help: "", value: v, changed: true }));
  const steps = model.pipeline ? pipelineSteps(model.pipeline, model) : [];
  const nOut = model.task === "classification" ? model.classes?.length ?? 2 : 1;

  return (
    <motion.section variants={rise}>
      <SectionTitle id="recipe" icon="📜" title="Recipe" subtitle="Everything that went into this model: how the data was prepared and which settings the algorithm used." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
        <Glass>
          <h3 style={{ marginBottom: 4 }}>Data preparation</h3>
          <p className="small muted" style={{ marginBottom: 14 }}>The exact same steps run automatically on every new example you predict.</p>
          <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 16, top: 20, bottom: 20, width: 2, background: "var(--hairline)", borderRadius: 2 }} />
          <motion.ol variants={stagger(0.05)} initial="hidden" whileInView="show" viewport={{ once: true }} style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
            {steps.map((s, i) => (
              <motion.li key={i} variants={rise} className="row" style={{ gap: 12, alignItems: "flex-start", padding: "7px 0", opacity: s.off ? 0.62 : 1 }}>
                <span style={{ width: 34, height: 34, borderRadius: 11, background: s.off ? "var(--fill)" : "var(--glass-strong)", border: "1px solid var(--glass-border)", boxShadow: s.off ? undefined : "0 2px 8px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, position: "relative" }}>
                  {s.icon}
                </span>
                <div className="col grow" style={{ gap: 2, paddingTop: 2 }}>
                  <b style={{ fontSize: 13.5 }}>{s.title}</b>
                  <span className="small muted" style={{ lineHeight: 1.5 }}>{s.text}</span>
                  {s.extra}
                </div>
              </motion.li>
            ))}
          </motion.ol>
          </div>
        </Glass>

        <div className="col" style={{ gap: 16 }}>
          <Glass>
            <div className="row between" style={{ marginBottom: 12 }}>
              <h3 className="row" style={{ gap: 8 }}>{spec?.emoji ?? "⚙️"} {model.label} settings</h3>
              <span className="tiny faint">{params.filter((p) => p.changed).length} changed from default</span>
            </div>
            {params.length === 0 ? (
              <p className="small muted">This model has no adjustable settings.</p>
            ) : (
              <div className="inset" style={{ padding: 0, overflow: "hidden" }}>
                <table className="table">
                  <tbody>
                    {params.map((p) => (
                      <tr key={p.name}>
                        <td style={{ whiteSpace: "normal" }}>
                          <span className="row" style={{ gap: 6 }}>{p.label}{p.help && <InfoTip text={p.help} />}</span>
                        </td>
                        <td className="num mono" style={{ textAlign: "right", fontWeight: p.changed ? 650 : 400, color: p.changed ? "var(--accent)" : "var(--text-2)" }}>
                          {typeof p.value === "boolean" ? (p.value ? "on" : "off") : p.value === null || p.value === undefined ? "auto" : String(p.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Glass>

          {arch && (
            <Glass>
              <div className="row between" style={{ marginBottom: 6 }}>
                <h3>🧠 Network architecture</h3>
                {model.n_params != null && <span className="badge accent">{model.n_params.toLocaleString()} parameters</span>}
              </div>
              <p className="small muted" style={{ marginBottom: 6 }}>Information flows left to right: your inputs, through the hidden layers, to the answer.</p>
              <NetworkDiagram layers={archToLayers(arch, model.feature_names.length, nOut)} height={240} />
            </Glass>
          )}

          <Glass>
            <h3 style={{ marginBottom: 10 }}>Inputs it expects</h3>
            <div className="row wrap" style={{ gap: 6 }}>
              {model.input_schema.map((s) => (
                <span key={s.name} className="badge" title={s.type === "categorical" ? (s.categories ?? []).join(", ") : s.type === "datetime" ? `date & time, e.g. ${s.example ?? "—"}` : `${s.min} … ${s.max}`}>
                  {s.type === "categorical" ? "🔤" : s.type === "datetime" ? "📅" : s.binary ? "◐" : "🔢"} {s.name}
                </span>
              ))}
            </div>
            {model.feature_names.length !== model.input_schema.length && (
              <p className="tiny faint" style={{ marginTop: 10 }}>After preparation these become {model.feature_names.length} numeric columns the model actually sees.</p>
            )}
          </Glass>
        </div>
      </div>
    </motion.section>
  );
}
