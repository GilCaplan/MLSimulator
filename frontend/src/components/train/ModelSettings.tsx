import { useProject } from "../../lib/store";
import type { ModelResult } from "../../lib/types";
import { NetworkDiagram } from "../nn/NetworkDiagram";
import { diagramLayers } from "./archLayers";
import { archFor, nFeatures, nOutputs } from "./util";

/** The model's settings table (every hyper-parameter, changed ones badged) and its network diagram for neural nets. */
export function ModelSettings({ model }: { model: ModelResult }) {
  const spec = useProject((s) => s.registry.find((r) => r.id === model.model_id));
  const merged: Record<string, any> = {};
  for (const hp of spec?.params ?? []) merged[hp.name] = hp.default;
  Object.assign(merged, model.params || {});
  const entries = Object.entries(merged);
  const arch = spec?.nn ? archFor(model) : null;
  return (
    <div className="col" style={{ gap: 16 }}>
      {arch && (
        <div className="inset" style={{ padding: 10 }}>
          <NetworkDiagram layers={diagramLayers(arch, nFeatures(), nOutputs(), model.vision?.image_shape ?? useProject.getState().report?.image_shape)} height={240} />
        </div>
      )}
      {entries.length === 0 ? (
        <span className="small muted">Default settings were used.</span>
      ) : (
        <div className="inset" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead><tr><th>Setting</th><th>Value</th><th>What it does</th></tr></thead>
            <tbody>
              {entries.map(([k, v]) => {
                const hp = spec?.params.find((p) => p.name === k);
                return (
                  <tr key={k}>
                    <td><b>{hp?.label ?? k}</b></td>
                    <td className="mono">
                      {typeof v === "number" ? String(Number(v.toPrecision(5))) : String(v)}
                      {hp && v !== hp.default && <span className="badge accent" style={{ marginLeft: 8, height: 18, fontSize: 10 }}>changed</span>}
                    </td>
                    <td className="muted" style={{ whiteSpace: "normal" }}>{hp?.help}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
