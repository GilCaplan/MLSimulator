import { useRef, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { SavedModel } from "../../lib/types";
import { Spinner } from "../glass";
import { Popover } from "./Popover";

/** File-name-safe version of a model name. */
export const safeName = (s: string) => s.replace(/[^\w\- ]+/g, "_").trim().replace(/\s+/g, "_").slice(0, 60) || "model";

/** Save a JS value as a pretty-printed .json download. */
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TORCH_SNIPPET = `import torch, json
state = torch.load("weights.pt", weights_only=True)
arch = json.load(open("architecture.json"))["nn_arch"]`;

const MENU_CSS = `
.exm-item { display: flex; gap: 12px; align-items: flex-start; width: 100%; padding: 10px 12px; border-radius: var(--r-md);
  background: transparent; border: 0; color: var(--text); text-align: left; cursor: pointer; text-decoration: none; font: inherit; }
.exm-item:hover, .exm-item:focus-visible { background: var(--fill); outline: none; }
.exm-item[aria-disabled="true"] { cursor: wait; opacity: .7; }
.exm-ico { width: 32px; height: 32px; border-radius: var(--r-sm); background: var(--accent-soft); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
`;

/** "Export ▾" on a saved model's page: full bundle, architecture-only JSON, PyTorch weights hint, and "What's inside?". */
export function ExportMenu({ model }: { model: SavedModel }) {
  const btn = useRef<HTMLButtonElement>(null);
  const infoBtn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const torch = model.family === "torch";

  const exportArch = async () => {
    setBusy(true);
    try {
      const arch = await api.modelArchitecture(model.id);
      downloadJson(arch, `${safeName(model.name)}.architecture.json`);
      toast.success("Architecture saved as a .json file.");
      setOpen(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{MENU_CSS}</style>
      <div className="row" style={{ gap: 4 }}>
        <button ref={btn} className={`btn sm${open ? " primary" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setInfo(false); setOpen((o) => !o); }}>
          ⬇︎ Export <span style={{ fontSize: 10, opacity: 0.8 }}>▾</span>
        </button>
        <button ref={infoBtn} className="btn ghost sm icon" aria-label="What's inside an export?" title="What's inside?" onClick={() => { setOpen(false); setInfo((o) => !o); }}>ⓘ</button>
      </div>

      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} width={420}>
        <div role="menu" className="col" style={{ gap: 2 }}>
          <a role="menuitem" className="exm-item" href={api.exportUrl(model.id)} download onClick={() => { setOpen(false); toast.info("Preparing the bundle — your download will start in a moment."); }}>
            <span className="exm-ico">🗜️</span>
            <span className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 14 }}>Full bundle (.zip)</b>
              <span className="tiny muted" style={{ lineHeight: 1.45 }}>Model + {torch ? "weights + " : ""}recipe. Re-import here or on another computer.</span>
            </span>
          </a>
          <button role="menuitem" className="exm-item" aria-disabled={busy} onClick={() => !busy && exportArch()}>
            <span className="exm-ico">{busy ? <Spinner size={14} color="var(--accent)" /> : "📐"}</span>
            <span className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 14 }}>Architecture only (.json)</b>
              <span className="tiny muted" style={{ lineHeight: 1.45 }}>Share the design without the trained weights — settings{torch ? ", network layers" : ""} and data recipe in plain text.</span>
            </span>
          </button>
          {torch && <TorchNote />}
        </div>
      </Popover>

      <Popover anchor={infoBtn} open={info} onClose={() => setInfo(false)} width={360}>
        <WhatsInside torch={torch} />
      </Popover>
    </>
  );
}

function TorchNote() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TORCH_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — select the text and copy it by hand.");
    }
  };
  return (
    <div className="col" style={{ gap: 8, padding: "10px 12px 6px", borderTop: "1px solid var(--hairline)", marginTop: 4 }}>
      <span className="small" style={{ lineHeight: 1.5 }}>
        🔥 <b>For PyTorch users:</b> the bundle also includes the raw network weights as <span className="mono">weights.pt</span>. Load them in Python:
      </span>
      <div className="inset col" style={{ padding: "6px 10px 10px", gap: 4 }}>
        <div className="row between">
          <span className="tiny faint">Python</span>
          <button className="btn ghost sm" style={{ height: 24, padding: "0 8px", fontSize: 11.5 }} onClick={copy}>{copied ? "✓ Copied" : "⧉ Copy"}</button>
        </div>
        <pre className="mono scroll" style={{ margin: 0, fontSize: 10.5, lineHeight: 1.65, whiteSpace: "pre", overflowX: "auto", color: "var(--text)", userSelect: "text" }}>{TORCH_SNIPPET}</pre>
      </div>
      <span className="tiny faint" style={{ lineHeight: 1.45 }}><span className="mono">state</span> maps each layer's name to its learned numbers. Rebuild the layers listed in <span className="mono">arch</span>, then call <span className="mono">net.load_state_dict(state)</span>.</span>
    </div>
  );
}

function WhatsInside({ torch }: { torch: boolean }) {
  const files: [string, ReactNode][] = [
    ["model.joblib", "The trained model itself — everything it learned."],
    ["preprocessor.joblib", "How raw data gets cleaned and turned into numbers before the model sees it."],
    ["architecture.json", "A readable description: model type, settings, layers and data recipe."],
    ...(torch ? [["weights.pt", "The network's learned weights in PyTorch's own format."] as [string, ReactNode]] : []),
    ["meta.json · result.json", "Name, notes, scores and the charts you see on this page."],
    ["README.txt", "Short instructions for using the files in Python."],
    ["MANIFEST.json · SIGNATURE", "A fingerprint of every file, so ML Playground can tell if anything was changed and whether this computer made it."],
  ];
  return (
    <div className="col" style={{ gap: 8, padding: 6 }}>
      <b style={{ fontSize: 14 }}>📦 What's inside the bundle?</b>
      <div className="col" style={{ gap: 7 }}>
        {files.map(([f, d]) => (
          <div key={f} className="col" style={{ gap: 1 }}>
            <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent)" }}>{f}</span>
            <span className="tiny muted" style={{ lineHeight: 1.45 }}>{d}</span>
          </div>
        ))}
      </div>
      <span className="tiny faint" style={{ lineHeight: 1.45, borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
        Model files can run code when opened, so only share bundles with people you trust — and only import ones you trust.
      </span>
    </div>
  );
}
