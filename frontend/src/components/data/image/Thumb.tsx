import { motion } from "framer-motion";
import { useState, type CSSProperties } from "react";
import { spring } from "../../../design/motion";
import { api } from "../../../lib/api";

/**
 * One dataset image as a rounded thumbnail. Tiny images are drawn with crisp square pixels (no blur), so you see exactly
 * what the model sees. `size` is the requested resolution; `box` the on-screen size.
 */
export function Thumb({ datasetId, i, size = 64, box = 56, delay = 0, ring, style, grayscale, title }: {
  datasetId: string;
  i: number;
  size?: number;
  box?: number;
  delay?: number;
  ring?: string;
  style?: CSSProperties;
  grayscale?: boolean;
  title?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring.pop, delay }}
      whileHover={{ scale: 1.12, zIndex: 2 }}
      title={title}
      className={loaded ? undefined : "skeleton"}
      style={{ width: box, height: box, borderRadius: Math.max(6, box * 0.16), overflow: "hidden", flexShrink: 0, position: "relative", boxShadow: ring ? `0 0 0 2px ${ring}` : "0 1px 4px rgba(0,0,0,.12)", background: "var(--fill)", ...style }}
    >
      <img
        src={api.imageUrl(datasetId, i, size)}
        alt=""
        draggable={false}
        onLoad={() => setLoaded(true)}
        style={{ width: "100%", height: "100%", display: "block", imageRendering: size <= 48 ? "pixelated" : "auto", opacity: loaded ? 1 : 0, transition: "opacity .3s, filter .4s", filter: grayscale ? "grayscale(1)" : "none" }}
      />
    </motion.div>
  );
}

/** Stored resolution of an image dataset (image_shape is [C, H, W] for image datasets). */
export function storedSize(shape?: number[] | null): number {
  if (!shape?.length) return 64;
  return shape.length === 3 ? shape[1] : shape[0];
}
