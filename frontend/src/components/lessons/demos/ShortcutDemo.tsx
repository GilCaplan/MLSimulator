import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Segmented, Toggle } from "../../glass";
import { useSize } from "../../charts";
import { withAlpha } from "../../../lib/colors";
import { spring } from "../../../design/motion";
import type { DemoProps } from "./index";
import { C, DemoFrame, Legend, MeterBar, gauss, pct, rng, useDone } from "./shared";

type World = "train" | "screen";
interface Patient { id: number; sick: boolean; honest: boolean; clinic: Record<World, number> }

const CLINICS = [
  { icon: "🫀", name: "Cardiology Centre" },
  { icon: "🏥", name: "City Clinic" },
  { icon: "🩺", name: "Northside GP" },
];
const N = 90;

function makePatients(): Patient[] {
  const r = rng(41);
  const out: Patient[] = [];
  for (let i = 0; i < N; i++) {
    const risk = gauss(r); // age + blood pressure, summarised
    const sick = risk + 0.75 * gauss(r) > 0.35;
    // Referral network: suspected heart patients get sent to Cardiology.
    const toCardio = sick ? r() < 0.86 : r() < 0.08;
    const trainClinic = toCardio ? 0 : r() < 0.5 ? 1 : 2;
    // Screening programme: everyone could end up anywhere.
    const screenClinic = Math.floor(r() * 3);
    out.push({ id: i, sick, honest: risk > 0.3, clinic: { train: trainClinic, screen: screenClinic } });
  }
  return out;
}

export function ShortcutDemo({ onDone }: DemoProps) {
  const done = useDone(onDone);
  const patients = useMemo(makePatients, []);
  const [shortcut, setShortcut] = useState(true);
  const [world, setWorld] = useState<World>("train");

  const acc = useMemo(() => {
    const score = (w: World, useClinic: boolean) => patients.filter((p) => (useClinic ? p.clinic[w] === 0 : p.honest) === p.sick).length / N;
    return { shortTrain: score("train", true), shortScreen: score("screen", true), honestTrain: score("train", false), honestScreen: score("screen", false) };
  }, [patients]);
  const shortAcc = world === "train" ? acc.shortTrain : acc.shortScreen;
  const honestAcc = world === "train" ? acc.honestTrain : acc.honestScreen;

  const caption = world === "train"
    ? shortcut
      ? <>In the referral network, "sent to Cardiology" almost <i>means</i> "sick" — so the clinic-using model scores <b>{pct(acc.shortTrain)}</b> without learning any medicine.</>
      : <>Without the clinic, the model has to read age and blood pressure: <b>{pct(acc.honestTrain)}</b>. Less impressive, but it learned something real.</>
    : shortcut
      ? <>In the screening programme everyone visits every clinic, so the clinic says nothing about the heart. The shortcut model collapses to <b>{pct(acc.shortScreen)}</b> — no better than flipping a coin.</>
      : <>Age and blood pressure work the same everywhere: the honest model holds at <b>{pct(acc.honestScreen)}</b> in the new setting.</>;

  return (
    <DemoFrame
      controls={
        <>
          <Segmented value={world} onChange={(w) => { setWorld(w); if (w === "screen") done(); }} options={[
            { value: "train", label: "🏢 Training hospital network" },
            { value: "screen", label: "🌍 New screening programme" },
          ]} />
          <Toggle label="Model may use the clinic" checked={shortcut} onChange={(v) => { setShortcut(v); done(); }} />
        </>
      }
      caption={caption}
      captionKey={`${world}-${shortcut}`}
    >
      <div className="inset col" style={{ padding: 12, gap: 8 }}>
        <Rooms patients={patients} world={world} shortcut={shortcut} />
        <Legend items={[
          { color: C.pos, label: "Has heart disease" },
          { color: C.neg, label: "Healthy" },
          { color: "var(--danger)", label: "Faded with ring = the model got it wrong", shape: "ring" },
        ]} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <div className="inset" style={{ padding: 14, boxShadow: shortcut ? `0 0 0 2px ${C.purple} inset` : undefined, transition: "box-shadow .3s" }}>
          <MeterBar label="🪤 Model that uses the clinic" value={shortAcc} color={shortAcc < 0.65 ? C.pos : C.purple} dim={!shortcut}
            note={world === "screen" ? `was ${pct(acc.shortTrain)} in the training network` : "accuracy in this world"} />
        </div>
        <div className="inset" style={{ padding: 14, boxShadow: !shortcut ? `0 0 0 2px ${C.ok} inset` : undefined, transition: "box-shadow .3s" }}>
          <MeterBar label="🩺 Model that uses age & blood pressure" value={honestAcc} color={C.ok} dim={shortcut}
            note={world === "screen" ? `was ${pct(acc.honestTrain)} in the training network` : "accuracy in this world"} />
        </div>
      </div>
    </DemoFrame>
  );
}

