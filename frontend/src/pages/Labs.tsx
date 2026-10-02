import { EmptyState } from "../components/glass";

/** Labs gallery (stub — built by the Labs UI agent). */
export function LabsPage() {
  return <EmptyState icon="🧪" title="Labs" text="Coming soon." />;
}

/** One lab (stub). */
export function LabPage({ labId }: { labId: string }) {
  return <EmptyState icon="🧪" title={labId} text="Coming soon." />;
}
