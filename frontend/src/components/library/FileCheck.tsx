import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { stagger } from "../../design/motion";
import { api } from "../../lib/api";
import { fmt } from "../../lib/format";
import { toast } from "../../lib/store";
import type { FileCheckReport, FileColumnCheck, FileFixes, InputSchemaItem, ModelView, SavedModel } from "../../lib/types";
import { InfoTip, Select, Spinner } from "../glass";
import { typicalRow } from "./inputs";
import { rise } from "./shared";

const STATUS: Record<FileColumnCheck["status"], { icon: string; label: string; badge: string }> = {
  ok: { icon: "✅", label: "Ready", badge: "success" },
  warn: { icon: "⚠️", label: "Check", badge: "warning" },
  error: { icon: "⛔", label: "Problem", badge: "danger" },
  missing: { icon: "❌", label: "Missing", badge: "danger" },
};

const TYPE_LABEL: Record<InputSchemaItem["type"], string> = { numeric: "number", categorical: "category", datetime: "date", text: "text" };

const NONE = "__none__";

const show = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "number" ? fmt(v, 4) : String(v));

/** Step between dropping a file and predicting: line its columns up with the model's, fix what's off, see what the model will get. */
export function FileCheck({ model, uploadId, fileName, initialFixes, initialReport, busy, onRun, onCancel }: {
  model: SavedModel;
  uploadId: string;
  fileName: string;
  initialFixes: FileFixes;
  initialReport: FileCheckReport;
  busy: boolean;
  onRun: (fixes: FileFixes) => void;
  onCancel: () => void;
}) {
  const [fixes, setFixes] = useState<FileFixes>(initialFixes);
  const [report, setReport] = useState<FileCheckReport>(initialReport);
  const [checking, setChecking] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let live = true;
    setChecking(true);
    const t = setTimeout(() => {
      api.checkUpload(model.id, uploadId, fixes)
        .then((r) => live && setReport(r))
        .catch((e) => live && toast.error(e))
        .finally(() => live && setChecking(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [fixes, model.id, uploadId]);

  const typical = typicalRow(model.input_schema);
  const schema = Object.fromEntries(model.input_schema.map((s) => [s.name, s]));
  const fileCols = report.file_columns;

  const setSource = (name: string, src: string) =>
    setFixes((f) => {
      const mapping = { ...f.mapping };
      if (src === NONE || src === name) delete mapping[name];
      else mapping[name] = src;
      return { ...f, mapping };
    });
  const setFill = (name: string, v: string | number | null) =>
    setFixes((f) => {
      const fill = { ...f.fill };
      if (v === null || v === "") delete fill[name];
      else fill[name] = v;
      return { ...f, fill };
    });
  const toggleClean = (name: string, on: boolean) =>
    setFixes((f) => ({ ...f, clean: on ? [...new Set([...f.clean, name])] : f.clean.filter((c) => c !== name) }));

  const { counts } = report;
  const total = report.columns.length;
  const problems = counts.missing + counts.error;

  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="col" style={{ gap: 16 }}>
      <motion.div variants={rise} className="row wrap" style={{ gap: 12 }}>
        <div className="inset row" style={{ padding: "12px 16px", gap: 12 }}>
          <span style={{ fontSize: 26 }}>{problems ? "🧩" : counts.warn ? "🔍" : "✅"}</span>
          <div className="col" style={{ gap: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>
              {counts.ok + counts.warn} of {total} columns ready
            </span>
            <span className="tiny muted"><b>{fileName}</b> · {report.n_rows.toLocaleString()} rows</span>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {counts.ok > 0 && <span className="badge success">✅ {counts.ok} ready</span>}
          {counts.warn > 0 && <span className="badge warning">⚠️ {counts.warn} to look at</span>}
          {counts.error > 0 && <span className="badge danger">⛔ {counts.error} with problems</span>}
          {counts.missing > 0 && <span className="badge danger">❌ {counts.missing} missing</span>}
        </div>
        <span className="grow" />
        {checking && <Spinner size={16} color="var(--accent)" />}
      </motion.div>

      <motion.p variants={rise} className="small muted" style={{ margin: 0, maxWidth: 720, lineHeight: 1.55 }}>
        The model needs the same columns it learned from. We matched what we could. For each column you can pick which column in your file holds it,
        or give one value for every row. Your saved data recipe (filling blanks, encoding, scaling…) runs on top automatically.
      </motion.p>

      <motion.div variants={rise} className="col" style={{ gap: 8 }}>
        {report.columns.map((c) => (
          <ColumnRow
            key={c.name}
            col={c}
            spec={schema[c.name]}
            typical={typical[c.name]}
            fileCols={fileCols}
            fixes={fixes}
            onSource={(v) => setSource(c.name, v)}
            onFill={(v) => setFill(c.name, v)}
            onClean={(on) => toggleClean(c.name, on)}
          />
        ))}
      </motion.div>

      {report.target && (
        <motion.div variants={rise} className="inset row wrap" style={{ padding: "12px 14px", gap: 12 }}>
          <span style={{ fontSize: 20 }}>🎯</span>
          <div className="col grow" style={{ gap: 2, minWidth: 220 }}>
            <b>The answers ({report.target.name}) — optional</b>
            <span className="tiny muted">
              {report.target.source
                ? <>Found in <b>{report.target.source}</b>{report.target.labelled !== undefined && <> · {report.target.labelled.toLocaleString()} rows have an answer</>}. We'll score the model against them.</>
                : "If your file has the true answers, point to them and we'll score the model. Otherwise we just predict."}
              {report.target.unknown && <> {report.target.unknown.rows.toLocaleString()} rows have an answer the model never learned (e.g. {report.target.unknown.examples.join(", ")}) and are left out of the score.</>}
            </span>
          </div>
          <Select
            value={fixes.mapping[report.target.name] ?? (fileCols.includes(report.target.name) ? report.target.name : NONE)}
            options={[{ value: NONE, label: "— no answers, just predict —" }, ...fileCols.map((f) => ({ value: f, label: f }))]}
            onChange={(v) => setSource(report.target!.name, v)}
            style={{ minWidth: 200 }}
          />
          {!report.target.source && report.target.suggestions.map((s) => (
            <button key={s} className="btn sm" onClick={() => setSource(report.target!.name, s)}>Use “{s}”?</button>
          ))}
        </motion.div>
      )}

      {report.extra.length > 0 && (
        <motion.div variants={rise} className="row wrap tiny muted" style={{ gap: 6 }}>
          <span>Not used by the model (kept in your download):</span>
          {report.extra.slice(0, 16).map((e) => <span key={e} className="badge">{e}</span>)}
          {report.extra.length > 16 && <span className="badge">+{report.extra.length - 16} more</span>}
        </motion.div>
      )}

      <motion.div variants={rise}>
        <ModelSees model={model} uploadId={uploadId} fixes={fixes} ready={report.ready} />
      </motion.div>

      <motion.div variants={rise} className="row wrap" style={{ gap: 10 }}>
        <button className="btn" onClick={onCancel} disabled={busy}>← Different file</button>
        <span className="grow" />
        {!report.ready && <span className="small muted">Sort out the missing columns first.</span>}
        <button className="btn primary" disabled={!report.ready || busy || checking} onClick={() => onRun(fixes)}>
          {busy ? <><Spinner size={14} /> Predicting…</> : <>Predict {report.n_rows.toLocaleString()} rows →</>}
        </button>
      </motion.div>
    </motion.div>
  );
}

function ColumnRow({ col, spec, typical, fileCols, fixes, onSource, onFill, onClean }: {
  col: FileColumnCheck;
  spec?: InputSchemaItem;
  typical: string | number | undefined;
  fileCols: string[];
  fixes: FileFixes;
  onSource: (v: string) => void;
  onFill: (v: string | number | null) => void;
  onClean: (on: boolean) => void;
}) {
  const st = STATUS[col.status];
  const fill = fixes.fill[col.name];
  const filling = fill !== undefined;
  const cleanable = col.issues.find((i) => (i.kind === "not_numbers" || i.kind === "unseen") && (i.fixable ?? 0) > 0);
  const cleaned = fixes.clean.includes(col.name);
  const hasBlanks = col.source !== null && col.blanks > 0;
  const [blankOpen, setBlankOpen] = useState(false);
  const source = fixes.mapping[col.name] ?? (fileCols.includes(col.name) ? col.name : NONE);

  return (
    <div className="inset" style={{ padding: "10px 14px", borderLeft: `3px solid var(--${col.status === "ok" ? "success" : col.status === "warn" ? "warning" : "danger"})` }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <span title={st.label}>{st.icon}</span>
        <div className="col" style={{ gap: 0, minWidth: 150 }}>
          <b>{col.name}</b>
          <span className="tiny faint">
            {spec ? TYPE_LABEL[spec.type] : col.type}
            {spec?.type === "numeric" && spec.min !== undefined && spec.max !== undefined && <> · trained on {fmt(spec.min)} to {fmt(spec.max)}</>}
            {spec?.type === "categorical" && spec.categories && <> · {spec.categories.slice(0, 4).join(", ")}{spec.categories.length > 4 ? "…" : ""}</>}
          </span>
        </div>
        <span className="grow" />
        <span className="tiny muted">from your file:</span>
        <Select
          value={source}
          options={[{ value: NONE, label: "— not in my file —" }, ...fileCols.map((f) => ({ value: f, label: f }))]}
          onChange={onSource}
          style={{ minWidth: 170 }}
        />
      </div>

      {col.status === "missing" || (col.source === null && filling) ? (
        <div className="row wrap" style={{ gap: 8, marginTop: 8, paddingLeft: 30 }}>
          {col.suggestions?.map((s) => <button key={s} className="btn sm" onClick={() => onSource(s)}>Use “{s}”?</button>)}
          <span className="small muted">{col.suggestions?.length ? "or fill every row with" : "Fill every row with"}</span>
          <FillInput spec={spec} value={fill} placeholder={typical} onChange={onFill} />
          {!filling && typical !== undefined && typical !== "" && (
            <button className="btn sm ghost" onClick={() => onFill(typical)}>Use the typical value ({show(typical)})</button>
          )}
        </div>
      ) : null}

      {col.issues.filter((i) => i.kind !== "missing").length > 0 && (
        <div className="col" style={{ gap: 4, marginTop: 8, paddingLeft: 30 }}>
          {col.issues.filter((i) => i.kind !== "missing").map((i, k) => (
            <span key={k} className={i.level === "info" ? "small muted" : "small"}>
              {i.text}
              {i.examples && i.examples.length > 0 && i.kind !== "blanks" && <span className="muted"> e.g. {i.examples.map((e) => `“${e}”`).join(", ")}</span>}
            </span>
          ))}
        </div>
      )}

      {(cleanable || cleaned || (hasBlanks && col.status !== "missing")) && (
        <div className="row wrap" style={{ gap: 8, marginTop: 8, paddingLeft: 30 }}>
          {(cleanable || cleaned) && (
            <label className="row small" style={{ gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={cleaned} onChange={(e) => onClean(e.target.checked)} />
              {col.type === "numeric"
                ? <>Tidy the numbers (drop $ , % and spaces){cleanable && <> — fixes {cleanable.fixable!.toLocaleString()} row{cleanable.fixable === 1 ? "" : "s"}</>}</>
                : <>Match values ignoring capitals and spaces{cleanable && <> — fixes {cleanable.fixable!.toLocaleString()} row{cleanable.fixable === 1 ? "" : "s"}</>}</>}
              <InfoTip text={col.type === "numeric" ? "“$1,200” becomes 1200 and “(50)” becomes −50. Anything still not a number is treated as blank." : "“Online ” is read as “online” when the model knows “online”."} />
            </label>
          )}
          {hasBlanks && (blankOpen || filling ? (
            <span className="row small" style={{ gap: 6 }}>
              Fill the blanks with <FillInput spec={spec} value={fill} placeholder={typical} onChange={onFill} />
              {filling && <button className="btn sm ghost" onClick={() => { onFill(null); setBlankOpen(false); }}>✕</button>}
            </span>
          ) : (
            <button className="btn sm ghost" onClick={() => setBlankOpen(true)}>Choose a value for the blanks</button>
          ))}
        </div>
      )}
    </div>
  );
}

function FillInput({ spec, value, placeholder, onChange }: {
  spec?: InputSchemaItem;
  value: string | number | undefined;
  placeholder: string | number | undefined;
  onChange: (v: string | number | null) => void;
}) {
  if (spec?.type === "categorical" && spec.categories?.length) {
    return (
      <Select
        value={value === undefined ? NONE : String(value)}
        options={[{ value: NONE, label: "— pick one —" }, ...spec.categories.map((c) => ({ value: c, label: c }))]}
        onChange={(v) => onChange(v === NONE ? null : v)}
        style={{ minWidth: 140 }}
      />
    );
  }
  return (
    <input
      className="input"
      style={{ width: 140 }}
      type={spec?.type === "numeric" ? "number" : "text"}
      value={value ?? ""}
      placeholder={placeholder === undefined ? "" : show(placeholder)}
      onChange={(e) => onChange(e.target.value === "" ? null : spec?.type === "numeric" ? Number(e.target.value) : e.target.value)}
    />
  );
}

/** A few rows as the file has them, next to the numbers the model actually receives after the saved recipe. */
function ModelSees({ model, uploadId, fixes, ready }: { model: SavedModel; uploadId: string; fixes: FileFixes; ready: boolean }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ModelView | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !ready) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.modelView(model.id, uploadId, fixes)
        .then((v) => live && setView(v))
        .catch((e) => live && toast.error(e))
        .finally(() => live && setLoading(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, ready, fixes, model.id, uploadId]);

  return (
    <div className="inset" style={{ padding: "10px 14px" }}>
      <button className="row btn ghost sm" style={{ gap: 8, padding: 0 }} onClick={() => setOpen((o) => !o)}>
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }}>▸</span>
        <b>👀 What the model will see</b>
        <span className="tiny muted">your first rows, before and after the saved data recipe</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
            <div className="col" style={{ gap: 12, paddingTop: 12 }}>
              {!ready ? (
                <span className="small muted">Fix the missing columns first — then you can see exactly what goes in.</span>
              ) : !view ? (
                <div className="row" style={{ gap: 8 }}><Spinner size={14} color="var(--accent)" /><span className="small muted">Running the recipe…</span></div>
              ) : (
                <>
                  <MiniTable title="Your values (after your fixes)" cols={view.raw.columns} rows={view.raw.rows} dim={loading} />
                  {view.model ? (
                    <>
                      <div className="small muted" style={{ textAlign: "center" }}>
                        ↓ saved recipe: fill blanks{model.input_schema.some((s) => s.type === "categorical") ? ", turn categories into numbers" : ""}{model.pipeline?.scale?.method && model.pipeline.scale.method !== "none" ? `, ${model.pipeline.scale.method} scaling` : ""}
                        {model.pipeline?.feature_select?.method && model.pipeline.feature_select.method !== "none" ? ", keep the chosen features" : ""}
                        {model.pipeline?.reduce?.method === "pca" ? ", PCA" : ""} ↓
                      </div>
                      <MiniTable title="What the model gets" cols={view.model.columns} rows={view.model.rows} dim={loading} accent />
                    </>
                  ) : (
                    <span className="small muted">This kind of model reads its input directly, so there's no table of numbers to show.</span>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniTable({ title, cols, rows, dim, accent }: { title: string; cols: string[]; rows: any[][]; dim?: boolean; accent?: boolean }) {
  return (
    <div className="col" style={{ gap: 6, opacity: dim ? 0.55 : 1, transition: "opacity .2s" }}>
      <span className="tiny muted" style={accent ? { color: "var(--accent)" } : undefined}>{title}</span>
      <div style={{ overflow: "auto", maxHeight: 220 }}>
        <table className="table">
          <thead><tr>{cols.map((c) => <th key={c} style={accent ? { color: "var(--accent)" } : undefined}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((v, j) => <td key={j} className="num" style={accent ? { background: "var(--accent-soft)" } : undefined}>{show(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
