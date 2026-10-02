import { motion } from "framer-motion";
import { useState } from "react";
import { fadeUp, stagger } from "../../design/motion";
import { navigate } from "../../lib/router";
import { toast } from "../../lib/store";
import { Spinner } from "../glass";
import { createFromTemplate, TASK_BADGE, TEMPLATES, type Template } from "./templateData";

/** Quick-start cards that create a ready-to-go project (data + models) and jump straight to Models. */
export function Templates() {
  const [busy, setBusy] = useState<string | null>(null);

  const start = async (t: Template) => {
    if (busy) return;
    setBusy(t.id);
    try {
      const p = await createFromTemplate(t);
      toast.success(`${t.emoji} ${t.title} is ready — data loaded and models picked.`);
      navigate(`/p/${p.id}/models`);
    } catch (e) {
      toast.error(e);
      setBusy(null);
    }
  };

  return (
    <section id="templates" className="col" style={{ gap: 12, scrollMarginTop: 12 }}>
      <div className="col" style={{ gap: 2, padding: "0 4px" }}>
        <h2>Quick start</h2>
        <p className="muted">One click: a dataset, a goal and a few models, ready to train.</p>
      </div>
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(208px, 1fr))", gap: 14 }}>
        {TEMPLATES.map((t) => (
          <motion.button
            key={t.id}
            variants={fadeUp}
            whileTap={{ scale: 0.97 }}
            onClick={() => start(t)}
            disabled={!!busy && busy !== t.id}
            className="glass tile"
            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, textAlign: "left", cursor: busy ? "wait" : "pointer", opacity: busy && busy !== t.id ? 0.5 : 1, border: "1px solid var(--glass-border)", minHeight: 186 }}
          >
            <div className="row between" style={{ width: "100%" }}>
              <motion.span whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }} transition={{ duration: 0.5 }}
                style={{ width: 46, height: 46, borderRadius: 14, background: t.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 25 }}>
                {t.emoji}
              </motion.span>
              {busy === t.id ? <Spinner size={18} color="var(--accent)" /> : (
                <span className="row" style={{ gap: 4 }}>
                {t.modality === "image" && <span className="badge" title="Learns from pictures" style={{ padding: "0 7px" }}>🖼️</span>}
                <span className={`badge ${TASK_BADGE[t.task]?.cls ?? ""}`} style={TASK_BADGE[t.task]?.style}>
                  {TASK_BADGE[t.task]?.label ?? t.task}
                </span>
                </span>
              )}
            </div>
            <b style={{ fontSize: 15, letterSpacing: "-0.01em" }}>{t.title}</b>
            <span className="small muted" style={{ lineHeight: 1.45 }}>{t.blurb}</span>
            <div className="grow" />
            <span className="tiny faint">{busy === t.id ? (t.imageSet ? "Drawing the pictures…" : "Setting things up…") : `${t.models.length} models${t.truth ? " · hidden answers to check" : ""} · opens on Models →`}</span>
          </motion.button>
        ))}
      </motion.div>
    </section>
  );
}
