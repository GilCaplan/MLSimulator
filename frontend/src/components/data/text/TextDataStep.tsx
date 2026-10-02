import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { toast, useProject } from "../../../lib/store";
import type { DatasetProfile, DatasetSummary, Suggestion, Task } from "../../../lib/types";
import { Glass, Segmented, Spinner } from "../../glass";
import { CoachPanel, NextBar, StepLayout } from "../../shell/Wizard";
import { ColumnsTable } from "../ColumnsTable";
import { RowsTable } from "../RowsTable";
import { panelSwap } from "../shared";
import { Disclosure } from "../ui";
import { adoptTextDataset, guessTextColumn, setTextColumn, setTextLabel, textSpecOf } from "./textData";
import { ExamplesCard, TextBalanceCard, TextLengthCard, TopWordsCard } from "./TextInsights";
import { TextHeader } from "./TextHeader";
import { TextSetsPanel } from "./TextSetsPanel";
import { TextUploadPanel } from "./TextUploadPanel";

type TextSource = "sets" | "upload";

const INTRO = (
  <>
    Each example here is a <b>piece of text</b> — a review, a message, a support ticket — together with its <b>label</b>, the answer you
    want the model to learn.
    <br /><br />Start with a ready-made <b>text set</b> or upload a table of your own. Then look at the <b>telling words</b>: they show
    which clues a model could pick up on. If <i>you</i> can tell the labels apart from the words, a model probably can too.
  </>
);

/** Friendly coach notes computed from the text profile (the backend's profile coach is tabular-only). */
function textSuggestions(profile: DatasetProfile | null, nRows: number): Suggestion[] {
  if (!profile) return [];
  const out: Suggestion[] = [];
  const cb = profile.class_balance;
  if (cb && cb.counts.length) {
    const total = cb.counts.reduce((a, b) => a + b, 0) + cb.other;
    const min = Math.min(...cb.counts);
    if (min / total < 0.2) out.push({ id: "rare", severity: "warn", title: `Only ${Math.round((min / total) * 100)}% are “${cb.labels[cb.counts.indexOf(min)]}”`, why: "Rare labels are easy to ignore. Watch the per-label scores after training, not just accuracy — a model can look great while missing most of the rare ones." });
    if (cb.labels.length + (cb.other ? 1 : 0) > 20) out.push({ id: "many", severity: "warn", title: "That's a lot of labels", why: "Is this really the answer column? Text labels usually have a handful of values. Pick a different label column above if not." });
  }
  if (nRows < 300) out.push({ id: "few", severity: "info", title: "Not many texts", why: "With only a few hundred examples, simple word-counting models (Naive Bayes, Logistic Regression) usually beat neural networks, which need more practice." });
  return out;
}

