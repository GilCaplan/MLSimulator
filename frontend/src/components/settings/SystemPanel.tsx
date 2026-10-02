import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { stagger } from "../../design/motion";
import { api } from "../../lib/api";
import { toast } from "../../lib/store";
import type { SystemInfo } from "../../lib/types";
import { Glass, InfoTip, Tooltip } from "../glass";

const LIB_LABELS: Record<string, string> = {
  torch: "PyTorch", "scikit-learn": "scikit-learn", xgboost: "XGBoost", lightgbm: "LightGBM", "imbalanced-learn": "imbalanced-learn",
  pandas: "pandas", numpy: "NumPy", fastapi: "FastAPI",
};

const tile = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function Fact({ icon, label, value, help }: { icon: string; label: string; value: ReactNode; help?: string }) {
  return (
    <motion.div variants={tile} className="inset" style={{ padding: "12px 14px" }}>
      <div className="row tiny muted" style={{ gap: 6 }}>{icon} {label}{help && <InfoTip text={help} />}</div>
      <div style={{ fontSize: 17, fontWeight: 680, marginTop: 3, letterSpacing: "-0.01em" }}>{value}</div>
    </motion.div>
  );
}

function PathRow({ label, path, action }: { label: string; path: string; action?: ReactNode }) {
  const copy = () => navigator.clipboard?.writeText(path).then(() => toast.success("Copied to clipboard."), () => toast.error("Couldn't copy."));
  return (
    <div className="col" style={{ gap: 5 }}>
      <span className="small" style={{ fontWeight: 600 }}>{label}</span>
      <div className="inset row" style={{ padding: "6px 6px 6px 12px", gap: 8 }}>
        <span className="mono truncate grow" title={path}>{path}</span>
        <Tooltip content="Copy path" width={90}><button className="btn ghost sm icon" onClick={copy} aria-label="Copy path">⧉</button></Tooltip>
        {action}
      </div>
    </div>
  );
}

/** System facts: versions, hardware, where your data lives. */
export function SystemPanel() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => { api.info().then(setInfo).catch(toast.error); }, []);

  return (
    <Glass animate_in style={{ gridColumn: "1 / -1" }}>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="col" style={{ gap: 2 }}>
          <span className="eyebrow">System</span>
          <h3>Under the hood</h3>
        </div>
        {info && <span className="badge">PID {info.pid}</span>}
      </div>
      {!info ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}
        </div>
      ) : (
        <div className="col" style={{ gap: 18 }}>
          <motion.div variants={stagger(0.05)} initial="hidden" animate="show" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
            <Fact icon="✨" label="ML Playground" value={`v${info.version}`} />
            <Fact icon="🐍" label="Python" value={info.python} />
            <Fact icon="💻" label="Machine" value={`${info.machine} · ${info.cpu_count} CPU cores`} />
            <Fact
              icon="⚡️"
              label="Apple GPU (MPS)"
              help="On Apple-silicon Macs, neural networks can train on the built-in graphics chip (Metal Performance Shaders), which is often several times faster."
              value={info.mps ? <span style={{ color: "var(--success)" }}>● Available</span> : <span className="muted">Not available</span>}
            />
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18, alignItems: "start" }}>
            <div className="col" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>Libraries</span>
              <div className="inset" style={{ padding: 0, overflow: "hidden" }}>
                <table className="table">
                  <tbody>
                    {Object.entries(info.versions).map(([k, v]) => (
                      <tr key={k}>
                        <td>{LIB_LABELS[k] ?? k}</td>
                        <td className="mono" style={{ textAlign: "right", color: v ? "var(--text-2)" : "var(--danger)" }}>{v ?? "not installed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="col" style={{ gap: 14 }}>
              <PathRow
                label="Data folder (projects, datasets, saved models)"
                path={info.data_dir}
                action={<button className="btn sm" onClick={() => api.revealData().catch(toast.error)}>Show in Finder</button>}
              />
              <PathRow label="Log file" path={info.log_path} />
              <p className="tiny faint" style={{ lineHeight: 1.5 }}>Back up the data folder to keep your work; delete it to start completely fresh.</p>
            </div>
          </div>
        </div>
      )}
    </Glass>
  );
}
