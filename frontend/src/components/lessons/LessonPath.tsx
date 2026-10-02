import { motion } from "framer-motion";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { spring } from "../../design/motion";
import type { LessonSummary } from "../../lib/types";
import { useSize } from "../charts";
import { LessonCard, Station } from "./LessonNode";
import { lessonStatus, stageTint } from "./shared";

const STATION = 64;
const GAP = 22;

/** The curriculum as a winding path: stations zig-zag down the page, grouped by pipeline stage. */
export function LessonPath({ lessons, upNextId, onOpen }: { lessons: LessonSummary[]; upNextId: string | null; onOpen: (id: string) => void }) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const stations = useRef<(HTMLButtonElement | null)[]>([]);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const wide = size.width >= 760;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const base = wrap.getBoundingClientRect();
      setPts(stations.current.slice(0, lessons.length).map((el) => {
        if (!el) return { x: 0, y: 0 };
        // offsetLeft/Top chain avoids picking up in-flight scale transforms
        let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
        let n: HTMLElement | null = el;
        while (n && n !== wrap) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
        if (n !== wrap) { const r = el.getBoundingClientRect(); return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }; }
        return { x, y };
      }));
    };
    measure();
    const t = setTimeout(measure, 400);
    return () => clearTimeout(t);
  }, [size.width, size.height, lessons.length, wrapRef]);

  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dy = (b.y - a.y) / 2;
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
  };
  const full = pts.length > 1 ? pts.slice(1).map((p, i) => seg(pts[i], p)).join(" ") : "";
  const nextIdx = lessons.findIndex((l) => l.id === upNextId);
  const lead = nextIdx > 0 && pts[nextIdx] ? seg(pts[nextIdx - 1], pts[nextIdx]) : null;

  let prevStage = "";
  return (
    <div ref={wrapRef} style={{ position: "relative", paddingBottom: 8 }}>
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 0 }}>
        <defs>
          <linearGradient id="lesson-path-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={size.height || 1}>
            <stop offset="0%" stopColor="#0a84ff" />
            <stop offset="50%" stopColor="#5e5ce6" />
            <stop offset="100%" stopColor="#bf5af2" />
          </linearGradient>
        </defs>
        {full && (
          <motion.path key={`base-${size.width}`} d={full} fill="none" stroke="var(--fill-2)" strokeWidth={4} strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: [0.32, 0.72, 0, 1], delay: 0.2 }} />
        )}
        {pts.slice(1).map((p, i) => lessonStatus(lessons[i].progress) === "done" && (
          <motion.path key={`done-${i}-${size.width}`} d={seg(pts[i], p)} fill="none" stroke="url(#lesson-path-grad)" strokeWidth={5} strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: "easeInOut", delay: 0.5 + i * 0.18 }}
            style={{ filter: "drop-shadow(0 0 6px rgba(94,92,230,.5))" }} />
        ))}
        {lead && (
          <circle r={5} fill="var(--accent)" style={{ filter: "drop-shadow(0 0 6px var(--accent))" }}>
            <animateMotion dur="2.4s" repeatCount="indefinite" path={lead} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="2.4s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>

      <div className="col" style={{ gap: GAP, position: "relative", zIndex: 1 }}>
        {lessons.map((l, i) => {
          const showStage = l.stage !== prevStage;
          prevStage = l.stage;
          const left = i % 2 === 0;
          const open = () => onOpen(l.id);
          const station = <Station ref={(el) => { stations.current[i] = el; }} lesson={l} upNext={l.id === upNextId} onOpen={open} size={STATION} />;
          return (
            <Fragment key={l.id}>
              {showStage && <StageMarker stage={l.stage} count={lessons.filter((x) => x.stage === l.stage).length} wide={wide} first={i === 0} />}
              {wide ? (
                <div className="row" style={{ justifyContent: left ? "flex-start" : "flex-end", gap: 18, alignItems: "center" }}>
                  {!left && station}
                  <div style={{ width: "54%", display: "flex" }}><LessonCard lesson={l} upNext={l.id === upNextId} onOpen={open} align={left ? "left" : "left"} /></div>
                  {left && station}
                </div>
              ) : (
                <div className="row" style={{ gap: 14, alignItems: "center" }}>
                  {station}
                  <LessonCard lesson={l} upNext={l.id === upNextId} onOpen={open} align="left" />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function StageMarker({ stage, count, wide, first }: { stage: string; count: number; wide: boolean; first: boolean }) {
  const t = stageTint(stage);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={spring.pop}
      className="row" style={{ justifyContent: wide ? "center" : "flex-start", marginTop: first ? 0 : 10, paddingLeft: wide ? 0 : STATION / 2 - 14 }}>
      <span className="glass strong row" style={{ gap: 8, padding: "6px 14px 6px 10px", borderRadius: 999, border: `1px solid ${t.color}55` }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: t.color, boxShadow: `0 0 10px ${t.color}` }} />
        <b style={{ fontSize: 12.5, letterSpacing: "0.02em", textTransform: "uppercase", color: t.color }}>{stage}</b>
        <span className="tiny faint">{count} lesson{count === 1 ? "" : "s"}</span>
      </span>
    </motion.div>
  );
}
