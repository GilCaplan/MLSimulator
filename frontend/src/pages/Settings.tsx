import { motion } from "framer-motion";
import { Glass, Segmented, Toggle } from "../components/glass";
import { PageFrame, PageHeader } from "../components/library/shared";
import { PortPanel } from "../components/settings/PortPanel";
import { QuitPanel } from "../components/settings/QuitPanel";
import { SystemPanel } from "../components/settings/SystemPanel";
import { stagger } from "../design/motion";
import { useUI } from "../lib/store";

function AppearancePanel() {
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const reduceMotion = useUI((s) => s.reduceMotion);
  const setReduceMotion = useUI((s) => s.setReduceMotion);
  return (
    <Glass animate_in>
      <span className="eyebrow">Appearance</span>
      <h3 style={{ margin: "2px 0 14px" }}>Look &amp; feel</h3>
      <div className="col" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 8 }}>
          <span className="small" style={{ fontWeight: 600 }}>Theme</span>
          <Segmented
            full
            value={theme}
            onChange={setTheme}
            options={[
              { value: "auto", label: "🌓 Auto" },
              { value: "light", label: "☀️ Light" },
              { value: "dark", label: "🌙 Dark" },
            ]}
          />
          <span className="tiny faint">Auto follows your Mac's appearance setting.</span>
        </div>
        <div className="divider" style={{ margin: 0 }} />
        <Toggle
          checked={reduceMotion}
          onChange={setReduceMotion}
          label="Reduce motion"
          help="Turns off most animations — springs, slides and fades — for a calmer, faster-feeling interface."
        />
      </div>
    </Glass>
  );
}

function AboutCard() {
  return (
    <Glass animate_in variant="thin" style={{ gridColumn: "1 / -1" }}>
      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <img src="/favicon.png" width={52} height={52} alt="" style={{ borderRadius: 14, flexShrink: 0, boxShadow: "0 6px 20px rgba(0,0,0,0.15)" }} />
        <div className="col" style={{ gap: 6 }}>
          <h3>About ML Playground</h3>
          <p className="muted" style={{ lineHeight: 1.6, maxWidth: 820 }}>
            ML Playground turns real machine learning — scikit-learn, XGBoost, LightGBM and PyTorch neural networks — into a guided, visual
            playground: bring or invent a dataset, prepare it, train several models side by side, and keep the best ones to make predictions.
            Everything runs <b style={{ color: "var(--text)" }}>locally on this computer</b>: your data, your models and every prediction stay on
            your Mac, and nothing is ever uploaded or sent anywhere.
          </p>
        </div>
      </div>
    </Glass>
  );
}

export function SettingsPage() {
  return (
    <PageFrame maxWidth={1100}>
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Where the app runs, how it looks, and what's under the hood." />
      <motion.div variants={stagger(0.07)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 18, alignItems: "start" }}>
        <PortPanel />
        <AppearancePanel />
        <QuitPanel />
        <SystemPanel />
        <AboutCard />
      </motion.div>
    </PageFrame>
  );
}
