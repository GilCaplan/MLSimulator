import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { stagger } from "../../../design/motion";
import { api } from "../../../lib/api";
import { toast } from "../../../lib/store";
import type { DatasetSummary } from "../../../lib/types";
import { Dropzone, Glass, Spinner } from "../../glass";
import { SectionTitle } from "../ui";

const IMAGE_TYPES = ["PNG", "JPG", "BMP", "GIF", "WEBP", "TIFF"];

/** Upload a ZIP of pictures: one folder per class, or images plus a labels CSV. */
export function ZipUploadPanel({ onLoaded }: { onLoaded: (d: DatasetSummary) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const upload = async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setLastError("Please choose a .zip file — zip the folder of pictures first (right-click → Compress).");
      return;
    }
    setBusy(f.name);
    setLastError(null);
    try {
      const d = await api.uploadImages(f);
      toast.success(`Read ${(d.n_images ?? d.n_rows).toLocaleString()} pictures from ${f.name}.`);
      (d.warnings ?? []).forEach((w) => toast.info(w));
      onLoaded(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      toast.error(`Couldn't use ${f.name}: ${msg}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Glass>
      <SectionTitle icon="📦" title="Upload your own pictures" sub="Zip them up in one of these two layouts — the app works out the labels." />
      <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginBottom: 14 }}>
        <Layout
          title="A · One folder per class"
          note="The folder name becomes the label. Best for classification."
          tree={[
            { d: 0, icon: "🗜️", name: "pets.zip" },
            { d: 1, icon: "📁", name: "cat/", accent: true },
            { d: 2, icon: "🖼️", name: "img001.jpg" },
            { d: 2, icon: "🖼️", name: "img002.jpg" },
            { d: 1, icon: "📁", name: "dog/", accent: true },
            { d: 2, icon: "🖼️", name: "img101.jpg" },
            { d: 2, icon: "⋯", name: "" },
          ]}
        />
        <Layout
          title="B · Pictures + labels.csv"
          note="Two columns: filename, then label (a class or a number). Numbers → regression."
          tree={[
            { d: 0, icon: "🗜️", name: "dots.zip" },
            { d: 1, icon: "📄", name: "labels.csv", accent: true },
            { d: 1, icon: "🖼️", name: "a.png" },
            { d: 1, icon: "🖼️", name: "b.png" },
            { d: 1, icon: "⋯", name: "" },
          ]}
          csv={["filename,label", "a.png,7", "b.png,3"]}
        />
      </motion.div>
      <Dropzone onFile={upload} busy={!!busy} accept=".zip,application/zip">
        <AnimatePresence mode="wait">
          {busy ? (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col center" style={{ gap: 12, padding: "14px 0" }}>
              <Spinner size={30} color="var(--accent)" />
              <b>Unpacking {busy}…</b>
              <span className="small muted">Reading every picture and resizing it to 64×64.</span>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="col center" style={{ gap: 10, padding: "14px 0" }}>
              <motion.span animate={{ y: [0, -6, 0], rotate: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }} style={{ fontSize: 40 }}>🗜️</motion.span>
              <b style={{ fontSize: 15 }}>Drop a .zip here, or click to choose</b>
              <div className="row wrap center" style={{ gap: 6 }}>
                {IMAGE_TYPES.map((f) => <span key={f} className="badge">{f}</span>)}
              </div>
              <span className="tiny faint">Up to 200 MB and 20,000 pictures · each is centre-cropped to a square and stored at 64×64.</span>
            </motion.div>
          )}
        </AnimatePresence>
      </Dropzone>
      <AnimatePresence>
        {lastError && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="small" style={{ color: "var(--danger)", marginTop: 10 }}>
            ⚠️ {lastError}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="row small muted" style={{ gap: 8, marginTop: 14 }}>
        <span>🔒</span>
        <span>Your pictures stay on this computer — they're read by the app running locally and never uploaded to the internet.</span>
      </div>
    </Glass>
  );
}

function Layout({ title, note, tree, csv }: { title: string; note: string; tree: { d: number; icon: string; name: string; accent?: boolean }[]; csv?: string[] }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} className="inset col" style={{ padding: 14, gap: 8 }}>
      <b className="small">{title}</b>
      <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
        <div className="col mono" style={{ gap: 3, fontSize: 12 }}>
          {tree.map((t, i) => (
            <motion.span key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.06 }}
              className="row" style={{ gap: 6, paddingLeft: t.d * 16, color: t.accent ? "var(--accent)" : "var(--text-2)", fontWeight: t.accent ? 650 : 450 }}>
              {t.d > 0 && <span className="faint" style={{ marginLeft: -12 }}>└</span>}
              <span>{t.icon}</span>{t.name}
            </motion.span>
          ))}
        </div>
        {csv && (
          <div className="col mono" style={{ gap: 2, fontSize: 11, padding: "6px 8px", borderRadius: 8, background: "var(--glass-strong)", border: "1px solid var(--hairline)", marginTop: 20 }}>
            {csv.map((l, i) => <span key={i} style={{ color: i === 0 ? "var(--text-3)" : "var(--text-2)" }}>{l}</span>)}
          </div>
        )}
      </div>
      <span className="tiny muted" style={{ lineHeight: 1.45 }}>{note}</span>
    </motion.div>
  );
}
