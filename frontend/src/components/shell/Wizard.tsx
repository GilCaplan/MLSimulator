import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { spring, stagger } from "../../design/motion";
import { navigate } from "../../lib/router";
import { STEPS, stepAvailable, stepDone, useJob, useProject } from "../../lib/store";
import type { StepId, Suggestion } from "../../lib/types";
import { Glass, Spinner } from "../glass";
import { ChallengeBanner } from "../lessons/ChallengeBanner";

/** Left-hand vertical stepper for the guided flow. */
export function Stepper({ current }: { current: StepId }) {
  const project = useProject((s) => s.project);
  const saving = useProject((s) => s.saving);
  const jobRunning = useJob((s) => s.status === "running" && s.kind === "train");
  if (!project) return null;
  return (
    <Glass pad={false} style={{ width: 232, padding: 12, display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, alignSelf: "flex-start" }}>
      <div style={{ padding: "8px 10px 12px" }}>
        <div className="eyebrow">Project</div>
        <input
          className="input"
          value={project.name}
          onChange={(e) => useProject.getState().update({ name: e.target.value })}
          style={{ marginTop: 6, width: "100%", fontWeight: 650, fontSize: 15, background: "transparent", border: "1px solid transparent", padding: "0 6px", marginLeft: -6 }}
        />
        <div className="tiny faint" style={{ marginTop: 2, height: 14 }}>{saving ? "Saving…" : "All changes saved"}</div>
      </div>
      {STEPS.map((s, i) => {
        const active = s.id === current;
        const done = stepDone(project, s.id);
        const avail = stepAvailable(project, s.id);
        return (
          <button
            key={s.id}
            disabled={!avail}
            onClick={() => navigate(`/p/${project.id}/${s.id}`)}
            style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "10px 10px", borderRadius: 14, border: "none", background: "transparent", cursor: avail ? "pointer" : "not-allowed", opacity: avail ? 1 : 0.42, textAlign: "left" }}
          >
            {active && <motion.span layoutId="step-pill" transition={spring.snappy} style={{ position: "absolute", inset: 0, borderRadius: 14, background: "var(--glass-strong)", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 4px 14px rgba(0,0,0,.08)" }} />}
            <span style={{ position: "relative", width: 34, height: 34, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, background: done ? "rgba(48,209,88,.16)" : active ? "var(--accent-soft)" : "var(--fill)", flexShrink: 0 }}>
              {s.id === "train" && jobRunning ? <Spinner size={16} color="var(--accent)" /> : done && !active ? "✓" : s.icon}
            </span>
            <span style={{ position: "relative", minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: active ? 650 : 560, fontSize: 13.5 }}>{i + 1}. {s.label}</span>
              <span className="tiny faint truncate" style={{ display: "block" }}>{s.blurb}</span>
            </span>
          </button>
        );
      })}
    </Glass>
  );
}

const SEV = {
  high: { color: "var(--danger)", bg: "rgba(255,69,58,.12)", icon: "⚠️" },
  warn: { color: "var(--warning)", bg: "rgba(255,159,10,.12)", icon: "💡" },
  info: { color: "var(--accent)", bg: "var(--accent-soft)", icon: "✨" },
};

/** The coach column: an intro for the step plus dynamic suggestions with one-click actions. */
export function CoachPanel({ intro, suggestions = [], extra }: { intro?: ReactNode; suggestions?: Suggestion[]; extra?: ReactNode }) {
  const apply = useProject((s) => s.applyAction);
  const inChallenge = useProject((s) => !!s.project?.challenge);
  const [spoilers, setSpoilers] = useState(false);
  const hidden = inChallenge && !spoilers && suggestions.length > 0;
  if (hidden) suggestions = [];
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col" style={{ width: 300, flexShrink: 0, gap: 12 }}>
      {intro && (
        <Glass animate_in variant="strong">
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <motion.span animate={{ rotate: [0, 12, -8, 0] }} transition={{ repeat: Infinity, duration: 4, repeatDelay: 2 }} style={{ fontSize: 18 }}>🧑‍🏫</motion.span>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>Coach</span>
          </div>
          <div className="small" style={{ lineHeight: 1.6, color: "var(--text-2)" }}>{intro}</div>
        </Glass>
      )}
      <AnimatePresence initial={false}>
        {suggestions.map((s) => {
          const sev = SEV[s.severity];
          return (
            <motion.div key={s.id} layout initial={{ opacity: 0, x: 20, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.96 }} transition={spring.gentle}>
              <Glass style={{ padding: 16 }}>
                <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: sev.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{sev.icon}</span>
                  <div className="col" style={{ gap: 4, minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>{s.title}</b>
                    <span className="small muted" style={{ lineHeight: 1.5 }}>{s.why}</span>
                    {s.action && (
                      <button className="btn sm primary" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={() => apply(s.action!)}>{s.action.label}</button>
                    )}
                  </div>
                </div>
              </Glass>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {hidden && (
        <Glass animate_in style={{ padding: 14 }}>
          <div className="small muted" style={{ marginBottom: 8 }}>🙈 The coach has tips, but this is a challenge — try solving it yourself first.</div>
          <button className="btn sm" onClick={() => setSpoilers(true)}>Show coach tips (spoilers)</button>
        </Glass>
      )}
      {extra}
    </motion.div>
  );
}

/** Standard page frame for a wizard step: header, main content, optional coach column and footer bar. */
export function StepLayout({ title, subtitle, children, coach, footer, wide }: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  coach?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" style={{ display: "flex", gap: 18, alignItems: "flex-start", minHeight: "100%" }}>
      <div className="col grow" style={{ gap: 16, maxWidth: wide ? undefined : 1100, paddingBottom: footer ? 90 : 24 }}>
        <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} className="col" style={{ gap: 6, padding: "6px 4px 4px" }}>
          <h1 style={{ fontSize: 30 }}>{title}</h1>
          {subtitle && <p className="muted" style={{ fontSize: 15, maxWidth: 720 }}>{subtitle}</p>}
        </motion.div>
        {children}
      </div>
      {coach && <div style={{ position: "sticky", top: 0 }}>{coach}</div>}
      {footer && createPortal(
        <div style={{ position: "fixed", bottom: 18, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 20, pointerEvents: "none" }}>
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring.gentle, delay: 0.2 }}
            className="glass strong row" style={{ padding: "8px 8px 8px 18px", borderRadius: 999, gap: 14, pointerEvents: "auto", marginLeft: 250 }}>
            {footer}
          </motion.div>
        </div>,
        document.body,
      )}
    </motion.div>
  );
}

/** Footer content: status text + Back / Continue buttons. */
export function NextBar({ status, back, next, nextLabel = "Continue", nextDisabled, busy }: {
  status?: ReactNode;
  back?: StepId;
  next?: StepId | (() => void);
  nextLabel?: ReactNode;
  nextDisabled?: boolean;
  busy?: boolean;
}) {
  const project = useProject((s) => s.project);
  return (
    <>
      {status && <span className="small muted" style={{ maxWidth: 420 }}>{status}</span>}
      {back && project && <button className="btn" onClick={() => navigate(`/p/${project.id}/${back}`)}>← Back</button>}
      {next && (
        <button className="btn primary" disabled={nextDisabled || busy}
          onClick={() => (typeof next === "function" ? next() : project && navigate(`/p/${project.id}/${next}`))}>
          {busy && <Spinner size={14} />} {nextLabel} {!busy && "→"}
        </button>
      )}
    </>
  );
}

/** Two-column wizard frame with the stepper on the left. */
export function WizardFrame({ step, children }: { step: StepId; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 18, height: "100%", padding: "16px 22px 0" }}>
      <Stepper current={step} />
      <div className="grow scroll" style={{ height: "100%", paddingRight: 4 }}>
        <ChallengeBanner />
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 18, filter: "blur(6px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }} exit={{ opacity: 0, x: -18, filter: "blur(6px)" }} transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }} style={{ minHeight: "100%" }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
