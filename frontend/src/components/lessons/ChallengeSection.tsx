import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring } from "../../design/motion";
import { ApiError, api } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { navigate } from "../../lib/router";
import { STEPS, toast, useProject } from "../../lib/store";
import type { Lesson, Project } from "../../lib/types";
import { Glass, Modal, Spinner, Toggle } from "../glass";
import { CheckReveal } from "./CheckReveal";
import { Hints } from "./Hints";
import { Rich, fmtGoal } from "./shared";

type ProjState = { kind: "none" } | { kind: "loading" } | { kind: "ok"; project: Project } | { kind: "missing" };

/** Practice challenge: the story, goals, start/continue, last real-world check and (once solved) the solution. */
export function ChallengeSection({ lesson }: { lesson: Lesson }) {
  const ch = lesson.challenge;
  const prog = lesson.progress;
  const registry = useProject((s) => s.registry);
  const [proj, setProj] = useState<ProjState>({ kind: prog.project_id ? "loading" : "none" });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleteOld, setDeleteOld] = useState(true);
  const completed = !!prog.completed_at;
  const check = prog.last_check;

  useEffect(() => { useProject.getState().ensureRegistry().catch(() => {}); }, []);
  useEffect(() => {
    if (!prog.project_id) { setProj({ kind: "none" }); return; }
    let alive = true;
    setProj({ kind: "loading" });
    api.project(prog.project_id)
      .then((p) => alive && setProj({ kind: "ok", project: p }))
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setProj({ kind: "missing" });
        else { toast.error(e); setProj({ kind: "missing" }); }
      });
    return () => { alive = false; };
  }, [prog.project_id]);

  const start = async () => {
    setBusy(true);
    try {
      const oldId = proj.kind === "ok" && deleteOld && confirm ? proj.project.id : null;
      const p = await api.startChallenge(lesson.id);
      if (oldId) await api.deleteProject(oldId).catch(() => {});
      toast.success(`${lesson.emoji} Challenge ready — the practice data is loaded.`);
      navigate(`/p/${p.id}/data`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };
  const label = (id: string) => registry.find((m) => m.id === id)?.label ?? id;
  const goalResult = (metric: string) => check?.goals.find((g) => g.metric === metric);
  const step = proj.kind === "ok" ? STEPS.find((s) => s.id === proj.project.step) : undefined;

  return (
    <div className="col" style={{ gap: 16 }}>
      <AnimatePresence>
        {completed && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring.gentle}>
            <Glass pad="lg" variant="strong" style={{ borderColor: "rgba(48,209,88,.5)", boxShadow: "var(--glass-shadow), 0 0 40px rgba(48,209,88,.2)", overflow: "hidden" }}>
              <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", background: "linear-gradient(135deg, rgba(48,209,88,.16), rgba(10,132,255,.08) 55%, rgba(191,90,242,.12))" }} />
              <div className="row wrap" style={{ gap: 18 }}>
                <motion.span animate={{ rotate: [0, -8, 8, 0], y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 3, repeatDelay: 1 }} style={{ fontSize: 52 }}>🏆</motion.span>
                <div className="col grow" style={{ gap: 4, minWidth: 240 }}>
                  <span className="eyebrow" style={{ color: "#1f9e46" }}>Challenge complete</span>
                  <h2 className="gradient-text" style={{ fontSize: 26 }}>You beat “{ch.title}”!</h2>
                  <span className="muted small">
                    Solved {timeAgo(prog.completed_at!)}{prog.attempts ? ` · ${prog.attempts} real-world check${prog.attempts === 1 ? "" : "s"}` : ""}
                  </span>
                </div>
              </div>
              {ch.solution && (
                <div className="inset col" style={{ gap: 4, padding: "14px 16px", marginTop: 16, background: "var(--glass-strong)" }}>
                  <span className="eyebrow">What we were looking for</span>
                  <span style={{ lineHeight: 1.6, fontSize: 14.5 }}><Rich text={ch.solution} /></span>
                </div>
              )}
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <Glass pad="lg" style={{ overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", background: "radial-gradient(ellipse at 0% 0%, rgba(94,92,230,.12), transparent 50%)" }} />
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          <div className="col" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 12 }}>
              <span style={{ width: 48, height: 48, borderRadius: 15, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 6px 18px rgba(94,92,230,.35)" }}>🎯</span>
              <div className="col" style={{ gap: 0 }}>
                <span className="eyebrow">Practice challenge</span>
                <h3 style={{ fontSize: 21 }}>{ch.title}</h3>
              </div>
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-2)" }}><Rich text={ch.story} /></p>
            <div className="inset row" style={{ gap: 10, padding: "12px 14px", alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>📝</span>
              <div className="col" style={{ gap: 2 }}>
                <span className="eyebrow">Your task</span>
                <span style={{ fontWeight: 560, lineHeight: 1.5 }}><Rich text={ch.task} /></span>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Meta icon="📊" label="Dataset" value={ch.dataset_name} />
              <Meta icon="🎯" label="Predict" value={<><code className="mono">{ch.target}</code> · {ch.task_type === "regression" ? "a number" : "a category"}</>} />
              {ch.allowed_models?.length ? <Meta icon="🧩" label="Model" value={`${ch.allowed_models.map(label).join(" or ")} only`} warn /> : null}
            </div>
          </div>

          <div className="col" style={{ gap: 14 }}>
            <div className="col" style={{ gap: 8 }}>
              <span className="eyebrow">Goals on the hidden real-world test</span>
              {ch.goals.map((g, i) => {
                const r = goalResult(g.metric);
                const ok = completed || r?.passed;
                return (
                  <motion.div key={g.metric} initial={{ opacity: 0, x: 10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ ...spring.gentle, delay: i * 0.08 }}
                    className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 14, background: ok ? "rgba(48,209,88,.12)" : "var(--glass-strong)", border: `1px solid ${ok ? "rgba(48,209,88,.4)" : "var(--hairline)"}` }}>
                    <motion.span key={String(ok)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={spring.pop}
                      style={{ width: 22, height: 22, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0,
                        background: ok ? "var(--success)" : "transparent", border: ok ? "none" : "2px solid var(--fill-2)", color: "white" }}>
                      {ok ? "✓" : ""}
                    </motion.span>
                    <span className="grow" style={{ fontWeight: 560 }}>{g.label}</span>
                    {r && <span className={`badge ${r.passed ? "success" : "danger"}`}>last: {fmtGoal(g.metric, r.value)}</span>}
                  </motion.div>
                );
              })}
              <span className="tiny faint" style={{ lineHeight: 1.5 }}>Your model is graded on data it has never seen — data that looks like the real world, not like your training set.</span>
            </div>

            <div className="col" style={{ gap: 10, marginTop: "auto" }}>
              {proj.kind === "loading" ? (
                <div className="row" style={{ gap: 10 }}><Spinner size={16} /><span className="small muted">Finding your practice project…</span></div>
              ) : proj.kind === "ok" ? (
                <>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="btn gradient lg" onClick={() => navigate(`/p/${proj.project.id}/${proj.project.step || "data"}`)}>
                    {completed ? "🔁 Open my practice project" : "▶ Continue challenge"}
                  </motion.button>
                  <div className="row between wrap" style={{ gap: 8 }}>
                    <span className="small muted">{step ? `${step.icon} You left off at ${step.label}` : ""} · <span className="faint">{timeAgo(proj.project.updated_at)}</span></span>
                    <button className="btn sm ghost" onClick={() => setConfirm(true)} disabled={busy}>↺ Start over</button>
                  </div>
                </>
              ) : (
                <>
                  {proj.kind === "missing" && (
                    <div className="inset small" style={{ padding: "10px 12px", lineHeight: 1.5 }}>🧹 Your previous practice project was deleted. No problem — start a fresh copy.</div>
                  )}
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="btn gradient lg" onClick={start} disabled={busy}>
                    {busy ? <Spinner size={16} /> : "🚀"} {proj.kind === "missing" ? "Start fresh" : "Start challenge"}
                  </motion.button>
                  <span className="tiny faint" style={{ textAlign: "center" }}>Creates a project with the practice data and a starting setup — opens on the Data step.</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="divider" style={{ margin: "22px 0 16px" }} />
        <div className="col" style={{ gap: 10 }}>
          <span className="eyebrow">Stuck?</span>
          <Hints lessonId={lesson.id} hints={ch.hints} />
        </div>
      </Glass>

      {check && (
        <Glass pad="lg">
          <div className="row between wrap" style={{ gap: 8, marginBottom: 16 }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="eyebrow">Your last real-world check</span>
              <b style={{ fontSize: 15 }}>{check.model} · {check.passed ? "passed ✓" : "not yet"}</b>
            </div>
            <span className="small faint">{timeAgo(check.checked_at)}</span>
          </div>
          <CheckReveal check={check} compact />
        </Glass>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Start the challenge over?"
        footer={<>
          <button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
          <button className="btn primary" onClick={start} disabled={busy}>{busy ? <Spinner size={14} /> : "↺"} Start over</button>
        </>}>
        <p className="muted" style={{ lineHeight: 1.55, marginBottom: 14 }}>You'll get a fresh project with the original practice data and the original (flawed) starting setup.</p>
        <Toggle checked={deleteOld} onChange={setDeleteOld} label="Delete my current attempt" help="Otherwise it stays in your Projects list." />
      </Modal>
    </div>
  );
}

function Meta({ icon, label, value, warn }: { icon: string; label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <span className="inset row" style={{ gap: 8, padding: "7px 11px", borderRadius: 12, borderColor: warn ? "rgba(255,159,10,.45)" : undefined, background: warn ? "rgba(255,159,10,.10)" : undefined }}>
      <span>{icon}</span>
      <span className="col" style={{ gap: 0 }}>
        <span className="tiny faint">{label}</span>
        <span className="small" style={{ fontWeight: 600 }}>{value}</span>
      </span>
    </span>
  );
}
