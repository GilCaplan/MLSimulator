import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { fullPipeline, toast, useProject } from "../../../lib/store";
import type { Suggestion } from "../../../lib/types";
import { guessTextColumn } from "../../data/text/textData";
import { EmptyState, Glass, Spinner } from "../../glass";
import { TEXT_NN_IDS } from "../../models/meta";
import { CoachPanel, NextBar, StepLayout } from "../../shell/Wizard";
import { FlowStripView, type FlowItem } from "../FlowStrip";
import { ImageSplitCard } from "../image/ImageSplitCard";
import { ResultsSkeleton } from "../Results";
import { SeqLenCard } from "./SeqLenCard";
import { TextColumnCard } from "./TextColumnCard";
import { TextResults } from "./TextResults";
import { TEXT_STAGES, textOf, textStageState, type TextStageId } from "./textPrepState";
import { WordsCard } from "./WordsCard";

const DEFAULT_OPEN: Record<TextStageId, boolean> = { textcol: false, words: true, seqlen: true, textsplit: false };

/** Coach suggestions written for tables that don't apply to text. */
const TABULAR_ONLY = new Set(["many_features"]);

const INTRO = (
  <>Models only understand numbers, so text has to be turned into numbers first. There are two ways, and your line-up may use both:
    <br /><br />🛍️ <b>Bag of words</b> — count which words (and maybe word pairs) appear. Used by Logistic Regression, Naive Bayes, the forests and the MLP.
    <br /><br />📜 <b>Word sequences</b> — give every word a number and keep them in order, cut or padded to one length. Used by the GRU, Transformer and word-embedding networks.
    <br /><br />The defaults are sensible — press <b>Run preparation</b> and look at what the models will see.</>
);

