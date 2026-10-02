import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { BalanceCard } from "../components/prepare/BalanceCard";
import { CleanCard } from "../components/prepare/CleanCard";
import { EncodeCard, OutliersCard } from "../components/prepare/EncodeOutliersCards";
import { FeaturesCard } from "../components/prepare/features/FeaturesCard";
import { FlowStrip } from "../components/prepare/FlowStrip";
import { ImagePrepareStep } from "../components/prepare/image/ImagePrepareStep";
import { TextPrepareStep } from "../components/prepare/text/TextPrepareStep";
import { HoldoutCard, ReduceCard } from "../components/prepare/ReduceHoldoutCards";
import { Results, ResultsSkeleton } from "../components/prepare/Results";
import { SelectCard, TargetCard } from "../components/prepare/SelectTargetCards";
import { ScaleCard, SplitCard } from "../components/prepare/SplitScaleCards";
import type { StageId } from "../components/prepare/StageCard";
import { usePrepCtx } from "../components/prepare/state";
import { UnsupervisedResults } from "../components/prepare/UnsupervisedResults";
import { EmptyState, Glass, Spinner } from "../components/glass";
import { CoachPanel, NextBar, StepLayout, useStepLabel } from "../components/shell/Wizard";
import { spring } from "../design/motion";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { fullPipeline, isUnsupervised, toast, useProject } from "../lib/store";

const DEFAULT_OPEN: Record<StageId, boolean> = {
  clean: true, features: true, encode: false, outliers: false, split: true, holdout: true, scale: false, select: false, reduce: false, balance: true, target: true,
};

const UNSUP_INTRO = (
  <>No answer column means no test to cheat on — so there's <b>no split and no balancing</b> here. What matters most is <b>scaling</b>:
    clustering, maps and outlier detection all measure how far apart rows are, and unscaled columns would shout over each other.
    <br /><br />Press <b>Run preparation</b> to see your rows on a map.</>
);

export function PrepareStep() {
  const modality = useProject((s) => s.project?.modality);
  return modality === "image" ? <ImagePrepareStep /> : modality === "text" ? <TextPrepareStep /> : <TabularPrepareStep />;
}

