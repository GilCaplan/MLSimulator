import { motion } from "framer-motion";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { spring } from "../../design/motion";
import { PALETTE } from "../../lib/colors";
import { Segmented, Slider, Tooltip } from "../glass";

export interface DrawPadHandle {
  /** Paint an image (URL or data URI) to fill the pad (centre-cropped to a square). */
  load: (src: string) => Promise<void>;
  clear: () => void;
}

const SIZE = 256;
const INKS = ["#FFFFFF", "#000000", PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[3], PALETTE[4], PALETTE[6]];
const BACKS = ["#000000", "#FFFFFF", "#1C1C3A", "#F2E8D5"];

/**
 * A square drawing canvas (256×256) with brush / eraser / clear, ink and background colours.
 * Calls `onChange(dataUri)` while drawing (throttled) and when a stroke ends.
 */
export const DrawPad = forwardRef<DrawPadHandle, { onChange: (uri: string) => void; display?: number }>(function DrawPad({ onChange, display = 280 }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [ink, setInk] = useState(INKS[0]);
  const [back, setBack] = useState(BACKS[0]);
  const [brush, setBrush] = useState(18);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const lastEmit = useRef(0);
  const emitTimer = useRef<number | null>(null);
  const [hint, setHint] = useState(true);

  const ctx = () => canvas.current?.getContext("2d") ?? null;
  const emit = (now = false) => {
    const cv = canvas.current;
    if (!cv) return;
    if (emitTimer.current) window.clearTimeout(emitTimer.current);
    const go = () => { lastEmit.current = Date.now(); onChange(cv.toDataURL("image/png")); };
    if (now || Date.now() - lastEmit.current > 260) go();
    else emitTimer.current = window.setTimeout(go, 260);
  };
  const fill = (color: string) => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = color;
    c.fillRect(0, 0, SIZE, SIZE);
  };

  useEffect(() => { fill(back); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (emitTimer.current) window.clearTimeout(emitTimer.current); }, []);

  useImperativeHandle(ref, () => ({
    load: (src: string) => new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = ctx();
        if (!c) return resolve();
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
        c.imageSmoothingEnabled = s >= SIZE; // keep tiny training pictures crisp
        c.drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
        c.imageSmoothingEnabled = true;
        setHint(false);
        emit(true);
        resolve();
      };
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = src;
    }),
    clear: () => { fill(back); emit(true); },
  }));

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };
  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const c = ctx();
    if (!c) return;
    c.strokeStyle = tool === "eraser" ? back : ink;
    c.lineWidth = tool === "eraser" ? brush * 1.6 : brush;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  };
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    setHint(false);
    const p = pos(e);
    last.current = p;
    stroke(p, { x: p.x + 0.01, y: p.y });
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    stroke(last.current, p);
    last.current = p;
    emit();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    emit(true);
  };
  const changeBack = (c: string) => {
    setBack(c);
    fill(c);
    if (ink === c) setInk(c === "#000000" ? "#FFFFFF" : "#000000");
    emit(true);
  };

  return (
    <div className="col" style={{ gap: 10, width: display, maxWidth: "100%" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 18, overflow: "hidden", boxShadow: "0 0 0 1px var(--hairline), 0 10px 30px rgba(0,0,0,0.18)", touchAction: "none" }}>
        <canvas ref={canvas} width={SIZE} height={SIZE} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
          style={{ width: "100%", height: "100%", display: "block", cursor: tool === "eraser" ? "cell" : "crosshair" }} />
        {hint && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0.5, 0.9, 0.5] }} transition={{ repeat: Infinity, duration: 2.4 }}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", color: back === "#FFFFFF" || back === "#F2E8D5" ? "#555" : "#ccc", fontSize: 14, fontWeight: 600 }}>
            ✏️ Draw here
          </motion.div>
        )}
      </div>
      <div className="row between wrap" style={{ gap: 8 }}>
        <Segmented size="sm" value={tool} onChange={setTool} options={[{ value: "brush", label: "🖌️ Brush" }, { value: "eraser", label: "🧽 Eraser" }]} />
        <motion.button whileTap={{ scale: 0.9, rotate: -10 }} transition={spring.pop} className="btn sm" onClick={() => { fill(back); setHint(true); emit(true); }}>🗑️ Clear</motion.button>
      </div>
      <Slider value={brush} min={4} max={48} integer onChange={setBrush} format={(v) => `${Math.round(v)} px`} />
      <div className="row between" style={{ gap: 8 }}>
        <span className="tiny faint">Ink</span>
        <div className="row" style={{ gap: 5 }}>
          {INKS.map((c) => <Swatch key={c} color={c} on={ink === c && tool === "brush"} onClick={() => { setInk(c); setTool("brush"); }} />)}
        </div>
      </div>
      <div className="row between" style={{ gap: 8 }}>
        <span className="tiny faint">Background</span>
        <div className="row" style={{ gap: 5 }}>
          {BACKS.map((c) => <Swatch key={c} color={c} on={back === c} onClick={() => changeBack(c)} title="Fills the pad — clears your drawing" />)}
        </div>
      </div>
    </div>
  );
});

function Swatch({ color, on, onClick, title }: { color: string; on: boolean; onClick: () => void; title?: string }) {
  const btn = (
    <motion.button onClick={onClick} whileHover={{ scale: 1.18 }} whileTap={{ scale: 0.9 }} transition={spring.pop} aria-label={color}
      style={{ width: 20, height: 20, borderRadius: 10, background: color, border: "1px solid var(--hairline)", cursor: "pointer", padding: 0,
        boxShadow: on ? "0 0 0 2px var(--bg), 0 0 0 4px var(--accent)" : "0 1px 3px rgba(0,0,0,0.2)" }} />
  );
  return title ? <Tooltip content={title} width={160}>{btn}</Tooltip> : btn;
}
