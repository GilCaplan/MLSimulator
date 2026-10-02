import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, type ReactNode } from "react";
import { spring } from "../../design/motion";

/** A lesson-page section with a numbered heading and an animated "done" badge. */
export const Section = forwardRef<HTMLElement, { id: string; n: number; icon: string; eyebrow: string; title: string; subtitle?: ReactNode; done?: boolean; children: ReactNode }>(
  function Section({ id, n, icon, eyebrow, title, subtitle, done, children }, ref) {
    return (
      <section ref={ref} id={`lesson-${id}`} className="col" style={{ gap: 16, scrollMarginTop: 90 }}>
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={spring.gentle}
          className="row" style={{ gap: 14, alignItems: "flex-end", padding: "0 4px" }}>
          <span style={{ width: 46, height: 46, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0,
            background: done ? "rgba(48,209,88,.16)" : "var(--accent-soft)", border: `1px solid ${done ? "rgba(48,209,88,.4)" : "transparent"}`, transition: "background .3s" }}>
            {icon}
          </span>
          <div className="col grow" style={{ gap: 2 }}>
            <span className="eyebrow">Step {n} · {eyebrow}</span>
            <h2 style={{ fontSize: 26 }}>{title}</h2>
          </div>
          <AnimatePresence>
            {done && (
              <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={spring.pop} className="badge success" style={{ height: 26, fontSize: 12.5 }}>
                ✓ Done
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
        {subtitle && <p className="muted" style={{ padding: "0 4px", marginTop: -6, lineHeight: 1.55, maxWidth: 720 }}>{subtitle}</p>}
        {children}
      </section>
    );
  },
);
