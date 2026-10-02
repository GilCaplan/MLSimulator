import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Hero } from "../components/home/Hero";
import { RecentProjects } from "../components/home/RecentProjects";
import { Templates } from "../components/home/Templates";
import { stagger } from "../design/motion";
import { api } from "../lib/api";
import { toast, useProject } from "../lib/store";
import type { Project } from "../lib/types";

export function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // Make sure any pending autosave from the wizard lands before we list projects.
    useProject.getState().flush()
      .then(() => api.projects())
      .then((ps) => alive && setProjects([...ps].sort((a, b) => b.updated_at - a.updated_at)))
      .catch((e) => toast.error(e))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  return (
    <div className="scroll" style={{ height: "100%" }}>
      <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="col"
        style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 22px 64px", gap: 34 }}>
        <Hero projectCount={projects.length} />
        <Templates />
        <RecentProjects projects={projects} loading={loading} onChange={setProjects} />
      </motion.div>
    </div>
  );
}
