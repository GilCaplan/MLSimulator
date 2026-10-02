import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { compact } from "../../lib/format";
import type { ArchSummary, NNArch, Task } from "../../lib/types";
import { NetworkDiagram, type DiagramLayer } from "../nn/NetworkDiagram";
import { previewLayers } from "./archLayers";
import { AnimatedNumber, InfoTip, Spinner } from "../glass";
import { useIoShape } from "./meta";

/** Live diagram of the architecture plus a debounced server-side check (parameter count, shapes, errors). */
export function ArchPreview({ arch, task }: { arch: NNArch; task: Task | null }) {
  const { nFeatures, nOut, known, imageShape, image } = useIoShape(task);
  const layers = useMemo(() => {
    const ls = previewLayers(arch, nFeatures, nOut, imageShape);
    // Long labels collide when there are many columns — use compact ones then.
    if (ls.length <= 4) return ls;
    const short: Record<DiagramLayer["kind"], string> = { input: "In", dense: "Dense", conv: "Conv", attention: "Attn", graph: "Graph", output: "Out" };
    return ls.map((l) => ({ ...l, label: l.short ?? `${short[l.kind]} ${l.units}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arch, nFeatures, nOut, imageShape?.join("x")]);
  const [summary, setSummary] = useState<ArchSummary | null>(null);
  const [checking, setChecking] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const reqId = useRef(0);

  const archKey = JSON.stringify(arch);
  useEffect(() => {
    const id = ++reqId.current;
    setChecking(true);
    const t = setTimeout(() => {
      api.validateArch(arch, nFeatures, nOut, imageShape)
        .then((s) => { if (id === reqId.current) { setSummary(s); setNetError(null); } })
        .catch((e) => { if (id === reqId.current) setNetError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (id === reqId.current) setChecking(false); });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archKey, nFeatures, nOut, imageShape?.join("x")]);

  const errors = netError ? [netError] : summary && !summary.ok ? summary.errors : [];
  const needsImage = (arch.kind === "cnn2d" || arch.kind === "tiny_resnet") && !imageShape;

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="inset" style={{ padding: "8px 6px 0", overflow: "hidden" }}>
        <NetworkDiagram layers={layers} height={250} training />
      </div>

      <div className="row" style={{ gap: 10, alignItems: "stretch" }}>
        <div className="inset col grow" style={{ padding: "10px 14px", gap: 2 }}>
          <span className="eyebrow row" style={{ gap: 6 }}>
            Learnable weights <InfoTip text="Every connection between neurons has a weight the network tunes while learning. More weights = more capacity, but more data needed and slower training." />
          </span>
          <span className="row" style={{ gap: 8, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {summary?.ok ? <AnimatedNumber value={summary.total_params} format={(v) => Math.round(v).toLocaleString()} /> : <span className="faint">—</span>}
            {checking && <Spinner size={14} color="var(--text-3)" />}
          </span>
        </div>
        <div className="inset col" style={{ padding: "10px 14px", gap: 2, minWidth: 120 }}>
          <span className="eyebrow">In → out</span>
          <span className="num" style={{ fontSize: 18, fontWeight: 650 }}>{image && imageShape ? imageShape.join("×") : nFeatures} → {nOut}</span>
          {image && <span className="tiny faint num">{nFeatures.toLocaleString()} pixel values</span>}
        </div>
      </div>

      {!known && (
        <div className="tiny faint row" style={{ gap: 6 }}>
          <span>📐</span> {image ? "Image size comes from the Prepare step (resolution × colour) — estimated until you run it." : "Input size is estimated until your data is prepared."}
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {errors.length > 0 && (
          <motion.div key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="small" style={{ padding: "10px 12px", borderRadius: 12, lineHeight: 1.5, background: needsImage ? "color-mix(in srgb, var(--warning) 14%, transparent)" : "color-mix(in srgb, var(--danger) 12%, transparent)", color: needsImage ? "var(--text)" : "var(--danger)" }}>
            {needsImage ? "🖼️ " : "⚠️ "}{errors.join(" ")}
          </motion.div>
        )}
      </AnimatePresence>

      {summary?.ok && summary.layers.length > 0 && (
        <div className="col" style={{ gap: 0 }}>
          {summary.layers.map((l, i) => {
            const share = summary.total_params ? l.params / summary.total_params : 0;
            return (
              <div key={`${l.name}-${i}`} className="row small" style={{ gap: 10, padding: "5px 2px", borderBottom: "1px solid var(--hairline)" }}>
                <span style={{ width: 92, fontWeight: 560 }} className="truncate">{l.name}</span>
                <span className="mono faint" style={{ width: 70 }}>[{l.out_shape.join("×")}]</span>
                <div className="grow" style={{ height: 5, borderRadius: 5, background: "var(--fill)", overflow: "hidden" }}>
                  <motion.div animate={{ width: `${Math.max(1, share * 100)}%` }} transition={{ type: "spring", stiffness: 140, damping: 20 }} style={{ height: "100%", background: "var(--grad)", borderRadius: 5 }} />
                </div>
                <span className="num muted" style={{ width: 48, textAlign: "right" }}>{compact(l.params)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
