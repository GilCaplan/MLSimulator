import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ColumnsTable } from "../components/data/ColumnsTable";
import { CombinePanel } from "../components/data/CombinePanel";
import { DatasetHeader } from "../components/data/DatasetHeader";
import { defaultDesign, fromSpec, type DesignState } from "../components/data/designer/model";
import { ProfilePanel } from "../components/data/ProfilePanel";
import { RowsTable } from "../components/data/RowsTable";
import { adoptDataset } from "../components/data/shared";
import { SourcePicker, type SourceMode } from "../components/data/SourcePicker";
import { Glass } from "../components/glass";
import { CoachPanel, NextBar, StepLayout } from "../components/shell/Wizard";
import { api } from "../lib/api";
import { toast, useProject } from "../lib/store";
import type { DatasetSummary } from "../lib/types";

const INTRO = (
  <>
    Machine learning learns from <b>examples</b>. Each row is one example and each column is a clue about it.
    Pick a ready-made dataset, upload your own, or <b>design one from scratch</b> — then tell me which column is the answer you
    want to predict. I'll point out anything that might trip the models up.
  </>
);

export function DataStep() {
  const project = useProject((s) => s.project)!;
  const dataset = useProject((s) => s.dataset);
  const profile = useProject((s) => s.profile);
  const catalog = useProject((s) => s.catalog);
  const task = project.task;

  const [mode, setMode] = useState<SourceMode>("samples");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [design, setDesign] = useState<DesignState>(() => defaultDesign(task ?? "classification"));
  const [profileLoading, setProfileLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const profileSeq = useRef(0);

  useEffect(() => {
    useProject.getState().ensureCatalog().catch(toast.error);
  }, []);

  // The project remembers a dataset but the cache is empty (e.g. after a reload): fetch it.
  useEffect(() => {
    const id = project.dataset_id;
    setMissing(false);
    if (!id || (dataset && dataset.id === id)) return;
    let live = true;
    api.dataset(id)
      .then((d) => { if (live && useProject.getState().project?.dataset_id === id) useProject.getState().setDataset(d); })
      .catch((e) => { if (live) { setMissing(true); toast.error(`Couldn't load the saved dataset: ${e instanceof Error ? e.message : e}`); } });
    return () => { live = false; };
  }, [project.dataset_id, dataset?.id]);

  // Profile follows dataset + target + task.
  const dsReady = !!dataset && dataset.id === project.dataset_id;
  useEffect(() => {
    if (!dsReady || !dataset) return;
    const my = ++profileSeq.current;
    setProfileLoading(true);
    api.profile(dataset.id, project.target, task)
      .then((p) => { if (my === profileSeq.current) useProject.getState().setProfile(p); })
      .catch((e) => { if (my === profileSeq.current) toast.error(e); })
      .finally(() => { if (my === profileSeq.current) setProfileLoading(false); });
  }, [dsReady, dataset?.id, project.target, task]);

  const scrollTop = () => requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const onLoaded = useCallback((d: DatasetSummary) => {
    adoptDataset(d);
    setPickerOpen(false);
    setMissing(false);
    scrollTop();
  }, []);

  const onComposed = useCallback((d: DatasetSummary) => {
    adoptDataset(d, useProject.getState().project?.target);
    scrollTop();
  }, []);

  const onTarget = (t: string) => {
    if (!t || t === project.target) return;
    useProject.getState().update({ target: t, prepared_id: null, pipeline: null });
    useProject.getState().setReport(null);
  };

  const editDesign = dataset?.source === "synthetic" && dataset.spec
    ? () => {
      setDesign(fromSpec(dataset.spec!, task ?? dataset.spec!.target.task));
      setMode("generate");
      setPickerOpen(true);
    }
    : undefined;

  const hasDataset = !!project.dataset_id && !missing;
  const showPicker = !hasDataset || pickerOpen;
  const nFeatures = dataset ? dataset.n_cols - (project.target ? 1 : 0) : 0;
  const status = !dsReady
    ? "Choose or create a dataset to continue"
    : !project.target
      ? "Pick the column you want to predict"
      : <>Predicting <b>‘{project.target}’</b> from {nFeatures} feature{nFeatures === 1 ? "" : "s"} · {dataset!.n_rows.toLocaleString()} rows</>;

  return (
    <StepLayout
      title={<>Bring your <span className="gradient-text">data</span></>}
      subtitle="Examples are what models learn from. Load some, invent some, or mix both — then choose what to predict."
      coach={<CoachPanel intro={INTRO} suggestions={dsReady ? profile?.coach ?? [] : []} />}
      footer={<NextBar status={status} back="models" next="prepare" nextDisabled={!dsReady || !project.target} />}
    >
      <div ref={topRef} style={{ scrollMarginTop: 16 }} />

      {hasDataset && (dsReady ? (
        <DatasetHeader dataset={dataset!} project={project} profile={profile} pickerOpen={pickerOpen}
          onTogglePicker={() => setPickerOpen((o) => !o)} onEditDesign={editDesign} onTarget={onTarget} />
      ) : (
        <Glass animate_in>
          <div className="row" style={{ gap: 14 }}>
            <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 16 }} />
            <div className="col grow" style={{ gap: 8 }}>
              <div className="skeleton" style={{ height: 18, width: "40%" }} />
              <div className="skeleton" style={{ height: 14, width: "25%" }} />
            </div>
          </div>
        </Glass>
      ))}

      <AnimatePresence initial={false}>
        {showPicker && (
          <motion.div
            key="picker"
            initial={{ opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.985, transition: { duration: 0.18 } }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          >
            {hasDataset && (
              <div className="row between" style={{ padding: "4px 4px 10px" }}>
                <span className="eyebrow">Use different data</span>
                <button className="btn ghost sm" onClick={() => setPickerOpen(false)}>Keep current dataset</button>
              </div>
            )}
            {missing && <p className="small" style={{ color: "var(--warning)", marginBottom: 10 }}>The dataset this project used is gone — pick or create a new one.</p>}
            <SourcePicker mode={mode} setMode={setMode} catalog={catalog} task={task} onLoaded={onLoaded} design={design} setDesign={setDesign} />
          </motion.div>
        )}
      </AnimatePresence>

      {dsReady && dataset && (
        <motion.div key={dataset.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }} className="col" style={{ gap: 16 }}>
          <ProfilePanel profile={profile} target={project.target ?? null} task={task} loading={profileLoading} />
          <ColumnsTable dataset={dataset} target={project.target ?? null} />
          <RowsTable key={dataset.id} datasetId={dataset.id} target={project.target ?? null} />
          <CombinePanel key={`c-${dataset.id}`} dataset={dataset} target={project.target ?? null} catalog={catalog} onLoaded={onComposed} />
        </motion.div>
      )}
    </StepLayout>
  );
}
