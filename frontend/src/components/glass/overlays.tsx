import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { spring } from "../../design/motion";
import { useToasts } from "../../lib/store";

export function Modal({ open, onClose, title, children, width = 520, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.18)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <motion.div
            className="glass strong pad-lg"
            initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={spring.snappy}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width, maxWidth: "100%", maxHeight: "88vh", overflow: "auto", borderRadius: 26 }}
          >
            {title && <h3 style={{ marginBottom: 16, fontSize: 19 }}>{title}</h3>}
            {children}
            {footer && <div className="row" style={{ justifyContent: "flex-end", marginTop: 22, gap: 10 }}>{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const ICON = { info: "ℹ️", success: "✅", error: "⚠️" };

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return createPortal(
    <div style={{ position: "fixed", top: 76, left: "50%", transform: "translateX(-50%)", zIndex: 200, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", pointerEvents: "none" }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={spring.pop}
            className="glass strong"
            onClick={() => dismiss(t.id)}
            style={{ padding: "11px 18px", borderRadius: 999, pointerEvents: "auto", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", maxWidth: 560, fontWeight: 520 }}
          >
            <span>{ICON[t.kind]}</span>
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