function Rooms({ patients, world, shortcut }: { patients: Patient[]; world: World; shortcut: boolean }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const gap = 10, pad = 10, sp = width < 640 ? 15 : 18;
  const roomW = (width - 2 * gap) / 3;
  const compact = roomW < 250;
  const header = compact ? 70 : 54;
  const cols = Math.max(4, Math.floor((roomW - 2 * pad) / sp));

  // Slots inside each room, per world (sick patients first so colour clusters are easy to read).
  const layout = useMemo(() => {
    const slot = new Map<number, number>();
    const counts = [0, 0, 0];
    let maxCount = 0;
    for (const w of ["train", "screen"] as World[]) {
      for (let c = 0; c < 3; c++) {
        const inRoom = patients.filter((p) => p.clinic[w] === c).sort((a, b) => Number(b.sick) - Number(a.sick) || a.id - b.id);
        maxCount = Math.max(maxCount, inRoom.length);
        if (w === world) { inRoom.forEach((p, i) => slot.set(p.id, i)); counts[c] = inRoom.length; }
      }
    }
    return { slot, counts, maxCount };
  }, [patients, world]);

  const rows = Math.ceil(layout.maxCount / cols);
  const height = header + rows * sp + pad + 4;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height }}>
      {width > 0 && CLINICS.map((c, i) => {
        const sickHere = patients.filter((p) => p.clinic[world] === i && p.sick).length;
        return (
          <div key={c.name} style={{ position: "absolute", left: i * (roomW + gap), top: 0, width: roomW, height, borderRadius: 14, background: "var(--glass-strong)", border: "1px solid var(--hairline)" }}>
            <div className="row" style={{ gap: 6, padding: "7px 10px 0", fontSize: 12.5, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden" }}>
              <span>{c.icon}</span><span className="truncate">{c.name}</span>
            </div>
            <div className="row tiny" style={{ gap: 6, padding: "2px 10px 0", whiteSpace: "nowrap", flexDirection: compact ? "column" : "row", alignItems: compact ? "flex-start" : "center", rowGap: 1 }}>
              <span className="faint num">{layout.counts[i]} {compact ? "" : "patients "}· {Math.round((sickHere / Math.max(1, layout.counts[i])) * 100)}% sick</span>
              <AnimatePresence>
                {shortcut && (
                  <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring.pop}
                    style={{ marginLeft: compact ? 0 : "auto", fontWeight: 700, color: i === 0 ? C.pos : C.neg }}>
                    model says: {i === 0 ? "sick" : "healthy"}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
      {width > 0 && patients.map((p) => {
        const room = p.clinic[world];
        const s = layout.slot.get(p.id) ?? 0;
        const x = room * (roomW + gap) + pad + (s % cols) * sp + sp / 2;
        const y = header + Math.floor(s / cols) * sp + sp / 2;
        const pred = shortcut ? room === 0 : p.honest;
        const wrong = pred !== p.sick;
        const col = p.sick ? C.pos : C.neg;
        const r = sp * 0.36;
        return (
          <div key={p.id} title={`${p.sick ? "Has heart disease" : "Healthy"} · model says ${pred ? "sick" : "healthy"}`}
            style={{
              position: "absolute", left: 0, top: 0, width: r * 2, height: r * 2, borderRadius: r,
              transform: `translate(${x - r}px, ${y - r}px)`,
              transition: `transform .9s cubic-bezier(.32,.72,0,1) ${(p.id % 30) * 16}ms, background .35s, box-shadow .35s`,
              background: wrong ? withAlpha(col, 0.22) : col,
              boxShadow: wrong ? `0 0 0 1.6px ${withAlpha("#FF453A", 0.95)}` : `0 1px 3px ${withAlpha(col, 0.4)}`,
            }} />
        );
      })}
    </div>
  );
}
