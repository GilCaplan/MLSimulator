import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { useProject } from "../../lib/store";
import { Rich, openLesson, useHints, useLesson } from "./shared";
import { Hints } from "./Hints";

const KEY = "mlp.challengeBannerCollapsed";
const readCollapsed = () => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};

/** Compact challenge reminder shown at the top of every wizard step of a lesson project. */
export function ChallengeBanner() {
  const project = useProject((s) => s.project);
  const lessonId = project?.challenge?.lesson_id ?? null;
  const lesson = useLesson(lessonId);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [hintsOpen, setHintsOpen] = useState(false);
  const shown = useHints((s) => (lessonId ? s.shown[lessonId] ?? 0 : 0));
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hintsOpen) return;
    const close = (e: MouseEvent) => { if (pop.current && !pop.current.contains(e.target as Node)) setHintsOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setHintsOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [hintsOpen]);

  if (!project?.challenge || !lessonId) return null;
  const toggle = (v: boolean) => {
    setCollapsed(v);
    setHintsOpen(false);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* storage unavailable */ }
  };
  const ch = lesson?.challenge;

  return (
    <motion.div layout transition={spring.snappy} style={{ position: "relative", zIndex: 20, marginBottom: 14, display: "flex", justifyContent: collapsed ? "flex-start" : "stretch" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {collapsed ? (
          <motion.button key="pill" layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring.snappy}
            onClick={() => toggle(false)} className="glass strong row" whileHover={{ y: -1 }}
            style={{ gap: 8, height: 34, padding: "0 14px 0 10px", borderRadius: 999, cursor: "pointer", border: "1px solid rgba(94,92,230,.35)" }}>
            <span style={{ fontSize: 15 }}>🎯</span>
            <span className="small" style={{ fontWeight: 650 }}>Challenge: {ch?.title ?? "…"}</span>
            <span className="tiny faint">· {ch?.goals.length ?? 0} goal{ch?.goals.length === 1 ? "" : "s"}</span>
            <span className="faint" style={{ fontSize: 11 }}>▾</span>
          </motion.button>
        ) : (
          <motion.div key="full" layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.snappy}
            className="glass strong row" style={{ width: "100%", gap: 14, padding: "10px 12px 10px 14px", borderRadius: 18, border: "1px solid rgba(94,92,230,.35)", minHeight: 56 }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", background: "linear-gradient(90deg, rgba(10,132,255,.10), rgba(191,90,242,.10) 50%, transparent)" }} />
            <motion.span animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 2.6, repeatDelay: 1.5 }}
              style={{ width: 36, height: 36, borderRadius: 12, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, boxShadow: "0 4px 14px rgba(94,92,230,.35)" }}>
              🎯
            </motion.span>
            <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
              <span className="row" style={{ gap: 8, minWidth: 0 }}>
                <b className="truncate" style={{ fontSize: 14 }}>Challenge: {ch?.title ?? "Loading…"}</b>
                {lesson && <span className="tiny faint truncate">{lesson.emoji} {lesson.title}</span>}
              </span>
              {ch && (
                <span className="row" style={{ gap: 5, minWidth: 0, overflow: "hidden", flexWrap: "nowrap" }}>
                  {ch.goals.map((g) => (
                    <span key={g.metric} className="badge" style={{ height: 20, fontSize: 10.5, flexShrink: 0, background: "var(--glass-strong)", border: "1px solid var(--hairline)" }}>🏁 {g.label}</span>
                  ))}
                  <span className="tiny faint truncate" style={{ marginLeft: 4 }}><Rich text={ch.task} /></span>
                </span>
              )}
            </div>
            <div ref={pop} style={{ position: "relative", flexShrink: 0 }}>
              <button className={`btn sm ${hintsOpen ? "primary" : ""}`} onClick={() => setHintsOpen((v) => !v)} disabled={!ch}>
                💡 Hints{shown ? ` · ${shown}/${ch?.hints.length ?? 0}` : ""}
              </button>
              <AnimatePresence>
                {hintsOpen && ch && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={spring.snappy}
                    className="glass strong" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 340, padding: 14, borderRadius: 18, zIndex: 60, transformOrigin: "top right",
                      // nested backdrop-filter can't blur through the banner's own glass, so back it with the page colour
                      background: "linear-gradient(var(--glass-strong), var(--glass-strong)), var(--bg)" }}>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>Hints · one at a time</div>
                    <Hints lessonId={lessonId} hints={ch.hints} compact />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button className="btn sm ghost" style={{ flexShrink: 0 }} onClick={() => openLesson(lessonId, "practice")}>🎓 Back to lesson</button>
            <button className="btn sm ghost icon" aria-label="Collapse challenge banner" title="Collapse" style={{ flexShrink: 0 }} onClick={() => toggle(true)}>▴</button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
