import { useRef, useState } from "react";
import { toast, useUI } from "../../../lib/store";
import { Modal, Segmented } from "../../glass";
import type { PreviewWidth } from "./shared";

const FILE_NAME = "ml-playground-appearance.json";

/** Reset all · Export · Import · Copy JSON · preview width. */
export function PrefsToolbar({ width, setWidth }: { width: PreviewWidth; setWidth: (w: PreviewWidth) => void }) {
  const exportPrefs = useUI((s) => s.exportPrefs);
  const [confirm, setConfirm] = useState(false);
  const [importing, setImporting] = useState(false);

  const download = () => {
    const blob = new Blob([exportPrefs()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = FILE_NAME;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Saved your look as " + FILE_NAME);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportPrefs());
      toast.success("Appearance settings copied. Paste them into Import on another computer.");
    } catch {
      toast.error("Couldn't reach the clipboard. Use Export instead.");
    }
  };

  return (
    <div className="row wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
      <button className="btn sm" onClick={download} title="Download your appearance settings as a file">⬇︎ Export</button>
      <button className="btn sm" onClick={() => setImporting(true)} title="Load appearance settings from a file or pasted text">⬆︎ Import</button>
      <button className="btn sm" onClick={copy} title="Copy the settings as JSON">⧉ Copy JSON</button>
      <button className="btn sm danger" onClick={() => setConfirm(true)}>↺ Reset all</button>
      <span style={{ width: 1, height: 22, background: "var(--hairline)", margin: "0 4px" }} aria-hidden />
      <span className="tiny faint">Preview</span>
      <Segmented<string>
        fixedRenderer="segmented"
        size="sm"
        value={String(width)}
        onChange={(v) => setWidth(Number(v) as PreviewWidth)}
        options={[{ value: "600", label: "600" }, { value: "1000", label: "1000" }, { value: "1400", label: "1400" }]}
      />
      <ResetAllModal open={confirm} onClose={() => setConfirm(false)} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function ResetAllModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const resetPrefs = useUI((s) => s.resetPrefs);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset the whole look?"
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            onClick={() => {
              resetPrefs("all");
              onClose();
              toast.success("Back to the original Liquid Glass look.");
            }}
          >
            Reset everything
          </button>
        </>
      }
    >
      <p className="muted" style={{ lineHeight: 1.55 }}>
        Template, background, colours, shape, fonts, controls, density and motion all go back to their defaults. Your light/dark
        choice stays as it is. Tip: <b style={{ color: "var(--text)" }}>Export</b> first if you might want this look back.
      </p>
    </Modal>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importPrefs = useUI((s) => s.importPrefs);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const apply = (json: string) => {
    const r = importPrefs(json);
    if (!r.ok) {
      setError(r.error ?? "That didn't work.");
      return;
    }
    toast.success(r.changed.length ? `Imported: ${r.changed.length} setting${r.changed.length === 1 ? "" : "s"} changed.` : "Imported. It was already your look!");
    setText("");
    setError(null);
    onClose();
  };
  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import a look"
      width={520}
      footer={
        <>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={!text.trim()} onClick={() => apply(text)}>Apply pasted settings</button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <p className="muted small" style={{ lineHeight: 1.55 }}>
          Choose a file you exported earlier, or paste the JSON from <b style={{ color: "var(--text)" }}>Copy JSON</b>. Anything
          unrecognised is ignored, so it's safe to try.
        </p>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) apply(await f.text());
          }}
        />
        <button className="btn" onClick={() => file.current?.click()}>📄 Choose a file…</button>
        <div className="row" style={{ gap: 10 }}>
          <div className="divider grow" style={{ margin: 0 }} />
          <span className="tiny faint">or paste</span>
          <div className="divider grow" style={{ margin: 0 }} />
        </div>
        <textarea
          className="input mono"
          rows={7}
          placeholder='{ "app": "ml-playground", "kind": "ui-prefs", … }'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          style={{ width: "100%" }}
        />
        {error && <span className="small" style={{ color: "var(--danger)" }}>⚠️ {error}</span>}
      </div>
    </Modal>
  );
}
