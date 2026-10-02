import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { EmptyState, Glass, ProgressRing } from "../components/glass";
import { BatchPredict } from "../components/library/BatchPredict";
import { ImagePlayground } from "../components/library/ImagePlayground";
import { Performance } from "../components/library/Performance";
import { Playground } from "../components/library/Playground";
import { Recipe } from "../components/library/Recipe";
import { TextPlayground } from "../components/library/TextPlayground";
import { EditableText, PageFrame, emojiFor, headline, isForecastModel, isRecsysModel, isTextModel, isUnsupModel, rise, specFor, taskMeta, useRegistry } from "../components/library/shared";
import { RecsysPlayground } from "../components/library/RecsysPlayground";
import { ForecastPlayground } from "../components/library/ForecastPlayground";
import { UnsupPlayground } from "../components/library/UnsupPlayground";
import { spring } from "../design/motion";
import { ApiError, api } from "../lib/api";
import { timeAgo } from "../lib/format";
import { navigate } from "../lib/router";
import { toast } from "../lib/store";
import type { SavedModel } from "../lib/types";

const IMAGE_JUMPS = [
  { id: "try", label: "🎨 Try it live" },
  { id: "performance", label: "🏆 Performance" },
  { id: "recipe", label: "📜 Recipe" },
];

const UNSUP_JUMPS = [
  { id: "try", label: "🎮 Try it live" },
  { id: "performance", label: "🔍 What it found" },
  { id: "recipe", label: "📜 Recipe" },
];

const RECSYS_JUMPS = [
  { id: "try", label: "🍿 Try it live" },
  { id: "performance", label: "🏆 How its lists did" },
  { id: "recipe", label: "📜 Recipe" },
];

const FORECAST_JUMPS = [
  { id: "try", label: "🔮 Try it live" },
  { id: "performance", label: "🏆 How its forecasts did" },
  { id: "recipe", label: "📜 Recipe" },
];

const JUMPS = [
  { id: "try", label: "🎮 Try it live" },
  { id: "batch", label: "📦 Batch" },
  { id: "performance", label: "🏆 Performance" },
  { id: "recipe", label: "📜 Recipe" },
];

function Header({ model, onPatch }: { model: SavedModel; onPatch: (p: { name?: string; notes?: string }) => void }) {
  const registry = useRegistry();
  const spec = specFor(registry, model.model_id);
  const h = headline(model);
  const task = taskMeta(model.task);
  const unsup = isUnsupModel(model);
  const rec = isRecsysModel(model);
  const fc = isForecastModel(model);
  return (
    <Glass variant="strong" pad="lg" animate_in>
      <div className="row between wrap" style={{ gap: 10, marginBottom: 18 }}>
        <button className="btn ghost sm" onClick={() => navigate("/library")}>← Model Library</button>
        <div className="row wrap" style={{ gap: 8 }}>
          {model.project_id && <button className="btn sm" onClick={() => navigate(`/p/${model.project_id}/train`)}>🧭 Open source project</button>}
          <a className="btn sm" href={api.exportUrl(model.id)} download>⬇︎ Export (.zip)</a>
        </div>
      </div>
      <div className="row" style={{ gap: 20, alignItems: "flex-start" }}>
        <motion.div
          initial={{ scale: 0.5, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ ...spring.pop, delay: 0.1 }}
          style={{ width: 72, height: 72, borderRadius: 22, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, flexShrink: 0, boxShadow: "0 10px 30px rgba(94,92,230,0.35), 0 1px 0 rgba(255,255,255,0.4) inset" }}
        >
          {emojiFor(registry, model)}
        </motion.div>
        <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
          <EditableText value={model.name} onSave={(name) => onPatch({ name })} style={{ fontSize: 30, fontWeight: 720, letterSpacing: "-0.025em", lineHeight: 1.2 }} />
          <EditableText value={model.notes ?? ""} onSave={(notes) => onPatch({ notes })} multiline placeholder="✎ Add a note — what is this model for?" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-2)" }} />
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
            <span className={`badge ${task.badge}`}>{task.icon} {task.label}</span>
            <span className="badge">{spec?.emoji ?? "⚙️"} {model.label}</span>
            <span className="badge">{model.family === "torch" ? "🔥 PyTorch neural net" : "🧰 scikit-learn"}</span>
            {model.modality === "image" && <span className="badge accent">🖼️ Image model{model.image_shape ? ` · ${model.image_shape[2]}×${model.image_shape[1]}` : ""}</span>}
            {fc && <span className="badge accent">⏱️ Forecaster{model.detail?.forecast ? ` · ${model.detail.forecast.horizon} ${model.detail.forecast.unit}s ahead` : ""}</span>}
            {isTextModel(model) && <span className="badge accent">💬 Text model{model.text_column ? ` · reads “${model.text_column}”` : ""}</span>}
            {model.dataset?.name && <span className="badge">📊 {model.dataset.name}{model.dataset.n_rows ? ` · ${model.dataset.n_rows.toLocaleString()} ${fc ? "rows" : model.modality === "image" ? "pictures" : isTextModel(model) ? "texts" : rec ? "ratings" : "rows"}` : ""}</span>}
            {model.n_params != null && <span className="badge accent">🧮 {model.n_params.toLocaleString()} params</span>}
            <span className="badge">🕒 saved {timeAgo(model.created_at)}</span>
          </div>
        </div>
        <div className="col center" style={{ gap: 4, flexShrink: 0 }}>
          <ProgressRing value={h.ring} size={84} stroke={8} color={h.tone}>
            <span style={{ fontSize: unsup || fc ? 15 : 17, fontWeight: 750 }}>{h.value === null ? "—" : unsup || fc ? h.text : `${Math.round(h.value * 100)}%`}</span>
          </ProgressRing>
          <span className="tiny muted">{fc ? `average miss${model.metrics?.test?.mase !== undefined ? ` · MASE ${model.metrics.test.mase.toFixed(2)}` : ""}` : rec ? "liked films found in top 10" : `${unsup ? "" : "test "}${h.label.toLowerCase()}`}</span>
        </div>
      </div>
    </Glass>
  );
}

