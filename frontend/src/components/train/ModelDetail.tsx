import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../design/motion";
import { colorAt } from "../../lib/colors";
import { METRIC_HELP, secs } from "../../lib/format";
import { navigate } from "../../lib/router";
import { toast, useProject } from "../../lib/store";
import type { ModelResult, RunResult } from "../../lib/types";
import { AnimatedNumber, EmptyState, Glass, InfoTip, Segmented } from "../glass";
import { BarList, ConfusionMatrix, DecisionSurface, Histogram, LineChart, ResidualPlot, RocChart, type Series } from "../charts";
import { NetworkDiagram } from "../nn/NetworkDiagram";
import { diagramLayers } from "./archLayers";
import { Calibration } from "./Calibration";
import { ErrorAnalysis } from "./Mistakes";
import { SaveModal } from "./SaveModal";
import { VisionFilters } from "./VisionFilters";
import { VisionGallery } from "./VisionGallery";
import { VisionLooks } from "./VisionLooks";
import { archFor, baselineOf, fmtMetric, isUnit, metricLabel, nFeatures, nOutputs, useSaved, vsBaseline } from "./util";

type Tab = "overview" | "surface" | "errors" | "mistakes" | "calibration" | "features" | "curve" | "settings" | "gallery" | "looks" | "filters";

const OVERVIEW: Record<string, string[]> = {
  classification: ["accuracy", "balanced_accuracy", "f1", "precision", "recall", "roc_auc"],
  regression: ["r2", "rmse", "mae", "mape"],
};

const turnOnCalibration = () => {
  const ps = useProject.getState();
  const p = ps.project;
  if (!p) return;
  ps.update({ options: { cv_folds: 0, seed: 42, ...(p.options || {}), calibrate: "isotonic" } });
  toast.success("Isotonic calibration is on — train again to see honest probabilities.");
};