/** The Data step for text projects: pick or upload texts, choose the text + label columns, then explore the words. */
export function TextDataStep() {
  const project = useProject((s) => s.project)!;
  const dataset = useProject((s) => s.dataset);
  const profile = useProject((s) => s.profile);
  const task = project.task as Task | null;

  const [mode, setMode] = useState<TextSource>("sets");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const profileSeq = useRef(0);

  // The project remembers a dataset but the cache is empty (e.g. after a reload): fetch it.
  useEffect(() => {
    const id = project.dataset_id;
    setMissing(false);
    if (!id || (dataset && dataset.id === id)) return;
    let live = true;
    api.dataset(id)
      .then((d) => { if (live && useProject.getState().project?.dataset_id === id) useProject.getState().setDataset(d); })
      .catch((e) => { if (live) { setMissing(true); toast.error(`Couldn't load the saved texts: ${e instanceof Error ? e.message : e}`); } });
    return () => { live = false; };
  }, [project.dataset_id, dataset?.id]);

  const dsReady = !!dataset && dataset.id === project.dataset_id;
  const savedCol = textSpecOf(project.pipeline).text_column;
  const textCol = dsReady ? (savedCol && dataset!.columns.some((c) => c.name === savedCol) ? savedCol : guessTextColumn(dataset!, project.target)) : null;

  useEffect(() => {
    if (!dsReady || !dataset || !textCol) return;
    const my = ++profileSeq.current;
    setProfileLoading(true);
    api.profile(dataset.id, project.target, task, { modality: "text", text_column: textCol })
      .then((p) => { if (my === profileSeq.current) useProject.getState().setProfile(p); })
      .catch((e) => { if (my === profileSeq.current) toast.error(e); })
      .finally(() => { if (my === profileSeq.current) setProfileLoading(false); });
  }, [dsReady, dataset?.id, project.target, task, textCol]);

  const onLoaded = useCallback((d: DatasetSummary, uploaded = false) => {
    adoptTextDataset(d);
    setPickerOpen(false);
    setMissing(false);
    if (uploaded) { setHighlight(true); setTimeout(() => setHighlight(false), 4500); }
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const onTextCol = (c: string) => {
    if (!c || c === textCol) return;
    if (c === project.target) return toast.info("That's the label column — pick the column with the sentences.");
    setTextColumn(c);
  };
  const onLabel = (c: string) => {
    if (!c) return;
    if (c === textCol) return toast.info("That's the text column — pick the column with the answers.");
    setTextLabel(c);
  };

  const hasDataset = !!project.dataset_id && !missing;
  const showPicker = !hasDataset || pickerOpen;
  const fresh = profile && profile.modality === "text" && dsReady && profile.text_column === textCol ? profile : null;
  const status = !dsReady
    ? "Choose or upload some texts to continue"
    : !textCol
      ? "Pick the column that holds the text"
      : !project.target
        ? "Pick the label you want to predict"
        : <>Reading <b>‘{textCol}’</b> to predict <b>‘{project.target}’</b> · {dataset!.n_rows.toLocaleString()} texts</>;

  return (
    <StepLayout
      title={<>Bring your <span className="gradient-text">texts</span></>}
      subtitle="Examples are what models learn from. Here every example is a piece of text, labelled with the answer."
      coach={<CoachPanel intro={INTRO} suggestions={textSuggestions(fresh, dataset?.n_rows ?? 0)} />}
      footer={<NextBar status={status} back="models" next="prepare" nextDisabled={!dsReady || !textCol || !project.target} />}
    >
      <div ref={topRef} style={{ scrollMarginTop: 16 }} />

      {hasDataset && dsReady && (
        <TextHeader dataset={dataset!} project={project} profile={fresh} textCol={textCol} pickerOpen={pickerOpen}
          onTogglePicker={() => setPickerOpen((o) => !o)} onTextCol={onTextCol} onLabel={onLabel} highlight={highlight} />
      )}
      {hasDataset && !dsReady && (
        <Glass animate_in>
          <div className="row" style={{ gap: 14 }}>
            <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 16 }} />
            <div className="col grow" style={{ gap: 8 }}>
              <div className="skeleton" style={{ height: 18, width: "40%" }} />
              <div className="skeleton" style={{ height: 14, width: "25%" }} />
            </div>
          </div>
        </Glass>
      )}

      <AnimatePresence initial={false}>
        {showPicker && (
          <motion.div key="picker" initial={{ opacity: 0, y: -10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.985, transition: { duration: 0.18 } }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="col" style={{ gap: 14 }}>
            {hasDataset && (
              <div className="row between" style={{ padding: "4px 4px 0" }}>
                <span className="eyebrow">Use different texts</span>
                <button className="btn ghost sm" onClick={() => setPickerOpen(false)}>Keep current texts</button>
              </div>
            )}
            {missing && <p className="small" style={{ color: "var(--warning)" }}>The texts this project used are gone — pick or upload new ones.</p>}
            <div className="row center">
              <Segmented<TextSource> value={mode} onChange={setMode}
                options={[{ value: "sets", label: "💬 Text sets" }, { value: "upload", label: "📁 Upload" }]} />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} {...panelSwap}>
                {mode === "sets" ? <TextSetsPanel onLoaded={(d) => onLoaded(d)} /> : <TextUploadPanel onLoaded={(d) => onLoaded(d, true)} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {dsReady && dataset && (
        <motion.div key={dataset.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }} className="col" style={{ gap: 16 }}>
          {fresh ? (
            <>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "stretch" }}>
                <TextBalanceCard profile={fresh} loading={profileLoading} />
                <TextLengthCard profile={fresh} />
              </div>
              <TopWordsCard profile={fresh} />
              <ExamplesCard profile={fresh} />
            </>
          ) : textCol ? (
            <Glass animate_in>
              <div className="row" style={{ gap: 10, marginBottom: 12 }}><Spinner size={16} color="var(--accent)" /><span className="small muted">Reading through your texts…</span></div>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="skeleton" style={{ height: 180 }} />
                <div className="skeleton" style={{ height: 180 }} />
              </div>
            </Glass>
          ) : null}
          <div style={{ padding: "0 4px" }}>
            <Disclosure title={<span className="row" style={{ gap: 8 }}>📋 <b>The raw table</b> <span className="muted small">{dataset.n_cols} columns · {dataset.n_rows.toLocaleString()} rows</span></span>}>
              <div className="col" style={{ gap: 16 }}>
                <ColumnsTable dataset={dataset} target={project.target ?? null} mark="🎯" />
                <RowsTable key={dataset.id} datasetId={dataset.id} target={project.target ?? null} mark="🎯" />
              </div>
            </Disclosure>
          </div>
        </motion.div>
      )}
    </StepLayout>
  );
}
