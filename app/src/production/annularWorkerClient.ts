import type { AnnularTask, AnnularTaskResult } from "./annularTask";
import { unpackAnnularResult, type TransportTaskResult } from "./annularTransport";

export interface AnnularWorkerRequest { readonly id: number; readonly task: AnnularTask }
export type AnnularWorkerMessage =
  | { readonly id: number; readonly kind: "progress"; readonly message: string }
  | { readonly id: number; readonly kind: "result"; readonly result: TransportTaskResult };

/** One owned worker per active request: terminate() also cancels synchronous search. */
export class AnnularWorkerClient {
  private nextId = 0;
  private pending: { worker: Worker; finish: (result: AnnularTaskResult | null) => void } | null = null;

  constructor(private readonly createWorker = () => new Worker(new URL("./annular.worker.ts", import.meta.url), { type: "module" })) {}

  cancel(): void { this.pending?.finish(null); }

  run(task: AnnularTask, progress: (message: string) => void = () => {}): Promise<AnnularTaskResult | null> {
    this.cancel();
    const id = ++this.nextId;
    return new Promise((resolve) => {
      let worker: Worker;
      try { worker = this.createWorker(); } catch {
        resolve({ ok: false, message: "Background routing could not start; the previous diagram was retained. Reload and try again." });
        return;
      }
      const pending = {
        worker,
        finish: (result: AnnularTaskResult | null) => {
          if (this.pending !== pending) return;
          this.pending = null;
          worker.terminate();
          resolve(result);
        },
      };
      this.pending = pending;
      const fail = () => pending.finish({ ok: false, message: "Background routing failed; the previous diagram was retained. Try again." });
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.onmessage = (event: MessageEvent<AnnularWorkerMessage>) => {
        if (this.pending !== pending || event.data.id !== id) return;
        if (event.data.kind === "progress") { progress(event.data.message); return; }
        try { pending.finish(unpackAnnularResult(event.data.result)); } catch { fail(); }
      };
      try { worker.postMessage({ id, task } satisfies AnnularWorkerRequest); } catch { fail(); }
    });
  }
}
