import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { createPortal } from "react-dom";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { useJob } from "../../lib/store";
import { Glass, Modal, Spinner } from "../glass";

/** Quit: stop the local server (with confirmation) and show a friendly goodbye screen. */
export function QuitPanel() {
  const [confirm, setConfirm] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [gone, setGone] = useState(false);
  const training = useJob((s) => s.status === "running");

  const quit = async () => {
    setQuitting(true);
    try { await api.shutdown(); } catch { /* the server may vanish before answering — that's fine */ }
    setConfirm(false);
    setGone(true);
  };

  return (
    <Glass animate_in>
      <span className="eyebrow">Quit</span>
      <h3 style={{ margin: "2px 0 6px" }}>Done for today?</h3>
      <p className="small muted" style={{ lineHeight: 1.5, marginBottom: 14 }}>
        Stops the ML Playground server running in the background. Everything is already saved on your Mac.
      </p>
      <button className="btn danger" onClick={() => setConfirm(true)}>⏻ Quit ML Playground</button>

      <Modal
        open={confirm}
        onClose={() => !quitting && setConfirm(false)}
        title="Quit ML Playground?"
        width={430}
        footer={
          <>
            <button className="btn ghost" onClick={() => setConfirm(false)} disabled={quitting}>Stay</button>
            <button className="btn primary" style={{ background: "var(--danger)", boxShadow: "0 6px 18px rgba(255,69,58,0.35)" }} onClick={quit} disabled={quitting}>
              {quitting ? <Spinner size={14} /> : "⏻"} Quit
            </button>
          </>
        }
      >
        <p className="muted" style={{ lineHeight: 1.55 }}>
          The server will stop and this page will stop working until you open the app again.
          {training && <><br /><br /><b style={{ color: "var(--warning)" }}>⚠️ A training job is still running — it will be stopped.</b></>}
        </p>
      </Modal>

      {createPortal(
        <AnimatePresence>
          {gone && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
              style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.2)", backdropFilter: "blur(24px) saturate(160%)", WebkitBackdropFilter: "blur(24px) saturate(160%)" }}
            >
              <motion.div className="glass strong" initial={{ scale: 0.9, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ ...spring.gentle, delay: 0.15 }}
                style={{ padding: "44px 48px", borderRadius: 32, textAlign: "center", maxWidth: 460 }}>
                <motion.div animate={{ rotate: [0, 18, -10, 18, 0] }} transition={{ duration: 1.4, delay: 0.5, repeat: Infinity, repeatDelay: 2.2 }} style={{ fontSize: 60, display: "inline-block", transformOrigin: "70% 80%" }}>👋</motion.div>
                <h2 style={{ marginTop: 12 }}>See you soon!</h2>
                <p className="muted" style={{ marginTop: 10, lineHeight: 1.55, fontSize: 15 }}>
                  ML Playground has stopped. You can reopen it any time from the <b>ML Playground</b> icon.
                </p>
                <p className="tiny faint" style={{ marginTop: 16 }}>It's safe to close this tab.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Glass>
  );
}
