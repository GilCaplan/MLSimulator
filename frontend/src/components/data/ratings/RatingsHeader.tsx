import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "../../../design/motion";
import type { DatasetProfile, DatasetSummary } from "../../../lib/types";
import { AnimatedNumber, Glass, InfoTip, Select } from "../../glass";
import { fmtInt, ROLES, rolesReady, type RoleId, type Roles } from "./ratingsData";
import { SparsityGrid } from "./viz";

/** Ratings dataset card: name, the four headline numbers, and which column plays which part. */
export function RatingsHeader({ dataset, profile, roles, pickerOpen, onTogglePicker, onRole, highlight }: {
  dataset: DatasetSummary;
  profile: DatasetProfile | null;
  roles: Roles;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onRole: (role: RoleId, col: string | null) => void;
  highlight: boolean;
}) {
  const uploaded = dataset.source === "upload";
  const names = dataset.columns.map((c) => c.name);
  const sp = profile?.sparsity;
  const ready = rolesReady(roles);
  const ratingCol = dataset.columns.find((c) => c.name === roles.rating);
  const ratingNotNumeric = !!ratingCol && ratingCol.role !== "numeric";
  return (
    <Glass animate_in variant="strong">
      <div className="row between wrap" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14, minWidth: 0 }}>
          <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.pop}
            style={{ width: 52, height: 52, borderRadius: 16, background: "linear-gradient(135deg, #FF9F0A, #FF375F 60%, #BF5AF2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, boxShadow: "0 8px 22px rgba(255,55,95,.28)" }}>
            {uploaded ? "📁" : "🎬"}
          </motion.div>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <h2 className="truncate" style={{ fontSize: 21 }}>{dataset.name}</h2>
              <span className={`badge ${uploaded ? "" : "success"}`}>{uploaded ? "Uploaded" : "Ratings set"}</span>
            </div>
            <span className="small muted">Who rated what — the raw material for learning tastes.</span>
          </div>
        </div>
        <button className={`btn ${pickerOpen ? "primary" : ""}`} onClick={onTogglePicker}>{pickerOpen ? "✕ Close" : "🔄 Change ratings"}</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10, marginTop: 16 }}>
        <Stat icon="👤" label="People" value={profile?.n_users} />
        <Stat icon="🎬" label="Items" value={profile?.n_items} />
        <Stat icon="⭐" label="Ratings" value={dataset.n_rows} />
        <div className="inset row" style={{ padding: "10px 12px", gap: 12, gridColumn: "span 2", minWidth: 0 }}>
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <span className="tiny muted row" style={{ gap: 4 }}>🕳️ Empty grid <InfoTip text="Picture a giant table with one row per person and one column per item. Each rating fills one cell. Sparsity is the share of cells that are still empty — usually well over 90%. The recommender's whole job is to guess those blanks." /></span>
            <b className="num" style={{ fontSize: 20 }}>
              {sp === undefined ? "—" : <AnimatedNumber value={sp * 100} format={(v) => `${v.toFixed(v > 99 ? 2 : 1)}%`} />}
            </b>
            <span className="tiny faint">of the people × items grid is empty</span>
          </div>
          <div className="grow" />
          {sp !== undefined && <SparsityGrid key={sp} sparsity={sp} cols={16} rows={5} size={6} gap={3} />}
        </div>
      </div>

      <div className="divider" style={{ margin: "16px 0" }} />

      <div className="row wrap" style={{ gap: 16, alignItems: "flex-end" }}>
        {ROLES.map((r, k) => (
          <Picker key={r.id} icon={r.icon} label={r.label} help={r.help} highlight={highlight} delay={k * 0.08}>
            <Select value={roles[r.id] ?? ""} onChange={(v) => onRole(r.id, v || null)} style={{ minWidth: 130 }}
              options={[...(r.optional ? [{ value: "", label: "— none —" }] : roles[r.id] ? [] : [{ value: "", label: "Choose…" }]), ...names.map((c) => ({ value: c, label: c }))]} />
          </Picker>
        ))}
        <div className="grow" />
        {ready && (
          <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="small row" style={{ gap: 6, paddingBottom: 6, color: "var(--text-2)" }}>
            <span className="badge">👤 {roles.user}</span>→<span className="badge">🎬 {roles.item}</span>=<span className="badge" style={{ color: "#E0A100" }}>⭐ {roles.rating}</span>
          </motion.span>
        )}
      </div>
      {!ready && <p className="small" style={{ color: "var(--warning)", marginTop: 12 }}>⚠️ Choose three different columns for who, what and the rating.</p>}
      {ratingNotNumeric && <p className="small" style={{ color: "var(--warning)", marginTop: 12 }}>⚠️ ‘{roles.rating}’ doesn't look like numbers — the rating must be a number such as stars (1–5) or 1 for “bought”.</p>}
      {(dataset.warnings ?? []).length > 0 && (
        <div className="col small" style={{ gap: 4, marginTop: 12 }}>
          {dataset.warnings!.map((w) => <span key={w} style={{ color: "var(--warning)" }}>⚠️ {w}</span>)}
        </div>
      )}
    </Glass>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value?: number }) {
  return (
    <div className="inset col" style={{ padding: "10px 12px", gap: 2 }}>
      <span className="tiny muted">{icon} {label}</span>
      <b className="num" style={{ fontSize: 20 }}>{value === undefined ? "—" : <AnimatedNumber value={value} format={(v) => fmtInt(v)} />}</b>
    </div>
  );
}

function Picker({ icon, label, help, highlight, delay, children }: { icon: string; label: string; help: string; highlight: boolean; delay: number; children: ReactNode }) {
  return (
    <motion.div className="col" style={{ gap: 6, padding: 8, margin: -8, borderRadius: 14 }}
      animate={highlight ? { boxShadow: ["0 0 0 0px var(--accent-soft)", "0 0 0 6px var(--accent-soft)", "0 0 0 0px var(--accent-soft)"] } : { boxShadow: "0 0 0 0px rgba(0,0,0,0)" }}
      transition={highlight ? { duration: 1.4, repeat: 2, delay } : { duration: 0.2 }}>
      <span className="row small" style={{ gap: 6, fontWeight: 650 }}>{icon} {label} <InfoTip text={help} /></span>
      {children}
    </motion.div>
  );
}
