/* One server lab run at a time: start → stream `lab.*` events over SSE → fetch the result. Local to the component that
 * owns it (unlike the global `useJob` store), and cancels its job when that component unmounts. */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { JobEvent } from "../../lib/types";

export type LabStatus = "idle" | "starting" | "running" | "stopping" | "finished" | "failed" | "cancelled";

export const isBusy = (s: LabStatus) => s === "starting" || s === "running" || s === "stopping";

export function useLabJob<R>(lab: string, onEvent: (ev: JobEvent) => void) {
  const [status, setStatus] = useState<LabStatus>("idle");
  const [result, setResult] = useState<R | null>(null);
  const [error, setError] = useState<string | undefined>();
  const es = useRef<EventSource | null>(null);
  const jobId = useRef<string | null>(null);
  const statusRef = useRef<LabStatus>("idle");
  const alive = useRef(true);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  const set = (s: LabStatus) => { statusRef.current = s; setStatus(s); };
  const close = () => { es.current?.close(); es.current = null; };

  const start = useCallback(async (params: Record<string, any>) => {
    if (isBusy(statusRef.current)) return;
    set("starting");
    setResult(null);
    setError(undefined);
    try {
      const { job_id } = await api.runLab(lab, params);
      if (!alive.current) { api.cancelJob(job_id).catch(() => {}); return; } // left the page while it was starting
      jobId.current = job_id;
      if ((statusRef.current as LabStatus) === "stopping") { await api.cancelJob(job_id).catch(() => {}); }
      else set("running");
      let lastSeq = -1;
      const src = new EventSource(`/api/jobs/${job_id}/events`);
      es.current = src;
      src.onmessage = (msg) => {
        if (jobId.current !== job_id) return;
        let ev: JobEvent;
        try { ev = JSON.parse(msg.data); } catch { return; }
        if (typeof ev.seq === "number") {
          if (ev.seq <= lastSeq) return; // replayed after a reconnect
          lastSeq = ev.seq;
        }
        switch (ev.type) {
          case "job.finished":
            close();
            api.labResult<R>(job_id)
              .then((r) => { if (jobId.current === job_id) { setResult(r); set("finished"); } })
              .catch((e) => { if (jobId.current === job_id) { setError(e instanceof Error ? e.message : String(e)); set("failed"); } });
            break;
          case "job.failed":
            close();
            setError(ev.data?.error || "The run failed.");
            set("failed");
            break;
          case "job.cancelled":
            close();
            set("cancelled");
            break;
          default:
            handler.current(ev);
        }
      };
      src.onerror = () => {
        // EventSource reconnects on its own; give up only once the run is over
        if (!isBusy(statusRef.current)) close();
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      set("failed");
    }
  }, [lab]);

  const cancel = useCallback(async () => {
    if (!isBusy(statusRef.current)) return;
    set("stopping");
    const id = jobId.current;
    if (id) {
      try { await api.cancelJob(id); } catch { close(); set("cancelled"); }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      close();
      if (isBusy(statusRef.current) && jobId.current) api.cancelJob(jobId.current).catch(() => {});
      jobId.current = null;
    };
  }, []);

  return { status, result, error, start, cancel, busy: isBusy(status), setResult };
}
