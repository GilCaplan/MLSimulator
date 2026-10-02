import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { ImagePredictResponse, SavedModel } from "../../lib/types";
import { extent, useSize } from "../charts";
import { Dropzone, InfoTip, Glass, Segmented, Slider, Spinner } from "../glass";
import { imageDims } from "../train/archLayers";
import { HeatLegend, Thumb } from "../train/visionKit";
import { DrawPad, type DrawPadHandle } from "./DrawPad";
import { useDebounced } from "./inputs";
import { PredictionPanel } from "./PredictionPanel";
import { SectionTitle, rise } from "./shared";

const readFile = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error("Couldn't read that file."));
  r.readAsDataURL(f);
});

/** "Try it live" for image models: draw, upload, paste or pick a test picture — the model answers as you go. */
export function ImagePlayground({ model }: { model: SavedModel }) {
  const pad = useRef<DrawPadHandle>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [result, setResult] = useState<ImagePredictResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"plain" | "heat">("heat");
  const [strength, setStrength] = useState(0.7);
  const [picked, setPicked] = useState<number | null>(null);
  const [gridRef, { width }] = useSize<HTMLDivElement>();
  const wide = width > 860;
  const seq = useRef(0);
  const lastError = useRef<string | null>(null);
  const vision = model.detail?.vision;
  const datasetId = vision?.dataset_id ?? model.dataset?.id;
  const dims = imageDims(model.image_shape ?? vision?.image_shape);

  const examples = useMemo(() => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const it of [...(vision?.correct ?? []).slice(0, 6), ...(vision?.mistakes ?? []).slice(0, 4)]) {
      if (!seen.has(it.i)) { seen.add(it.i); out.push(it.i); }
    }
    return out.length ? out : Array.from({ length: 8 }, (_, i) => i);
  }, [vision]);

  const pick = (i: number) => {
    if (!datasetId) return;
    setPicked(i);
    pad.current?.load(api.imageUrl(datasetId, i, 256)).catch(() => toast.error("That picture isn't available any more (its dataset may have been deleted)."));
  };

  // start from a real test picture so there's an answer straight away
  useEffect(() => {
    if (datasetId && examples.length) {
      const t = setTimeout(() => {
        setPicked(examples[0]);
        pad.current?.load(api.imageUrl(datasetId, examples[0], 256)).catch(() => setPicked(null));
      }, 60);
      return () => clearTimeout(t);
    }
  }, [model.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // paste an image from the clipboard (⌘V / Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((x) => x.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (!f) return;
      e.preventDefault();
      readFile(f).then((u) => pad.current?.load(u)).then(() => { setPicked(null); toast.success("Pasted!"); }).catch(toast.error);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const upload = (f: File) => {
    if (!f.type.startsWith("image/")) { toast.error("That's not an image — try a PNG or JPG."); return; }
    readFile(f).then((u) => pad.current?.load(u)).then(() => setPicked(null)).catch(toast.error);
  };

  /* ---- live prediction (debounced) */
  const pred = useDebounced(uri, 160);
  useEffect(() => {
    if (!pred) return;
    const s = ++seq.current;
    setBusy(true);
    api.predictImage(model.id, [pred])
      .then((r) => { if (s === seq.current) { setResult(r); lastError.current = null; } })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== lastError.current) toast.error(msg);
        lastError.current = msg;
      })
      .finally(() => s === seq.current && setBusy(false));
  }, [pred, model.id]);

  const targetRange = useMemo<[number, number] | null>(() => {
    const pts = model.detail?.residuals?.points;
    if (model.task === "classification" || !pts?.length) return null;
    return extent(pts.map((p) => p.t));
  }, [model]);

  const heat = result?.saliency ?? vision?.pixel_importance ?? null;
  const heatIsFixed = !result?.saliency && !!vision?.pixel_importance;

  return (
    <motion.section variants={rise}>
      <SectionTitle
        id="try"
        icon="🎨"
        title="Try it live"
        subtitle="Draw something, drop in a photo, paste one from your clipboard (⌘V) or pick a test picture — the model answers as you draw."
      />
      <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1.55fr) minmax(320px, 1fr)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <Glass style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
            <div className="col" style={{ gap: 8 }}>
              <h3>Your picture</h3>
              <DrawPad ref={pad} onChange={setUri} display={260} />
            </div>

            <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="col center faint" style={{ alignSelf: "center", gap: 2, paddingTop: 30 }}>
              <span style={{ fontSize: 22 }}>→</span>
              <span className="tiny">shrink</span>
            </motion.div>

            <div className="col" style={{ gap: 10, flex: "1 1 190px", minWidth: 190 }}>
              <h3 className="row" style={{ gap: 6 }}>
                What the model sees
                <InfoTip text="Before the model looks, every picture is cropped to a square and resized to the resolution it was trained on (and turned grey, if it was trained in grey). This tiny version is literally all it gets." />
              </h3>
              <div style={{ position: "relative", width: 168 }}>
                {result ? (
                  <Thumb src={result.model_input} size={168} radius={16} heat={view === "heat" ? heat : null} strength={strength} />
                ) : (
                  <div className="skeleton" style={{ width: 168, height: 168, borderRadius: 16 }} />
                )}
                <AnimatePresence>
                  {busy && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, background: "rgba(20,20,30,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Spinner size={13} color="#fff" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {dims && (
                <span className="small muted" style={{ lineHeight: 1.5, maxWidth: 260 }}>
                  Just <b>{dims.w}×{dims.h} {dims.c === 1 ? "grey" : "colour"} pixels</b> — {(dims.w * dims.h * dims.c).toLocaleString()} numbers. Thin lines and tiny details can vanish when it shrinks.
                </span>
              )}
              {heat && (
                <div className="col" style={{ gap: 8, maxWidth: 260 }}>
                  <Segmented size="sm" value={view} onChange={setView}
                    options={[{ value: "plain", label: "Plain" }, { value: "heat", label: heatIsFixed ? "Pixels it uses" : "Where it looked" }]} />
                  {view === "heat" && (
                    <>
                      <Slider fixedRenderer="slider" value={strength} min={0} max={1} step={0.05} onChange={setStrength} format={(v) => `${Math.round(v * 100)}%`} />
                      <HeatLegend width={90} low="ignored" high={heatIsFixed ? "relied on" : "decisive"} />
                      <span className="tiny faint" style={{ lineHeight: 1.45 }}>
                        {heatIsFixed
                          ? "This classic model always watches the same pixel positions — move your drawing and see whether it still lands on the bright spots."
                          : "Bright = the pixels that pushed this answer most. It updates with every stroke."}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="divider" style={{ margin: "18px 0 14px" }} />

          <div className="col" style={{ gap: 10 }}>
            <div className="row between wrap" style={{ gap: 8 }}>
              <span className="small" style={{ fontWeight: 600 }}>Or start from a test picture</span>
              <span className="tiny faint">pictures it never saw while training · then draw on top!</span>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {datasetId && examples.map((i, k) => (
                <motion.button key={i} onClick={() => pick(i)} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.pop, delay: k * 0.03 }}
                  whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.92 }}
                  style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", borderRadius: 12, boxShadow: picked === i ? "0 0 0 2.5px var(--accent)" : "none" }}>
                  <Thumb datasetId={datasetId} i={i} size={52} px={64} radius={12} />
                </motion.button>
              ))}
            </div>
            <Dropzone onFile={upload} accept="image/*">
              <div className="row center" style={{ gap: 10 }}>
                <span style={{ fontSize: 22 }}>📁</span>
                <span className="small"><b>Drop a picture here</b> <span className="muted">or click to choose one · or paste with ⌘V</span></span>
              </div>
            </Dropzone>
          </div>
        </Glass>

        <Glass variant="strong" style={{ position: wide ? "sticky" : "relative", top: 58, minWidth: 0, zIndex: 2 }}>
          <PredictionPanel model={model} result={result} warming={!result} busy={busy && !!result} targetRange={targetRange} />
        </Glass>
      </div>
    </motion.section>
  );
}
