import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { spring } from "../../design/motion";
import { api } from "../../lib/api";
import { fullPipeline, toast, useProject } from "../../lib/store";
import type { ModelConfig, ModelSpec, NNArch, Task } from "../../lib/types";
import { InfoTip, Spinner } from "../glass";
import { downloadJson, safeName } from "../library/ExportMenu";
import { isTextKind, useIoShape } from "./meta";

/** Plain-language names for each kind of network, used in "this design is for X; this model is Y" messages. */
const KIND_NAME: Record<string, string> = {
  mlp: "a tabular MLP (stacked layers)", cnn1d: "a 1-D convolutional net", cnn2d: "an image CNN", ft_transformer: "a tabular transformer",
  gcn: "a graph neural net", tiny_resnet: "an image ResNet", embedding_bag: "a bag-of-words text net", gru: "a GRU text net",
  text_transformer: "a text transformer",
};
const kindName = (k?: string | null) => (k ? KIND_NAME[k] ?? `a “${k}” network` : "a model without a network");

type Note = { tone: "ok" | "error"; text: string };

const LAYER_TEMPLATE: Record<string, Record<string, any>> = {
  dense: { type: "dense", units: 32, activation: "relu", dropout: 0, batchnorm: false },
  conv: { type: "conv", filters: 16, kernel: 3, activation: "relu", pool: 0, batchnorm: false },
};
const LIMITS: Record<string, [number, number, boolean]> = { units: [1, 4096, true], filters: [1, 1024, true], kernel: [1, 15, true], pool: [0, 8, true], dropout: [0, 0.95, false] };
const PART: Record<string, string> = { units: "size", filters: "number of filters", kernel: "filter size", pool: "pooling", dropout: "dropout" };

/** Fill in anything an imported design leaves out (from this model's defaults) and reject values the builders can't show.
 * The server check that follows is lenient (it clamps sizes), so obvious nonsense is caught here in plain words. */
export function normalizeArch(incoming: Record<string, any>, def: NNArch): { arch: NNArch } | { error: string } {
  const merged: Record<string, any> = { ...structuredClone(def), ...structuredClone(incoming) };
  if (Array.isArray(def.layers)) {
    if (!Array.isArray(incoming.layers)) return { error: "This design has no list of layers." };
    if (incoming.layers.length > 24) return { error: `This design has ${incoming.layers.length} layers — the most this app supports is 24.` };
    const types = new Set(def.layers.map((l) => l.type));
    const layers = [];
    for (const [i, raw] of (incoming.layers as Record<string, any>[]).entries()) {
      const type = raw?.type;
      if (!type || !types.has(type)) return { error: `Layer ${i + 1} is a “${type ?? "?"}” layer, which ${kindName(def.kind)} can't use.` };
      const layer: Record<string, any> = { ...(def.layers.find((l) => l.type === type) ?? LAYER_TEMPLATE[type]), ...raw };
      for (const [k, [lo, hi, int]] of Object.entries(LIMITS)) {
        if (!(k in layer)) continue;
        const v = layer[k];
        if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi || (int && !Number.isInteger(v))) {
          return { error: `Layer ${i + 1} has an impossible ${PART[k]} (${JSON.stringify(v)}). It should be ${int ? "a whole number" : "a number"} from ${lo} to ${hi}.` };
        }
      }
      layers.push(layer);
    }
    merged.layers = layers;
  }
  for (const [k, v] of Object.entries(def)) {
    if (typeof v === "number" && (typeof merged[k] !== "number" || !Number.isFinite(merged[k]) || merged[k] < 0)) {
      return { error: `The design's “${k}” value (${JSON.stringify(merged[k])}) isn't a valid number.` };
    }
  }
  return { arch: merged as NNArch };
}

