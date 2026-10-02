import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { stagger } from "../../design/motion";
import { classColor } from "../../lib/colors";
import { fmt, pct } from "../../lib/format";
import type { SavedModel, Task } from "../../lib/types";
import { BarList, ConfusionMatrix, DecisionSurface, LineChart, ResidualPlot, RocChart, type Series } from "../charts";
import { Glass, InfoTip, Segmented } from "../glass";
import { Calibration } from "../train/Calibration";
import { ErrorAnalysis } from "../train/Mistakes";
import { VisionFilters } from "../train/VisionFilters";
import { VisionGallery } from "../train/VisionGallery";
import { VisionLooks } from "../train/VisionLooks";
import { TextExplain, TextMistakes, TextWords } from "../train/TextViews";
import { UnsupMetricTiles, UnsupViews } from "../train/unsup/UnsupViews";
import { RecsysTiles, RecsysViews } from "../train/recsys/RecsysViews";
import { ForecastTiles, ForecastViews } from "../train/forecast/ForecastViews";
import { lastSeason, masePhrase, stepsText } from "../train/forecast/fcKit";
import { MetricTiles, SectionTitle, isForecastModel, isRecsysModel, isUnsupModel, rise } from "./shared";

function ChartCard({ title, help, caption, children, wide }: { title: string; help?: string; caption?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <motion.div variants={rise} className="inset" style={{ padding: 16, gridColumn: wide ? "1 / -1" : undefined, minWidth: 0 }}>
      <div className="row" style={{ gap: 6, marginBottom: 4 }}>
        <h4>{title}</h4>
        {help && <InfoTip text={help} />}
      </div>
      {caption && <p className="small muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>{caption}</p>}
      {children}
    </motion.div>
  );
}

/** Clustering / map / anomaly models: headline numbers and the same task tabs as on the Train results. */
function UnsupPerformance({ model }: { model: SavedModel }) {
  const task = model.task as string;
  const metrics = model.metrics?.test ?? {};
  return (
    <motion.section variants={rise}>
      <SectionTitle
        id="performance"
        icon="🔍"
        title="What it found"
        subtitle={task === "clustering"
          ? "The groups it discovered, what makes each one different and — if you kept a hidden truth column — how well they match reality."
          : task === "anomaly"
            ? "How it scored the training rows, which ones it flagged and how well that matched the real anomalies."
            : "The map it drew of your data and how honestly it keeps real neighbours together."}
      />
      <Glass>
        <div className="col" style={{ gap: 18 }}>
          <UnsupMetricTiles task={task} metrics={metrics} />
          <div className="row wrap tiny faint" style={{ gap: 14 }}>
            {model.fit_time_s != null && <span>⏱ found in {model.fit_time_s < 1 ? `${Math.round(model.fit_time_s * 1000)} ms` : `${model.fit_time_s.toFixed(1)} s`}</span>}
            {model.dataset?.n_rows != null && <span>📊 {model.dataset.n_rows.toLocaleString()} rows in the dataset</span>}
            {model.pipeline?.truth && <span>🙈 hidden truth column: {model.pipeline.truth}</span>}
          </div>
          <UnsupViews task={task} detail={model.detail ?? {}} metrics={metrics} modelId={model.model_id} height={340} />
        </div>
      </Glass>
    </motion.section>
  );
}

/** Recommenders: headline numbers and the same tabs as on the Train results (example viewers, long tail, taste map). */
function RecsysPerformance({ model }: { model: SavedModel }) {
  const metrics = model.metrics?.test ?? {};
  return (
    <motion.section variants={rise}>
      <SectionTitle id="performance" icon="🏆" title="How its lists did"
        subtitle="We hid each viewer's most recent ratings, asked for 10 picks, and counted how many of the films they really liked made the list — plus how much of the catalogue ever got a chance." />
      <Glass>
        <div className="col" style={{ gap: 18 }}>
          <RecsysTiles metrics={metrics} />
          <div className="row wrap tiny faint" style={{ gap: 14 }}>
            {model.fit_time_s != null && <span>⏱ learned in {model.fit_time_s < 1 ? `${Math.round(model.fit_time_s * 1000)} ms` : `${model.fit_time_s.toFixed(1)} s`}</span>}
            {metrics.users_evaluated ? <span>👥 tested on {Math.round(metrics.users_evaluated).toLocaleString()} viewers</span> : null}
            {model.dataset?.n_rows != null && <span>⭐ {model.dataset.n_rows.toLocaleString()} ratings in the dataset</span>}
          </div>
          <RecsysViews detail={model.detail ?? {}} metrics={metrics} modelId={model.model_id} height={360} />
        </div>
      </Glass>
    </motion.section>
  );
}

/** Forecasters: the MAE / MASE headline (vs "same as last season") and the same tabs as on the Train results. */
function ForecastPerformance({ model }: { model: SavedModel }) {
  const metrics = model.metrics?.test ?? {};
  const fc = model.detail?.forecast;
  const unit = fc?.unit ?? "day";
  const mp = masePhrase(metrics.mase, unit);
  const random = fc?.split === "random";
  return (
    <motion.section variants={rise}>
      <SectionTitle id="performance" icon="🏆" title="How its forecasts did"
        subtitle={random
          ? "Tested with a random split: single days scattered between training days, guessed one step ahead. These scores flatter it — a real forecast runs ahead on its own guesses."
          : `We hid the last ${stepsText(fc?.horizon ?? metrics.horizon ?? 0, unit)} of the series and asked for a forecast of all of it — one guess feeding the next — then compared it with what really happened.`} />
      <Glass>
        <div className="col" style={{ gap: 18 }}>
          {mp && (
            <div className="inset row" style={{ gap: 12, padding: "12px 14px", alignItems: "center", borderColor: mp.good ? "color-mix(in srgb, var(--success) 45%, transparent)" : "color-mix(in srgb, var(--warning) 45%, transparent)" }}>
              <span style={{ fontSize: 26 }}>{mp.good ? "📉" : "⚠️"}</span>
              <span className="small" style={{ lineHeight: 1.5 }}>
                <b>Off by {metrics.mae !== undefined ? (Math.abs(metrics.mae) >= 100 ? Math.round(metrics.mae).toLocaleString() : fmt(metrics.mae, 1)) : "—"} {fc?.value_name ?? ""} per {unit} on average</b>
                <span className="muted"> — {mp.text} (MASE {metrics.mase?.toFixed(2)}). {mp.good ? "It has learned more than the repeating rhythm." : `A forecaster should beat “${lastSeason(unit)}” to be worth using.`}</span>
              </span>
            </div>
          )}
          <ForecastTiles metrics={metrics} fc={fc} />
          <div className="row wrap tiny faint" style={{ gap: 14 }}>
            {model.fit_time_s != null && <span>⏱ learned in {model.fit_time_s < 1 ? `${Math.round(model.fit_time_s * 1000)} ms` : `${model.fit_time_s.toFixed(1)} s`}</span>}
            {model.dataset?.n_rows != null && <span>📊 {model.dataset.n_rows.toLocaleString()} rows in the dataset</span>}
            {fc && fc.series.length > 1 && <span>📚 {fc.series.length} series</span>}
          </div>
          <ForecastViews detail={model.detail ?? {}} metrics={metrics} height={320} />
        </div>
      </Glass>
    </motion.section>
  );
}

/** "How it performed": test scores and the evaluation charts saved with the model. */
export function Performance({ model }: { model: SavedModel }) {
  if (isForecastModel(model)) return <ForecastPerformance model={model} />;
  if (isRecsysModel(model)) return <RecsysPerformance model={model} />;
  if (isUnsupModel(model)) return <UnsupPerformance model={model} />;
  return <SupervisedPerformance model={model} />;
}

function SupervisedPerformance({ model }: { model: SavedModel }) {
  const d = model.detail ?? {};
  const isCls = model.task === "classification";
  const test = model.metrics?.test ?? {};
  const imp = d.importance;
  const impIdx = imp ? imp.names.map((_, i) => i).sort((a, b) => Math.abs(imp.values[b]) - Math.abs(imp.values[a])).slice(0, 12) : [];
  const curve = d.curve;
  const pts = curve?.points ?? [];
  const hasLoss = pts.some((p) => p.train_loss != null || p.val_loss != null);
  const series: Series[] = hasLoss
    ? [
        { name: "Training loss", color: "#0A84FF", points: pts.map((p) => ({ x: p.step, y: p.train_loss })) },
        { name: "Validation loss", color: "#FF375F", points: pts.map((p) => ({ x: p.step, y: p.val_loss })), dashed: true },
      ]
    : [
        { name: "Training score", color: "#0A84FF", points: pts.map((p) => ({ x: p.step, y: p.train_score })) },
        { name: "Validation score", color: "#30D158", points: pts.map((p) => ({ x: p.step, y: p.val_score })), dashed: true },
      ];
  const bestEpoch = curve?.best_epoch ?? (d.notes?.best_epoch as number | undefined);

  return (
    <motion.section variants={rise}>
      <SectionTitle
        id="performance"
        icon="🏆"
        title="How it performed"
        subtitle="These scores come from the test set — examples the model never saw while learning — so they're a fair preview of how it does on new data."
      />
      <Glass>
        <div className="col" style={{ gap: 18 }}>
          <MetricTiles metrics={test} train={model.metrics?.train} />
          <div className="row wrap tiny faint" style={{ gap: 14 }}>
            {model.fit_time_s != null && <span>⏱ trained in {model.fit_time_s < 1 ? `${Math.round(model.fit_time_s * 1000)} ms` : `${model.fit_time_s.toFixed(1)} s`}</span>}
            {model.dataset?.n_rows != null && <span>📊 {model.dataset.n_rows.toLocaleString()} {model.modality === "image" ? "pictures" : d.text ? "texts" : "rows"} in the dataset</span>}
            {model.n_params != null && <span>🧮 {model.n_params.toLocaleString()} learnable numbers</span>}
            {d.cv && <span>🔁 cross-validation {d.cv.metric}: {fmt(d.cv.mean)} ± {fmt(d.cv.std)}</span>}
          </div>

          <motion.div variants={stagger(0.06)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 14 }}>
            {isCls && d.confusion && (
              <ChartCard title="Right vs wrong" caption="Each row is the true answer, each column what the model guessed. Green diagonal = correct.">
                <ConfusionMatrix labels={d.confusion.labels} matrix={d.confusion.matrix} />
              </ChartCard>
            )}
            {isCls && d.roc && d.roc.length > 0 && (
              <ChartCard title="ROC curve" help="Shows the trade-off between catching real positives (up) and raising false alarms (right) as the decision threshold moves. The more the curve hugs the top-left, the better." caption="Higher and further left is better; the dashed diagonal is random guessing.">
                <RocChart curves={d.roc} height={240} />
              </ChartCard>
            )}
            {!isCls && d.residuals?.points?.length ? (
              <ChartCard title="Predicted vs actual" caption="Each dot is a test example. Dots on the dashed line were predicted perfectly; the further away, the bigger the miss.">
                <ResidualPlot points={d.residuals.points} height={260} />
              </ChartCard>
            ) : null}
            {imp && impIdx.length > 0 && (
              <ChartCard title="What it pays attention to" help={`Measured by ${imp.method}. Bars near zero barely matter; negative bars mean shuffling that input slightly helped (it's noise).`} caption="Inputs ranked by how much the model's accuracy suffers when that input is scrambled.">
                <BarList labels={impIdx.map((i) => imp.names[i])} values={impIdx.map((i) => imp.values[i])} format={(v) => fmt(v, 3)} colors={impIdx.map((i) => (imp.values[i] < 0 ? "#8e8e93" : "#5E5CE6"))} />
              </ChartCard>
            )}
            {d.surface && (
              <ChartCard title="How it divides up the data" help="Each coloured region is where the model would give that answer. Dots are real examples coloured by their true answer." caption={isCls ? "Coloured regions show the model's answer across the space; stronger colour = more confident." : "Colour shows the predicted value across the space, from low (blue) to high (pink)."}>
                <DecisionSurface surface={d.surface} classes={model.classes} height={280} />
                {isCls && model.classes && (
                  <div className="row wrap tiny" style={{ gap: 10, marginTop: 8 }}>
                    {model.classes.map((c) => (
                      <span key={c} className="row" style={{ gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: classColor(c, model.classes) }} />{c}</span>
                    ))}
                  </div>
                )}
              </ChartCard>
            )}
            {pts.length > 1 && (
              <ChartCard title="Learning curve" help="If the validation line starts rising while training keeps falling, the model began memorising instead of learning." caption={hasLoss ? "Lower is better. The two lines should fall together." : "Higher is better. The two lines should rise together."}>
                <LineChart series={series} height={220} xLabel={curve?.x_label ?? "step"} marker={bestEpoch ? { x: bestEpoch, label: "best" } : undefined} />
              </ChartCard>
            )}
            {d.cv && d.cv.scores.length > 0 && (
              <ChartCard title="Cross-validation" help="The training data was split into folds; each fold took a turn as the test set. Similar bars = a stable model." caption={`Average ${d.cv.metric}: ${fmt(d.cv.mean)} (± ${fmt(d.cv.std)})`}>
                <BarList labels={d.cv.scores.map((_, i) => `Fold ${i + 1}`)} values={d.cv.scores} format={(v) => (Math.abs(v) <= 1 ? pct(v, 1) : fmt(v))} />
              </ChartCard>
            )}
          </motion.div>

          {d.vision && <VisionSection model={model} />}
          {d.text && <TextSection model={model} />}
          {isCls && d.calibration && (
            <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} className="col" style={{ gap: 10 }}>
              <div className="divider" />
              <h4 className="row" style={{ gap: 6 }}>🎯 Can you trust its probabilities?<InfoTip text="Calibration: whether the model's stated probabilities match how often things really happen on the test rows." /></h4>
              <Calibration cal={d.calibration} />
            </motion.div>
          )}
          {(d.mistakes?.rows?.length || d.slices?.length) ? (
            <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} className="col" style={{ gap: 10 }}>
              <div className="divider" />
              <h4 className="row" style={{ gap: 6 }}>🔍 Where it goes wrong</h4>
              <ErrorAnalysis mistakes={d.mistakes} slices={d.slices} classes={model.classes} />
            </motion.div>
          ) : null}
        </div>
      </Glass>
    </motion.section>
  );
}

