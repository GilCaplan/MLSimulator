import { motion } from "framer-motion";
import { forwardRef, useState } from "react";
import { spring } from "../../design/motion";
import { timeAgo } from "../../lib/format";
import { navigate } from "../../lib/router";
import type { SavedModel } from "../../lib/types";
import { ProgressRing, Tooltip } from "../glass";
import { Thumb } from "../train/visionKit";
import { genreColor, genreIcon } from "../train/recsys/recKit";
import { ImportedBadge } from "./ImportedBadge";
import { EditableText, headline, isForecastModel, isRecsysModel, isTextModel, taskMeta } from "./shared";
import type { ForecastResult } from "../../lib/types";
import { ExportMenu } from "./ExportMenu";

/** One saved model in the library grid. */
export const ModelCard = forwardRef<HTMLDivElement, { model: SavedModel; emoji: string; onRename: (name: string) => void; onDelete: () => void }>(
  function ModelCard({ model, emoji, onRename, onDelete }, ref) {
    const [hover, setHover] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const h = headline(model);
    const tone = h.tone;
    const task = taskMeta(model.task);
    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85, filter: "blur(6px)", transition: { duration: 0.22 } }}
        whileHover={{ y: -4 }}
        transition={spring.gentle}
        onHoverStart={() => setHover(true)}
        onHoverEnd={() => setHover(false)}
        onClick={() => !renaming && navigate(`/library/${model.id}`)}
        className="glass"
        style={{ padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 14, boxShadow: hover ? "var(--glass-shadow), 0 18px 44px rgba(40,50,90,0.16)" : undefined }}
      >
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <motion.span
            animate={{ rotate: hover ? [0, -8, 6, 0] : 0, scale: hover ? 1.06 : 1 }}
            transition={{ duration: 0.5 }}
            style={{ width: 46, height: 46, borderRadius: 14, background: "linear-gradient(135deg, var(--accent-soft), rgba(191,90,242,0.16))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, border: "1px solid var(--glass-border)" }}
          >
            {emoji}
          </motion.span>
          <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
            <EditableText
              value={model.name}
              onSave={onRename}
              editing={renaming}
              onDone={() => setRenaming(false)}
              style={{ fontWeight: 650, fontSize: 15.5, letterSpacing: "-0.015em", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            />
            <span className="small muted truncate">{model.label}</span>
          </div>
          <motion.div className="row" style={{ gap: 2 }} animate={{ opacity: hover || renaming ? 1 : 0 }} transition={{ duration: 0.15 }}>
            <Tooltip content="Export (bundle or architecture)" width={190}>
              <ExportMenu model={model} compact />
            </Tooltip>
            <Tooltip content="Rename" width={80}>
              <button className="btn ghost sm icon" aria-label="Rename" onClick={(e) => { e.stopPropagation(); setRenaming(true); }}>✏️</button>
            </Tooltip>
            <Tooltip content="Delete" width={70}>
              <button className="btn ghost sm icon" aria-label="Delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>🗑️</button>
            </Tooltip>
          </motion.div>
        </div>

        <div className="inset row" style={{ padding: "10px 12px", gap: 12 }}>
          <ProgressRing value={h.ring} size={46} stroke={5} color={tone}>
            {(model.task as string) === "forecasting"
              ? <span style={{ fontSize: 10.5 }} title="MASE: below 1 beats “same as last season”">{model.metrics?.test?.mase !== undefined ? model.metrics.test.mase.toFixed(2) : "—"}</span>
              : ["classification", "regression"].includes(model.task)
              ? <span style={{ fontSize: 10.5 }}>{h.value === null ? "—" : Math.round(h.ring * 100)}</span>
              : <span style={{ fontSize: 13 }}>{task.icon}</span>}
          </ProgressRing>
          <div className="col grow" style={{ gap: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }} className="num">{h.text}</span>
            <span className="tiny muted">{(model.task as string) === "forecasting" ? "average miss" : <>{["classification", "regression"].includes(model.task) ? "test " : ""}{h.label.toLowerCase()}</>}</span>
          </div>
          {isTextModel(model) && (
            <div className="col" style={{ gap: 3, alignItems: "flex-end" }} aria-hidden>
              {[30, 22].map((w, i) => (
                <motion.div key={i} animate={{ x: hover ? (i ? -4 : 2) : 0, scale: hover ? 1.06 : 1 }} transition={{ ...spring.gentle, delay: i * 0.04 }}
                  style={{ width: w + 14, height: 14, borderRadius: i ? "8px 8px 2px 8px" : "8px 8px 8px 2px", background: i ? "var(--accent-soft)" : "var(--glass-strong)", border: "1px solid var(--glass-border)", display: "flex", alignItems: "center", gap: 3, padding: "0 5px" }}>
                  {[0.55, 0.3].map((f, k) => <span key={k} style={{ height: 3, width: w * f, borderRadius: 2, background: i ? "var(--accent)" : "var(--text-3)", opacity: 0.6 }} />)}
                </motion.div>
              ))}
            </div>
          )}
          {isForecastModel(model) && <ForecastSpark fc={model.detail?.forecast} hover={hover} />}
          {isRecsysModel(model) && <PosterStack hover={hover} genres={(model.detail?.recsys?.examples?.[0]?.recs ?? []).slice(0, 3).map((r) => r.genre ?? "")} />}
          {model.modality === "image" && model.dataset?.id && (
            <div className="row" style={{ gap: 0 }}>
              {[0, 1, 2].map((i) => (
                <motion.div key={i} animate={{ rotate: hover ? (i - 1) * 9 : (i - 1) * 4, x: hover ? (i - 1) * 6 : 0, y: hover ? -2 : 0 }} transition={spring.gentle} style={{ marginLeft: i ? -12 : 0, zIndex: 3 - i }}>
                  <Thumb datasetId={model.dataset.id} i={i} size={34} px={64} radius={8} style={{ border: "2px solid var(--glass-strong)" }} />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          <span className={`badge ${task.badge}`}>{task.icon} {task.label}</span>
          {model.modality === "image" && <span className="badge">🖼️ Images</span>}
          {isTextModel(model) && <span className="badge">💬 Text</span>}
          {isRecsysModel(model) && <span className="badge" title="Learns from star ratings">⭐ Ratings</span>}
          {isForecastModel(model) && <span className="badge" title="Learns from a time series">⏱️ Time series</span>}
          <ImportedBadge model={model} compact />
          {model.dataset?.name && <span className="badge truncate" style={{ maxWidth: 170 }} title={model.dataset.name}>📊 {model.dataset.name}</span>}
          <span className="grow" />
          <span className="tiny faint">{timeAgo(model.created_at)}</span>
        </div>
      </motion.div>
    );
  },
);

/** A tiny history → forecast sparkline (forecasters); the forecast part draws itself when the card is hovered. */
function ForecastSpark({ fc, hover }: { fc?: ForecastResult | null; hover: boolean }) {
  const s = fc?.series?.[0];
  // the library list carries no detail: fall back to a decorative weekly rhythm
  const demo = !s?.history?.length;
  const wk = [0.82, 0.78, 0.84, 0.93, 1.12, 1.38, 1.13];
  const hist = demo ? Array.from({ length: 21 }, (_, i) => wk[i % 7] * (1 + i * 0.006)) : (s!.history).slice(-28).map((p) => p.y);
  const fut = demo ? Array.from({ length: 10 }, (_, i) => { const y = wk[(21 + i) % 7] * (1 + (21 + i) * 0.006); const b = 0.05 + i * 0.02; return { y, lo: y - b, hi: y + b }; }) : (s!.forecast).slice(0, 14);
  if (hist.length < 2 || !fut.length) return null;
  const all = [...hist, ...fut.map((p) => p.hi), ...fut.map((p) => p.lo)];
  const lo = Math.min(...all), hi = Math.max(...all);
  const W = 74, Hh = 34, n = hist.length + fut.length - 1;
  const x = (i: number) => (i / n) * W;
  const y = (v: number) => Hh - 2 - ((v - lo) / (hi - lo || 1)) * (Hh - 4);
  const hp = hist.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const off = hist.length - 1;
  const fp = `M${x(off).toFixed(1)},${y(hist[off]).toFixed(1)}` + fut.map((p, i) => `L${x(off + i + 1).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const band = `M${x(off)},${y(hist[off])}` + fut.map((p, i) => `L${x(off + i + 1)},${y(p.hi)}`).join("") + [...fut].reverse().map((p, i) => `L${x(off + fut.length - i)},${y(p.lo)}`).join("") + "Z";
  return (
    <svg width={W} height={Hh} aria-hidden style={{ overflow: "visible" }}>
      <path d={band} fill="#BF5AF2" opacity={0.18} />
      <path d={hp} fill="none" stroke="#0A84FF" strokeWidth={1.6} strokeLinejoin="round" />
      <motion.path key={hover ? "h" : "n"} d={fp} fill="none" stroke="#BF5AF2" strokeWidth={2} strokeLinecap="round" initial={{ pathLength: hover ? 0 : 1 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7 }} />
      <line x1={x(off)} x2={x(off)} y1={0} y2={Hh} stroke="var(--text-3)" strokeDasharray="2 3" />
    </svg>
  );
}

/** Three tiny fanned-out posters (recommenders) — they spread when the card is hovered. */
function PosterStack({ hover, genres }: { hover: boolean; genres: string[] }) {
  const g = genres.length >= 3 ? genres : ["Sci-Fi", "Drama", "Comedy"];
  return (
    <div className="row" style={{ gap: 0 }} aria-hidden>
      {g.slice(0, 3).map((x, i) => (
        <motion.div key={i} animate={{ rotate: hover ? (i - 1) * 12 : (i - 1) * 5, x: hover ? (i - 1) * 7 : 0, y: hover ? -3 : 0 }} transition={spring.gentle}
          style={{ marginLeft: i ? -12 : 0, zIndex: 3 - i, width: 26, height: 37, borderRadius: 5, border: "2px solid var(--glass-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
            background: `linear-gradient(160deg, ${genreColor(x)}, ${genreColor(x)}66)`, boxShadow: "0 2px 6px rgba(0,0,0,.15)" }}>
          {genreIcon(x)}
        </motion.div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ gap: 12 }}>
        <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 14 }} />
        <div className="col grow" style={{ gap: 6 }}>
          <div className="skeleton" style={{ height: 14, width: "70%" }} />
          <div className="skeleton" style={{ height: 11, width: "40%" }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 66, borderRadius: 14 }} />
      <div className="skeleton" style={{ height: 20, width: "60%" }} />
    </div>
  );
}