/** Export / import a neural network's design (layer layout + training settings, no learned weights). Render only for specs with `default_arch`. */
export function DesignTransfer({ cfg, spec, task, label, apply }: { cfg: ModelConfig; spec: ModelSpec; task: Task | null; label: string; apply: (patch: Partial<ModelConfig>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const { nFeatures, nOut, imageShape } = useIoShape(task);
  const report = useProject((s) => s.report);
  const registry = useProject((s) => s.registry);
  const maxLen = useProject((s) => (s.project ? fullPipeline(s.project)?.text?.max_len : undefined) ?? s.project?.pipeline?.text?.max_len ?? 40);
  const def = spec.default_arch!;
  const arch = cfg.nn_arch ?? def;
  const known = new Set(spec.params.map((p) => p.name));
  /** what the model will actually train with: registry defaults overlaid with anything the user changed */
  const effective = () => ({ ...Object.fromEntries(spec.params.map((p) => [p.name, p.default])), ...cfg.params });

  const exportIt = () => {
    downloadJson({ app: "ml-playground", kind: "nn-architecture", version: 1, model_id: spec.id, nn_arch: arch, params: effective() }, `${safeName(label)}.design.json`);
    setNote({ tone: "ok", text: "Design saved. Import it into another network of the same kind — here or on another computer." });
  };

  const fail = (text: string) => setNote({ tone: "error", text });

  const importIt = async (file: File) => {
    setNote(null);
    let doc: any;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      return fail("That file isn't valid JSON. Pick a .json file you exported with “Export design” or from the Model Library.");
    }
    const kinds = ["nn-architecture", "model-architecture"];
    if (!doc || typeof doc !== "object" || doc.app !== "ml-playground" || !kinds.includes(doc.kind)) {
      return fail("This doesn't look like a design file from ML Playground.");
    }
    const fromLabel: string = doc.label || registry.find((r) => r.id === doc.model_id)?.label || doc.model_id || "another model";
    const rawParams: Record<string, any> = doc.params && typeof doc.params === "object" ? doc.params : {};
    const params = Object.fromEntries(Object.entries(rawParams).filter(([k]) => known.has(k)));
    const skipped = Object.keys(rawParams).length - Object.keys(params).length;

    const raw: NNArch | null = doc.nn_arch && typeof doc.nn_arch === "object" ? doc.nn_arch : null;
    const want = def.kind;
    if (!raw || !raw.kind) {
      return fail(`This file describes ${fromLabel}, which isn't a neural network — so there are no layers to bring in.`);
    }
    if (raw.kind !== want) {
      return fail(`This design is for ${kindName(raw.kind)}; this model is ${kindName(want)}. Pick a design made for the same kind of network.`);
    }
    const norm = normalizeArch(raw, def);
    if ("error" in norm) return fail(`That design can't be used: ${norm.error}`);
    const incoming = norm.arch;
    setBusy(true);
    try {
      const check = isTextKind(incoming.kind)
        ? await api.validateArch({ ...incoming, vocab_size: report?.vocab_size ?? 5000, max_len: maxLen } as NNArch, maxLen, nOut)
        : await api.validateArch(incoming, nFeatures, nOut, imageShape);
      if (!check.ok) return fail(`That design doesn't fit your data: ${check.errors[0] ?? "the layers don't line up"}.`);
      apply({ nn_arch: structuredClone(incoming), params: { ...cfg.params, ...params } });
      const n = Array.isArray(incoming.layers) && incoming.layers.length ? incoming.layers.length : undefined;
      setNote({ tone: "ok", text: `Design applied${n ? ` — ${n} layers` : ""}, ${check.total_params.toLocaleString()} learnable weights${Object.keys(params).length ? `, plus ${Object.keys(params).length} training settings` : ""}.${skipped ? ` ${skipped} setting${skipped > 1 ? "s" : ""} didn't apply here and were skipped.` : ""}` });
      toast.success("Network design imported.");
    } catch (e) {
      fail(`Couldn't check that design: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inset col" style={{ padding: "10px 12px", gap: 8 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="small row grow" style={{ gap: 6, minWidth: 180, color: "var(--text-2)" }}>
          📐 Share this network's design
          <InfoTip text="Saves the layer layout and training settings as a small .json file — no training data or learned weights. Import it into another network of the same kind to reuse the design. A model's architecture.json from the Model Library works too." />
        </span>
        <button className="btn sm" onClick={exportIt}>⬇ Export design (.json)</button>
        <button className="btn sm" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner size={12} /> : "⬆"} Import design
        </button>
        <input ref={input} type="file" accept=".json,application/json" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importIt(f); e.target.value = ""; }} />
      </div>
      <AnimatePresence initial={false}>
        {note && (
          <motion.div key="note" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.snappy} style={{ overflow: "hidden" }}>
            <div className="row" role={note.tone === "error" ? "alert" : "status"} style={{ gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: "var(--r-sm)",
              background: `color-mix(in srgb, var(${note.tone === "error" ? "--danger" : "--success"}) 12%, transparent)`,
              border: `1px solid color-mix(in srgb, var(${note.tone === "error" ? "--danger" : "--success"}) 38%, transparent)` }}>
              <span>{note.tone === "error" ? "⚠️" : "✅"}</span>
              <span className="small grow" style={{ lineHeight: 1.45, color: "var(--text)" }}>{note.text}</span>
              <button className="btn ghost sm icon" style={{ height: 22, width: 22 }} aria-label="Dismiss" onClick={() => setNote(null)}>✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
