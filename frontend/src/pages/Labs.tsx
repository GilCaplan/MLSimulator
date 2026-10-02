import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { EmptyState, Glass } from "../components/glass";
import { BanditLab, GridworldLab } from "../components/labs/client";
import { LAB_ORDER, LEARN } from "../components/labs/explainers";
import { GanLab } from "../components/labs/GanLab";
import { LabSketch } from "../components/labs/LabSketch";
import { TransferLab } from "../components/labs/TransferLab";
import { VaeLab } from "../components/labs/VaeLab";
import "../components/labs/labs.css";
import { fadeUp, spring, stagger } from "../design/motion";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { toast } from "../lib/store";
import type { LabInfo, LabsCatalog } from "../lib/types";

/* The catalogue rarely changes: fetch it once per session and share it between the gallery and lab pages. */
let catalogPromise: Promise<LabsCatalog> | null = null;
function useCatalog() {
  const [cat, setCat] = useState<LabsCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    catalogPromise ??= api.labs();
    catalogPromise
      .then((c) => alive && setCat(c))
      .catch((e) => { catalogPromise = null; if (alive) { toast.error(e); setFailed(true); } });
    return () => { alive = false; };
  }, []);
  return { cat, failed };
}

const ordered = (labs: Record<string, LabInfo>) =>
  Object.entries(labs).sort(([a], [b]) => (LAB_ORDER.indexOf(a) + 99) % 99 - (LAB_ORDER.indexOf(b) + 99) % 99);

function KindBadge({ kind }: { kind: LabInfo["kind"] }) {
  return kind === "client"
    ? <span className="badge success">⚡ Runs in your browser</span>
    : <span className="badge accent">🧠 Trains a small network</span>;
}

/** Labs gallery. */
export function LabsPage() {
  const { cat, failed } = useCatalog();
  return (
    <div className="scroll" style={{ height: "100%" }}>
      <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="col"
        style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 22px 80px", gap: 28 }}>
        <motion.section variants={fadeUp} className="col" style={{ gap: 8, padding: "8px 4px 0", maxWidth: 720 }}>
          <span className="eyebrow">Labs 🧪</span>
          <h1>Labs are playgrounds for ideas beyond the wizard</h1>
          <p className="muted" style={{ fontSize: 15 }}>
            No datasets, no steps — just one idea per lab that you can poke at until it clicks. Some train a tiny neural network on the server in
            seconds; others run entirely in your browser. Nothing here can break your projects.
          </p>
        </motion.section>

        {cat === null && !failed && (
          <div className="lab-gallery">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 268, borderRadius: "var(--r-lg)" }} />)}
          </div>
        )}
        {failed && (
          <Glass><p className="muted" style={{ textAlign: "center", padding: 30 }}>Couldn't load the labs. Is the server running?</p></Glass>
        )}
        {cat && (
          <motion.div className="lab-gallery" variants={stagger(0.08)} initial="hidden" animate="show">
            {ordered(cat.labs).map(([id, lab]) => (
              <motion.div key={id} variants={fadeUp} whileHover={{ y: -3 }} transition={spring.snappy}>
                <Glass className="lab-card" role="link" tabIndex={0} aria-label={`Open ${lab.label}`}
                  onClick={() => navigate(`/labs/${id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/labs/${id}`); } }}>
                  <LabSketch id={id} />
                  <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 26, lineHeight: 1 }}>{lab.emoji}</span>
                    <div className="col" style={{ gap: 4, minWidth: 0 }}>
                      <h3 style={{ margin: 0 }}>{lab.label}</h3>
                      <span className="small muted">{lab.blurb}</span>
                    </div>
                  </div>
                  <div className="row between wrap" style={{ gap: 8, marginTop: "auto" }}>
                    <KindBadge kind={lab.kind} />
                    <span className="small" style={{ color: "var(--accent)", fontWeight: 600 }}>Open →</span>
                  </div>
                </Glass>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

/** One lab: header, plain-language explainer, then the lab itself. */
export function LabPage({ labId }: { labId: string }) {
  const { cat, failed } = useCatalog();
  const lab = cat?.labs[labId];
  const learn = LEARN[labId];

  let body;
  switch (labId) {
    case "gan": body = <GanLab catalog={cat} />; break;
    case "vae": body = <VaeLab catalog={cat} />; break;
    case "transfer": body = <TransferLab catalog={cat} />; break;
    case "bandit": body = <BanditLab />; break;
    case "gridworld": body = <GridworldLab />; break;
    default: body = null;
  }
  const known = !!body;
  // server labs read their default settings from the catalogue — wait for it so the controls start right
  const ready = !!cat || failed || labId === "bandit" || labId === "gridworld";

  return (
    <div className="scroll" style={{ height: "100%" }}>
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="col"
        style={{ maxWidth: 1240, margin: "0 auto", padding: "14px 22px 80px", gap: 18 }}>
        <motion.div variants={fadeUp}>
          <button className="btn ghost sm" onClick={() => navigate("/labs")}>← All labs</button>
        </motion.div>
        {!known ? (
          <EmptyState icon="🧪" title="No such lab" text="That lab doesn't exist (yet)." action={<button className="btn primary" onClick={() => navigate("/labs")}>See all labs</button>} />
        ) : (
          <>
            <motion.header variants={fadeUp} className="row wrap" style={{ gap: 14, alignItems: "flex-start", padding: "0 4px" }}>
              <span style={{ fontSize: 40, lineHeight: 1 }}>{lab?.emoji ?? "🧪"}</span>
              <div className="col grow" style={{ gap: 6, minWidth: 0, flexBasis: 260 }}>
                <div className="row wrap" style={{ gap: 10 }}>
                  <h1 style={{ margin: 0 }}>{lab?.label ?? (cat ? labId : <span className="skeleton" style={{ display: "inline-block", width: 240, height: 28 }} />)}</h1>
                  {lab && <KindBadge kind={lab.kind} />}
                </div>
                {lab && <p className="muted" style={{ margin: 0, maxWidth: 720 }}>{lab.blurb}</p>}
              </div>
            </motion.header>
            {learn && (
              <Glass animate_in className="col" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="eyebrow">What you'll learn</span>
                  <span className="small" style={{ fontWeight: 600 }}>· {learn.title}</span>
                </div>
                <ul className="col" style={{ gap: 6, margin: 0, paddingLeft: 20 }}>
                  {learn.bullets.map((b, i) => <li key={i} className="small" style={{ lineHeight: 1.5 }}>{b}</li>)}
                </ul>
              </Glass>
            )}
            <motion.div variants={fadeUp} style={{ minWidth: 0 }}>
              {ready ? body : <div className="skeleton" style={{ height: 420, borderRadius: "var(--r-lg)" }} />}
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}