function TabularPrepareStep() {
  const project = useProject((s) => s.project);
  const dataset = useProject((s) => s.dataset);
  const report = useProject((s) => s.report);
  const ctx = usePrepCtx();
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(() => (isUnsupervised(useProject.getState().project?.task) ? { ...DEFAULT_OPEN, scale: true } : DEFAULT_OPEN));
  const trainLabel = useStepLabel("train");
  const [flash, setFlash] = useState<StageId | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  const datasetId = project?.dataset_id ?? null;

  // Make sure the dataset summary is loaded (columns, missing counts, row count).
  useEffect(() => {
    if (!datasetId || dataset?.id === datasetId) return;
    let alive = true;
    api.dataset(datasetId)
      .then((d) => { if (alive && useProject.getState().project?.dataset_id === datasetId) useProject.getState().setDataset(d); })
      .catch((e) => toast.error(e));
    return () => { alive = false; };
  }, [datasetId, dataset?.id]);

  const run = useCallback(async (manual: boolean) => {
    const p = useProject.getState().project;
    const spec = p && fullPipeline(p);
    if (!p?.dataset_id || !spec) return;
    setRunning(true);
    try {
      const rep = await api.prepare(p.dataset_id, spec, p.models.map((m) => m.model_id));
      const st = useProject.getState();
      if (st.project?.id !== p.id) return;
      st.setReport(rep);
      // Only mark the data as prepared if nothing changed while we were waiting.
      const now = fullPipeline(st.project);
      if (JSON.stringify(now) === JSON.stringify(spec) && st.project.dataset_id === p.dataset_id) st.update({ prepared_id: rep.prepared_id });
      if (manual) {
        toast.success(`Ready: ${rep.splits.train.toLocaleString()} training rows · ${rep.n_features} features`);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setRunning(false);
    }
  }, []);

  // Auto-run once on the first visit, when nothing has been prepared yet.
  useEffect(() => {
    if (autoRan.current || !project?.dataset_id || (!project.target && !isUnsupervised(project.task)) || !project.task) return;
    if (report || project.prepared_id) return;
    autoRan.current = true;
    run(false);
  }, [project?.dataset_id, project?.target, project?.task, project?.prepared_id, report, run]);

  const pick = (id: StageId) => {
    setOpen((o) => ({ ...o, [id]: true }));
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
    setTimeout(() => document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const toggle = (id: StageId) => () => setOpen((o) => ({ ...o, [id]: !o[id] }));

  if (!project) return null;

  if (!ctx || !project.dataset_id) {
    return (
      <StepLayout title="Prepare your data" subtitle="Clean, split and balance the data before training.">
        <Glass>
          <EmptyState icon="📊" title="Pick a dataset first" text={isUnsupervised(project.task) ? "Choose or generate a dataset to explore — then come back here to prepare it." : "Choose or generate a dataset and tell us which column to predict — then come back here to prepare it."}
            action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/data`)}>Go to Data →</button>} />
        </Glass>
      </StepLayout>
    );
  }

  const { spec, isClf, used, unsup } = ctx;
  const stale = !!report && project.prepared_id !== report.prepared_id;
  const fresh = !!report && !stale;
  const hasCategorical = used.some((c) => c.role === "categorical") || (!ctx.dataset && !!report?.categorical_columns.length);
  const stages: StageId[] = unsup
    ? ["clean", "features", "encode", "outliers", "holdout", "scale", "select", "reduce"]
    : ["clean", "features", "encode", "outliers", "split", "scale", "select", "reduce", isClf ? "balance" : "target"];
  const cardProps = (id: StageId) => ({ ctx, open: open[id], onToggle: toggle(id), flash: flash === id, onJump: pick });

  const status = running
    ? "Preparing your data…"
    : fresh
      ? `Ready: ${report!.splits.train.toLocaleString()} ${unsup ? "rows to explore" : "training rows"} · ${report!.n_features} features`
      : stale
        ? "Settings changed — run again"
        : project.prepared_id
          ? "Prepared — ready to train"
          : "Run the preparation to continue";

  return (
    <StepLayout
      title="Prepare your data"
      subtitle={unsup
        ? "Turn raw rows into something models can compare: fill gaps, turn words into numbers, put every column on the same scale — and optionally squash it with PCA."
        : "Turn raw rows into something models can learn from: fill gaps, turn words into numbers, hide a test set, and even out rare classes."}
      coach={
        <CoachPanel
          intro={unsup ? UNSUP_INTRO : <>Real data is messy. Blanks, words, wildly different scales and rare classes all trip models up. Each stage below fixes one of these — the defaults are sensible, so you can simply press <b>Run preparation</b> and see what happens.</>}
          suggestions={fresh ? report!.coach : []}
        />
      }
      footer={<NextBar status={status} back="data" next="train" nextLabel={trainLabel} nextDisabled={!project.prepared_id || running} />}
    >
      {/* sticky pipeline overview + run */}
      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} style={{ position: "sticky", top: 4, zIndex: 6 }}>
        <FlowStrip
          stages={stages}
          spec={spec}
          hasCategorical={hasCategorical}
          running={running}
          onPick={pick}
          header={<RunHeader running={running} stale={stale} fresh={fresh} hasReport={!!report} onRun={() => run(true)} />}
        />
      </motion.div>

      <AnimatePresence>
        {project.prepared_id && !report && !running && (
          <motion.div key="reload" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle}>
            <Glass variant="thin" className="row between wrap" style={{ gap: 12, padding: "12px 16px" }}>
              <span className="row small" style={{ gap: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span>Your data is prepared and you can continue. <span className="muted">Run again to see the visuals.</span></span>
              </span>
              <button className="btn sm" onClick={() => run(true)}>Show visuals</button>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      {/* stage cards */}
      <CleanCard {...cardProps("clean")} />
      <FeaturesCard {...cardProps("features")} />
      <EncodeCard {...cardProps("encode")} />
      <OutliersCard {...cardProps("outliers")} />
      {unsup ? <HoldoutCard {...cardProps("holdout")} /> : <SplitCard {...cardProps("split")} />}
      <ScaleCard {...cardProps("scale")} />
      <SelectCard {...cardProps("select")} />
      <ReduceCard {...cardProps("reduce")} />
      {!unsup && (isClf ? <BalanceCard {...cardProps("balance")} /> : <TargetCard {...cardProps("target")} />)}

      {/* results */}
      <div ref={resultsRef} className="col" style={{ gap: 14, scrollMarginTop: 150, marginTop: 8 }}>
        {(report || running) && (
          <div className="row between wrap" style={{ gap: 10, padding: "0 4px" }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="eyebrow">Results</span>
              <h2 style={{ fontSize: 22 }}>What happened to your data</h2>
            </div>
            <AnimatePresence>
              {stale && !running && (
                <motion.button key="stale" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  className="btn sm" onClick={() => run(true)} style={{ color: "var(--warning)" }}>
                  ⟳ Settings changed — run again
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
        {report ? (
          <div style={{ position: "relative" }}>
            <div style={{ opacity: stale || running ? 0.55 : 1, filter: stale || running ? "saturate(0.6)" : "none", transition: "opacity .35s, filter .35s" }}>
              {unsup || isUnsupervised(report.task)
                ? <UnsupervisedResults report={report} task={String(report.task)} />
                : <Results report={report} logTarget={spec.target_transform === "log1p"} />}
            </div>
            <AnimatePresence>
              {running && (
                <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 60, pointerEvents: "none" }}>
                  <div className="glass strong row" style={{ padding: "10px 18px", borderRadius: 999, gap: 10, position: "sticky", top: 200 }}>
                    <Spinner size={16} color="var(--accent)" /> <b className="small">Re-running the pipeline…</b>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : running ? (
          <ResultsSkeleton />
        ) : null}
      </div>
    </StepLayout>
  );
}

function RunHeader({ running, stale, fresh, hasReport, onRun }: { running: boolean; stale: boolean; fresh: boolean; hasReport: boolean; onRun: () => void }) {
  return (
    <div className="row between wrap" style={{ gap: 12 }}>
      <div className="col" style={{ gap: 1 }}>
        <span className="eyebrow">Your data recipe</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={running ? "run" : stale ? "stale" : fresh ? "fresh" : "idle"}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
            className="small row" style={{ gap: 6, color: stale ? "var(--warning)" : "var(--text-2)" }}
          >
            {running ? <><Spinner size={12} color="var(--accent)" /> Data is flowing through the pipeline…</>
              : stale ? <>⟳ Settings changed — run again to update the results</>
                : fresh ? <><span style={{ color: "var(--success)" }}>●</span> Up to date — click any stage to tweak it</>
                  : <>Click a stage to tweak it, then run</>}
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.button
        className="btn gradient"
        onClick={onRun}
        disabled={running}
        animate={stale && !running ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={stale && !running ? { repeat: Infinity, duration: 1.6 } : spring.snappy}
        style={{ minWidth: 168 }}
      >
        {running ? <><Spinner size={14} /> Preparing…</> : <>🧪 {hasReport ? "Run again" : "Run preparation"}</>}
      </motion.button>
    </div>
  );
}
