import { motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { spring } from "../../design/motion";
import { navigate, useRouter } from "../../lib/router";
import { useJob, useUI } from "../../lib/store";
import { MeshBackground, Spinner, Toasts } from "../glass";

function useTheme() {
  const theme = useUI((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "auto" && mq.matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

const NAV = [
  { path: "/", label: "Projects", match: ["home", "wizard"] },
  { path: "/lessons", label: "Lessons", match: ["lessons", "lesson"] },
  { path: "/library", label: "Model Library", match: ["library", "model"] },
  { path: "/settings", label: "Settings", match: ["settings"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  useTheme();
  const route = useRouter((s) => s.route);
  const jobStatus = useJob((s) => s.status);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <MeshBackground />
      <header style={{ position: "relative", zIndex: 10, padding: "14px 22px 0" }}>
        <div className="glass" style={{ display: "flex", alignItems: "center", gap: 18, padding: "8px 10px 8px 16px", borderRadius: 20 }}>
          <button onClick={() => navigate("/")} className="row" style={{ gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <img src="/favicon.png" width={28} height={28} style={{ borderRadius: 8 }} alt="" />
            <span style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.02em" }}>ML Playground</span>
          </button>
          <nav className="inset row" style={{ padding: 3, gap: 2, borderRadius: 12, marginLeft: 8 }}>
            {NAV.map((n) => {
              const active = n.match.includes(route.name);
              return (
                <button key={n.path} onClick={() => navigate(n.path)} style={{ position: "relative", height: 30, padding: "0 14px", border: "none", background: "transparent", cursor: "pointer", fontWeight: active ? 600 : 500, fontSize: 13, borderRadius: 9 }}>
                  {active && <motion.span layoutId="nav-pill" transition={spring.snappy} style={{ position: "absolute", inset: 0, borderRadius: 9, background: "var(--glass-strong)", boxShadow: "0 1px 0 rgba(255,255,255,.6) inset, 0 2px 8px rgba(0,0,0,.1)" }} />}
                  <span style={{ position: "relative" }}>{n.label}</span>
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
          <span className="faint small" style={{ paddingRight: 8 }}>localhost:{window.location.port || 80}</span>
        </div>
      </header>
      <main style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0 }}>{children}</main>
      <Toasts />
    </div>
  );
}
