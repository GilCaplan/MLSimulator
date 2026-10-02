import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { fullPipeline, toast, useProject } from "../../../lib/store";
import { storedSize } from "../../data/image/Thumb";
import { EmptyState, Glass, Spinner } from "../../glass";
import { CoachPanel, NextBar, StepLayout } from "../../shell/Wizard";
import { FlowStripView, type FlowItem } from "../FlowStrip";
import { ResultsSkeleton } from "../Results";
import { AugmentCard } from "./AugmentCard";
import { ImageResults } from "./ImageResults";
import { ImageSplitCard } from "./ImageSplitCard";
import { IMAGE_STAGES, imageStageState, type ImageStageId } from "./imageState";
import { ColourCard, ResolutionCard } from "./ResolutionColourCards";

const DEFAULT_OPEN: Record<ImageStageId, boolean> = { resolution: true, colour: false, augment: true, imgsplit: false };

/** Coach suggestions written for tables that don't apply to pictures. */
const TABULAR_ONLY = new Set(["many_features"]);

/** The Prepare step for image projects: resolution → colour → augmentation → split. */
export function ImagePrepareStep() {
  const project = useProject((s) => s.project);
  const dataset = useProject((s) => s.dataset);
  const report = useProject((s) => s.report);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [flash, setFlash] = useState<ImageStageId | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);
  const datasetId = project?.dataset_id ?? null;

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
      const now = fullPipeline(st.project);
      if (JSON.stringify(now) === JSON.stringify(spec) && st.project.dataset_id === p.dataset_id) st.update({ prepared_id: rep.prepared_id });
      if (manual) {
        const shape = (rep.image_shape as number[] | null) ?? [];
        toast.success(`Ready: ${rep.splits.train.toLocaleString()} training pictures · ${shape.join("×")}`);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (autoRan.current || !project?.dataset_id || !project.target || !project.task) return;
    if (report || project.prepared_id) return;
    autoRan.current = true;
    run(false);
  }, [project?.dataset_id, project?.target, project?.task, project?.prepared_id, report, run]);

  if (!project) return null;
  const spec = fullPipeline(project);
  const dsReady = !!dataset && dataset.id === project.dataset_id;
  if (!spec || !project.dataset_id) {
    return (
      <StepLayout title="Prepare your pictures" subtitle="Choose a resolution, colour and augmentation before training.">
        <Glass>
          <EmptyState icon="🖼️" title="Pick some pictures first" text="Choose an image set or upload a ZIP of pictures — then come back here to prepare them."
            action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/data`)}>Go to Images →</button>} />
        </Glass>
      </StepLayout>
    );
  }

  const pick = (id: ImageStageId) => {
    setOpen((o) => ({ ...o, [id]: true }));
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
    setTimeout(() => document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const toggle = (id: ImageStageId) => () => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const stale = !!report && project.prepared_id !== report.prepared_id;
  const fresh = !!report && !stale;
  const stored = storedSize(dataset?.image_shape);
  const samples = report?.sample_images?.length ? report.sample_images : [0, 1, 2, 3, 4, 5];
  const isClf = spec.task === "classification";
  const items: FlowItem[] = IMAGE_STAGES.map((s) => ({ ...s, ...imageStageState(s.id, spec) }));
  const cardProps = (id: ImageStageId) => ({ spec, datasetId: project.dataset_id!, samples, stored, open: open[id], onToggle: toggle(id), flash: flash === id });
  const top = dataset?.columns.find((c) => c.name === spec.target)?.top;
  const classTotals = top && !top.other ? Object.fromEntries(top.labels.map((l, k) => [String(l), top.counts[k]])) : null;
  const shapeText = (report?.image_shape as number[] | null)?.join("×");

  const status = running
    ? "Preparing your pictures…"
    : fresh
      ? `Ready: ${report!.splits.train.toLocaleString()} training pictures · ${shapeText}`
      : stale
        ? "Settings changed — run again"
        : project.prepared_id
          ? "Prepared — ready to train"
          : "Run the preparation to continue";

  return (
    <StepLayout
      title="Prepare your pictures"
      subtitle="Decide how big and colourful the pictures the model sees should be, how to vary them while training, and which ones to hide for the final exam."
      coach={
        <CoachPanel
          intro={<>Pictures need less cleaning than tables — but a few choices matter a lot: <b>how many pixels</b> the model looks at, whether it sees <b>colour</b>, and <b>augmentation</b>, the trick of showing slightly altered copies so the model learns what really matters. The defaults are a good start — press <b>Run preparation</b> and look.</>}
          suggestions={fresh ? report!.coach.filter((c) => !TABULAR_ONLY.has(c.id)) : []}
        />
      }
      footer={<NextBar status={status} back="data" next="train" nextLabel="Train" nextDisabled={!project.prepared_id || running} />}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} style={{ position: "sticky", top: 4, zIndex: 6 }}>
        <FlowStripView items={items} running={running} onPick={(id) => pick(id as ImageStageId)}
          header={<RunHeader running={running} stale={stale} fresh={fresh} hasReport={!!report} onRun={() => run(true)} />} />
      </motion.div>

      <AnimatePresence>
        {project.prepared_id && !report && !running && (
          <motion.div key="reload" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle}>
            <Glass variant="thin" className="row between wrap" style={{ gap: 12, padding: "12px 16px" }}>
              <span className="row small" style={{ gap: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span>Your pictures are prepared and you can continue. <span className="muted">Run again to see the visuals.</span></span>
              </span>
              <button className="btn sm" onClick={() => run(true)}>Show visuals</button>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      {dsReady ? (
        <>
          <ResolutionCard {...cardProps("resolution")} />
          <ColourCard {...cardProps("colour")} />
          <AugmentCard {...cardProps("augment")} imageSet={dataset?.image_set} />
          <ImageSplitCard spec={spec} nImages={dataset?.n_images ?? dataset?.n_rows ?? 0} isClf={isClf} open={open.imgsplit} onToggle={toggle("imgsplit")} flash={flash === "imgsplit"} />
        </>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          {[0, 1, 2].map((k) => <div key={k} className="skeleton" style={{ height: 76, borderRadius: 22 }} />)}
        </div>
      )}

      <div ref={resultsRef} className="col" style={{ gap: 14, scrollMarginTop: 150, marginTop: 8 }}>
        {(report || running) && (
          <div className="row between wrap" style={{ gap: 10, padding: "0 4px" }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="eyebrow">Results</span>
              <h2 style={{ fontSize: 22 }}>What happened to your pictures</h2>
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
              <ImageResults key={report.prepared_id} report={report} datasetId={project.dataset_id} grayscale={(report.image_shape as number[] | null)?.[0] === 1} stored={stored} classTotals={classTotals} />
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
        ) : running ? <ResultsSkeleton /> : null}
      </div>
    </StepLayout>
  );
}

function RunHeader({ running, stale, fresh, hasReport, onRun }: { running: boolean; stale: boolean; fresh: boolean; hasReport: boolean; onRun: () => void }) {
  return (
    <div className="row between wrap" style={{ gap: 12 }}>
      <div className="col" style={{ gap: 1 }}>
        <span className="eyebrow">Your picture recipe</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={running ? "run" : stale ? "stale" : fresh ? "fresh" : "idle"}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
            className="small row" style={{ gap: 6, color: stale ? "var(--warning)" : "var(--text-2)" }}>
            {running ? <><Spinner size={12} color="var(--accent)" /> Pictures are flowing through the pipeline…</>
              : stale ? <>⟳ Settings changed — run again to update the results</>
                : fresh ? <><span style={{ color: "var(--success)" }}>●</span> Up to date — click any stage to tweak it</>
                  : <>Click a stage to tweak it, then run</>}
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.button className="btn gradient" onClick={onRun} disabled={running}
        animate={stale && !running ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={stale && !running ? { repeat: Infinity, duration: 1.6 } : spring.snappy} style={{ minWidth: 168 }}>
        {running ? <><Spinner size={14} /> Preparing…</> : <>🧪 {hasReport ? "Run again" : "Run preparation"}</>}
      </motion.button>
    </div>
  );
}
