import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { navigate } from "../../lib/router";
import { modelConfigFor, toast, useJob, useProject } from "../../lib/store";
import type { ModelConfig, RunResult, SweepResult } from "../../lib/types";
import { AnimatedNumber, InfoTip, ProgressBar, Segmented, Slider, Spinner } from "../glass";
import { SweepChart } from "./SweepChart";
import { useSweep, type SweepModel } from "./sweepStore";

/** Which setting holds k for each sweepable model. */
const K_PARAM: Record<SweepModel, string> = { kmeans: "n_clusters", gmm: "n_components", agglomerative: "n_clusters" };
const MODEL_OPTS: { value: SweepModel; label: string }[] = [
  { value: "kmeans", label: "🎯 K-Means" },
  { value: "gmm", label: "🫧 Gaussian Mixture" },
  { value: "agglomerative", label: "🌳 Hierarchical" },
];
const COLORS = { silhouette: "#0A84FF", ari: "#30D158", inertia: "#BF5AF2", bic: "#FF9F0A", db: "#FF375F" };

type Row = SweepResult["rows"][number];

function verdict(s: number | null | undefined) {
  if (s === null || s === undefined) return { text: "—", tone: "var(--text-3)" };
  if (s >= 0.5) return { text: "Clear, well-separated groups", tone: "var(--success)" };
  if (s >= 0.25) return { text: "Real structure, but the groups overlap", tone: "var(--accent)" };
  return { text: "Weak structure — groups blur together", tone: "var(--warning)" };
}

/** Set k on every K-Means / GMM / hierarchical model in the line-up (adding the swept model if missing), then go train. */
function adoptK(k: number, modelId: SweepModel) {
  const st = useProject.getState();
  const p = st.project;
  if (!p) return;
  const spec = st.spec(modelId);
  let models: ModelConfig[] = p.models.map((m) => (m.model_id in K_PARAM ? { ...m, params: { ...m.params, [K_PARAM[m.model_id as SweepModel]]: k } } : m));
  let added = false;
  if (!models.some((m) => m.model_id === modelId) && spec) {
    const cfg = modelConfigFor(spec);
    models = [...models, { ...cfg, params: { ...cfg.params, [K_PARAM[modelId]]: k } }];
    added = true;
  }
  const names = Array.from(new Set(models.filter((m) => m.model_id in K_PARAM).map((m) => st.spec(m.model_id)?.label ?? m.model_id)));
  st.update({ models });
  useProject.setState({ dirtySinceTrain: true });
  toast.success(`k = ${k} set on ${names.join(", ")}${added ? " (added to your line-up)" : ""} — run it again to see the new groups.`);
  navigate(`/p/${p.id}/train`);
}

