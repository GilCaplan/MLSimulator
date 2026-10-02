import { motion } from "framer-motion";
import { navigate } from "../../lib/router";
import type { LessonSummary } from "../../lib/types";
import { lessonStatus } from "./shared";

/** Previous / next lesson cards at the bottom of a lesson page. */
export function LessonNav({ lessons, currentId }: { lessons: LessonSummary[]; currentId: string }) {
  const i = lessons.findIndex((l) => l.id === currentId);
  if (i < 0) return null;
  const prev = lessons[i - 1];
  const next = lessons[i + 1];
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
      {prev ? <NavCard lesson={prev} dir="prev" /> : <div />}
      {next ? <NavCard lesson={next} dir="next" /> : (
        <motion.button whileHover={{ y: -2 }} onClick={() => navigate("/lessons")} className="glass tile row" style={{ gap: 12, padding: 16, textAlign: "left", border: "1px solid var(--glass-border)" }}>
          <span style={{ fontSize: 28 }}>🏁</span>
          <span className="col grow" style={{ gap: 2 }}>
            <span className="eyebrow">That's the last lesson</span>
            <b>Back to the path</b>
          </span>
          <span className="faint">→</span>
        </motion.button>
      )}
    </div>
  );
}

function NavCard({ lesson, dir }: { lesson: LessonSummary; dir: "prev" | "next" }) {
  const done = lessonStatus(lesson.progress) === "done";
  return (
    <motion.button whileHover={{ x: dir === "next" ? 3 : -3 }} whileTap={{ scale: 0.98 }} onClick={() => navigate(`/lessons/${lesson.id}`)}
      className="glass tile row" style={{ gap: 12, padding: 16, textAlign: dir === "next" ? "right" : "left", flexDirection: dir === "next" ? "row-reverse" : "row", border: "1px solid var(--glass-border)" }}>
      <span className="faint" style={{ fontSize: 18 }}>{dir === "next" ? "→" : "←"}</span>
      <span style={{ width: 44, height: 44, borderRadius: 14, background: "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{lesson.emoji}</span>
      <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
        <span className="eyebrow">{dir === "next" ? "Next lesson" : "Previous lesson"} · {lesson.order}{done ? " · ✓" : ""}</span>
        <b className="truncate" style={{ fontSize: 14.5 }}>{lesson.title}</b>
      </span>
    </motion.button>
  );
}
