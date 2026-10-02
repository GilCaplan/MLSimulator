import { motion } from "framer-motion";
import { Glass } from "../components/glass";
import { PageFrame, PageHeader } from "../components/library/shared";
import { AppearancePanel } from "../components/settings/appearance/AppearancePanel";
import { PortPanel } from "../components/settings/PortPanel";
import { QuitPanel } from "../components/settings/QuitPanel";
import { SystemPanel } from "../components/settings/SystemPanel";
import { stagger } from "../design/motion";

function AboutCard() {
  return (
    <Glass animate_in variant="thin" style={{ gridColumn: "1 / -1" }}>
      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <img src="/favicon.png" width={52} height={52} alt="" style={{ borderRadius: 14, flexShrink: 0, boxShadow: "var(--btn-shadow)" }} />
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
    <PageFrame maxWidth={1180}>
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Where the app runs, how it looks, and what's under the hood." />
      <motion.div variants={stagger(0.07)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 18, alignItems: "start" }}>
        <AppearancePanel />
        <PortPanel />
        <QuitPanel />
        <SystemPanel />
        <AboutCard />
      </motion.div>
    </PageFrame>
  );
}