/** Clustering: try a range of k, chart how tidy (and how truthful) the groups are, and adopt the best k. */
export function KSweep({ result }: { result: RunResult }) {
  const project = useProject((s) => s.project)!;
  const job = useJob();
  const sweep = useSweep();
  const mine = sweep.projectId === project.id;
  const inLineup = project.models.map((m) => m.model_id).find((id): id is SweepModel => id in K_PARAM);
  const [modelId, setModelId] = useState<SweepModel>(() => (mine ? sweep.modelId : inLineup ?? "kmeans"));
  const [kMin, setKMin] = useState(mine ? sweep.kMin : 2);
  const [kMax, setKMax] = useState(mine ? sweep.kMax : 10);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const isMine = mine && job.kind === "sweep" && job.jobId === sweep.jobId;
  const live = isMine && job.status === "running";
  const otherJob = job.status === "running" && !live;
  const rows: Row[] = isMine && job.sweepRows.length && !sweep.result ? job.sweepRows : mine && sweep.result ? sweep.result.rows : isMine ? job.sweepRows : [];
  const range = mine && (live || rows.length) ? { lo: sweep.kMin, hi: sweep.kMax } : { lo: kMin, hi: kMax };
  const shownModel: SweepModel = mine && (live || rows.length) ? sweep.modelId : modelId;
  const hasTruth = mine && sweep.result ? sweep.result.has_truth : rows.some((r) => r.ari !== null && r.ari !== undefined);
  const best = useMemo(() => {
    if (mine && sweep.result) return sweep.result.best_k;
    const ok = rows.filter((r) => r.silhouette !== null && r.silhouette !== undefined);
    return ok.length ? ok.reduce((a, b) => ((b.silhouette ?? -1) > (a.silhouette ?? -1) ? b : a)).k : null;
  }, [rows, mine, sweep.result]);
  const done = mine && !!sweep.result && !live;
  const pick = selected ?? best;
  const row = rows.find((r) => r.k === pick);
  const preparedId = result.prepared_id || project.prepared_id;

  // when a fresh sweep finishes, look at its best k
  useEffect(() => { if (done) setSelected(null); }, [done, sweep.jobId]);

  const start = async () => {
    if (!preparedId) return toast.error("Prepare your data first.");
    setStarting(true);
    try {
      const lo = Math.min(kMin, kMax - 1), hi = Math.max(kMax, kMin + 1);
      const { job_id } = await api.sweep({ prepared_id: preparedId, model_id: modelId, k_min: lo, k_max: hi, project_id: project.id });
      useSweep.getState().begin(project.id, job_id, modelId, lo, hi);
      setSelected(null);
      useJob.getState().start(job_id, "sweep", [], async (status) => {
        if (status === "finished") {
          try {
            const res = await api.sweepResult(job_id);
            useSweep.getState().finish(job_id, res);
            toast.success(`Sweep done — k = ${res.best_k} gives the tidiest groups.`);
          } catch (e) { toast.error(e); }
        } else if (status === "failed") toast.error(useJob.getState().error || "The sweep failed.");
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(/not found|404|expired/i.test(msg) ? "The prepared data has expired — run Prepare again, then retry." : e);
    } finally {
      setStarting(false);
    }
  };

  const second = shownModel === "kmeans"
    ? { key: "inertia" as const, name: "Spread inside groups (elbow)", color: COLORS.inertia, help: "Total squared distance from every row to its group's centre. It always falls as k grows — look for the elbow, where adding another group stops helping much." }
    : shownModel === "gmm"
      ? { key: "bic" as const, name: "BIC (lower is better)", color: COLORS.bic, help: "Bayesian Information Criterion: rewards fitting the data well but charges for every extra blob. The lowest point is a sensible k." }
      : { key: "davies_bouldin" as const, name: "Davies–Bouldin (lower is better)", color: COLORS.db, help: "Compares how spread out each group is with how far it sits from its nearest neighbour group. Lower = tighter, better separated groups." };
  const n = range.hi - range.lo + 1;
  const sil = verdict(row?.silhouette);

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* controls */}
      <div className="row wrap" style={{ gap: 18, alignItems: "flex-end" }}>
        <div className="col" style={{ gap: 6 }}>
          <span className="eyebrow">Algorithm</span>
          <Segmented<SweepModel> value={modelId} onChange={setModelId} options={MODEL_OPTS} />
        </div>
        <div style={{ flex: "1 1 160px", minWidth: 150 }}>
          <Slider label="From k" value={kMin} min={2} max={14} integer onChange={(v) => { setKMin(v); if (v >= kMax) setKMax(v + 1); }} />
        </div>
        <div style={{ flex: "1 1 160px", minWidth: 150 }}>
          <Slider label="To k" value={kMax} min={3} max={15} integer onChange={(v) => { setKMax(v); if (v <= kMin) setKMin(v - 1); }} />
        </div>
        {live ? (
          <button className="btn" onClick={() => useJob.getState().cancel().catch(toast.error)}>■ Stop</button>
        ) : (
          <motion.button className="btn gradient" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} disabled={starting || otherJob || !preparedId} onClick={start} style={{ minWidth: 150 }}>
            {starting ? <Spinner size={14} /> : "🔎"} {rows.length ? "Sweep again" : "Start the sweep"}
          </motion.button>
        )}
      </div>
      {otherJob && <span className="small" style={{ color: "var(--warning)" }}>Another job is running — wait for it to finish before sweeping.</span>}

      <AnimatePresence initial={false}>
        {live && (
          <motion.div key="prog" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="row" style={{ gap: 10 }}>
              <Spinner size={14} color="var(--accent)" />
              <span className="small muted grow">Trying k = {Math.min(range.hi, range.lo + rows.length)} … ({rows.length} of {n} done)</span>
            </div>
            <div style={{ marginTop: 8 }}><ProgressBar value={rows.length / Math.max(1, n)} /></div>
          </motion.div>
        )}
      </AnimatePresence>

      {!rows.length && !live ? (
        <SweepIntro />
      ) : (
        <div className="row wrap" style={{ gap: 16, alignItems: "stretch" }}>
          <div className="col" style={{ gap: 12, flex: "3 1 420px", minWidth: 0 }}>
            <div className="inset" style={{ padding: "12px 12px 6px" }}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 4 }}>
                <span className="row small" style={{ gap: 12 }}>
                  <Legend color={COLORS.silhouette} text="Silhouette" help="How snugly each row sits in its own group compared with the next-nearest group. From −1 to 1 — higher is better, above 0.5 is great." />
                  {hasTruth && <Legend color={COLORS.ari} text="Match with hidden truth (ARI)" help="Adjusted Rand Index: how well the groups agree with the hidden answer key. 0 = no better than random, 1 = a perfect match. Real projects rarely have this!" />}
                </span>
                <span className="tiny faint">Click a k to inspect it</span>
              </div>
              <SweepChart kMin={range.lo} kMax={range.hi} best={best} selected={pick} onSelect={setSelected}
                yDomain={[Math.min(0, ...rows.map((r) => Math.min(r.silhouette ?? 0, r.ari ?? 0))), 1]}
                series={[
                  { name: "silhouette", color: COLORS.silhouette, values: rows.map((r) => ({ k: r.k, v: r.silhouette })) },
                  ...(hasTruth ? [{ name: "ari", color: COLORS.ari, values: rows.map((r) => ({ k: r.k, v: r.ari })) }] : []),
                ]} />
            </div>
            <div className="inset" style={{ padding: "10px 12px 4px" }}>
              <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                <Legend color={second.color} text={second.name} help={second.help} />
              </div>
              <SweepChart compact height={130} kMin={range.lo} kMax={range.hi} selected={pick} onSelect={setSelected}
                series={[{ name: second.key, color: second.color, values: rows.map((r) => ({ k: r.k, v: r[second.key] ?? null })) }]} />
            </div>
          </div>

          {/* readout for the chosen k */}
          <div className="inset col" style={{ padding: 16, gap: 12, flex: "1 1 220px", minWidth: 210 }}>
            <span className="eyebrow">{pick === best ? "⭐ Best k" : "You're looking at"}</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={pick ?? "none"} initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={spring.snappy} className="col" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
                  <b className="num gradient-text" style={{ fontSize: 44, lineHeight: 1, letterSpacing: -1 }}>k = {pick ?? "…"}</b>
                </div>
                {row ? (
                  <>
                    <span className="small" style={{ color: sil.tone, fontWeight: 650 }}>{sil.text}</span>
                    <Stat label="Silhouette" value={row.silhouette} color={COLORS.silhouette} />
                    {hasTruth && <Stat label="Match with truth (ARI)" value={row.ari} color={COLORS.ari} />}
                    {row[second.key] !== undefined && row[second.key] !== null && <Stat label={second.key === "inertia" ? "Spread inside groups" : second.key === "bic" ? "BIC" : "Davies–Bouldin"} value={row[second.key] as number} color={second.color} plain />}
                  </>
                ) : <span className="small muted">Waiting for the first results…</span>}
              </motion.div>
            </AnimatePresence>
            <div className="grow" />
            {hasTruth && done && sweep.result && (() => {
              const bestAri = rows.reduce((a, b) => ((b.ari ?? -1) > (a.ari ?? -1) ? b : a));
              return bestAri.k !== best ? (
                <span className="tiny muted" style={{ lineHeight: 1.5 }}>💡 The hidden truth agrees most at <b>k = {bestAri.k}</b>. Tidy-looking groups and “real” groups don't always line up — that's the honest challenge of unsupervised learning.</span>
              ) : (
                <span className="tiny muted" style={{ lineHeight: 1.5 }}>🎉 The tidiest grouping is also the one that best matches the hidden truth.</span>
              );
            })()}
            <motion.button className="btn primary" whileTap={{ scale: 0.96 }} disabled={!pick || live} onClick={() => pick && adoptK(pick, shownModel)}>
              Use k = {pick ?? "…"} →
            </motion.button>
            <span className="tiny faint" style={{ textAlign: "center" }}>Sets k on your clustering models and takes you back to Discover.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ color, text, help }: { color: string; text: string; help: string }) {
  return (
    <span className="row small" style={{ gap: 6, fontWeight: 600 }}>
      <span style={{ width: 14, height: 3, borderRadius: 2, background: color }} />{text}<InfoTip text={help} />
    </span>
  );
}

