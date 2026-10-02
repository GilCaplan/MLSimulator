import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { fadeUp } from "../../design/motion";

type GlassProps = HTMLMotionProps<"div"> & { variant?: "default" | "strong" | "thin"; pad?: boolean | "lg"; animate_in?: boolean };

/** Frosted-glass surface. `animate_in` fades/blurs it in using the parent's stagger. */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { variant = "default", pad = true, animate_in = false, className = "", children, ...rest },
  ref,
) {
  const cls = ["glass", variant !== "default" ? variant : "", pad === "lg" ? "pad-lg" : pad ? "pad" : "", className].filter(Boolean).join(" ");
  return (
    <motion.div ref={ref} className={cls} {...(animate_in ? { variants: fadeUp } : {})} {...rest}>
      {children}
    </motion.div>
  );
});
