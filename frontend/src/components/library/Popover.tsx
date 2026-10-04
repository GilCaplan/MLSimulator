import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { spring } from "../../design/motion";

/** A small floating glass panel anchored under a button. Rendered in a portal so page scrollers and
 * sticky bars can't clip or cover it; closes on outside click, Escape, scroll and resize. */
export function Popover({ anchor, open, onClose, children, width = 340, align = "right" }: {
  anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; children: ReactNode; width?: number; align?: "left" | "right";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 24);
    const left = align === "right" ? Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12)) : Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    setPos({ top: r.bottom + 8, left, maxH: window.innerHeight - r.bottom - 24 });
  }, [open, anchor, width, align]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const away = (e: Event) => { if (!panel.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose, anchor]);

  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={panel}
          role="dialog"
          className="glass strong"
          initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
          transition={spring.snappy}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 24), maxHeight: Math.max(220, pos.maxH), overflow: "auto",
            zIndex: 90, padding: 8, borderRadius: "var(--r-lg)", transformOrigin: align === "right" ? "top right" : "top left", color: "var(--text)" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
