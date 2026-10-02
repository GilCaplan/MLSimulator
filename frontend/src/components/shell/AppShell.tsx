import { motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { useApplyPrefs } from "../../design/apply";
import { spring } from "../../design/motion";
import { navigate, useRouter } from "../../lib/router";
import { useJob, useUI } from "../../lib/store";
import { MeshBackground, Spinner, Toasts } from "../glass";

const NAV = [
  { path: "/", label: "Projects", match: ["home", "wizard"] },
  { path: "/lessons", label: "Lessons", match: ["lessons", "lesson"] },
  { path: "/labs", label: "Labs", match: ["labs", "lab"] },
  { path: "/library", label: "Model Library", match: ["library", "model"] },
  { path: "/settings", label: "Settings", match: ["settings"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const prefs = useUI((s) => s.prefs);
  useApplyPrefs(prefs);
  useEffect(() => { useUI.getState().syncFromServer(); }, []);
  const route = useRouter((s) => s.route);
  const jobStatus = useJob((s) => s.status);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <MeshBackground />
      <header className="app-header" style={{ position: "relative", zIndex: 10, padding: "14px 22px 0" }}>
        <div className="glass" style={{ display: "flex", alignItems: "center", gap: 18, padding: "8px 10px 8px 16px", borderRadius: "var(--r-lg)" }}>
          <button onClick={() => navigate("/")} className="row app-brand" style={{ gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <img src="/favicon.png" width={28} height={28} style={{ borderRadius: 8 }} alt="" />
            <span style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.02em" }}>ML Playground</span>
          </button>
          <nav className="inset row app-nav" style={{ padding: 3, gap: 2, borderRadius: "var(--r-md)", marginLeft: 8 }}>
            {NAV.map((n) => {
              const active = n.match.includes(route.name);
              return (
                <button key={n.path} onClick={() => navigate(n.path)} style={{ position: "relative", height: 30, padding: "0 14px", border: "none", background: "transparent", cursor: "pointer", fontWeight: active ? 600 : 500, fontSize: 13, borderRadius: "calc(var(--r-md) - 3px)" }}>
                  {active && <motion.span layoutId="nav-pill" transition={spring.snappy} style={{ position: "absolute", inset: 0, borderRadius: "calc(var(--r-md) - 3px)", background: "var(--seg-pill-bg)", boxShadow: "var(--seg-pill-shadow)" }} />}
                  <span style={{ position: "relative", color: active ? "var(--seg-pill-text)" : undefined }}>{n.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="grow" />
          {jobStatus === "running" && (
            <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="badge accent" style={{ height: 26 }}>
              <Spinner size={12} /> Training…
            </motion.span>
          )}
          <span className="faint small app-host" style={{ paddingRight: 8 }}>localhost:{window.location.port || 80}</span>
        </div>
      </header>
      <main key={prefs.chartPalette} style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0 }}>{children}</main>
      <Toasts />
    </div>
  );
}
