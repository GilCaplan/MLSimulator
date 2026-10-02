/* Transfer learning lab: the same small CNN trained three ways on a handful of labelled digits — from scratch, re-using
 * frozen pre-trained features, and fine-tuning them — with live test-accuracy curves and a per-digit gallery. */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Glass, ProgressBar, Slider } from "../glass";
import { AccuracyChart } from "./AccuracyChart";
import { colorAt } from "../../lib/colors";
import type { LabsCatalog, TransferFrame, TransferResult } from "../../lib/types";
import { Callout, LabSplit, Lock, RunBar, StatTile } from "./common";
import { useLabJob } from "./useLabJob";

type RunId = "scratch" | "frozen" | "finetune";
const RUNS: RunId[] = ["scratch", "frozen", "finetune"];
const RUN_INFO: Record<RunId, { name: string; short: string; color: () => string; dashed?: boolean; blurb: string }> = {
  scratch: { name: "From scratch", short: "S", color: () => "var(--text-2)", dashed: true, blurb: "A brand-new network that has never seen an image before." },
  frozen: { name: "Frozen features", short: "F", color: () => colorAt(1), blurb: "Keeps the pre-trained layers locked and only trains a new final layer." },
  finetune: { name: "Fine-tune", short: "T", color: () => colorAt(0), blurb: "Starts from the pre-trained layers and gently adjusts all of them." },
};
interface Params { per_class: number; epochs: number }
type Curves = Record<RunId, { epoch: number; test_acc: number }[]>;
const EMPTY: Curves = { scratch: [], frozen: [], finetune: [] };
const pct0 = (v: number) => `${Math.round(v * 100)}%`;