type TTab = "mistakes" | "words" | "explain";

/** Text models: the confident mistakes, the words it weighs and per-word explanations. */
function TextSection({ model }: { model: SavedModel }) {
  const t = model.detail!.text!;
  const [tab, setTab] = useState<TTab>(t.examples?.length ? "explain" : "mistakes");
  const options: { value: TTab; label: string; disabled?: boolean }[] = [
    { value: "explain", label: "🔍 Explanations", disabled: !t.examples?.length },
    { value: "words", label: "🔤 Words" },
    { value: "mistakes", label: "💬 Mistakes" },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} className="col" style={{ gap: 12 }}>
      <div className="divider" />
      <div className="row between wrap" style={{ gap: 10 }}>
        <h4 className="row" style={{ gap: 6 }}>💬 Inside its head<InfoTip text="Real test messages with the model's answers, the words it weighs most and how each word moved its answer." /></h4>
        <Segmented size="sm" value={tab} onChange={setTab} options={options} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "explain" && <TextExplain text={t} classes={model.classes} />}
          {tab === "words" && <TextWords text={t} classes={model.classes} family={model.family} label={model.label} onExplain={t.examples?.length ? () => setTab("explain") : undefined} />}
          {tab === "mistakes" && <TextMistakes text={t} classes={model.classes} onExplain={t.examples?.length ? () => setTab("explain") : undefined} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

type VTab = "gallery" | "looks" | "filters";

/** Image models: the test-picture gallery, attention maps and (for CNNs) the learned filters. */
function VisionSection({ model }: { model: SavedModel }) {
  const v = model.detail!.vision!;
  const [tab, setTab] = useState<VTab>("gallery");
  const options: { value: VTab; label: string; disabled?: boolean }[] = [
    { value: "gallery", label: "🖼️ Gallery" },
    { value: "looks", label: "👀 What it looks at", disabled: !v.saliency?.length && !v.pixel_importance },
    ...(v.filters?.length ? [{ value: "filters" as VTab, label: "🔬 Filters" }] : []),
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} className="col" style={{ gap: 12 }}>
      <div className="divider" />
      <div className="row between wrap" style={{ gap: 10 }}>
        <h4 className="row" style={{ gap: 6 }}>🖼️ Inside its head<InfoTip text="Real test pictures with the model's answers, where it looks, and the patterns it learned." /></h4>
        <Segmented size="sm" value={tab} onChange={setTab} options={options} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "gallery" && <VisionGallery vision={v} classes={model.classes} task={model.task as Task} />}
          {tab === "looks" && <VisionLooks vision={v} label={model.label.toLowerCase()} />}
          {tab === "filters" && <VisionFilters vision={v} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
