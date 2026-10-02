import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { stagger } from "../../design/motion";
import { api } from "../../lib/api";
import { toast, useProject } from "../../lib/store";
import type { Project } from "../../lib/types";
import { EmptyState, Glass, Modal, Spinner } from "../glass";
import { ProjectCard } from "./ProjectCard";

export function RecentProjects({ projects, loading, onChange }: { projects: Project[]; loading: boolean; onChange: (p: Project[]) => void }) {
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rename = async (p: Project, name: string) => {
    onChange(projects.map((x) => (x.id === p.id ? { ...x, name } : x)));
    try {
      const st = useProject.getState();
      if (st.project?.id === p.id) st.update({ name });
      else await api.saveProject({ ...p, name });
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.deleteProject(confirm.id);
      if (useProject.getState().project?.id === confirm.id) useProject.setState({ project: null });
      onChange(projects.filter((x) => x.id !== confirm.id));
      toast.success(`Deleted “${confirm.name}”.`);
      setConfirm(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="col" style={{ gap: 12 }}>
      <div className="row between" style={{ padding: "0 4px" }}>
        <div className="col" style={{ gap: 2 }}>
          <h2>Your projects</h2>
          <p className="muted">Pick up right where you left off.</p>
        </div>
        {projects.length > 0 && <span className="badge num">{projects.length}</span>}
      </div>

      {loading ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 168, borderRadius: 22 }} />)}
        </div>
      ) : projects.length === 0 ? (
        <Glass animate_in>
          <EmptyState icon="🪴" title="No projects yet" text="Start a new project above, or grab a quick-start template — you'll be training a model in about a minute." />
        </Glass>
      ) : (
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          <AnimatePresence>
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={() => setConfirm(p)} onRename={(n) => rename(p, n)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <Modal
        open={!!confirm}
        onClose={() => !deleting && setConfirm(null)}
        title="Delete this project?"
        width={440}
        footer={
          <>
            <button className="btn" onClick={() => setConfirm(null)} disabled={deleting}>Cancel</button>
            <button className="btn primary" style={{ background: "var(--danger)", boxShadow: "0 6px 18px rgba(255,69,58,.35)" }} onClick={remove} disabled={deleting}>
              {deleting && <Spinner size={14} />} Delete
            </button>
          </>
        }
      >
        <p className="muted" style={{ lineHeight: 1.55 }}>
          <b style={{ color: "var(--text)" }}>{confirm?.name}</b> and its settings will be removed. Models you saved to the Model Library stay safe.
        </p>
      </Modal>
    </section>
  );
}
