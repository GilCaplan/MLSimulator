import { motion } from "framer-motion";
import { useState } from "react";
import { fadeUp, spring } from "../../design/motion";
import { timeAgo } from "../../lib/format";
import { navigate } from "../../lib/router";
import { STEPS, stepDone } from "../../lib/store";
import type { Project } from "../../lib/types";
import { Tooltip } from "../glass";

/** One recent project: name, task, where you left off, six-step progress dots, actions. */
export function ProjectCard({ project: p, onDelete, onRename }: { project: Project; onDelete: () => void; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const step = STEPS.find((s) => s.id === p.step) ?? STEPS[0];
  const done = STEPS.filter((s) => stepDone(p, s.id)).length;
  const open = () => !editing && navigate(`/p/${p.id}/${p.step || "problem"}`);
  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== p.name) onRename(name);
    else setDraft(p.name);
  };

  return (
    <motion.div
      layout
      variants={fadeUp}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
      transition={spring.gentle}
      onClick={open}
      className="glass tile"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, minHeight: 168 }}
    >
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <span style={{ width: 42, height: 42, borderRadius: 13, background: "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
          {p.emoji || (p.task === "regression" ? "📈" : p.task === "classification" ? "🗂️" : "🎯")}
        </span>
        <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
          {editing ? (
            <input
              autoFocus
              className="input"
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(p.name); setEditing(false); } }}
              style={{ height: 28, fontWeight: 650, fontSize: 14.5, padding: "0 8px", marginLeft: -8 }}
            />
          ) : (
            <b className="truncate" style={{ fontSize: 15, letterSpacing: "-0.01em" }}>{p.name}</b>
          )}
          <span className="row wrap" style={{ gap: 6 }}>
            {p.task ? (
              <span className={`badge ${p.task === "classification" ? "accent" : ""}`} style={p.task === "regression" ? { background: "rgba(191,90,242,.16)", color: "var(--accent-2)" } : undefined}>
                {p.task === "classification" ? "Classification" : "Regression"}
              </span>
            ) : <span className="badge">No goal yet</span>}
            <span className={`badge ${p.dataset_id ? "success" : ""}`}>{p.dataset_id ? (p.modality === "image" ? "🖼️ Images" : "📊 Data") : "No data yet"}</span>
          </span>
        </div>
        <span className="row" style={{ gap: 0 }} onClick={(e) => e.stopPropagation()}>
          <Tooltip content="Rename" width={80}>
            <button className="btn ghost sm icon" aria-label="Rename" onClick={() => { setDraft(p.name); setEditing(true); }}>✎</button>
          </Tooltip>
          <Tooltip content="Delete" width={70}>
            <button className="btn ghost sm icon" aria-label="Delete" onClick={onDelete} style={{ color: "var(--text-3)" }}>🗑</button>
          </Tooltip>
        </span>
      </div>

      <div className="grow" />

      <div className="col" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 5 }}>
          {STEPS.map((s, i) => {
            const isDone = stepDone(p, s.id);
            const current = s.id === p.step;
            return (
              <Tooltip key={s.id} content={`${s.icon} ${s.label}${isDone ? " — done" : current ? " — you are here" : ""}`} width={150}>
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...spring.pop, delay: 0.15 + i * 0.04 }}
                  style={{
                    display: "block", height: 8, width: current ? 22 : 8, borderRadius: 4,
                    background: isDone ? "var(--success)" : current ? "var(--accent)" : "var(--fill-2)",
                    transition: "width .3s",
                  }}
                />
              </Tooltip>
            );
          })}
          <span className="tiny faint num" style={{ marginLeft: 4 }}>{done}/6</span>
        </div>
        <div className="row between small">
          <span className="muted">{step.icon} {step.label} · <span className="faint">{step.blurb}</span></span>
          <span className="faint tiny" style={{ whiteSpace: "nowrap" }}>{timeAgo(p.updated_at)}</span>
        </div>
      </div>
    </motion.div>
  );
}
