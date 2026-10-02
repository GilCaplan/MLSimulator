/* Autoencoder map lab: squeeze 8×8 digits through a 2-number bottleneck, watch the map organise itself, then explore
 * it — click to decode a spot, draw a path between two spots, overlay what lives where. */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Glass, Segmented, Slider, Spinner, Toggle } from "../glass";
import { api } from "../../lib/api";
import { colorAt } from "../../lib/colors";
import { toast } from "../../lib/store";
import type { LabsCatalog, VaeFrame, VaeResult } from "../../lib/types";
import { Callout, doneIn, LabSplit, Lock, Pixels, RunBar, Spark, usePaced } from "./common";
import { useLabJob } from "./useLabJob";
import { VaeMap, type Z } from "./VaeMap";

interface VaeParams { mode: "vae" | "ae"; epochs: number; beta: number; hidden: number }
const DEFAULTS: VaeParams = { mode: "vae", epochs: 60, beta: 1, hidden: 128 };
type Tool = "probe" | "path";

export function VaeLab({ catalog }: { catalog: LabsCatalog | null }) {
  const [p, setP] = useState<VaeParams>(() => ({ ...DEFAULTS, ...(catalog?.labs.vae?.params as Partial<VaeParams> | undefined) }));
  const [frames, setFrames] = useState<VaeFrame[]>([]);
  const [tool, setTool] = useState<Tool>("probe");
  const [overlay, setOverlay] = useState(false);
  const [probe, setProbe] = useState<{ z: Z; image: number[] | null; loading: boolean } | null>(null);
  const [path, setPath] = useState<{ a: Z | null; b: Z | null; images: number[][] | null; loading: boolean }>({ a: null, b: null, images: null, loading: false });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reqId = useRef(0);
  const job = useLabJob<VaeResult>("vae", (ev) => {
    if (ev.type === "lab.frame") setFrames((f) => [...f, ev.data as VaeFrame]);
  });
  const { status, result } = job;
  const set = <K extends keyof VaeParams>(k: K, v: VaeParams[K]) => setP((s) => ({ ...s, [k]: v }));

  const [runNo, setRunNo] = useState(0);
  const allFrames = result?.frames ?? frames;
  const paced = usePaced(allFrames.length, 110, runNo);
  const frame = paced.idx >= 0 ? allFrames[paced.idx] : null;
  const upto = allFrames.slice(0, paced.idx + 1);
  const ready = !!result && paced.caughtUp; // the map is explorable once the replay has caught up
  const runMode = result?.mode ?? null;

  const train = (over?: Partial<VaeParams>) => {
    const params = { ...p, ...over };
    if (over) setP(params);
    setFrames([]);
    setProbe(null);
    setPath({ a: null, b: null, images: null, loading: false });
    setOverlay(false);
    setTool("probe");
    setRunNo((n) => n + 1);
    job.start(params);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const decode = async (z: Z[]) => {
    if (!result) return null;
    const id = ++reqId.current;
    try {
      const { images } = await api.vaeDecode(result.run_id, z);
      return id === reqId.current ? images : null;
    } catch (e) {
      if (id === reqId.current) toast.error(e);
      return null;
    }
  };

  const onPick = (z: Z, phase: "down" | "move") => {
    if (!result || !ready) return;
    if (tool === "probe") {
      setProbe((s) => ({ z, image: s?.image ?? null, loading: true }));
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const imgs = await decode([z]);
        if (imgs) setProbe({ z, image: imgs[0], loading: false });
      }, phase === "down" ? 0 : 70);
      return;
    }
    if (phase !== "down") return;
    if (!path.a || path.b) { setPath({ a: z, b: null, images: null, loading: false }); return; }
    const a = path.a;
    setPath({ a, b: z, images: null, loading: true });
    const zs: Z[] = Array.from({ length: 8 }, (_, k) => [a[0] + ((z[0] - a[0]) * k) / 7, a[1] + ((z[1] - a[1]) * k) / 7]);
    decode(zs).then((imgs) => setPath((s) => (s.b === z ? { ...s, images: imgs, loading: false } : s)));
  };

  const progress = frame ? frame.epoch / frame.epochs : undefined;

  const controls = (
    <Glass className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 2 }}>
        <h3>Settings</h3>
        <span className="small muted">1,797 handwritten digits, each 8×8 pixels, squeezed down to just two numbers.</span>
      </div>
      <Lock locked={job.busy}>
        <div className="col" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>Kind of autoencoder</span>
          <Segmented value={p.mode} onChange={(v) => set("mode", v)} full
            options={[{ value: "vae", label: "Variational (VAE)" }, { value: "ae", label: "Plain autoencoder" }]} />
          <span className="tiny faint">{p.mode === "vae" ? "Adds a little randomness and keeps the map tidy around the centre." : "Just learns to squeeze and rebuild — nothing keeps the map tidy."}</span>
        </div>
        <Slider label="Epochs" help="How many times it studies every digit." value={p.epochs} min={10} max={150} step={10} integer onChange={(v) => set("epochs", v)} />
        <AnimatePresence initial={false}>
          {p.mode === "vae" && (
            <motion.div key="beta" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
              <Slider label="Tidiness (beta)" help="How strongly the VAE is pushed to keep its map compact and gap-free. Higher = smoother map, blurrier rebuilds."
                value={p.beta} min={0.1} max={5} log onChange={(v) => set("beta", v)} format={(v) => v.toPrecision(2)} />
            </motion.div>
          )}
        </AnimatePresence>
        <Slider label="Hidden units" help="Size of the layers either side of the 2-number bottleneck." value={p.hidden} min={32} max={256} log integer onChange={(v) => set("hidden", v)} />
      </Lock>
      <RunBar status={status} error={job.error} onTrain={() => train()} onStop={job.cancel} progress={progress}
        label={frame ? `Epoch ${frame.epoch} of ${frame.epochs}` : "Loading the digits…"}
        doneText={result ? doneIn(allFrames[allFrames.length - 1]?.secs) : undefined} />
    </Glass>
  );

  return (
    <LabSplit controls={controls}>
      <Glass className="col" style={{ gap: 14 }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <h3>The digit map</h3>
            <span className="small muted">
              {ready ? (tool === "probe" ? "Click or drag anywhere to see what digit lives there." : path.a && !path.b ? "Now click a second spot (B)." : "Click two spots, A then B, to walk between them.")
                : "Each dot is one handwritten digit, placed by the encoder. Same colour = same digit."}
            </span>
          </div>
          {ready && (
            <div className="row wrap" style={{ gap: 12 }}>
              <Segmented size="sm" value={tool} onChange={(v) => { setTool(v); setProbe(null); setPath({ a: null, b: null, images: null, loading: false }); }}
                options={[{ value: "probe", label: "🔍 Probe" }, { value: "path", label: "↔ Path" }]} />
              <Toggle checked={overlay} onChange={setOverlay} label="What lives where" />
            </div>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <VaeMap frame={frame} result={ready ? result : null} overlay={overlay} probe={tool === "probe" ? probe?.z ?? null : null}
            path={tool === "path" ? path : { a: null, b: null }} onPick={onPick} interactive={ready} />
          {!frame && (
            <div className="lab-overlay-chip" style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
              {status === "idle" ? "Press Train to draw the map" : status === "failed" || status === "cancelled" ? "No map yet" : "Squeezing digits…"}
            </div>
          )}
          {frame && !ready && (
            <span className="lab-overlay-chip" style={{ left: 10, top: 10 }}>Epoch {frame.epoch} / {frame.epochs}</span>
          )}
          <AnimatePresence>
            {tool === "probe" && probe && (
              <motion.div key="probe" className="glass strong col center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                style={{ position: "absolute", right: 10, top: 10, padding: 10, gap: 6, borderRadius: "var(--r-md)" }}>
                <div style={{ position: "relative" }}>
                  {probe.image ? <Pixels values={probe.image} size={96} title="Decoded digit at this spot" /> : <div className="lab-pixels" style={{ width: 96, height: 96 }} />}
                  {probe.loading && <span style={{ position: "absolute", right: 4, bottom: 4 }}><Spinner size={12} /></span>}
                </div>
                <span className="tiny muted mono">({probe.z[0].toFixed(2)}, {probe.z[1].toFixed(2)})</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="row wrap" style={{ gap: 10, rowGap: 4 }}>
          {Array.from({ length: 10 }, (_, d) => (
            <span key={d} className="row small" style={{ gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: colorAt(d) }} />
              <span className="mono">{d}</span>
            </span>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 18 }}>
          <Spark label="Rebuild error" values={upto.map((f) => f.recon)} color="var(--accent)" format={(v) => v.toFixed(1)}
            hint="How different the rebuilt digits are from the originals. Lower is better." />
          <Spark label="Tidiness penalty (KL)" values={upto.map((f) => f.kl)} color="var(--text-2)" format={(v) => v.toFixed(1)}
            hint={runMode === "ae" || (!runMode && p.mode === "ae") ? "A plain autoencoder has no tidiness penalty, so this stays at zero." : "How far the VAE's map strays from a neat round cloud around the centre."} />
        </div>
      </Glass>

      <AnimatePresence>
        {tool === "path" && ready && (path.a || path.images) && (
          <motion.div key="path" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
            <Glass className="col" style={{ gap: 10 }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <h3>Walking from A to B</h3>
                {path.loading && <Spinner size={14} />}
              </div>
              <div className="lab-strip">
                <span className="badge accent">A</span>
                {(path.images ?? Array.from({ length: 8 }, () => null)).map((im, i) =>
                  im ? <Pixels key={i} values={im} size={52} title={`Step ${i + 1} of 8`} /> : <div key={i} className="lab-pixels skeleton" style={{ width: 52, height: 52 }} />)}
                <span className="badge accent">B</span>
              </div>
              <span className="small muted">Eight evenly spaced stops on the straight line between your two points, decoded into digits.
                {runMode === "vae" ? " A VAE usually morphs smoothly from one digit to the next." : " A plain autoencoder can produce smudges where the line crosses empty space."}</span>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      {result && ready && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Glass className="col" style={{ gap: 12 }}>
            <h3>Original vs rebuilt</h3>
            <span className="small muted">Each digit squeezed to two numbers and back again. The bottom row is all the decoder could recover.</span>
            <div className="lab-strip" style={{ gap: 10 }}>
              <div className="col tiny muted" style={{ gap: 4, justifyContent: "space-around", height: 100, textAlign: "right" }}>
                <span>original</span><span>rebuilt</span>
              </div>
              {result.reconstructions.map((r, i) => (
                <div key={i} className="col center" style={{ gap: 4 }}>
                  <Pixels values={r.original} size={48} title={`Original ${r.digit}`} />
                  <Pixels values={r.rebuilt} size={48} title={`Rebuilt ${r.digit}`} />
                  <span className="tiny muted mono">{r.digit}</span>
                </div>
              ))}
            </div>
          </Glass>
        </motion.div>
      )}

      {result && ready && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Glass className="col" style={{ gap: 12 }}>
            <h3>VAE or plain autoencoder?</h3>
            <div className="lab-tiles">
              <div className="inset col" style={{ gap: 4, padding: 14, outline: runMode === "vae" ? "2px solid var(--accent)" : undefined }}>
                <b>Variational (VAE){runMode === "vae" && <span className="badge accent" style={{ marginLeft: 8 }}>this run</span>}</b>
                <span className="small muted">Smoother map with fewer holes. Digits huddle around the centre, so almost any spot you click decodes into something digit-like.</span>
              </div>
              <div className="inset col" style={{ gap: 4, padding: 14, outline: runMode === "ae" ? "2px solid var(--accent)" : undefined }}>
                <b>Plain autoencoder{runMode === "ae" && <span className="badge accent" style={{ marginLeft: 8 }}>this run</span>}</b>
                <span className="small muted">Spreads points widely with gaps between groups. Rebuilds can be sharper, but the empty spaces decode into smudges.</span>
              </div>
            </div>
            <Callout icon="💡">
              <span className="small">Train the other kind and compare: click the gaps between colour groups and turn on “What lives where”.</span>
              <div><button className="btn sm" onClick={() => train({ mode: runMode === "vae" ? "ae" : "vae" })} disabled={job.busy}>
                Train a {runMode === "vae" ? "plain autoencoder" : "VAE"} now
              </button></div>
            </Callout>
          </Glass>
        </motion.div>
      )}
    </LabSplit>
  );
}
