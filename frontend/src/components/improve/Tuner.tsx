import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { fadeUp, spring } from "../../design/motion";
import { api } from "../../lib/api";
import { navigate } from "../../lib/router";
import { toast, useJob, useProject, type Trial } from "../../lib/store";
import type { RunResult } from "../../lib/types";
import { AnimatedNumber, Field, ProgressBar, Segmented, Select, Slider, Spinner } from "../glass";
import { CV_SCORING, fmtMetric, metricLabel, primaryMetric } from "../train/util";
import { SpaceEditor, initialSpace, toSpace, type SpaceState } from "./SpaceEditor";
import { TrialChart } from "./TrialChart";
import { useTune } from "./tuneStore";

const scoreFmt = (metric: string, v: number | null | undefined) => (metric.startsWith("neg_") ? (v === null || v === undefined ? "—" : (-v).toPrecision(4)) : fmtMetric(metric, v));
const deltaFmt = (metric: string, d: number) =>
  metric.startsWith("neg_") ? `${d.toPrecision(3)} less error` : metric === "r2" ? d.toFixed(3) : `${(d * 100).toFixed(1)} pts`;
const fmtVal = (v: any) => (typeof v === "number" ? String(Number(v.toPrecision(4))) : String(v));

/** Automatic hyperparameter search for one classic model. */
export function Tuner({ result }: { result: RunResult }) {
  const project = useProject((s) => s.project)!;
  const registry = useProject((s) => s.registry);
  const tuneKey = useProject((s) => s.tuneKey);
  const job = useJob();
  const tune = useTune();
  const task = result.task;
  const candidates = Object.values(result.models).filter((m) => !m.baseline && m.family === "classic" && project.models.some((c) => c.key === m.key));
  const [key, setKey] = useState<string | null>(() => (tune.projectId === project.id && tune.key) || candidates[0]?.key || null);
  const model = key ? result.models[key] : undefined;
  const spec = registry.find((r) => r.id === model?.model_id);
  const params = useMemo(() => spec?.params ?? [], [spec]);
  const [space, setSpace] = useState<SpaceState>({});
  const [search, setSearch] = useState<"random" | "grid">("random");
  const [nIter, setNIter] = useState(20);
  const [cv, setCv] = useState("3");
  const [scoring, setScoring] = useState(primaryMetric(task));
  const [starting, setStarting] = useState(false);

  // Hand-off from coach "Start tuning" buttons.
  useEffect(() => {
    if (tuneKey) {
      if (result.models[tuneKey]?.family === "classic" && !result.models[tuneKey]?.baseline) setKey(tuneKey);
      useProject.getState().setTuneKey(null);
    }
  }, [tuneKey, result]);
  useEffect(() => { setSpace(initialSpace(params)); }, [params]);

  const live = job.kind === "tune" && job.jobId === tune.jobId && job.status === "running";
  const mineDone = tune.projectId === project.id && tune.result && tune.key === key;
  const showTrials = live || (tune.projectId === project.id && tune.key === key && (job.kind === "tune" && job.jobId === tune.jobId ? job.trials.length > 0 : !!tune.result));
  const trials: Trial[] = live || (job.kind === "tune" && job.jobId === tune.jobId) ? job.trials : tune.result?.trials.map((t) => ({ ...t, n: tune.result!.trials.length })) ?? [];
  const n = trials[trials.length - 1]?.n ?? nIter;
  const bestLive = [...trials].reverse().find((t) => t.best)?.best as { params: Record<string, any>; score: number } | undefined;
  const best = tune.result && mineDone ? tune.result.best : bestLive;
  const metric = tune.result && mineDone ? tune.result.metric : scoring;
  const spaceObj = toSpace(params, space);
  const nSpace = Object.keys(spaceObj).length;

  const start = async () => {
    if (!model) return;
    if (useJob.getState().status === "running") return toast.error("Another job is running — wait for it to finish.");
    if (!nSpace) return toast.error("Tick at least one setting to search.");
    setStarting(true);
    try {
      const current = project.models.find((m) => m.key === model.key)?.params ?? model.params;
      const { job_id } = await api.tune({
        prepared_id: project.prepared_id || result.prepared_id, model_id: model.model_id, params: current, space: spaceObj,
        search, n_iter: nIter, cv: Number(cv), scoring, project_id: project.id,
      });
      useTune.getState().begin(project.id, job_id, model.key, model.model_id);
      useJob.getState().start(job_id, "tune", [], async (status) => {
        if (status === "finished") {
          try {
            const r = await api.tuneResult(job_id);
            useTune.getState().finish(job_id, r);
            toast.success(r.improvement > 0 ? `Found better settings (+${scoreFmt(r.metric, Math.abs(r.improvement))})!` : "Search finished — your current settings were already good.");
          } catch (e) { toast.error(e); }
        } else if (status === "failed") toast.error(`Tuning failed: ${useJob.getState().error ?? "unknown error"}`);
        else if (status === "cancelled") toast.info("Tuning stopped.");
      });
    } catch (e) {
      toast.error(e);
    } finally {
      setStarting(false);
    }
  };

  const apply = () => {
    const r = tune.result;
    if (!r || !tune.key) return;
    const cfg = useProject.getState().project?.models.find((m) => m.key === tune.key);
    if (!cfg) return toast.error("That model is no longer in your line-up.");
    useProject.getState().update((p) => ({ models: p.models.map((m) => (m.key === tune.key ? { ...m, params: { ...m.params, ...r.best_params } } : m)) }));
    useProject.setState({ dirtySinceTrain: true });
    toast.success(`Applied the best settings to ${model?.label ?? "the model"} — train again to see the effect.`);
    navigate(`/p/${project.id}/train`);
  };

  if (!candidates.length) {
    return <p className="small muted">Automatic tuning works with classic models (trees, linear models, SVMs…). Add one in the Models step to try it.</p>;
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <Field label="Model to tune">
        <div className="row wrap" style={{ gap: 8 }}>
          {candidates.map((m) => {
            const s = registry.find((r) => r.id === m.model_id);
            const on = m.key === key;
            return (
              <motion.button key={m.key} whileTap={{ scale: 0.95 }} disabled={live} onClick={() => setKey(m.key)} className={`btn sm ${on ? "primary" : ""}`}>
                {s?.emoji} {m.label}
              </motion.button>
            );
          })}
        </div>
      </Field>

      <Field label="Settings to search" help="Tick the knobs you want the search to turn. Numeric ones are tried within the range you give; choices only among the ones you keep selected.">
        <SpaceEditor params={params} state={space} onChange={setSpace} disabled={live} />
      </Field>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 18, alignItems: "start" }}>
        <Field label="Search style" help="Random tries settings picked at random from your ranges — usually finds good ones fastest. Grid tries evenly spaced combinations.">
          <div><Segmented kind="form" size="sm" value={search} onChange={setSearch} options={[{ value: "random", label: "🎲 Random" }, { value: "grid", label: "▦ Grid" }]} /></div>
        </Field>
        <Slider label="Trials" help="How many combinations to try. More = better chance, but slower." value={nIter} min={5} max={60} integer onChange={setNIter} />
        <Field label="CV folds" help="Each trial is scored with cross-validation on the training rows, so the test rows stay untouched.">
          <div><Segmented kind="form" size="sm" value={cv} onChange={setCv} options={[{ value: "3", label: "3 folds" }, { value: "5", label: "5 folds" }]} /></div>
        </Field>
        <Field label="Optimise for">
          <Select value={scoring} onChange={setScoring} options={CV_SCORING[task]} />
        </Field>
      </div>

      <div className="row" style={{ gap: 12 }}>
        {live ? (
          <button className="btn danger" onClick={() => useJob.getState().cancel().catch(toast.error)}>■ Stop search</button>
        ) : (
          <motion.button className="btn gradient" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={start} disabled={starting || !nSpace || job.status === "running"}>
            {starting ? <Spinner size={14} /> : "🔍"} Start search
          </motion.button>
        )}
        <span className="small muted">{nSpace ? `Searching ${nSpace} setting${nSpace === 1 ? "" : "s"} · about ${search === "grid" ? "a grid of" : ""} ${nIter} trials × ${cv} folds` : "Tick at least one setting."}</span>
      </div>

      <AnimatePresence>
        {showTrials && (
          <motion.div key="trials" variants={fadeUp} initial="hidden" animate="show" exit="exit" className="col" style={{ gap: 14 }}>
            <div className="divider" style={{ margin: 0 }} />
            <div className="row between">
              <span className="row" style={{ gap: 8 }}>
                {live && <Spinner size={14} color="var(--accent)" />}
                <b>{live ? "Searching…" : "Search results"}</b>
                <span className="small muted num">{trials.length} / {n} trials</span>
              </span>
              <span className="small muted">{metricLabel(metric.replace(/^neg_/, ""))}{metric.startsWith("neg_") ? " (lower is better)" : ""}</span>
            </div>
            {live && <ProgressBar value={trials.length / Math.max(1, n)} color="var(--grad)" />}
            <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(200px, 1fr)", gap: 16 }}>
              <div className="inset" style={{ padding: 8 }}>
                <TrialChart trials={trials} n={n} baseline={mineDone ? tune.result!.baseline.score : null} />
              </div>
              <div className="inset col" style={{ padding: 14, gap: 8 }}>
                <span className="eyebrow">🏅 Best so far</span>
                <b className="num gradient-text" style={{ fontSize: 26 }}>{scoreFmt(metric, best?.score)}</b>
                <div className="col" style={{ gap: 4 }}>
                  {best && Object.entries(best.params).map(([k, v]) => (
                    <div key={k} className="row between small" style={{ gap: 8 }}>
                      <span className="muted truncate">{params.find((p) => p.name === k)?.label ?? k}</span>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.b key={fmtVal(v)} className="mono" initial={{ y: 10, opacity: 0, color: "#BF5AF2" }} animate={{ y: 0, opacity: 1, color: "var(--text)" }} exit={{ y: -10, opacity: 0 }} transition={spring.snappy}>
                          {fmtVal(v)}
                        </motion.b>
                      </AnimatePresence>
                    </div>
                  ))}
                  {!best && <span className="small faint">Waiting for the first trial…</span>}
                </div>
              </div>
            </div>

            {mineDone && tune.result && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring.gentle} className="row wrap" style={{ gap: 14, alignItems: "stretch" }}>
                <div className="inset col" style={{ padding: "12px 16px", gap: 2, flex: 1, minWidth: 150 }}>
                  <span className="tiny faint">Your current settings</span>
                  <b className="num" style={{ fontSize: 20 }}>{scoreFmt(metric, tune.result.baseline.score)}</b>
                </div>
                <div className="inset col" style={{ padding: "12px 16px", gap: 2, flex: 1, minWidth: 150, borderColor: "var(--accent)" }}>
                  <span className="tiny faint">Best found</span>
                  <b className="num" style={{ fontSize: 20 }}>{scoreFmt(metric, tune.result.best.score)}</b>
                </div>
                <div className="col center" style={{ gap: 4, minWidth: 120 }}>
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.pop, delay: 0.2 }}
                    className={`badge ${tune.result.improvement > 0 ? "success" : ""}`} style={{ fontSize: 14, height: 30, padding: "0 14px" }}>
                    {tune.result.improvement > 0 ? "▲ +" : tune.result.improvement < 0 ? "▼ " : "= "}
                    <AnimatedNumber value={Math.abs(tune.result.improvement)} format={(v) => deltaFmt(metric, v)} />
                  </motion.span>
                </div>
                <div className="col center" style={{ gap: 6 }}>
                  <motion.button className="btn primary" onClick={apply}
                    animate={tune.result.improvement > 0 ? { scale: [1, 1.05, 1] } : {}} transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}>
                    ✨ Apply best settings
                  </motion.button>
                  {tune.result.improvement <= 0 && <span className="tiny faint">Nothing beat your current settings by much.</span>}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
