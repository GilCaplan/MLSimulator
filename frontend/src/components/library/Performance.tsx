import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { stagger } from "../../design/motion";
import { classColor } from "../../lib/colors";
import { fmt, pct } from "../../lib/format";
import type { SavedModel } from "../../lib/types";
import { BarList, ConfusionMatrix, DecisionSurface, LineChart, ResidualPlot, RocChart, type Series } from "../charts";
import { Glass, InfoTip } from "../glass";
import { Calibration } from "../train/Calibration";
import { ErrorAnalysis } from "../train/Mistakes";
import { MetricTiles, SectionTitle, rise } from "./shared";

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

/** "How it performed": test scores and the evaluation charts saved with the model. */
export function Performance({ model }: { model: SavedModel }) {
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
            {model.dataset?.n_rows != null && <span>📊 {model.dataset.n_rows.toLocaleString()} rows in the dataset</span>}
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
