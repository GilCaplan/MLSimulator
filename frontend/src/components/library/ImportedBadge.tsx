import type { SavedModel } from "../../lib/types";
import { Tooltip } from "../glass";

/** Import info that the backend writes into an imported model's meta (not part of the shared SavedModel type yet). */
export interface ImportInfo { imported_at: number; imported_signed: boolean }

/** Local type guard: does this saved model carry import info? */
export function importInfo(m: SavedModel): ImportInfo | null {
  const x = m as SavedModel & { imported_at?: unknown; imported_signed?: unknown };
  if (typeof x.imported_at !== "number") return null;
  return { imported_at: x.imported_at, imported_signed: x.imported_signed === true };
}

/** "📥 Imported" badge, plus an "unverified source" badge when the bundle wasn't signed by this computer. */
export function ImportedBadge({ model, compact }: { model: SavedModel; compact?: boolean }) {
  const info = importInfo(model);
  if (!info) return null;
  const when = new Date(info.imported_at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return (
    <>
      <Tooltip width={220} content={<>Brought in from an exported file on {when}.{info.imported_signed ? " It was exported from this computer, so it's the same model you saved." : ""}</>}>
        <span className="badge accent">📥 Imported</span>
      </Tooltip>
      {!info.imported_signed && (
        <Tooltip width={260} content="This file wasn't exported from this computer, so ML Playground can't confirm where it came from. You chose to trust it when you imported it.">
          <span className="badge warning">⚠︎ {compact ? "unverified" : "unverified source"}</span>
        </Tooltip>
      )}
    </>
  );
}