export function ModelPage({ modelId }: { modelId: string }) {
  const [model, setModel] = useState<SavedModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setModel(null);
    setError(null);
    api.savedModel(modelId)
      .then((m) => {
        setModel(m);
        api.warm(m.family).catch(() => { /* first predict will start it anyway */ });
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "This model doesn't exist any more — it may have been deleted." : String(e?.message || e)));
  }, [modelId]);

  const patch = async (p: { name?: string; notes?: string }) => {
    if (!model) return;
    const prev = model;
    setModel({ ...model, ...p });
    try {
      await api.renameModel(model.id, p);
      toast.success(p.name ? "Renamed." : "Note saved.");
    } catch (e) {
      toast.error(e);
      setModel(prev);
    }
  };

  const jump = (id: string) => {
    const el = scroller.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (error) {
    return (
      <EmptyState icon="🔎" title="Model not found" text={error}
        action={<button className="btn primary" onClick={() => navigate("/library")}>Back to the library</button>} />
    );
  }

  if (!model) {
    return (
      <PageFrame>
        <div className="skeleton" style={{ height: 190, borderRadius: 22 }} />
        <div className="row" style={{ gap: 16 }}>
          <div className="skeleton" style={{ height: 420, flex: 1.5, borderRadius: 22 }} />
          <div className="skeleton" style={{ height: 420, flex: 1, borderRadius: 22 }} />
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame scrollRef={scroller}>
      <Header model={model} onPatch={patch} />
      <motion.nav variants={rise} className="row wrap" style={{ gap: 6, position: "sticky", top: 0, zIndex: 5, pointerEvents: "none" }}>
        <div className="glass strong row" style={{ padding: 4, gap: 2, borderRadius: 999, pointerEvents: "auto" }}>
          {(isForecastModel(model) ? FORECAST_JUMPS : model.modality === "image" ? IMAGE_JUMPS : isRecsysModel(model) ? RECSYS_JUMPS : isUnsupModel(model) ? UNSUP_JUMPS : JUMPS).map((j) => (
            <button key={j.id} className="btn ghost sm" onClick={() => jump(j.id)}>{j.label}</button>
          ))}
        </div>
      </motion.nav>
      {isForecastModel(model) ? (
        <ForecastPlayground key={model.id} model={model} />
      ) : isRecsysModel(model) ? (
        <RecsysPlayground key={model.id} model={model} />
      ) : model.modality === "image" ? (
        <ImagePlayground key={model.id} model={model} />
      ) : isTextModel(model) ? (
        <>
          <TextPlayground key={model.id} model={model} />
          <BatchPredict model={model} />
        </>
      ) : isUnsupModel(model) ? (
        <UnsupPlayground key={model.id} model={model} />
      ) : (
        <>
          <Playground key={model.id} model={model} />
          <BatchPredict model={model} />
        </>
      )}
      <Performance model={model} />
      <Recipe model={model} />
    </PageFrame>
  );
}
