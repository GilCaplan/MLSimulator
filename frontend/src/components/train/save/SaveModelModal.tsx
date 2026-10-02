import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";
import { navigate, useRouter } from "../../../lib/router";
import { toast, useProject } from "../../../lib/store";
import type { RunResult, SavedModel } from "../../../lib/types";
import { Field, Modal, Spinner } from "../../glass";
import { TryPanel } from "../try/TryPanel";
import { tryable } from "../try/tryKit";
import { boardRows, defaultMetric, fmtMetric, metricLabel, useSaved } from "../util";
import { ModelPick } from "./ModelPick";
import { noteSaved, syncSaved } from "./savedSync";

/**
 * "Save a model" dialog: pick one of the run's trained models (the baseline is left out), name it, add notes and save it
 * to the library. Optionally test it by hand first. Afterwards: open it in the library, keep improving, or close.
 */
export function SaveModelModal({ open, onClose, result, preselect, finish }: {
  open: boolean;
  onClose: () => void;
  result: RunResult;
  /** model key to select first (e.g. from a model's own save button) */
  preselect?: string | null;
  /** opened from "Save & finish": word the finish screen as the end of the project */
  finish?: boolean;
}) {
  const project = useProject((s) => s.project);
  const registry = useProject((s) => s.registry);
  const saved = useSaved((s) => s.saved);
  const metric = useMemo(() => defaultMetric(result), [result]);
  const rows = useMemo(() => boardRows(result, metric).filter((r) => !r.baseline), [result, metric]);
  const best = rows.find((r) => r.score !== null)?.key ?? rows[0]?.key ?? null;
  const isSaved = (key: string) => !!saved[`${result.job_id}:${key}`];

  const [key, setKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [done, setDone] = useState<SavedModel | null>(null);

  const model = key ? result.models[key] : undefined;
  const defaultName = (k: string | null) => {
    const m = k ? result.models[k] : undefined;
    return m ? `${m.label} · ${project?.name ?? "project"}` : "";
  };

  // fresh state each time the dialog opens
  useEffect(() => {
    if (!open) return;
    const first = (preselect && result.models[preselect] && !result.models[preselect].baseline ? preselect : null)
      ?? rows.find((r) => r.score !== null && !isSaved(r.key))?.key ?? best;
    setKey(first);
    setName(defaultName(first));
    setTouched(false);
    setNotes("");
    setDone(null);
    setTesting(false);
    syncSaved(result.job_id);
  }, [open, preselect, result.job_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (k: string) => {
    setKey(k);
    if (!touched) setName(defaultName(k));
  };

  const save = async () => {
    if (!model || busy) return;
    setBusy(true);
    try {
      const s = await api.saveModel({ job_id: result.job_id, key: model.key, name: name.trim() || model.label, notes, project_id: project?.id });
      noteSaved(result.job_id, model.key, s.id);
      setDone(s);
      setTesting(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const onImprove = useRouter((s) => s.route.name === "wizard" && s.route.step === "improve");
  const keepImproving = () => {
    onClose();
    if (project && !onImprove) navigate(`/p/${project.id}/improve`);
  };
  const unsavedLeft = rows.filter((r) => !isSaved(r.key)).length;
  const saveAnother = () => {
    const next = rows.find((r) => !isSaved(r.key))?.key ?? null;
    setDone(null);
    setKey(next);
    setName(defaultName(next));
    setTouched(false);
    setNotes("");
  };
  const canTest = !!model && tryable(result, project?.modality);

  const footer = done ? (
    <>
      <button className="btn" onClick={onClose}>Close</button>
      {project && <button className="btn" onClick={keepImproving}>{onImprove ? "🔧 Keep improving" : "🔧 Keep improving →"}</button>}
      <button className="btn primary" onClick={() => { onClose(); navigate(`/library/${done.id}`); }}>📚 Open in library</button>
    </>
  ) : (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy || !model}>{busy ? <Spinner size={14} /> : "💾"} Save model</button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} width={testing && !done ? 900 : 600} title={done ? undefined : "💾 Save a model"} footer={footer}>
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.gentle}
            className="col center" style={{ gap: 12, padding: "18px 8px 6px", textAlign: "center" }}>
            <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.05 }}
              style={{ width: 68, height: 68, borderRadius: 34, background: "var(--success)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 800, boxShadow: "0 10px 30px color-mix(in srgb, var(--success) 35%, transparent)" }}>
              ✓
            </motion.div>
            <h3 style={{ fontSize: 21 }}>{finish ? "All done — nice work! 🎉" : "Saved to your library"}</h3>
            <p className="muted" style={{ maxWidth: 420, lineHeight: 1.55 }}>
              <b style={{ color: "var(--text)" }}>“{done.name}”</b> is in your library with its data-preparation recipe, ready to make predictions on new {project?.modality === "image" ? "pictures" : project?.modality === "text" ? "messages" : "data"} — no retraining needed.
              {finish ? " You can always come back to this project and improve it." : ""}
            </p>
            {unsavedLeft > 0 && (
              <button className="btn ghost sm" onClick={saveAnother}>+ Save another model ({unsavedLeft} not saved yet)</button>
            )}
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="col" style={{ gap: 16 }}>
            <p className="small muted" style={{ lineHeight: 1.55 }}>
              Saving keeps a trained model together with its data-preparation recipe, so you can use it later — no retraining needed.
              You don't have to improve it first: you can always come back.
            </p>
            {rows.length === 0 ? (
              <div className="inset small muted" style={{ padding: 14 }}>This run has no trained models to save — train again first.</div>
            ) : (
              <Field label="Which model?" right={<span className="tiny faint">ranked by {metricLabel(metric)}</span>}>
                <div role="radiogroup" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8, maxHeight: testing ? 170 : 300, overflow: "auto", padding: 3, margin: -3 }}>
                  {rows.map((r, i) => (
                    <ModelPick key={r.key} index={i} selected={r.key === key} onSelect={() => choose(r.key)}
                      emoji={registry.find((s) => s.id === r.model_id)?.emoji ?? "🤖"} label={r.label}
                      score={fmtMetric(metric, r.score)} metric={metricLabel(metric)} best={r.key === best && rows.length > 1} saved={isSaved(r.key)} />
                  ))}
                </div>
              </Field>
            )}
            {model && isSaved(model.key) && (
              <span className="tiny muted" style={{ marginTop: -8 }}>✓ This one is already in your library — saving again keeps a second copy.</span>
            )}
            <div className="grid" style={{ gridTemplateColumns: testing ? "1fr 1fr" : "1fr", gap: 14 }}>
              <Field label="Name">
                <input className="input" value={name} autoFocus onChange={(e) => { setName(e.target.value); setTouched(true); }} onKeyDown={(e) => e.key === "Enter" && save()} />
              </Field>
              <Field label="Notes" help="Anything you want to remember: what you changed, why it's good…">
                <textarea className="input" rows={testing ? 1 : 2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional"
                  style={{ height: "auto", padding: "8px 12px", resize: "vertical" }} />
              </Field>
            </div>
            {canTest && (
              <div className="col" style={{ padding: testing ? 14 : 0, gap: 12, border: "1px solid var(--hairline)", borderRadius: "var(--r-md)" }}>
                <button className="btn ghost" onClick={(e) => { e.currentTarget.focus(); setTesting((t) => !t); }} aria-expanded={testing} title="Shortcut inside: N for the next example"
                  style={{ justifyContent: "space-between", width: "100%", padding: testing ? 0 : "0 14px", height: 42 }}>
                  <span className="row" style={{ gap: 8 }}>🧪 <b>Test before saving</b> <span className="small muted">— optional</span></span>
                  <motion.span animate={{ rotate: testing ? 90 : 0 }} transition={spring.snappy} className="muted">›</motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {testing && model && (
                    <motion.div key="tester" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle} style={{ overflow: "hidden" }}>
                      <TryPanel key={model.key} result={result} model={model} compact />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
