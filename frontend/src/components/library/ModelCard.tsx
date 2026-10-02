import { motion } from "framer-motion";
import { forwardRef, useState } from "react";
import { spring } from "../../design/motion";
import { timeAgo } from "../../lib/format";
import { navigate } from "../../lib/router";
import type { SavedModel } from "../../lib/types";
import { ProgressRing, Tooltip } from "../glass";
import { Thumb } from "../train/visionKit";
import { EditableText, headline, taskMeta } from "./shared";

/** One saved model in the library grid. */
export const ModelCard = forwardRef<HTMLDivElement, { model: SavedModel; emoji: string; onRename: (name: string) => void; onDelete: () => void }>(
  function ModelCard({ model, emoji, onRename, onDelete }, ref) {
    const [hover, setHover] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const h = headline(model);
    const tone = h.tone;
    const task = taskMeta(model.task);
    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85, filter: "blur(6px)", transition: { duration: 0.22 } }}
        whileHover={{ y: -4 }}
        transition={spring.gentle}
        onHoverStart={() => setHover(true)}
        onHoverEnd={() => setHover(false)}
        onClick={() => !renaming && navigate(`/library/${model.id}`)}
        className="glass"
        style={{ padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 14, boxShadow: hover ? "var(--glass-shadow), 0 18px 44px rgba(40,50,90,0.16)" : undefined }}
      >
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <motion.span
            animate={{ rotate: hover ? [0, -8, 6, 0] : 0, scale: hover ? 1.06 : 1 }}
            transition={{ duration: 0.5 }}
            style={{ width: 46, height: 46, borderRadius: 14, background: "linear-gradient(135deg, var(--accent-soft), rgba(191,90,242,0.16))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, border: "1px solid var(--glass-border)" }}
          >
            {emoji}
          </motion.span>
          <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
            <EditableText
              value={model.name}
              onSave={onRename}
              editing={renaming}
              onDone={() => setRenaming(false)}
              style={{ fontWeight: 650, fontSize: 15.5, letterSpacing: "-0.015em", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            />
            <span className="small muted truncate">{model.label}</span>
          </div>
          <motion.div className="row" style={{ gap: 2 }} animate={{ opacity: hover || renaming ? 1 : 0 }} transition={{ duration: 0.15 }}>
            <Tooltip content="Rename" width={80}>
              <button className="btn ghost sm icon" aria-label="Rename" onClick={(e) => { e.stopPropagation(); setRenaming(true); }}>✏️</button>
            </Tooltip>
            <Tooltip content="Delete" width={70}>
              <button className="btn ghost sm icon" aria-label="Delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>🗑️</button>
            </Tooltip>
          </motion.div>
        </div>

        <div className="inset row" style={{ padding: "10px 12px", gap: 12 }}>
          <ProgressRing value={h.ring} size={46} stroke={5} color={tone}>
            {["classification", "regression"].includes(model.task)
              ? <span style={{ fontSize: 10.5 }}>{h.value === null ? "—" : Math.round(h.ring * 100)}</span>
              : <span style={{ fontSize: 13 }}>{task.icon}</span>}
          </ProgressRing>
          <div className="col grow" style={{ gap: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }} className="num">{h.text}</span>
            <span className="tiny muted">{["classification", "regression"].includes(model.task) ? "test " : ""}{h.label.toLowerCase()}</span>
          </div>
          {model.modality === "image" && model.dataset?.id && (
            <div className="row" style={{ gap: 0 }}>
              {[0, 1, 2].map((i) => (
                <motion.div key={i} animate={{ rotate: hover ? (i - 1) * 9 : (i - 1) * 4, x: hover ? (i - 1) * 6 : 0, y: hover ? -2 : 0 }} transition={spring.gentle} style={{ marginLeft: i ? -12 : 0, zIndex: 3 - i }}>
                  <Thumb datasetId={model.dataset.id} i={i} size={34} px={64} radius={8} style={{ border: "2px solid var(--glass-strong)" }} />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          <span className={`badge ${task.badge}`}>{task.icon} {task.label}</span>
          {model.modality === "image" && <span className="badge">🖼️ Images</span>}
          {model.dataset?.name && <span className="badge truncate" style={{ maxWidth: 170 }} title={model.dataset.name}>📊 {model.dataset.name}</span>}
          <span className="grow" />
          <span className="tiny faint">{timeAgo(model.created_at)}</span>
        </div>
      </motion.div>
    );
  },
);

export function CardSkeleton() {
  return (
    <div className="glass" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ gap: 12 }}>
        <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 14 }} />
        <div className="col grow" style={{ gap: 6 }}>
          <div className="skeleton" style={{ height: 14, width: "70%" }} />
          <div className="skeleton" style={{ height: 11, width: "40%" }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 66, borderRadius: 14 }} />
      <div className="skeleton" style={{ height: 20, width: "60%" }} />
    </div>
  );
}