/** Full report for one trained model, with tabs. */
export function ModelDetail({ result, model }: { result: RunResult; model: ModelResult }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const spec = useProject((s) => s.registry.find((r) => r.id === model.model_id));
  const savedId = useSaved((s) => s.saved[`${result.job_id}:${model.key}`]);
  const isBase = !!model.baseline;
  const cls = result.task === "classification";
  const vision = model.vision;
  const isImage = !!vision || useProject.getState().project?.modality === "image";
  const tabs: { value: Tab; label: string; disabled?: boolean }[] = isBase ? [{ value: "overview", label: "Overview" }] : isImage ? [
    // image models: the tabular views (decision map, feature table, row mistakes, slices) don't apply
    { value: "overview", label: "Overview" },
    { value: "gallery", label: "🖼️ Gallery", disabled: !vision?.mistakes?.length && !vision?.correct?.length },
    { value: "looks", label: "👀 What it looks at", disabled: !vision?.saliency?.length && !vision?.pixel_importance },
    ...(model.family === "torch" ? [{ value: "filters" as Tab, label: "🔬 Filters", disabled: !vision?.filters?.length }] : []),
    { value: "errors", label: "Errors", disabled: !model.confusion && !model.residuals },
    ...(cls ? [{ value: "calibration" as Tab, label: "Calibration", disabled: !model.calibration }] : []),
    { value: "curve", label: "Learning curve", disabled: !model.curve?.points?.length },
    { value: "settings", label: "Settings" },
  ] : [
    { value: "overview", label: "Overview" },
    { value: "surface", label: "Decision map", disabled: !model.surface },
    { value: "errors", label: "Errors", disabled: !model.confusion && !model.residuals },
    { value: "mistakes", label: "Mistakes", disabled: !model.mistakes?.rows?.length && !model.slices?.length },
    ...(cls ? [{ value: "calibration" as Tab, label: "Calibration", disabled: !model.calibration }] : []),
    { value: "features", label: "Features", disabled: !model.importance?.names?.length },
    { value: "curve", label: "Learning curve", disabled: !model.curve?.points?.length },
    { value: "settings", label: "Settings" },
  ];
  useEffect(() => {
    const t = tabs.find((x) => x.value === tab);
    if (!t || t.disabled) setTab("overview");
  }, [model.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Glass animate_in>
      <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <motion.span key={model.key} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ fontSize: 26, width: 46, height: 46, borderRadius: 14, background: "var(--glass-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isBase ? "🎯" : spec?.emoji ?? "🤖"}
          </motion.span>
          <div className="col" style={{ gap: 2 }}>
            <h3>{isBase ? "Baseline — what you'd get by always guessing" : model.label}</h3>
            <span className="small muted">{isBase ? `${model.label.replace(/^Baseline\s*·\s*/, "")} — it ignores every input. Not a real model, just the bar every real model has to clear.` : spec?.description}</span>
          </div>
        </div>
        {isBase ? (
          <span className="badge">🎯 Reference only</span>
        ) : savedId ? (
          <div className="row" style={{ gap: 8 }}>
            <span className="badge success">✓ Saved</span>
            <button className="btn sm" onClick={() => navigate(`/library/${savedId}`)}>View in library →</button>
          </div>
        ) : (
          <button className="btn primary" onClick={() => setSaving(true)}>💾 Save to library</button>
        )}
      </div>
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <Segmented value={tab} onChange={setTab} options={tabs} size="sm" />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={`${model.key}-${tab}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "overview" && <Overview result={result} model={model} />}
          {tab === "surface" && model.surface && (
            <div className="col" style={{ gap: 10 }}>
              <p className="small muted" style={{ lineHeight: 1.55 }}>
                {result.task === "classification"
                  ? "Your data squashed onto a flat map. Each coloured region shows which answer the model would give for points there — stronger colour means more confident. Dots are real rows, coloured by their true answer. Dots sitting in a different-coloured region are mistakes."
                  : model.surface.kind === "curve"
                    ? "The purple line is what the model predicts for each value of your feature; the dots are the real rows."
                    : "Your data squashed onto a flat map, coloured by the value the model predicts there (blue = low, pink = high)."}
              </p>
              <DecisionSurface surface={model.surface} classes={result.classes} height={340} />
            </div>
          )}
          {tab === "gallery" && vision && <VisionGallery vision={vision} classes={result.classes} task={result.task} />}
          {tab === "looks" && vision && <VisionLooks vision={vision} label={model.label.toLowerCase()} />}
          {tab === "filters" && vision && <VisionFilters vision={vision} />}
          {tab === "errors" && <Errors result={result} model={model} />}
          {tab === "mistakes" && <ErrorAnalysis mistakes={model.mistakes} slices={model.slices} classes={result.classes} />}
          {tab === "calibration" && model.calibration && (
            <Calibration cal={model.calibration} calibrated={result.options?.calibrate && result.options.calibrate !== "none" ? result.options.calibrate : null}
              onCalibrate={model.family === "classic" ? turnOnCalibration : undefined} />
          )}
          {tab === "features" && model.importance && (
            <div className="col" style={{ gap: 12 }}>
              <p className="small muted" style={{ lineHeight: 1.55 }}>
                Which columns the model leaned on most. Measured by <b>{model.importance.method}</b>.
                {model.importance.method?.startsWith("permutation") && " We shuffled each column and watched how much the score dropped — a big drop means that column mattered."}
              </p>
              <BarList labels={model.importance.names.slice(0, 15)} values={model.importance.values.slice(0, 15)}
                colors={model.importance.names.slice(0, 15).map(() => "#5E5CE6")} format={(v) => v.toFixed(3)} />
            </div>
          )}
          {tab === "curve" && model.curve && <Curve model={model} />}
          {tab === "settings" && <Settings model={model} />}
        </motion.div>
      </AnimatePresence>
      {!isBase && <SaveModal open={saving} onClose={() => setSaving(false)} jobId={result.job_id} model={model} />}
    </Glass>
  );
}

function Overview({ result, model }: { result: RunResult; model: ModelResult }) {
  const metrics = OVERVIEW[result.task].filter((m) => model.metrics.test[m] !== undefined);
  const notes = model.notes || {};
  const chips: { icon: string; text: string; tip: string }[] = [];
  if (notes.early_stopped) chips.push({ icon: "⏹️", text: `Early-stopped at epoch ${notes.early_stopped}`, tip: "It stopped training once the validation loss stopped improving, to avoid memorising." });
  if (notes.best_epoch) chips.push({ icon: "⭐", text: `Best epoch: ${notes.best_epoch}`, tip: "The weights from this epoch (lowest validation loss) were kept." });
  if (notes.diverged) chips.push({ icon: "💥", text: "Training blew up", tip: "The loss became infinite — the learning rate is probably too high." });
  if (notes.plateau) chips.push({ icon: "🐢", text: "Barely improved", tip: "The training loss hardly moved. Try a higher learning rate or more epochs." });
  if (notes.val_rising) chips.push({ icon: "📈", text: "Validation loss rose late", tip: "After its best epoch it started memorising the training rows." });
  if (notes.device) chips.push({ icon: notes.device === "cpu" ? "🖥️" : "⚡", text: `Trained on ${notes.device}`, tip: "The chip that did the maths." });
  const extra = model as ModelResult & { predict_ms_per_1k?: number };
  const base = model.baseline ? undefined : baselineOf(result);
  return (
    <div className="col" style={{ gap: 16 }}>
      {model.baseline && (
        <div className="inset row" style={{ gap: 12, padding: "12px 14px", alignItems: "flex-start", borderStyle: "dashed" }}>
          <span style={{ fontSize: 22 }}>🎯</span>
          <span className="small" style={{ lineHeight: 1.55 }}>
            <b>Why a baseline?</b>{" "}
            <span className="muted">
              {result.task === "classification"
                ? "It always answers with the most common class. If one answer is very common, this lazy guess already scores a high accuracy — a real model must do clearly better, or it hasn't learned anything useful."
                : "It always predicts the average of the training rows (R² ≈ 0). A real model's errors should be clearly smaller than this, or the inputs aren't helping."}
            </span>
          </span>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {metrics.map((m, i) => {
          const test = model.metrics.test[m];
          const train = model.metrics.train?.[m];
          const unit = isUnit(m);
          return (
            <motion.div key={m} className="inset col" initial={{ opacity: 0, y: 10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...spring.gentle, delay: i * 0.04 }} style={{ padding: 12, gap: 4 }}>
              <span className="row small muted" style={{ gap: 5 }}>{metricLabel(m)}{METRIC_HELP[m] && <InfoTip text={METRIC_HELP[m]} />}</span>
              <b style={{ fontSize: 24, letterSpacing: "-0.02em" }}>
                <AnimatedNumber value={unit ? test * 100 : test} format={(v) => (unit ? `${v.toFixed(1)}%` : v.toFixed(3))} />
              </b>
              <span className="tiny faint num">{model.vision ? "training pictures" : "training rows"}: {fmtMetric(m, train)}</span>
              {base && base.metrics.test[m] !== undefined && (() => {
                const vs = vsBaseline(m, test, base.metrics.test[m]);
                return (
                  <span className="tiny num" style={{ color: vs && vs.delta > 0 ? "var(--success)" : "var(--danger)" }}>
                    🎯 baseline {fmtMetric(m, base.metrics.test[m])}{vs ? ` · ${vs.text}` : ""}
                  </span>
                );
              })()}
            </motion.div>
          );
        })}
      </div>
      <div className="row wrap" style={{ gap: 10 }}>
        {model.cv && !model.baseline && (
          <div className="inset col" style={{ padding: "10px 14px", gap: 2 }}>
            <span className="row tiny faint" style={{ gap: 5 }}>Cross-validation ({metricLabel(model.cv.metric)}) <InfoTip text="Average score across the folds, ± how much it wobbled between folds. Small wobble = dependable." /></span>
            <b className="num">{fmtMetric(model.cv.metric, model.cv.mean)} <span className="muted" style={{ fontWeight: 500 }}>± {fmtMetric(model.cv.metric, model.cv.std)}</span></b>
            <div className="row" style={{ gap: 4 }}>
              {model.cv.scores.map((s, i) => <span key={i} title={String(s)} style={{ width: 8, height: 8, borderRadius: 4, background: colorAt(i), opacity: 0.8 }} />)}
            </div>
          </div>
        )}
        <div className="inset col" style={{ padding: "10px 14px", gap: 2 }}>
          <span className="tiny faint">Training time</span>
          <b className="num">{secs(model.fit_time_s)}</b>
        </div>
        {extra.predict_ms_per_1k !== undefined && (
          <div className="inset col" style={{ padding: "10px 14px", gap: 2 }}>
            <span className="tiny faint">Prediction speed</span>
            <b className="num">{extra.predict_ms_per_1k.toFixed(1)} ms / 1k rows</b>
          </div>
        )}
        {model.n_params ? (
          <div className="inset col" style={{ padding: "10px 14px", gap: 2 }}>
            <span className="tiny faint">Learnable weights</span>
            <b className="num">{model.n_params.toLocaleString()}</b>
          </div>
        ) : null}
      </div>
      {chips.length > 0 && (
        <div className="row wrap" style={{ gap: 8 }}>
          {chips.map((c) => <span key={c.text} className="badge" title={c.tip}>{c.icon} {c.text}</span>)}
        </div>
      )}
    </div>
  );
}

function Errors({ result, model }: { result: RunResult; model: ModelResult }) {
  if (result.task === "classification") {
    return (
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        {model.confusion && (
          <div className="col" style={{ gap: 8 }}>
            <h4>Who got mixed up with whom</h4>
            <span className="small muted">Green diagonal = correct. Red cells = mistakes.</span>
            <ConfusionMatrix labels={model.confusion.labels} matrix={model.confusion.matrix} />
          </div>
        )}
        <div className="col" style={{ gap: 14 }}>
          {model.roc?.length ? (
            <div className="col" style={{ gap: 6 }}>
              <h4 className="row" style={{ gap: 6 }}>ROC curve <InfoTip text="How many real positives it catches (up) vs. false alarms (right) as you make it more trigger-happy. Hugging the top-left corner is best; the dashed line is random guessing." /></h4>
              <RocChart curves={model.roc} height={220} />
            </div>
          ) : null}
          {model.pr?.recall?.length ? (
            <div className="col" style={{ gap: 6 }}>
              <h4 className="row" style={{ gap: 6 }}>Precision vs. recall <InfoTip text="Catching more positives (recall) usually means more false alarms (lower precision). Higher and further right is better." /></h4>
              <LineChart height={180} xLabel="Recall" yLabel="Precision" yDomain={[0, 1]} area showLegend={false}
                series={[{ name: "PR", color: "#BF5AF2", points: model.pr.recall.map((x, i) => ({ x, y: model.pr!.precision[i] })) }]} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  if (!model.residuals) return <EmptyState icon="📭" title="No error details" />;
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
      <div className="col" style={{ gap: 6 }}>
        <h4>Predicted vs. actual</h4>
        <span className="small muted">Perfect predictions sit on the green dashed line. Pinker dots missed by more.</span>
        <ResidualPlot points={model.residuals.points} height={280} />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <h4>How big are the misses?</h4>
        <span className="small muted">Errors (actual − predicted). A tall, narrow hump around 0 is what you want.</span>
        <Histogram data={model.residuals.hist} height={200} color="#5E5CE6" />
        {model.residuals.hetero_r !== undefined && Math.abs(model.residuals.hetero_r) > 0.3 && (
          <span className="badge warning" style={{ alignSelf: "flex-start" }}>⚠️ Errors grow with the size of the value</span>
        )}
      </div>
    </div>
  );
}

function Curve({ model }: { model: ModelResult }) {
  const c = model.curve!;
  const pts = c.points;
  const has = (k: keyof (typeof pts)[number]) => pts.some((p) => p[k] !== null && p[k] !== undefined);
  const loss: Series[] = [];
  if (has("train_loss")) loss.push({ name: "Training loss", color: "#0A84FF", points: pts.map((p) => ({ x: p.step, y: p.train_loss })) });
  if (has("val_loss")) loss.push({ name: "Validation loss", color: "#FF375F", points: pts.map((p) => ({ x: p.step, y: p.val_loss })) });
  const score: Series[] = [];
  if (has("train_score")) score.push({ name: "Training score", color: "#0A84FF", points: pts.map((p) => ({ x: p.step, y: p.train_score })) });
  if (has("val_score")) score.push({ name: "Validation score", color: "#30D158", points: pts.map((p) => ({ x: p.step, y: p.val_score })) });
  const marker = c.best_epoch ? { x: c.best_epoch, label: `best · ${c.best_epoch}` } : undefined;
  return (
    <div className="col" style={{ gap: 14 }}>
      <p className="small muted" style={{ lineHeight: 1.55 }}>
        How the model improved over {c.x_label}. When the training line keeps getting better but the validation line stalls or turns, the model has started memorising.
      </p>
      <div className="grid" style={{ gridTemplateColumns: loss.length && score.length ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr", gap: 16 }}>
        {loss.length > 0 && <div><h4 style={{ marginBottom: 6 }}>Loss {c.loss ? <span className="faint small">({c.loss})</span> : null}</h4><LineChart series={loss} height={220} xLabel={c.x_label} marker={marker} /></div>}
        {score.length > 0 && <div><h4 style={{ marginBottom: 6 }}>Score {c.score ? <span className="faint small">({metricLabel(c.score)})</span> : null}</h4><LineChart series={score} height={220} xLabel={c.x_label} marker={marker} /></div>}
      </div>
    </div>
  );
}

function Settings({ model }: { model: ModelResult }) {
  const spec = useProject((s) => s.registry.find((r) => r.id === model.model_id));
  const merged: Record<string, any> = {};
  for (const hp of spec?.params ?? []) merged[hp.name] = hp.default;
  Object.assign(merged, model.params || {});
  const entries = Object.entries(merged);
  const arch = spec?.nn ? archFor(model) : null;
  return (
    <div className="col" style={{ gap: 16 }}>
      {arch && (
        <div className="inset" style={{ padding: 10 }}>
          <NetworkDiagram layers={diagramLayers(arch, nFeatures(), nOutputs(), model.vision?.image_shape ?? useProject.getState().report?.image_shape)} height={240} />
        </div>
      )}
      {entries.length === 0 ? (
        <span className="small muted">Default settings were used.</span>
      ) : (
        <div className="inset" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead><tr><th>Setting</th><th>Value</th><th>What it does</th></tr></thead>
            <tbody>
              {entries.map(([k, v]) => {
                const hp = spec?.params.find((p) => p.name === k);
                return (
                  <tr key={k}>
                    <td><b>{hp?.label ?? k}</b></td>
                    <td className="mono">
                      {typeof v === "number" ? String(Number(v.toPrecision(5))) : String(v)}
                      {hp && v !== hp.default && <span className="badge accent" style={{ marginLeft: 8, height: 18, fontSize: 10 }}>changed</span>}
                    </td>
                    <td className="muted" style={{ whiteSpace: "normal" }}>{hp?.help}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
