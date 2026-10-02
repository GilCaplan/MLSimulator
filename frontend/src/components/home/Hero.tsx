import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { navigate } from "../../lib/router";
import { toast } from "../../lib/store";
import type { NNArch } from "../../lib/types";
import { Glass, Spinner } from "../glass";
import { archToLayers, NetworkDiagram } from "../nn/NetworkDiagram";

const HERO_ARCH: NNArch = {
  kind: "mlp",
  layers: [
    { type: "dense", units: 6, activation: "relu" },
    { type: "dense", units: 5, activation: "relu" },
  ],
};

const FLOATERS = [
  { text: "🌸 Iris · 97%", x: "6%", y: "8%", d: 0 },
  { text: "📉 loss ↓", x: "70%", y: "2%", d: 0.8 },
  { text: "🌲 Random Forest", x: "64%", y: "84%", d: 1.6 },
  { text: "🧠 3 layers", x: "2%", y: "82%", d: 2.2 },
];

export function Hero({ projectCount }: { projectCount: number }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const layers = useMemo(() => archToLayers(HERO_ARCH, 4, 3), []);

  useEffect(() => {
    api.library().then((l) => setSaved(l.length)).catch(() => setSaved(null));
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const p = await api.createProject({ name: projectCount ? `Project ${projectCount + 1}` : "My first project" });
      navigate(`/p/${p.id}/problem`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  return (
    <Glass pad="lg" animate_in variant="default" style={{ overflow: "hidden" }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28, alignItems: "center" }}>
        <div className="col" style={{ gap: 18 }}>
          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="badge accent" style={{ alignSelf: "flex-start" }}>
            ✨ No code required
          </motion.span>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.15 }}
            style={{ fontSize: "clamp(36px, 5vw, 54px)", lineHeight: 1.04, letterSpacing: "-0.035em" }}>
            Machine learning,<br />as a <span className="gradient-text">playground</span>.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.22 }} className="muted" style={{ fontSize: 17, maxWidth: 460, lineHeight: 1.5 }}>
            Pick a question, drop in some data, and watch real models learn — step by step, with a coach at your side.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.gentle, delay: 0.3 }} className="row wrap" style={{ gap: 12 }}>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn gradient lg" onClick={create} disabled={busy} style={{ paddingLeft: 26, paddingRight: 28 }}>
              {busy ? <Spinner size={16} /> : <span style={{ fontSize: 18 }}>＋</span>} New project
            </motion.button>
            <button className="btn lg ghost" onClick={() => document.getElementById("templates")?.scrollIntoView({ behavior: "smooth" })}>
              Try a template ↓
            </button>
          </motion.div>
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
            whileHover={{ x: 3 }}
            onClick={() => navigate("/library")}
            className="inset row"
            style={{ alignSelf: "flex-start", gap: 12, padding: "10px 14px", cursor: "pointer", textAlign: "left", marginTop: 4 }}
          >
            <span style={{ fontSize: 22 }}>📚</span>
            <span className="col" style={{ gap: 0 }}>
              <b style={{ fontSize: 13 }}>Model Library</b>
              <span className="small muted">
                {saved === null ? "Your trained models live here" : saved === 0 ? "No saved models yet — train one and keep it" : `${saved} saved model${saved === 1 ? "" : "s"} ready to predict`}
              </span>
            </span>
            <span className="faint">→</span>
          </motion.button>
        </div>

        <div style={{ position: "relative", minHeight: 280 }}>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring.soft, delay: 0.2 }}
            className="inset" style={{ padding: "16px 10px", borderRadius: 26, background: "linear-gradient(160deg, var(--accent-soft), rgba(191,90,242,.10))" }}>
            <NetworkDiagram layers={layers} height={250} training compact speed={0.8} />
          </motion.div>
          {FLOATERS.map((f) => (
            <motion.span
              key={f.text}
              className="glass strong small"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, y: [0, -7, 0] }}
              transition={{ opacity: { delay: 0.6 + f.d * 0.2 }, scale: { delay: 0.6 + f.d * 0.2, ...spring.pop }, y: { repeat: Infinity, duration: 4, delay: f.d, ease: "easeInOut" } }}
              style={{ position: "absolute", left: f.x, top: f.y, padding: "6px 12px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none" }}
            >
              {f.text}
            </motion.span>
          ))}
        </div>
      </div>
    </Glass>
  );
}
