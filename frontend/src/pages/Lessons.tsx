import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Glass } from "../components/glass";
import { LessonPath } from "../components/lessons/LessonPath";
import { LessonsHero } from "../components/lessons/LessonsHero";
import { stagger } from "../design/motion";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { toast } from "../lib/store";
import type { LessonSummary } from "../lib/types";

export function LessonsPage() {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.lessons()
      .then((ls) => alive && setLessons([...ls].sort((a, b) => a.order - b.order)))
      .catch((e) => { toast.error(e); alive && setLessons([]); });
    return () => { alive = false; };
  }, []);

  const next = lessons?.find((l) => !l.progress.completed_at) ?? null;
  const open = (id: string) => navigate(`/lessons/${id}`);

  return (
    <div className="scroll" style={{ height: "100%" }}>
      <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="col"
        style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 22px 80px", gap: 34 }}>
        <LessonsHero lessons={lessons ?? []} next={next} onContinue={() => next && open(next.id)} />

        <section className="col" style={{ gap: 18 }}>
          <div className="col" style={{ gap: 2, padding: "0 4px" }}>
            <h2>The path</h2>
            <p className="muted">Ordered like a real project — from cleaning raw data to shipping a model responsibly. Jump in anywhere.</p>
          </div>
          {lessons === null ? (
            <div className="col" style={{ gap: 22 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="row" style={{ justifyContent: i % 2 ? "flex-end" : "flex-start", gap: 18 }}>
                  {i % 2 === 1 && <div className="skeleton" style={{ width: 64, height: 64, borderRadius: 32 }} />}
                  <div className="skeleton" style={{ width: "54%", height: 168, borderRadius: 22 }} />
                  {i % 2 === 0 && <div className="skeleton" style={{ width: 64, height: 64, borderRadius: 32 }} />}
                </div>
              ))}
            </div>
          ) : lessons.length === 0 ? (
            <Glass><p className="muted" style={{ textAlign: "center", padding: 30 }}>Couldn't load the lessons. Is the server running?</p></Glass>
          ) : (
            <LessonPath lessons={lessons} upNextId={next?.id ?? null} onOpen={open} />
          )}
        </section>

        {lessons && lessons.length > 0 && (
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="col center" style={{ gap: 6, textAlign: "center", padding: "10px 0 0" }}>
            <span style={{ fontSize: 30 }}>🏁</span>
            <b>That's the whole pipeline.</b>
            <span className="small muted" style={{ maxWidth: 440 }}>Every practice challenge is graded on a hidden test set that behaves like the real world — the only exam that counts.</span>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