export function TransferLab({ catalog }: { catalog: LabsCatalog | null }) {
  const [p, setP] = useState<Params>(() => ({ per_class: 5, epochs: 40, ...(catalog?.labs.transfer?.params as Partial<Params> | undefined) }));
  const [curves, setCurves] = useState<Curves>(EMPTY);
  const [live, setLive] = useState<{ run: RunId; epoch: number; epochs: number } | null>(null);
  const [pretrain, setPretrain] = useState<{ epoch: number; epochs: number } | null>(null);
  const [history, setHistory] = useState<{ per_class: number; acc: Record<RunId, number> }[]>([]);
  const job = useLabJob<TransferResult>("transfer", (ev) => {
    if (ev.type === "lab.frame") {
      const f = ev.data as TransferFrame;
      setPretrain(null);
      setLive({ run: f.run, epoch: f.epoch, epochs: f.epochs });
      setCurves((c) => ({ ...c, [f.run]: [...c[f.run], { epoch: f.epoch, test_acc: f.test_acc }] }));
    } else if (ev.type === "lab.pretrain") {
      setPretrain({ epoch: ev.data.epoch, epochs: ev.data.epochs });
    } else if (ev.type === "log" && /pre-train/i.test(ev.data?.message ?? "")) {
      setPretrain((s) => s ?? { epoch: 0, epochs: 6 });
    }
  });
  const { status, result } = job;

  const train = (over?: Partial<Params>) => {
    const params = { ...p, ...over };
    if (over) setP(params);
    setCurves(EMPTY);
    setLive(null);
    setPretrain(null);
    job.start(params);
  };

  // record finished runs for the comparison table (once per result)
  useEffect(() => {
    if (!result) return;
    setHistory((h) => [...h, { per_class: result.per_class, acc: { scratch: result.runs.scratch.final_acc, frozen: result.runs.frozen.final_acc, finetune: result.runs.finetune.final_acc } }].slice(-6));
  }, [result]);

  const shownCurves: Curves = result
    ? { scratch: result.runs.scratch.curve, frozen: result.runs.frozen.curve, finetune: result.runs.finetune.curve }
    : curves;
  const progress = live ? (RUNS.indexOf(live.run) * live.epochs + live.epoch) / (3 * live.epochs) : undefined;

  const controls = (
    <Glass className="col" style={{ gap: 16 }}>
      <div className="col" style={{ gap: 2 }}>
        <h3>Settings</h3>
        <span className="small muted">Three copies of the same small network learn to read digits from very few examples.</span>
      </div>
      <Lock locked={job.busy}>
        <Slider label="Labelled examples per digit" help="How many example images of each digit (0–9) the networks get to learn from. Fewer examples = harder."
          value={p.per_class} min={1} max={20} integer onChange={(v) => setP((s) => ({ ...s, per_class: v }))} />
        <Slider label="Epochs" help="How many times each network studies its examples." value={p.epochs} min={10} max={80} step={5} integer
          onChange={(v) => setP((s) => ({ ...s, epochs: v }))} />
        <span className="tiny faint">That's {p.per_class * 10} labelled images in total — tiny by deep-learning standards.</span>
      </Lock>
      <RunBar status={status} error={job.error} onTrain={() => train()} onStop={job.cancel}
        progress={pretrain ? undefined : progress}
        label={pretrain ? "Pre-training the base network…" : live ? `${RUN_INFO[live.run].name}: epoch ${live.epoch} of ${live.epochs}` : "Preparing the digits…"}
        doneText={`Trained 3 networks on ${result?.n_train ?? p.per_class * 10} images, tested on ${result?.n_test ?? "the rest"}`} />
    </Glass>
  );

  return (
    <LabSplit controls={controls}>
      <AnimatePresence>
        {pretrain && job.busy && (
          <motion.div key="pre" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <Glass className="col" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 12 }}>
                <span style={{ fontSize: 26 }}>🏗️</span>
                <div className="col grow" style={{ gap: 2 }}>
                  <b>Pre-training the base network once (~30 s)</b>
                  <span className="small muted">It's learning edges and shapes from 6,000 synthetic shapes and arrows. This happens only on the first run — later runs re-use it.</span>
                </div>
                <span className="mono small num">{pretrain.epoch}/{pretrain.epochs}</span>
              </div>
              <ProgressBar value={pretrain.epoch / pretrain.epochs} indeterminate={pretrain.epoch === 0} />
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <Glass className="col" style={{ gap: 12 }}>
        <div className="col" style={{ gap: 2 }}>
          <h3>Test accuracy while training</h3>
          <span className="small muted">Measured on digits none of the networks has seen. Higher is better.</span>
        </div>
        {RUNS.some((r) => shownCurves[r].length) ? (
          <AccuracyChart epochs={result ? result.runs.scratch.curve.length : live?.epochs ?? p.epochs}
            series={RUNS.map((r) => ({ name: RUN_INFO[r].name, color: RUN_INFO[r].color(), dashed: RUN_INFO[r].dashed, points: shownCurves[r] }))} />
        ) : (
          <div className="lab-well col center" style={{ height: 240, gap: 8 }}>
            <span style={{ fontSize: 30 }}>{job.busy ? "⏳" : "📈"}</span>
            <span className="small muted">{job.busy ? (pretrain ? "Curves start once the base network is ready." : "Getting the first network ready…") : "Press Train to race the three approaches."}</span>
          </div>
        )}
        <div className="row wrap" style={{ gap: 10 }}>
          {RUNS.map((r) => (
            <div key={r} className="inset col" style={{ gap: 2, padding: "8px 12px", flex: "1 1 180px", minWidth: 0, outline: live?.run === r && job.busy ? "2px solid var(--accent)" : undefined }}>
              <span className="row small" style={{ gap: 6, fontWeight: 600 }}>
                <svg width={18} height={6} aria-hidden><line x1={0} x2={18} y1={3} y2={3} stroke={RUN_INFO[r].color()} strokeWidth={2.6} strokeDasharray={RUN_INFO[r].dashed ? "4 3" : undefined} /></svg>
                {RUN_INFO[r].name}
              </span>
              <span className="tiny muted">{RUN_INFO[r].blurb}</span>
            </div>
          ))}
        </div>
      </Glass>

      {result && <TransferResults result={result} history={history} busy={job.busy} onTry={(n) => train({ per_class: n })} />}
    </LabSplit>
  );
}

