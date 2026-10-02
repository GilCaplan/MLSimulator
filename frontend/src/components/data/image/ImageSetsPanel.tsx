import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { spring, stagger } from "../../../design/motion";
import { api } from "../../../lib/api";
import { toast } from "../../../lib/store";
import type { DatasetSummary, ImageSetInfo, Task } from "../../../lib/types";
import { Glass, Segmented, Slider, Spinner } from "../../glass";
import { SectionTitle } from "../ui";

/** A strip of glyphs hinting at what each image set's pictures look like. */
const GLYPHS: Record<string, { g: string[]; color: string }> = {
  shapes: { g: ["●", "■", "▲", "★"], color: "#FF9F0A" },
  count_dots: { g: ["⚀", "⚂", "⚄", "⚅"], color: "#5E5CE6" },
  line_tilt: { g: ["╱", "│", "╲", "─"], color: "#30D158" },
  digits: { g: ["3", "7", "0", "5"], color: "#0A84FF" },
  arrows: { g: ["↑", "→", "↓", "←"], color: "#FF375F" },
};

const SIZES = [16, 24, 32, 48, 64] as const;

/** Gallery of built-in picture collections, matching problem type first, with knobs before creating one. */
export function ImageSetsPanel({ task, onLoaded }: { task: Task | null; onLoaded: (d: DatasetSummary) => void }) {
  const [sets, setSets] = useState<Record<string, ImageSetInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.imageSets().then(setSets).catch((e) => { setError(e instanceof Error ? e.message : String(e)); toast.error(e); });
  }, []);

  const entries = Object.entries(sets ?? {}).sort(([, a], [, b]) => Number(b.task === task) - Number(a.task === task));
  const choose = (name: string) => {
    if (sel === name) return setSel(null);
    setSel(name);
    setParams({ ...(sets?.[name].params ?? {}) });
  };
  const create = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const d = await api.createImageSet(sel, params);
      toast.success(`Created “${d.name}” — ${(d.n_images ?? d.n_rows).toLocaleString()} pictures.`);
      onLoaded(d);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (error && !sets) return <Glass><p className="small" style={{ color: "var(--danger)" }}>⚠️ Couldn't load the image sets: {error}</p></Glass>;

  const info = sel ? sets?.[sel] : null;
  return (
    <div className="col" style={{ gap: 16 }}>
      <Glass>
        <SectionTitle icon="🖼️" title="Image sets" sub="Ready-made picture collections, generated on your computer in a second or two." />
        {!sets ? (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton" style={{ height: 150, borderRadius: 16 }} />)}
          </div>
        ) : (
          <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {entries.map(([name, s]) => {
              const other = !!task && s.task !== task;
              const active = sel === name;
              const glyph = GLYPHS[name] ?? { g: [s.emoji], color: "var(--accent)" };
              return (
                <motion.button
                  key={name}
                  variants={{ hidden: { opacity: 0, y: 12, scale: 0.96 }, show: { opacity: other ? 0.55 : 1, y: 0, scale: 1, transition: spring.gentle } }}
                  whileHover={{ y: -3, opacity: 1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => choose(name)}
                  className="inset col"
                  style={{ padding: 14, gap: 8, textAlign: "left", cursor: "pointer", alignItems: "stretch", borderColor: active ? "var(--accent)" : "var(--hairline)", boxShadow: active ? "0 0 0 3px var(--accent-soft)" : undefined, transition: "border-color .2s, box-shadow .2s" }}
                >
                  <div className="row" style={{ gap: 6 }}>
                    {glyph.g.map((g, k) => (
                      <motion.span key={k} animate={{ y: [0, -3, 0], rotate: name === "line_tilt" ? [0, 8, 0] : 0 }} transition={{ duration: 2.4, repeat: Infinity, delay: k * 0.25 }}
                        style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 800, color: glyph.color, background: k % 2 ? "rgba(20,20,30,.82)" : "var(--glass-strong)", border: "1px solid var(--hairline)" }}>
                        {g}
                      </motion.span>
                    ))}
                  </div>
                  <div className="row between">
                    <b style={{ fontSize: 14 }}>{s.emoji} {s.label}</b>
                    <span className={`badge ${s.task === "classification" ? "accent" : "success"}`}>{s.task === "classification" ? "Classify" : "Number"}</span>
                  </div>
                  <span className="small muted" style={{ lineHeight: 1.45 }}>{s.blurb}</span>
                  {other && <span className="tiny faint">Different problem type</span>}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </Glass>

      <AnimatePresence mode="wait">
        {sel && info && (
          <motion.div key={sel} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={spring.gentle}>
            <Glass>
              <SectionTitle icon={info.emoji} title={info.label} sub="Set the knobs, then create your pictures." />
              {task && info.task !== task && (
                <p className="small" style={{ color: "var(--warning)", marginTop: -4, marginBottom: 12 }}>
                  💡 This set is a <b>{info.task}</b> problem but your project is set up for <b>{task}</b> — you'd need to change the problem type.
                </p>
              )}
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px 24px", alignItems: "end" }}>
                {"n_images" in params && (
                  <Slider label="Number of pictures" help="More examples = better models, but slower training. 1,000–3,000 is a sweet spot for a laptop."
                    value={params.n_images} min={100} max={5000} log integer format={(v) => v.toLocaleString()}
                    onChange={(v) => setParams((p) => ({ ...p, n_images: v }))} />
                )}
                {"noise" in params && (
                  <Slider label="Noise" help="Random speckle on every picture. More noise = harder to see, like a grainy photo."
                    value={params.noise} min={0} max={0.4} step={0.01} format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => setParams((p) => ({ ...p, noise: v }))} />
                )}
                {"size" in params && (
                  <div className="col" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 560, fontSize: 13 }}>Picture size <span className="muted" style={{ fontWeight: 450 }}>· {params.size}×{params.size} pixels</span></span>
                    <Segmented<string> size="sm" value={String(params.size)} onChange={(v) => setParams((p) => ({ ...p, size: Number(v) }))}
                      options={SIZES.map((s) => ({ value: String(s), label: String(s) }))} />
                  </div>
                )}
              </div>
              <div className="row between wrap" style={{ marginTop: 18, gap: 12 }}>
                <span className="tiny faint">You can still pick a lower training resolution later, in Prepare.</span>
                <motion.button className="btn gradient lg" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} disabled={busy} onClick={create}>
                  {busy ? <Spinner size={16} /> : "✨"} Create {params.n_images ? `${Math.round(params.n_images).toLocaleString()} pictures` : "the set"}
                </motion.button>
              </div>
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
