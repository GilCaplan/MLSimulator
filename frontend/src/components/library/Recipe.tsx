import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { stagger } from "../../design/motion";
import type { FeatureStep, PipelineSpec, SavedModel } from "../../lib/types";
import { SplitBar } from "../charts";
import { Glass, InfoTip } from "../glass";
import { NetworkDiagram } from "../nn/NetworkDiagram";
import { diagramLayers, imageDims } from "../train/archLayers";
import { SectionTitle, isRecsysModel, isTextModel, rise, specFor, useRegistry } from "./shared";
import { textNetCaption } from "../train/textKit";

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

const UNSUP_GOAL: Record<string, [string, string, string]> = {
  clustering: ["🫧", "Find natural groups", "No target column — the model grouped similar rows on its own"],
  reduction: ["🗺️", "Draw a 2-D map", "No target column — the model folded every input onto a flat map"],
  anomaly: ["🚨", "Spot unusual rows", "No target column — the model learned what normal looks like and scores how unusual each row is"],
};

function pipelineSteps(p: PipelineSpec, m: SavedModel): Step[] {
  const steps: Step[] = [];
  const nIn = m.input_schema.length;
  const unsup = UNSUP_GOAL[m.task as string];
  const ignored = (p.drop_columns ?? []).filter((c) => c !== p.truth);
  steps.push(unsup ? {
    icon: unsup[0],
    title: unsup[1],
    text: <>{unsup[2]}, using {nIn} input{nIn === 1 ? "" : "s"}{ignored.length ? <> (ignored: {ignored.join(", ")})</> : null}.{p.truth ? <> The column <b>{p.truth}</b> was hidden from it and only used afterwards to check the result.</> : null}</>,
  } : {
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
      : <>Gaps in numbers were filled with {IMPUTE_NUM[p.impute?.numeric ?? "median"] ?? p.impute?.numeric}; gaps in categories with {p.impute?.categorical === "constant" ? "a “missing” label" : "the most common category"}.</>,
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
  if (unsup) {
    steps.push({ icon: "📚", title: "Every row used", text: "No train/test split: with no answers to check, there's no exam to hold rows back for. The model looked at all of them." });
  } else steps.push({
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
  if (unsup) return steps;
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

type Augment = NonNullable<PipelineSpec["image"]>["augment"];

/** Active augmentations in plain words. */
export function describeAugment(a: Augment | undefined): { icon: string; text: string }[] {
  if (!a) return [];
  const out: { icon: string; text: string }[] = [];
  if (a.flip_h) out.push({ icon: "↔️", text: "mirrored left–right" });
  if (a.flip_v) out.push({ icon: "↕️", text: "flipped upside down" });
  if (a.rotate) out.push({ icon: "🔄", text: `rotated up to ±${a.rotate}°` });
  if (a.shift) out.push({ icon: "✥", text: `shifted up to ${Math.round(a.shift * 100)}%` });
  if (a.brightness) out.push({ icon: "☀️", text: `brightness ±${Math.round(a.brightness * 100)}%` });
  if (a.cutout) out.push({ icon: "⬛", text: "a random square blanked out" });
  return out;
}

function imageSteps(p: PipelineSpec, m: SavedModel): Step[] {
  const img = { size: 32, grayscale: false, augment: {}, ...(p.image ?? {}) } as NonNullable<PipelineSpec["image"]>;
  const d = imageDims(m.image_shape);
  const size = d?.w ?? img.size;
  const grey = d ? d.c === 1 : img.grayscale;
  const aug = describeAugment(img.augment);
  const test = p.split?.test_size ?? 0.2, val = p.split?.val_size ?? 0.1;
  return [
    { icon: "🎯", title: m.task === "classification" ? "Sort pictures into classes" : `Predict a number from each picture`,
      text: m.task === "classification" ? <>Each picture belongs to one of {m.classes?.length ?? "several"} classes{m.classes?.length ? <>: {m.classes.join(", ")}</> : null}.</> : <>The model predicts “{m.target}” straight from the pixels.</> },
    { icon: "🔍", title: `Resize to ${size}×${size} pixels`, text: <>Every picture is centre-cropped to a square and shrunk to {size}×{size}. Smaller trains faster; larger keeps finer detail.</> },
    { icon: grey ? "◐" : "🎨", title: grey ? "Turned grey" : "Kept in colour", text: grey ? "Colour was dropped: one brightness value per pixel. Good when colour doesn't matter (like the shape of a digit)." : "Each pixel keeps its red, green and blue values — 3 numbers per pixel." },
    { icon: "🔢", title: "Pixels → numbers between 0 and 1", text: <>So the model sees {(size * size * (grey ? 1 : 3)).toLocaleString()} numbers per picture.</> },
    { icon: "✂️", title: "Split into train / validation / test",
      text: <>It learned from {Math.round((1 - test - val) * 100)}% of the pictures and was graded on {Math.round(test * 100)}% it never saw.</>,
      extra: (
        <div style={{ marginTop: 8, maxWidth: 420 }}>
          <SplitBar parts={[
            { label: "Train", value: Math.round((1 - test - val) * 100), color: "#0A84FF" },
            ...(val > 0 ? [{ label: "Validation", value: Math.round(val * 100), color: "#BF5AF2" }] : []),
            { label: "Test", value: Math.round(test * 100), color: "#FF9F0A" },
          ]} />
        </div>
      ) },
    { icon: "🪄", title: aug.length ? "Augmentation while training" : "No augmentation", off: !aug.length || m.family !== "torch",
      text: aug.length
        ? m.family === "torch"
          ? "Every time it studied a training picture, it saw a slightly changed copy — so it learns the object, not one exact pose. New pictures are never altered."
          : "Augmentation was switched on, but only neural networks use it — this classic model saw the pictures as they are."
        : "Training pictures were used exactly as they are.",
      extra: aug.length ? (
        <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
          {aug.map((a) => <span key={a.text} className="badge">{a.icon} {a.text}</span>)}
        </div>
      ) : undefined },
  ];
}

function textSteps(p: PipelineSpec, m: SavedModel): Step[] {
  const t = { text_column: null, ngram_max: 1, max_features: 3000, min_df: 2, max_len: 40, ...(p.text ?? {}) } as NonNullable<PipelineSpec["text"]>;
  const col = m.text_column ?? t.text_column ?? m.input_schema[0]?.name ?? "text";
  const neural = m.family === "torch";
  const test = p.split?.test_size ?? 0.2, val = p.split?.val_size ?? 0;
  const pairs = t.ngram_max >= 2;
  return [
    { icon: "🎯", title: `Predict “${m.target}” from text`,
      text: <>The model reads the <b>{col}</b> column{m.classes?.length ? <> and sorts each message into one of {m.classes.length} answers: {m.classes.join(", ")}</> : null}.</> },
    { icon: "✂️", title: "Split into words",
      text: <>Each message is lower-cased and chopped into words (“Not GOOD!” → <span className="mono">not</span> · <span className="mono">good</span>). Punctuation is dropped.</> },
    neural
      ? { icon: "📏", title: `Up to ${t.max_len} words per message`,
          text: <>The network reads at most the first {t.max_len} words, in order. Longer messages are cut; shorter ones are padded with blanks it learns to ignore.</> }
      : { icon: pairs ? "🔗" : "🔤", title: pairs ? "Count words and word pairs" : "Count single words",
          text: pairs
            ? <>Each message becomes counts of its words <i>and</i> neighbouring pairs, so “not good” is its own clue — not just “not” plus “good”.</>
            : <>Each message becomes a bag of word counts. Order is lost: “not good” and “good, not” look the same.</>,
          extra: (
            <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
              <span className="badge">not</span><span className="badge">good</span>
              {pairs && <span className="badge accent">not · good</span>}
            </div>
          ) },
    { icon: "📖", title: `Vocabulary: up to ${t.max_features.toLocaleString()} ${neural ? "words" : pairs ? "words & pairs" : "words"}`,
      text: <>Only {neural ? "words" : "words and pairs"} seen in at least {t.min_df} training messages are kept{!neural && m.feature_names.length ? <> — {m.feature_names.length.toLocaleString()} made the cut</> : null}. Anything else is invisible to the model.</> },
    ...(!neural ? [{ icon: "⚖️", title: "Rare words weigh more (TF-IDF)", text: "Words that appear in almost every message (like “the”) are turned down; distinctive ones are turned up." }] : []),
    { icon: "🧪", title: "Split into train / validation / test",
      text: <>It learned from {Math.round((1 - test - val) * 100)}% of the messages and was graded on {Math.round(test * 100)}% it never saw.</>,
      extra: (
        <div style={{ marginTop: 8, maxWidth: 420 }}>
          <SplitBar parts={[
            { label: "Train", value: Math.round((1 - test - val) * 100), color: "#0A84FF" },
            ...(val > 0 ? [{ label: "Validation", value: Math.round(val * 100), color: "#BF5AF2" }] : []),
            { label: "Test", value: Math.round(test * 100), color: "#FF9F0A" },
          ]} />
        </div>
      ) },
  ];
}

function recsysSteps(p: PipelineSpec, m: SavedModel): Step[] {
  const rc = { min_user: 5, min_item: 2, positive: 4, test_k: 3, split: "leave_last_out" as const, ...(p.recsys ?? {}) };
  const cols = { user: "user", item: "item", rating: "rating", time: null as string | null, ...(p.columns ?? {}) };
  const fallback = m.params?.cold_start === "popularity";
  const stars = (n: number) => "★".repeat(Math.max(0, Math.min(5, Math.round(n))));
  return [
    { icon: "🎬", title: "Who rated what",
      text: <>Each row is one rating: viewer <b>{cols.user}</b> gave item <b>{cols.item}</b> a score in <b>{cols.rating}</b>{cols.time ? <>, at time <b>{cols.time}</b></> : null}. Together they form a huge, mostly empty grid of viewers × films.</> },
    { icon: "🧹", title: `Filter: viewers with ≥ ${rc.min_user} ratings, films with ≥ ${rc.min_item}`,
      text: "Viewers and films with almost no ratings carry too little signal to learn from, so they were dropped (a few rounds, since removing one can push the other under the bar)." },
    { icon: "❤️", title: `“Liked” means ${rc.positive}+ stars`,
      text: <>A rating of <span style={{ color: "#FFB800" }}>{stars(rc.positive)}</span> or more counts as a film the viewer liked. Only liked films count as hits — recommending something they'd rate 2 stars isn't a success.</> },
    { icon: "🙈", title: `Hide each viewer's ${rc.test_k} ${rc.split === "leave_last_out" ? "most recent" : "random"} ratings`,
      text: rc.split === "leave_last_out"
        ? "Their latest ratings were held back as the exam: just like real life, the model must predict what they'll watch next from what they watched before."
        : "A few random ratings per viewer were held back as the exam.",
      extra: (
        <div className="row" style={{ gap: 3, marginTop: 8 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} style={{ width: 16, height: 22, borderRadius: 4, background: i >= 10 - rc.test_k ? "#FF9F0A" : "#0A84FF", opacity: i >= 10 - rc.test_k ? 0.9 : 0.55 }} title={i >= 10 - rc.test_k ? "hidden for the exam" : "used for learning"} />
          ))}
          <span className="tiny faint" style={{ marginLeft: 6 }}>learn → <span style={{ color: "#FF9F0A", fontWeight: 600 }}>exam</span></span>
        </div>
      ) },
    { icon: "🔟", title: "Grade: 10 picks per viewer",
      text: "For every viewer, films they'd already rated are skipped and the 10 highest-scoring ones become their list. Recall@10 counts how many of their hidden favourites made it." },
    { icon: "🛟", title: fallback ? `New viewers: popular picks until ${m.params?.cold_start_min ?? 5} ratings` : "No special treatment for new viewers",
      text: fallback ? "Viewers with very few ratings get the crowd favourites instead of a shaky personal guess — the classic cure for the cold-start problem." : "Even a viewer with one rating gets a fully personal list. Turn on the popularity fallback in the model's settings to help brand-new viewers.",
      off: !fallback },
  ];
}

/** "Recipe": the model's settings, its network (if any) and the data-prep steps that feed it. */
export function Recipe({ model }: { model: SavedModel }) {
  const registry = useRegistry();
  const spec = specFor(registry, model.model_id);
  const arch = model.nn_arch ?? (model.family === "torch" ? spec?.default_arch : null);
  const params = spec
    ? spec.params.map((hp) => ({ name: hp.name, label: hp.label, help: hp.help, value: model.params?.[hp.name] ?? hp.default, changed: model.params?.[hp.name] !== undefined && model.params[hp.name] !== hp.default }))
    : Object.entries(model.params ?? {}).map(([k, v]) => ({ name: k, label: k, help: "", value: v, changed: true }));
  const isImage = model.modality === "image";
  const isText = isTextModel(model);
  const isRec = isRecsysModel(model);
  const steps = model.pipeline ? (isRec ? recsysSteps(model.pipeline, model) : isImage ? imageSteps(model.pipeline, model) : isText ? textSteps(model.pipeline, model) : pipelineSteps(model.pipeline, model)) : [];
  const dims = imageDims(model.image_shape);
  const nOut = model.task === "classification" ? model.classes?.length ?? 2 : 1;

  return (
    <motion.section variants={rise}>
      <SectionTitle id="recipe" icon="📜" title="Recipe" subtitle="Everything that went into this model: how the data was prepared and which settings the algorithm used." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16, alignItems: "start" }}>
        <Glass>
          <h3 style={{ marginBottom: 4 }}>Data preparation</h3>
          <p className="small muted" style={{ marginBottom: 14 }}>{isRec ? "How the ratings were turned into a fair exam for the recommender." : "The exact same steps run automatically on every new example you predict."}</p>
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
              <p className="small muted" style={{ marginBottom: 6 }}>{isImage ? "Information flows left to right: the picture, through layers of pattern-detecting filters, to the answer." : isText ? textNetCaption(arch) : "Information flows left to right: your inputs, through the hidden layers, to the answer."}</p>
              <NetworkDiagram layers={diagramLayers(arch, model.feature_names.length, nOut, model.image_shape, model.pipeline?.text?.max_len ?? 40)} height={240} />
            </Glass>
          )}

          {isRec ? (
            <Glass>
              <h3 style={{ marginBottom: 10 }}>What it needs</h3>
              <div className="row" style={{ gap: 14 }}>
                <span style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🍿</span>
                <div className="col" style={{ gap: 4 }}>
                  <b>A known viewer — or a few star ratings</b>
                  <span className="small muted" style={{ lineHeight: 1.5 }}>
                    Name a viewer it learned from and it recalls their whole history. Or describe a brand-new viewer with a handful of 1–5 star ratings{model.model_id === "popularity" ? " (this model ignores them: everyone gets the same hits)" : model.model_id === "item_knn" ? " — it recommends neighbours of the films you liked" : " — it works out their taste from those ratings"}.
                  </span>
                </div>
              </div>
            </Glass>
          ) : isText ? (
            <Glass>
              <h3 style={{ marginBottom: 10 }}>Text it expects</h3>
              <div className="row" style={{ gap: 14 }}>
                <span style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>💬</span>
                <div className="col" style={{ gap: 4 }}>
                  <b>One column of free text{model.text_column ? <> · <span className="mono">{model.text_column}</span></> : null}</b>
                  <span className="small muted" style={{ lineHeight: 1.5 }}>
                    Any sentence in plain language. {model.family === "torch" ? `Only the first ${model.pipeline?.text?.max_len ?? 40} words are read.` : "Words it never saw in training are simply ignored."}
                  </span>
                </div>
              </div>
            </Glass>
          ) : isImage ? (
            <Glass>
              <h3 style={{ marginBottom: 10 }}>Pictures it expects</h3>
              <div className="row" style={{ gap: 14 }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0, backgroundImage: "linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)", backgroundSize: "8px 8px", border: "1px solid var(--hairline)" }} />
                <div className="col" style={{ gap: 4 }}>
                  <b>{dims ? `${dims.w}×${dims.h} pixels · ${dims.c === 1 ? "grey" : "colour"}` : "Any picture"}</b>
                  <span className="small muted" style={{ lineHeight: 1.5 }}>Any picture works — PNG, JPG, a drawing. It's cropped to a square and resized automatically.</span>
                </div>
              </div>
            </Glass>
          ) : (
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
          )}
        </div>
      </div>
    </motion.section>
  );
}