/** The Prepare step for text projects: text column → words → sequence length → split. */
export function TextPrepareStep() {
  const project = useProject((s) => s.project);
  const dataset = useProject((s) => s.dataset);
  const report = useProject((s) => s.report);
  const profile = useProject((s) => s.profile);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [flash, setFlash] = useState<TextStageId | null>(null);
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
        toast.success(`Ready: ${rep.splits.train.toLocaleString()} training texts · ${rep.n_features.toLocaleString()} vocabulary entries`);
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
      <StepLayout title="Prepare your texts" subtitle="Turn sentences into numbers a model can learn from.">
        <Glass>
          <EmptyState icon="💬" title="Pick some texts first" text="Choose a text set or upload a table of texts and pick the label — then come back here to prepare them."
            action={<button className="btn primary" onClick={() => navigate(`/p/${project.id}/data`)}>Go to Texts →</button>} />
        </Glass>
      </StepLayout>
    );
  }

  const pick = (id: TextStageId) => {
    setOpen((o) => ({ ...o, [id]: true }));
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
    setTimeout(() => document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const toggle = (id: TextStageId) => () => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const t = textOf(spec);
  const stale = !!report && project.prepared_id !== report.prepared_id;
  const fresh = !!report && !stale;
  const textCol = t.text_column ?? report?.text_column ?? (dsReady ? guessTextColumn(dataset!, spec.target) : null);
  const usesSeq = project.models.some((m) => TEXT_NN_IDS.has(m.model_id));
  const usesBow = project.models.some((m) => !TEXT_NN_IDS.has(m.model_id));
  const hist = report?.length_hist ?? (profile?.modality === "text" && profile.text_column === textCol ? profile.length_hist ?? null : null);
  const example = (report?.examples ?? []).map((e) => e.text).sort((a, b) => b.length - a.length)[0] ?? null;
  const items: FlowItem[] = TEXT_STAGES.map((s) => ({ ...s, ...textStageState(s.id, spec, textCol, usesSeq) }));
  const top = dataset?.columns.find((c) => c.name === spec.target)?.top;
  const classTotals = top && !top.other ? Object.fromEntries(top.labels.map((l, k) => [String(l), top.counts[k]])) : null;

  const suggestions: Suggestion[] = fresh ? report!.coach.filter((c) => !TABULAR_ONLY.has(c.id)) : [];
  if (usesBow && t.ngram_max === 1 && dataset?.columns.length && /review|sentiment/i.test(`${dataset.name} ${spec.target}`)) {
    suggestions.push({ id: "pairs", severity: "info", title: "Try word pairs", why: "Reviews often flip their meaning with “not”. Counting pairs like “not good” gives the bag-of-words models a fighting chance.", action: { kind: "pipeline", label: "Use words + pairs", patch: { text: { ...t, ngram_max: 2 } } } });
  }
  if (usesSeq && hist && fresh) {
    const lastEdge = hist.edges[hist.edges.length - 1];
    if (t.max_len < hist.edges[0] + (lastEdge - hist.edges[0]) * 0.5) suggestions.push({ id: "short", severity: "warn", title: "Many texts get cut short", why: `The networks only read the first ${t.max_len} words, but many texts are longer. Words after that are invisible to them.`, action: { kind: "pipeline", label: `Read ${Math.ceil(lastEdge)} words`, patch: { text: { ...t, max_len: Math.min(200, Math.ceil(lastEdge)) } } } });
  }

  const status = running
    ? "Preparing your texts…"
    : fresh
      ? `Ready: ${report!.splits.train.toLocaleString()} training texts · ${report!.n_features.toLocaleString()} vocabulary entries`
      : stale
        ? "Settings changed — run again"
        : project.prepared_id
          ? "Prepared — ready to train"
          : "Run the preparation to continue";

  return (
    <StepLayout
      title="Prepare your texts"
      subtitle="Choose how sentences become numbers: which words to count, how many words the networks read, and which texts to hide for the final exam."
      coach={<CoachPanel intro={INTRO} suggestions={suggestions} />}
      footer={<NextBar status={status} back="data" next="train" nextLabel="Train" nextDisabled={!project.prepared_id || running} />}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} style={{ position: "sticky", top: 4, zIndex: 6 }}>
        <FlowStripView items={items} running={running} onPick={(id) => pick(id as TextStageId)}
          header={<RunHeader running={running} stale={stale} fresh={fresh} hasReport={!!report} onRun={() => run(true)} />} />
      </motion.div>

      <AnimatePresence>
        {project.prepared_id && !report && !running && (
          <motion.div key="reload" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle}>
            <Glass variant="thin" className="row between wrap" style={{ gap: 12, padding: "12px 16px" }}>
              <span className="row small" style={{ gap: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span>Your texts are prepared and you can continue. <span className="muted">Run again to see the visuals.</span></span>
              </span>
              <button className="btn sm" onClick={() => run(true)}>Show visuals</button>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <TextColumnCard spec={spec} dataset={dsReady ? dataset : null} textCol={textCol} open={open.textcol} onToggle={toggle("textcol")} flash={flash === "textcol"} />
      <WordsCard spec={spec} report={report} fresh={fresh} open={open.words} onToggle={toggle("words")} flash={flash === "words"} />
      <SeqLenCard spec={spec} hist={hist} example={example} usesSeq={usesSeq} open={open.seqlen} onToggle={toggle("seqlen")} flash={flash === "seqlen"} />
      <ImageSplitCard spec={spec} nImages={dataset?.n_rows ?? 0} isClf open={open.textsplit} onToggle={toggle("textsplit")} flash={flash === "textsplit"} noun="texts" id="textsplit" />

      <div ref={resultsRef} className="col" style={{ gap: 14, scrollMarginTop: 150, marginTop: 8 }}>
        {(report || running) && (
          <div className="row between wrap" style={{ gap: 10, padding: "0 4px" }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="eyebrow">Results</span>
              <h2 style={{ fontSize: 22 }}>What the models will see</h2>
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
              <TextResults key={report.prepared_id} report={report} maxLen={t.max_len} ngram={(report.feature_names_out ?? []).some((w) => w.includes(" ")) ? 2 : 1} classTotals={classTotals} />
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
        <span className="eyebrow">Your text recipe</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={running ? "run" : stale ? "stale" : fresh ? "fresh" : "idle"}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
            className="small row" style={{ gap: 6, color: stale ? "var(--warning)" : "var(--text-2)" }}>
            {running ? <><Spinner size={12} color="var(--accent)" /> Texts are flowing through the pipeline…</>
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
