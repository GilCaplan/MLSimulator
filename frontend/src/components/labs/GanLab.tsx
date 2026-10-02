/* GAN lab: a forger (generator) learns to fake points from a 2-D shape while a detective (discriminator) learns to
 * spot the fakes. Live canvas + loss sparklines, then a replay scrubber and coverage / precision scores. */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Glass, Segmented, Slider } from "../glass";
import type { GanFrame, GanResult, LabsCatalog } from "../../lib/types";
import { Callout, doneIn, LabSplit, Lock, RunBar, Spark, StatTile, usePaced } from "./common";
import { GanCanvas } from "./GanCanvas";
import { sampleTarget, TARGET_ORDER, targetExtent } from "./targets";
import { useMotionFull } from "./theme";
import { useLabJob } from "./useLabJob";

interface GanParams { target: string; steps: number; lr: number; hidden: number; d_steps: number; latent: number }
const DEFAULTS: GanParams = { target: "ring8", steps: 2000, lr: 0.001, hidden: 64, d_steps: 1, latent: 2 };
const pct0 = (v: number) => `${Math.round(v * 100)}%`;

export function GanLab({ catalog }: { catalog: LabsCatalog | null }) {
  const [p, setP] = useState<GanParams>(() => ({ ...DEFAULTS, ...(catalog?.labs.gan?.params as Partial<GanParams> | undefined) }));
  const [frames, setFrames] = useState<GanFrame[]>([]);
  const [runTarget, setRunTarget] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [runNo, setRunNo] = useState(0);
  const motionFull = useMotionFull();
  const job = useLabJob<GanResult>("gan", (ev) => {
    if (ev.type === "lab.frame") setFrames((f) => [...f, ev.data as GanFrame]);
  });
  const { status, result } = job;
  const set = <K extends keyof GanParams>(k: K, v: GanParams[K]) => setP((s) => ({ ...s, [k]: v }));

  // the shape on screen: the run's shape once training starts, otherwise a preview of the picked one
  const shape = runTarget ?? p.target;
  const livePts = useMemo(() => sampleTarget(shape, 500, 3), [shape]);
  const first = frames[0];
  const real = result?.target === shape ? result.real : runTarget && first?.real ? first.real : livePts;
  const extent = result?.target === shape ? result.extent : runTarget && first?.extent ? first.extent : targetExtent(livePts);

  const allFrames = result?.frames ?? frames;
  const paced = usePaced(allFrames.length, 60, runNo);
  const idx = cursor === null ? paced.idx : Math.min(cursor, allFrames.length - 1);
  const showScores = !!result && (paced.caughtUp || cursor !== null);
  const frame = idx >= 0 ? allFrames[idx] : null;
  const upto = allFrames.slice(0, idx + 1);

  const train = () => {
    setFrames([]);
    setCursor(null);
    setPlaying(false);
    setRunTarget(p.target);
    setRunNo((n) => n + 1);
    job.start({ ...p });
  };

  // replay: walk the cursor through the frames (~11 fps)
  useEffect(() => {
    if (!playing) return;
    const n = allFrames.length;
    if ((cursor ?? n - 1) >= n - 1) { setPlaying(false); return; }
    const id = setTimeout(() => setCursor((c) => Math.min(n - 1, (c ?? -1) + 1)), 90);
    return () => clearTimeout(id);
  }, [playing, cursor, allFrames.length]);

  const pickTarget = (t: string) => {
    set("target", t);
    if (!job.busy) { setRunTarget(null); setFrames([]); setCursor(null); setPlaying(false); job.setResult(null); }
  };

  const controls = (
    <Glass className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 2 }}>
        <h3>Settings</h3>
        <span className="small muted">Pick a shape for the forger to copy, then press Train.</span>
      </div>
      <Lock locked={job.busy}>
        <div className="col" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>Target shape</span>
          <div className="lab-target-grid" role="radiogroup" aria-label="Target shape">
            {TARGET_ORDER.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={p.target === t} className={`lab-target ${p.target === t ? "on" : ""}`}
                onClick={() => pickTarget(t)} title={catalog?.gan_targets[t] ?? t}>
                <TargetPreview name={t} />
                <span>{shortName(catalog?.gan_targets[t] ?? t)}</span>
              </button>
            ))}
          </div>
        </div>
        <Slider label="Training steps" help="How many rounds of forger-vs-detective to play." value={p.steps} min={300} max={5000} step={100} integer
          onChange={(v) => set("steps", v)} format={(v) => v.toLocaleString()} />
        <Slider label="Learning rate" help="How big a nudge both networks get each round. Too big and they chase each other in circles; too small and nothing happens."
          value={p.lr} min={0.0001} max={0.01} log onChange={(v) => set("lr", v)} format={(v) => v.toPrecision(2)} />
        <Slider label="Hidden units" help="The 'brain size' of each network. More units can draw more detailed shapes." value={p.hidden} min={8} max={256} log integer
          onChange={(v) => set("hidden", v)} />
        <div className="col" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>Detective practice per round</span>
          <Segmented value={String(p.d_steps)} onChange={(v) => set("d_steps", Number(v))} full
            options={["1", "2", "3", "5"].map((v) => ({ value: v, label: `${v}×` }))} />
          <span className="tiny faint">Extra practice makes the detective sharper — and harder to fool.</span>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>Forger's random dice</span>
          <Segmented value={String(p.latent)} onChange={(v) => set("latent", Number(v))} full
            options={["1", "2", "4", "8"].map((v) => ({ value: v, label: v }))} />
          <span className="tiny faint">How many random numbers the forger turns into each point (its "latent" size).</span>
        </div>
      </Lock>
      <RunBar status={status} error={job.error} onTrain={train} onStop={job.cancel}
        progress={frame ? frame.step / frame.steps : undefined}
        label={frame ? `Round ${frame.step.toLocaleString()} of ${frame.steps.toLocaleString()}` : "Warming up…"}
        doneText={result ? doneIn(allFrames[allFrames.length - 1]?.secs) : undefined}
        extra={showScores && (
          <button className="btn" onClick={() => { setCursor(0); setPlaying(true); }} disabled={playing}>↺ Replay</button>
        )} />
    </Glass>
  );

  return (
    <LabSplit controls={controls}>
      <Glass className="col" style={{ gap: 14 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="col" style={{ gap: 2 }}>
            <h3>The forgery desk</h3>
            <span className="small muted">Grey dots are the real shape. Coloured dots are the forger's fakes.</span>
          </div>
          {frame && (
            <span className="badge accent num">Round {frame.step.toLocaleString()} / {frame.steps.toLocaleString()}</span>
          )}
        </div>
        <GanCanvas frame={frame} real={real} extent={extent}>
          {!frame && status === "idle" && (
            <div className="lab-overlay-chip" style={{ left: "50%", bottom: 14, transform: "translateX(-50%)" }}>Press Train to release the forger</div>
          )}
          {status === "starting" && (
            <div className="lab-overlay-chip" style={{ left: "50%", bottom: 14, transform: "translateX(-50%)" }}>Waking up the networks…</div>
          )}
        </GanCanvas>
        <HeatLegend />
        {showScores && allFrames.length > 1 && (
          <div className="row" style={{ gap: 10 }}>
            <button className="btn sm icon" aria-label={playing ? "Pause replay" : "Play replay"}
              onClick={() => { if (playing) setPlaying(false); else { if (idx >= allFrames.length - 1) setCursor(0); setPlaying(true); } }}>
              {playing ? "❚❚" : "▶"}
            </button>
            <div className="grow" style={{ minWidth: 0 }}>
              <Slider fixedRenderer="slider" value={idx} min={0} max={allFrames.length - 1} integer
                onChange={(v) => { setPlaying(false); setCursor(v); }}
                format={(v) => allFrames[Math.round(v)]?.step.toLocaleString() ?? ""} />
            </div>
          </div>
        )}
        <div className="row wrap" style={{ gap: 18 }}>
          <Spark label="Forger's loss" values={upto.map((f) => f.g_loss)} color="var(--accent)"
            hint="Low = the forger is fooling the detective. In a healthy GAN both losses wobble around a balance instead of one winning outright." />
          <Spark label="Detective's loss" values={upto.map((f) => f.d_loss)} color="var(--text-2)"
            hint="Low = the detective easily tells real from fake. If it drops to zero the forger gets no useful feedback." />
        </div>
      </Glass>

      <AnimatePresence>
        {result && showScores && (
          <motion.div key="scores" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="col" style={{ gap: 14 }}>
            <Glass className="col" style={{ gap: 14 }}>
              <h3>How good are the forgeries?</h3>
              <div className="lab-tiles">
                <StatTile label="Coverage" value={result.coverage} format={pct0}
                  color={result.coverage < 0.6 ? "var(--warning)" : "var(--success)"}
                  caption="How much of the shape the forger covers."
                  tip="Share of real points that have a forged point close by. Low coverage means whole parts of the shape are missing." />
                <StatTile label="Precision" value={result.precision} format={pct0}
                  caption="How many forgeries look real."
                  tip="Share of forged points that land close to a real one. Low precision means lots of fakes in the wrong places." />
              </div>
              {result.coverage < 0.6 && (
                <Callout tone="warning" icon="⚠️">
                  <b>Looks like mode collapse.</b>
                  <span className="small">The forger found a few spots the detective believes and keeps forging only those, ignoring the rest of the shape.
                    Try a lower learning rate or more hidden units.</span>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <button className="btn sm" onClick={() => setP((s) => ({ ...s, lr: Number(Math.max(0.0001, s.lr / 3).toPrecision(2)), hidden: Math.min(256, Math.max(128, s.hidden * 2)) }))}>
                      Use a lower rate + bigger networks
                    </button>
                  </div>
                </Callout>
              )}
              {result.coverage >= 0.6 && result.precision >= 0.6 && (
                <Callout tone="success" icon="🎉">
                  <span className="small">The forger learned the shape: most of it is covered and most fakes would fool you too. Try a harder shape like the spiral{motionFull ? ", or press Replay to watch it happen again" : ""}.</span>
                </Callout>
              )}
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>
    </LabSplit>
  );
}

function HeatLegend() {
  return (
    <div className="row wrap small muted" style={{ gap: 14, rowGap: 6 }}>
      <span className="row" style={{ gap: 6 }}><Dot color="var(--text-3)" /> real shape</span>
      <span className="row" style={{ gap: 6 }}><Dot color="var(--accent)" /> forger's fakes</span>
      <span className="row grow" style={{ gap: 8, justifyContent: "flex-end", minWidth: 220 }}>
        <span>looks fake</span>
        <span className="lab-legend-bar" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--danger) 55%, transparent), transparent, color-mix(in srgb, var(--success) 55%, transparent))" }} />
        <span>looks real</span>
      </span>
    </div>
  );
}

const Dot = ({ color }: { color: string }) => <span style={{ width: 9, height: 9, borderRadius: 5, background: color, display: "inline-block" }} />;

const shortName = (s: string) => s.replace("Ring of 8 blobs", "Ring").replace("Two moons", "Moons").replace("3×3 grid", "Grid");

function TargetPreview({ name }: { name: string }) {
  const pts = useMemo(() => sampleTarget(name, 90, 11), [name]);
  const ext = targetExtent(pts);
  return (
    <svg width={34} height={34} viewBox={`${-ext} ${-ext} ${2 * ext} ${2 * ext}`} aria-hidden>
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={-y} r={ext * 0.045} fill="currentColor" opacity={0.75} />)}
    </svg>
  );
}
