import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../design/motion";
import { ApiError, api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { ImportNeedsTrust, SavedModel } from "../../lib/types";
import { Dropzone, InfoTip, Modal, ProgressBar, Spinner } from "../glass";
import { taskMeta } from "./shared";

const MODALITY: Record<string, string> = {
  tabular: "📋 A table (rows and columns)", image: "🖼️ Pictures", text: "💬 Text", ratings: "⭐ Star ratings", timeseries: "⏱️ A time series",
};

type Phase =
  | { k: "pick" }
  | { k: "uploading"; file: File; trusted: boolean }
  | { k: "trust"; file: File; info: ImportNeedsTrust }
  | { k: "error"; file: File | null; message: string };

const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Import a model bundle (.zip) exported from ML Playground — with an explicit trust step for files from elsewhere. */
export function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (m: SavedModel) => void }) {
  const [phase, setPhase] = useState<Phase>({ k: "pick" });
  const busy = phase.k === "uploading";

  const close = () => {
    if (busy) return;
    onClose();
    setTimeout(() => setPhase({ k: "pick" }), 250);
  };

  const upload = async (file: File, trusted = false) => {
    if (!/\.zip$/i.test(file.name)) {
      setPhase({ k: "error", file, message: "That isn't a .zip file. Pick the bundle you got from “Export → Full bundle”." });
      return;
    }
    setPhase({ k: "uploading", file, trusted });
    try {
      const m = await api.importModel(file, trusted);
      toast.success(`“${m.name}” is now in your library.`);
      onImported(m);
      setPhase({ k: "pick" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.data as ImportNeedsTrust | undefined)?.needs_trust) {
        setPhase({ k: "trust", file, info: e.data as ImportNeedsTrust });
      } else {
        setPhase({ k: "error", file, message: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  const footer =
    phase.k === "trust" ? (
      <>
        <button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn primary" onClick={() => upload(phase.file, true)}>I trust this file — import</button>
      </>
    ) : phase.k === "error" ? (
      <>
        <button className="btn ghost" onClick={close}>Close</button>
        <button className="btn primary" onClick={() => setPhase({ k: "pick" })}>Try another file</button>
      </>
    ) : (
      <button className="btn ghost" onClick={close} disabled={busy}>Cancel</button>
    );

  return (
    <Modal open={open} onClose={close} title="📥 Import a model" width={520} footer={footer}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={phase.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.snappy} className="col" style={{ gap: 14 }}>
          {phase.k === "pick" && (
            <>
              <p className="muted small" style={{ lineHeight: 1.55 }}>
                Bring in a model someone exported from ML Playground — or one you exported yourself on another computer. It arrives fully
                trained, ready to make predictions.
              </p>
              <Dropzone accept=".zip,application/zip" onFile={(f) => upload(f)}>
                <div className="col center" style={{ gap: 6 }}>
                  <span style={{ fontSize: 34 }}>🗜️</span>
                  <b>Drop a model bundle here</b>
                  <span className="small muted">or click to choose a <span className="mono">.zip</span> file</span>
                </div>
              </Dropzone>
              <p className="tiny faint row" style={{ gap: 6 }}>
                Where do I get one? Open any saved model and choose <b>Export ▾ → Full bundle</b>.
                <InfoTip text="A bundle holds the trained model, how its data gets prepared, and a description of its design. Bundles made on this computer are recognised automatically." />
              </p>
            </>
          )}

          {phase.k === "uploading" && (
            <div className="inset col" style={{ padding: 18, gap: 12 }}>
              <div className="row" style={{ gap: 12 }}>
                <Spinner size={20} color="var(--accent)" />
                <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                  <b className="truncate">{phase.file.name}</b>
                  <span className="tiny muted">{mb(phase.file.size)} · uploading and test-loading the model…</span>
                </div>
              </div>
              <ProgressBar value={0} indeterminate />
            </div>
          )}

          {phase.k === "trust" && <TrustStep file={phase.file} info={phase.info} />}

          {phase.k === "error" && (
            <div className="inset col" style={{ padding: 16, gap: 8, borderColor: "color-mix(in srgb, var(--danger) 45%, transparent)", background: "color-mix(in srgb, var(--danger) 9%, var(--fill))" }}>
              <b className="row" style={{ gap: 8, color: "var(--danger)" }}>⚠️ That file couldn't be imported</b>
              <span className="small" style={{ lineHeight: 1.5, color: "var(--text)" }}>{phase.message}</span>
              {phase.file && <span className="tiny faint mono truncate">{phase.file.name}</span>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

function TrustStep({ file, info }: { file: File; info: ImportNeedsTrust }) {
  const s = info.summary;
  const task = s.task ? taskMeta(s.task) : null;
  const rows: [string, string][] = [
    ["Name", s.name || "(no name)"],
    ["Model type", s.label || s.model_id || "—"],
    ["Task", task ? `${task.icon} ${task.label}` : "—"],
    ["Kind of data", MODALITY[s.modality ?? "tabular"] ?? s.modality ?? "—"],
    ["Made on", s.created_at ? new Date(s.created_at * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "unknown"],
  ];
  return (
    <>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>🛡️</span>
        <div className="col" style={{ gap: 3 }}>
          <b>Do you trust where this file came from?</b>
          <span className="small muted" style={{ lineHeight: 1.5 }}>{info.reason}</span>
        </div>
      </div>
      <div className="inset col" style={{ padding: "12px 14px", gap: 7 }}>
        {rows.map(([k, v]) => (
          <div key={k} className="row" style={{ gap: 12, alignItems: "baseline" }}>
            <span className="tiny muted" style={{ width: 92, flexShrink: 0 }}>{k}</span>
            <span className="small" style={{ fontWeight: k === "Name" ? 650 : 500, minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
          </div>
        ))}
        <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
          <span className="tiny muted" style={{ width: 92, flexShrink: 0 }}>File</span>
          <span className="tiny mono faint truncate">{file.name} · {mb(file.size)}</span>
        </div>
      </div>
      <div className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: "var(--r-md)", alignItems: "flex-start",
        background: "color-mix(in srgb, var(--warning) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)" }}>
        <span>⚠️</span>
        <span className="small" style={{ lineHeight: 1.5, color: "var(--text)" }}>
          Model files can run code when they're opened. Only import files from people you trust.
        </span>
      </div>
    </>
  );
}