function TransferResults({ result, history, busy, onTry }: { result: TransferResult; history: { per_class: number; acc: Record<RunId, number> }[]; busy: boolean; onTry: (n: number) => void }) {
  const maxParams = Math.max(...RUNS.map((r) => result.runs[r].trainable));
  const s = result.runs.scratch.final_acc;
  const bestT: RunId = result.runs.finetune.final_acc >= result.runs.frozen.final_acc ? "finetune" : "frozen";
  const t = result.runs[bestT].final_acc;
  const how = bestT === "finetune" ? "fine-tuning" : "freezing";
  const takeaway = t > s + 0.005
    ? <>With <b>{result.per_class} example{result.per_class === 1 ? "" : "s"} per digit</b>, re-using a pre-trained network ({how} it) scored <b>{pct0(t)}</b> vs <b>{pct0(s)}</b> from scratch.</>
    : <>With <b>{result.per_class} examples per digit</b>, starting from scratch kept up ({pct0(s)} vs {pct0(t)} for the best re-used network). Prior knowledge matters most when labels are scarce — try fewer examples.</>;
  const fewer = Math.round(maxParams / Math.max(1, result.runs.frozen.trainable));
  const f = result.runs.frozen.final_acc;
  const frozenNote = f >= s
    ? `The frozen network only trains its last layer — ${fewer}× fewer numbers than the others — and still scored ${pct0(f)}, because its pre-trained layers already know what edges and curves look like.`
    : `The frozen network only trains its last layer — ${fewer}× fewer numbers than the others. That's fast and hard to overfit, but its locked features were learned on shapes, not digits, so it reached only ${pct0(f)}. Fine-tuning lets those features adapt.`;
  const suggestions = [3, 10].filter((n) => n !== result.per_class);

  return (
    <motion.div className="col" style={{ gap: 18 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Glass className="col" style={{ gap: 14 }}>
        <h3>Final scores</h3>
        <div className="lab-tiles">
          {RUNS.map((r) => {
            const run = result.runs[r];
            return (
              <StatTile key={r} label={RUN_INFO[r].name} value={run.final_acc} format={pct0} color={RUN_INFO[r].color()}
                caption={<>trains <b className="num">{run.trainable.toLocaleString()}</b> numbers</>}
                tip={`Best accuracy during training: ${pct0(run.best_acc)}. "Numbers" are the weights the optimiser is allowed to change.`}>
                <div style={{ height: 4, borderRadius: 2, background: "var(--fill)", marginTop: 4 }}>
                  <motion.div style={{ height: "100%", borderRadius: 2, background: RUN_INFO[r].color() }} initial={{ width: 0 }} animate={{ width: `${Math.max(1.5, (run.trainable / maxParams) * 100)}%` }} />
                </div>
              </StatTile>
            );
          })}
        </div>
        <Callout tone="success" icon="🎁">
          <span>{takeaway}</span>
          <span className="small muted">{frozenNote}</span>
        </Callout>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted">Does the gap grow or shrink with more labels?</span>
          {suggestions.map((n) => (
            <button key={n} className="btn sm" disabled={busy} onClick={() => onTry(n)}>Try {n} per digit</button>
          ))}
        </div>
        {history.length > 1 && (
          <div className="inset col" style={{ gap: 6, padding: 12 }}>
            <span className="eyebrow">Your runs</span>
            {history.map((h, i) => (
              <div key={i} className="row small wrap" style={{ gap: 12 }}>
                <span className="mono" style={{ minWidth: 72 }}>{h.per_class}/digit</span>
                {RUNS.map((r) => (
                  <span key={r} className="row" style={{ gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: RUN_INFO[r].color() }} />
                    <span className="muted">{RUN_INFO[r].name}</span> <b className="num">{pct0(h.acc[r])}</b>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </Glass>

      <Glass className="col" style={{ gap: 12 }}>
        <div className="col" style={{ gap: 2 }}>
          <h3>What each network guessed</h3>
          <span className="small muted">24 test digits. <b>S</b> = from scratch, <b>F</b> = frozen, <b>T</b> = fine-tune; hover a ✗ to see the wrong answer it gave.</span>
        </div>
        <div className="lab-digits">
          {result.examples.map((ex, i) => (
            <motion.div key={i} className="lab-digit" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(0.5, i * 0.015) }}>
              <img src={ex.image} alt={`Handwritten ${ex.label}`} />
              <span className="tiny muted">true <b>{ex.label}</b></span>
              <div className="row" style={{ gap: 4 }}>
                {RUNS.map((r) => {
                  const pred = result.runs[r].examples[i];
                  const ok = pred === ex.label;
                  return (
                    <span key={r} className="tiny mono" title={`${RUN_INFO[r].name} guessed ${pred}`}
                      style={{ color: ok ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                      {RUN_INFO[r].short}{ok ? "✓" : "✗"}
                    </span>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </Glass>
    </motion.div>
  );
}
