import { executeAnnularTask } from "./annularTask";
import { packAnnularResult } from "./annularTransport";
import type { AnnularWorkerMessage, AnnularWorkerRequest } from "./annularWorkerClient";

const scope = self as unknown as {
  onmessage: (event: MessageEvent<AnnularWorkerRequest>) => void;
  postMessage: (message: AnnularWorkerMessage) => void;
};
scope.onmessage = ({ data: { id, task } }) => {
  try {
    const result = executeAnnularTask(task, (message) => scope.postMessage({ id, kind: "progress", message }));
    scope.postMessage({ id, kind: "result", result: packAnnularResult(result) });
  } catch {
    scope.postMessage({ id, kind: "result", result: { ok: false, message: "Background routing encountered an unexpected failure; the previous diagram was retained." } });
  }
};
