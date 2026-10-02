import { motion } from "framer-motion";
import { useState } from "react";
import { spring } from "../../design/motion";
import type { VisionResult } from "../../lib/types";
import { EmptyState, InfoTip, Segmented, Tooltip } from "../glass";
import { PixelCanvas, Thumb } from "./visionKit";

/** First-layer filters of a CNN and the feature maps they produce for one picture. */
export function VisionFilters({ vision }: { vision: VisionResult }) {
  const filters = vision.filters ?? [];
  const fm = vision.feature_maps;
  const hasRgb = filters.some((f) => f.rgb);
  const [colour, setColour] = useState<"rgb" | "gray">(hasRgb ? "rgb" : "gray");
  if (!filters.length) return <EmptyState icon="🔬" title="No filters to show" text={vision.note ?? "Only convolutional networks have filters."} />;
  const k = filters[0].gray.length;
  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="col" style={{ gap: 12 }}>
        <div className="row between wrap" style={{ gap: 12, alignItems: "flex-end" }}>
          <div className="col" style={{ gap: 4, maxWidth: 620 }}>
            <h4 className="row" style={{ gap: 6 }}>🔍 Its first {filters.length} filters <span className="tiny faint">({k}×{k} pixels each, blown up)</span></h4>
            <p className="small muted" style={{ lineHeight: 1.55 }}>
              Each filter is a <b>tiny pattern detector</b> that slides across the whole picture — so it finds its pattern wherever it is. Some learn <b>edges</b> (a dark side next to a bright side),
              some <b>colour blobs</b>, some corners. Nobody programmed these: the network invented them while training.
            </p>
          </div>
          {hasRgb && <Segmented size="sm" value={colour} onChange={setColour} options={[{ value: "rgb", label: "🎨 Colour" }, { value: "gray", label: "◐ Brightness" }]} />}
        </div>
        <div className="inset" style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))", gap: 10 }}>
          {filters.map((f, i) => (
            <Tooltip key={i} content={`Filter ${i + 1}${i < (fm?.maps.length ?? 0) ? " — its output is shown below" : ""}`} width={150}>
              <motion.div initial={{ opacity: 0, scale: 0.4, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: i * 0.03 }}
                whileHover={{ scale: 1.15, zIndex: 2 }}
                className="col" style={{ gap: 4, alignItems: "center", width: "100%" }}>
                <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", boxShadow: "0 0 0 1px var(--hairline), 0 3px 10px rgba(0,0,0,0.14)" }}>
                  <PixelCanvas rgb={colour === "rgb" ? f.rgb : undefined} grid={colour === "rgb" && f.rgb ? undefined : f.gray} mode="gray" size="100%" />
                </div>
                <span className="tiny faint num">{i + 1}</span>
              </motion.div>
            </Tooltip>
          ))}
        </div>
      </div>

      {fm && fm.maps.length > 0 && (
        <div className="col" style={{ gap: 12 }}>
          <div className="col" style={{ gap: 4, maxWidth: 680 }}>
            <h4 className="row" style={{ gap: 6 }}>
              🗺️ What the first layer sees
              <InfoTip text="These are called feature maps (or activations). The next layer reads these maps instead of the raw picture, combining edges into corners, corners into shapes, and so on." />
            </h4>
            <p className="small muted" style={{ lineHeight: 1.55 }}>
              We ran one test picture through the first {fm.maps.length} filters. Each map shows <b>where that filter fired</b> — bright means "my pattern is here!".
              One map might trace the outline, another light up the whole shape, another the background.
            </p>
          </div>
          <div className="row wrap" style={{ gap: 18, alignItems: "center" }}>
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={spring.gentle} className="col" style={{ gap: 6, alignItems: "center" }}>
              <Thumb datasetId={vision.dataset_id} i={fm.i} size={150} px={160} radius={18} />
              <span className="tiny faint">The picture</span>
            </motion.div>
            <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="col center faint" style={{ gap: 2 }}>
              <span style={{ fontSize: 22 }}>→</span>
              <span className="tiny">filters</span>
            </motion.div>
            <div style={{ flex: "1 1 320px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))", gap: 10 }}>
              {fm.maps.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
                  transition={{ ...spring.gentle, delay: 0.15 + i * 0.06 }} className="col" style={{ gap: 4, alignItems: "center" }}>
                  <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", boxShadow: "0 3px 10px rgba(0,0,0,0.14)" }}>
                    <PixelCanvas grid={m} mode="heat" size="100%" />
                  </div>
                  <span className="row tiny faint" style={{ gap: 4 }}>
                    {filters[i] && (
                      <span style={{ width: 12, height: 12, borderRadius: 3, overflow: "hidden", display: "inline-block" }}>
                        <PixelCanvas rgb={colour === "rgb" ? filters[i].rgb : undefined} grid={colour === "rgb" && filters[i].rgb ? undefined : filters[i].gray} mode="gray" size={12} />
                      </span>
                    )}
                    filter {i + 1}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
