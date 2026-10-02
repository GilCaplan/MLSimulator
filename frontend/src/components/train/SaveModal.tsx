import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useProject, toast } from "../../lib/store";
import type { ModelResult } from "../../lib/types";
import { Field, Modal, Spinner } from "../glass";
import { useSaved } from "./util";

/** "Save to library" dialog for one trained model. */
export function SaveModal({ open, onClose, jobId, model }: { open: boolean; onClose: () => void; jobId: string; model: ModelResult }) {
  const project = useProject((s) => s.project);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(`${model.label} · ${project?.name ?? "project"}`);
      setNotes("");
    }
  }, [open, model.label, project?.name]);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.saveModel({ job_id: jobId, key: model.key, name: name.trim() || model.label, notes, project_id: project?.id });
      useSaved.getState().mark(jobId, model.key, saved.id);
      toast.success(`“${saved.name}” is in your library — open it with “View in library”.`);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="💾 Save to library"
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy && <Spinner size={14} />} Save model</button>
      </>}>
      <div className="col" style={{ gap: 16 }}>
        <p className="small muted" style={{ lineHeight: 1.55 }}>
          Saving keeps the trained model together with its data-preparation recipe, so you can make predictions on new rows later — no retraining needed.
        </p>
        <Field label="Name">
          <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </Field>
        <Field label="Notes" help="Anything you want to remember: what you changed, why it's good…">
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
