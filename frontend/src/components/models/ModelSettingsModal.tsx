import { motion } from "framer-motion";
import { useProject } from "../../lib/store";
import type { ModelConfig, NNArch } from "../../lib/types";
import { HyperparamForm } from "../HyperparamForm";
import { Modal } from "../glass";
import { ArchPreview } from "./ArchPreview";
import { GcnBuilder, TransformerBuilder } from "./ArchBuilders";
import { LayerBuilder } from "./LayerBuilder";
import { badgesFor, familyOf } from "./meta";

/** Write a patch back into one ModelConfig of the current project (debounced autosave via the store). */
export function patchModel(key: string, patch: Partial<ModelConfig>) {
  const st = useProject.getState();
  st.update((p) => ({ models: p.models.map((m) => (m.key === key ? { ...m, ...patch } : m)) }));
  if (st.project?.last_job_id) useProject.setState({ dirtySinceTrain: true });
}

export function ModelSettingsModal({ modelKey, label, onClose }: { modelKey: string | null; label?: string; onClose: () => void }) {
  const project = useProject((s) => s.project);
  const registry = useProject((s) => s.registry);
  const cfg = project?.models.find((m) => m.key === modelKey) ?? null;
  const spec = cfg ? registry.find((s) => s.id === cfg.model_id) : undefined;
  const open = !!cfg && !!spec;
  const arch = cfg?.nn_arch ?? spec?.default_arch ?? null;

  const setArch = (a: NNArch) => cfg && patchModel(cfg.key, { nn_arch: a });
  const reset = () => {
    if (!cfg || !spec) return;
    const params: Record<string, any> = {};
    for (const hp of spec.params) params[hp.name] = hp.default;
    patchModel(cfg.key, { params, nn_arch: spec.default_arch ? structuredClone(spec.default_arch) : null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={spec?.nn ? 900 : 640}
      footer={
        <>
          <button className="btn ghost" onClick={reset}>↺ Reset to defaults</button>
          <div className="grow" />
          <button className="btn primary" onClick={onClose}>Done</button>
        </>
      }
    >
      {cfg && spec && (
        <div className="col" style={{ gap: 20 }}>
          <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
            <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}
              style={{ width: 52, height: 52, borderRadius: 16, background: "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>
              {spec.emoji}
            </motion.span>
            <div className="col grow" style={{ gap: 4 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <h3 style={{ fontSize: 20 }}>{label ?? spec.label}</h3>
                {!spec.nn && <span className="badge">{familyOf(spec.family)?.icon} {spec.family}</span>}
                {badgesFor(spec).map((b) => <span key={b.text} className={`badge ${b.tone}`}>{b.text}</span>)}
              </div>
              <p className="muted small" style={{ lineHeight: 1.5, maxWidth: 640 }}>{spec.description}</p>
            </div>
          </div>

          {spec.nn && arch && (
            <section className="col" style={{ gap: 12 }}>
              <div className="row between">
                <h4>🏗️ Design the network</h4>
                <span className="tiny faint">Changes show up live on the right</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
                <div className="col" style={{ gap: 12 }}>
                  {arch.kind === "ft_transformer" ? <TransformerBuilder arch={arch} onChange={setArch} />
                    : arch.kind === "gcn" ? <GcnBuilder arch={arch} onChange={setArch} />
                    : <LayerBuilder arch={arch} onChange={setArch} />}
                </div>
                <div style={{ position: "sticky", top: 0 }}>
                  <ArchPreview arch={arch} task={project?.task ?? null} />
                </div>
              </div>
            </section>
          )}

          {spec.params.length > 0 && (
            <section className="col" style={{ gap: 12 }}>
              {spec.nn && <div className="divider" />}
              <h4>{spec.nn ? "⚙️ Training settings" : "⚙️ Settings"}</h4>
              <p className="small faint" style={{ marginTop: -6 }}>The defaults are sensible — hover the little “i” to learn what each one does.</p>
              <HyperparamForm params={spec.params} values={cfg.params} columns={2}
                onChange={(name, value) => patchModel(cfg.key, { params: { ...cfg.params, [name]: value } })} />
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
