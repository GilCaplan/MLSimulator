import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { AnimatedNumber, EmptyState, Glass, Modal, Segmented, Spinner } from "../components/glass";
import { CardSkeleton, ModelCard } from "../components/library/ModelCard";
import { PageFrame, PageHeader, emojiFor, rise, useRegistry } from "../components/library/shared";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { toast } from "../lib/store";
import type { SavedModel, Task } from "../lib/types";

type Filter = "all" | Task | "image" | "discover";
const UNSUP = ["clustering", "reduction", "anomaly"];

export function LibraryPage() {
  const registry = useRegistry();
  const [models, setModels] = useState<SavedModel[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [doomed, setDoomed] = useState<SavedModel | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.library().then(setModels).catch((e) => { toast.error(e); setModels([]); });
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models ?? []).filter((m) =>
      (filter === "all" || m.task === filter || (filter === "image" && m.modality === "image") || (filter === "discover" && UNSUP.includes(m.task))) &&
      (!q || [m.name, m.label, m.dataset?.name, m.target, m.notes, m.task, m.modality === "image" ? "image picture" : ""].some((s) => s && s.toLowerCase().includes(q))));
  }, [models, query, filter]);

  const counts = useMemo(() => ({
    classification: (models ?? []).filter((m) => m.task === "classification").length,
    regression: (models ?? []).filter((m) => m.task === "regression").length,
    image: (models ?? []).filter((m) => m.modality === "image").length,
    discover: (models ?? []).filter((m) => UNSUP.includes(m.task)).length,
  }), [models]);

  const rename = async (m: SavedModel, name: string) => {
    setModels((list) => list?.map((x) => (x.id === m.id ? { ...x, name } : x)) ?? null);
    try {
      await api.renameModel(m.id, { name });
    } catch (e) {
      toast.error(e);
      setModels((list) => list?.map((x) => (x.id === m.id ? { ...x, name: m.name } : x)) ?? null);
    }
  };

  const confirmDelete = async () => {
    if (!doomed) return;
    setDeleting(true);
    try {
      await api.deleteModel(doomed.id);
      setModels((list) => list?.filter((x) => x.id !== doomed.id) ?? null);
      toast.success(`“${doomed.name}” deleted.`);
      setDoomed(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setDeleting(false);
    }
  };

  const total = models?.length ?? 0;

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Your saved models"
        title={
          <span className="row" style={{ gap: 12 }}>
            Model Library
            {models && (
              <span className="badge accent" style={{ height: 28, fontSize: 14, padding: "0 12px" }}>
                <AnimatedNumber value={total} />
              </span>
            )}
          </span>
        }
        subtitle="Every model you save lands here — open one to play with live predictions, run a whole file through it, or export it."
      />

      {models && total > 0 && (
        <motion.div variants={rise} className="row wrap" style={{ gap: 12 }}>
          <div className="row grow" style={{ position: "relative", minWidth: 220, maxWidth: 420 }}>
            <span style={{ position: "absolute", left: 12, fontSize: 13, opacity: 0.6, pointerEvents: "none" }}>🔍</span>
            <input className="input" placeholder="Search by name, model, dataset…" value={query} onChange={(e) => setQuery(e.target.value)}
              style={{ width: "100%", paddingLeft: 34, borderRadius: 999, height: 38 }} />
            {query && (
              <button className="btn ghost sm icon" style={{ position: "absolute", right: 5 }} onClick={() => setQuery("")} aria-label="Clear search">✕</button>
            )}
          </div>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All · ${total}` },
              { value: "classification", label: `🏷️ Classification · ${counts.classification}` },
              { value: "regression", label: `📈 Regression · ${counts.regression}` },
              ...(counts.image ? [{ value: "image" as Filter, label: `🖼️ Images · ${counts.image}` }] : []),
              ...(counts.discover ? [{ value: "discover" as Filter, label: `🫧 Discover · ${counts.discover}` }] : []),
            ]}
          />
        </motion.div>
      )}

      {!models ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {[0, 1, 2].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : total === 0 ? (
        <Glass animate_in variant="thin">
          <EmptyState
            icon="📚"
            title="No saved models yet"
            text="Train a model in one of your projects, then press “Save to library” on the one you like. It will show up here, ready to make predictions."
            action={<button className="btn primary" onClick={() => navigate("/")}>Go to projects →</button>}
          />
        </Glass>
      ) : (
        <motion.div layout style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          <AnimatePresence mode="popLayout">
            {shown.map((m) => (
              <ModelCard key={m.id} model={m} emoji={emojiFor(registry, m)} onRename={(n) => rename(m, n)} onDelete={() => setDoomed(m)} />
            ))}
          </AnimatePresence>
          {shown.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col center muted" style={{ gridColumn: "1 / -1", padding: 40, gap: 6 }}>
              <span style={{ fontSize: 30 }}>🫥</span>
              <span>Nothing matches that search.</span>
              <button className="btn sm ghost" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>
            </motion.div>
          )}
        </motion.div>
      )}

      <Modal
        open={!!doomed}
        onClose={() => !deleting && setDoomed(null)}
        title="Delete this model?"
        width={440}
        footer={
          <>
            <button className="btn ghost" onClick={() => setDoomed(null)} disabled={deleting}>Keep it</button>
            <button className="btn primary" style={{ background: "var(--danger)", boxShadow: "0 6px 18px rgba(255,69,58,0.35)" }} onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Spinner size={14} /> : "🗑️"} Delete
            </button>
          </>
        }
      >
        <p className="muted" style={{ lineHeight: 1.55 }}>
          <b style={{ color: "var(--text)" }}>{doomed?.name}</b> will be removed from your library for good. The project it came from is not affected — you
          can always train it again.
        </p>
      </Modal>
    </PageFrame>
  );
}
