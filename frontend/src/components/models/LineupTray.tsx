import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { spring } from "../../design/motion";
import { newKey, useProject } from "../../lib/store";
import type { ModelConfig } from "../../lib/types";
import { Glass, Tooltip } from "../glass";
import { lineupLabels } from "./meta";

const EMPTY: ModelConfig[] = [];

/** Sticky "Your line-up" tray: the selected models as chips, with settings, duplicate and remove. */
export function LineupTray({ onSettings }: { onSettings: (key: string) => void }) {
  const models = useProject((s) => s.project?.models ?? EMPTY);
  const spec = useProject((s) => s.spec);
  const labels = lineupLabels(models, spec);

  const duplicate = (m: ModelConfig) => {
    const copy: ModelConfig = { ...structuredClone(m), key: newKey() };
    useProject.getState().update((p) => {
      const i = p.models.findIndex((x) => x.key === m.key);
      const next = [...p.models];
      next.splice(i + 1, 0, copy);
      return { models: next };
    });
    onSettings(copy.key);
  };
  const remove = (key: string) => useProject.getState().update((p) => ({ models: p.models.filter((m) => m.key !== key) }));

  return (
    <Glass variant="strong" animate_in style={{ position: "sticky", top: 0, zIndex: 5, padding: "12px 14px" }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 0, flexShrink: 0, paddingTop: 4, width: 112 }}>
          <span className="eyebrow">Your line-up</span>
          <span className="small muted num">
            {models.length === 0 ? "Nothing yet" : `${models.length} model${models.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <LayoutGroup>
          <motion.div layout className="row wrap grow" style={{ gap: 8, minHeight: 34 }}>
            <AnimatePresence mode="popLayout" initial={false}>
              {models.length === 0 && (
                <motion.span key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="small faint" style={{ padding: "8px 2px" }}>
                  Tap the cards below to add models — they'll race each other when you train. 🏁
                </motion.span>
              )}
              {models.map((m) => {
                const s = spec(m.model_id);
                return (
                  <motion.div
                    key={m.key}
                    layout
                    initial={{ opacity: 0, scale: 0.6, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
                    transition={spring.pop}
                    className="row"
                    style={{ gap: 2, height: 34, padding: "0 4px 0 10px", borderRadius: 999, background: "var(--glass-strong)", border: "1px solid var(--hairline)", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}
                  >
                    <span style={{ fontSize: 15 }}>{s?.emoji ?? "🧩"}</span>
                    <span className="small" style={{ fontWeight: 600, padding: "0 4px", whiteSpace: "nowrap" }}>{labels[m.key]}</span>
                    <Tooltip content="Open its settings" width={130}>
                      <button className="btn ghost sm icon" onClick={() => onSettings(m.key)} aria-label="Settings">⚙︎</button>
                    </Tooltip>
                    <Tooltip content="Add a copy — compare two settings of the same model side by side" width={200}>
                      <button className="btn ghost sm" style={{ padding: "0 6px", fontSize: 11.5 }} onClick={() => duplicate(m)}>+ copy</button>
                    </Tooltip>
                    <button className="btn ghost sm icon" onClick={() => remove(m.key)} aria-label="Remove" style={{ color: "var(--text-3)" }}>✕</button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      </div>
    </Glass>
  );
}
