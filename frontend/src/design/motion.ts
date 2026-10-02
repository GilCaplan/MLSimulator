import type { Transition, Variants } from "framer-motion";

export const spring = {
  snappy: { type: "spring", stiffness: 380, damping: 32 } as Transition,
  gentle: { type: "spring", stiffness: 140, damping: 20 } as Transition,
  pop: { type: "spring", stiffness: 520, damping: 24 } as Transition,
  soft: { type: "spring", stiffness: 90, damping: 18 } as Transition,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: spring.gentle, transitionEnd: { filter: "none" } },
  exit: { opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.18 } },
};

export const stagger = (delay = 0.045): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: delay } },
});

export const pageTransition: Variants = {
  hidden: { opacity: 0, x: 24, filter: "blur(8px)" },
  show: { opacity: 1, x: 0, filter: "blur(0px)", transition: { ...spring.gentle, staggerChildren: 0.05 }, transitionEnd: { filter: "none" } },
  exit: { opacity: 0, x: -24, filter: "blur(8px)", transition: { duration: 0.2 } },
};
