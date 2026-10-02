import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

export function Tooltip({ content, children, width = 240 }: { content: ReactNode; children: ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="glass strong"
            style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", translateX: "-50%", width, padding: "10px 12px", fontSize: 12, lineHeight: 1.45, zIndex: 50, borderRadius: "min(12px, var(--r-md))", pointerEvents: "none", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text)" }}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function InfoTip({ text }: { text: ReactNode }) {
  return (
    <Tooltip content={text}>
      <span className="infotip">i</span>
    </Tooltip>
  );
}