function Stat({ label, value, color, plain }: { label: string; value: number | null | undefined; color: string; plain?: boolean }) {
  const v = value ?? null;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between small">
        <span className="muted">{label}</span>
        <b className="num">{v === null ? "—" : <AnimatedNumber value={v} format={(x) => (plain ? (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : x.toFixed(2)) : x.toFixed(3))} />}</b>
      </div>
      {!plain && (
        <div style={{ height: 5, borderRadius: 3, background: "var(--fill-2)", overflow: "hidden" }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, v ?? 0)) * 100}%` }} transition={spring.gentle} style={{ height: "100%", background: color, borderRadius: 3 }} />
        </div>
      )}
    </div>
  );
}

/** Before the first sweep: what it does, with a tiny animated preview. */
function SweepIntro() {
  const demo = [0.31, 0.42, 0.47, 0.58, 0.45, 0.36, 0.3, 0.26];
  return (
    <div className="inset row wrap" style={{ padding: 16, gap: 18, alignItems: "center" }}>
      <svg width={180} height={84} viewBox="0 0 180 84" style={{ flexShrink: 0 }}>
        {demo.map((v, i) => (
          <motion.circle key={i} cx={14 + i * 22} r={4.5} fill={i === 3 ? "#FFD60A" : "#0A84FF"} stroke="var(--bg)" strokeWidth={1.2}
            initial={{ cy: 80, opacity: 0 }} animate={{ cy: [80, 76 - v * 110, 76 - v * 110, 80], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 4, times: [0, 0.2, 0.85, 1], repeat: Infinity, delay: i * 0.18 }} />
        ))}
      </svg>
      <div className="col" style={{ gap: 6, flex: "1 1 260px" }}>
        <b>How many groups are there, really?</b>
        <span className="small muted" style={{ lineHeight: 1.55 }}>
          The sweep trains the algorithm once for every k in your range and scores each result. Watch the dots pop in — the
          highest <b>silhouette</b> marks the tidiest grouping. If the data has a hidden truth, a second line shows how well each k matches it.
        </span>
      </div>
    </div>
  );
}
