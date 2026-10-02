import { AnimatePresence, motion } from "framer-motion";
import { useState, type CSSProperties, type ReactNode } from "react";
import { spring } from "../../../design/motion";
import { navigate } from "../../../lib/router";
import { useProject } from "../../../lib/store";
import type { RunResult } from "../../../lib/types";
import { Glass } from "../../glass";
import { realModels, useSaved } from "../util";
import { SaveModelModal } from "./SaveModelModal";
import { useSavedCount, useSavedSync } from "./savedSync";

/* Entry points for saving: a button that opens the save dialog, the header strip on the Train results, and the coach hint. */

/** A button that opens the "Save a model" dialog for a run. */
export function SaveModelButton({ result, children = "💾 Save a model", className = "btn primary", preselect, finish, style, title }: {
  result: RunResult | null | undefined;
  children?: ReactNode;
  className?: string;
  preselect?: string | null;
  finish?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!result) return null;
  return (
    <>
      <motion.button whileTap={{ scale: 0.96 }} transition={spring.pop} className={className} style={style} title={title} onClick={() => setOpen(true)}
        disabled={!realModels(result).length}>
        {children}
      </motion.button>
      <SaveModelModal open={open} onClose={() => setOpen(false)} result={result} preselect={preselect} finish={finish} />
    </>
  );
}

/** Strip above the Train results: how many models are saved, and a prominent save button. */
export function SaveStrip({ result }: { result: RunResult }) {
  useSavedSync(result.job_id);
  const n = useSavedCount(result);
  const total = realModels(result).length;
  const lastId = useSaved((s) => {
    const keys = Object.keys(result.models).filter((k) => s.saved[`${result.job_id}:${k}`]);
    return keys.length ? s.saved[`${result.job_id}:${keys[keys.length - 1]}`] : null;
  });
  if (!total) return null;
  return (
    <Glass variant="strong" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle} style={{ padding: "10px 12px 10px 16px" }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <span className="row" style={{ gap: 10, minWidth: 0 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={n ? "saved" : "unsaved"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={spring.pop}
              style={{ width: 34, height: 34, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0,
                background: n ? "color-mix(in srgb, var(--success) 16%, transparent)" : "var(--accent-soft)" }}>
              {n ? "✓" : "💾"}
            </motion.span>
          </AnimatePresence>
          <span className="col" style={{ gap: 1, minWidth: 0 }}>
            <b style={{ fontSize: 14 }}>{n ? `${n} of ${total} model${total === 1 ? "" : "s"} saved` : "Happy with a model? Save it."}</b>
            <span className="small muted">
              {n ? "Saved models live in your library, ready to use. Save more, or keep improving." : "You don't have to improve it first — save any time, and come back later."}
            </span>
          </span>
        </span>
        <span className="row" style={{ gap: 8 }}>
          {n > 0 && lastId && <button className="btn sm ghost" onClick={() => navigate(`/library/${lastId}`)}>📚 Library</button>}
          <SaveModelButton result={result} className="btn gradient">💾 Save a model</SaveModelButton>
        </span>
      </div>
    </Glass>
  );
}

const HINT_KEY = "mlp.saveHint.dismissed";
const readDismissed = () => { try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } };

/** Coach-column hint shown while a run's results are fresh and nothing is saved yet (until dismissed). */
export function SaveHint({ result }: { result: RunResult | null }) {
  const n = useSavedCount(result);
  const [dismissed, setDismissed] = useState(readDismissed);
  const challenge = useProject((s) => !!s.project?.challenge);
  const show = !!result && !n && !dismissed && !challenge && realModels(result).length > 0;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* private mode: just hide it for now */ }
  };
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="save-hint" initial={{ opacity: 0, x: 20, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.96 }} transition={{ ...spring.gentle, delay: 0.4 }}>
          <Glass style={{ padding: 16 }}>
            <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>💾</span>
              <div className="col" style={{ gap: 4, minWidth: 0 }}>
                <b style={{ fontSize: 13.5 }}>Happy with a model?</b>
                <span className="small muted" style={{ lineHeight: 1.5 }}>Save it — you can always come back to improve.</span>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <SaveModelButton result={result} className="btn sm primary">Save a model</SaveModelButton>
                  <button className="btn sm ghost" onClick={dismiss}>Got it</button>
                </div>
              </div>
            </div>
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
