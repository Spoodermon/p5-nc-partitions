import { describe, expect, it, vi } from "vitest";
import { createAnnularRoute } from "../src/geometry/annular";
import { verifyAnnularRouteControlEdit, isEditableCoverCubic } from "../src/geometry/annular-routing";
import { executeAnnularTask, type AnnularTask } from "../src/production/annularTask";
import { packAnnularResult, unpackAnnularResult } from "../src/production/annularTransport";
import { AnnularWorkerClient, type AnnularWorkerMessage } from "../src/production/annularWorkerClient";

const input: AnnularTask = { kind: "input", p: "3", q: "2", notation: "(1 4)", interpretation: "strict-permutation" };

describe("annular background computation", () => {
  it("round-trips admitted geometry, samples, tangents and editable controls through structured clone", () => {
    const computed = executeAnnularTask(input);
    expect(computed.ok).toBe(true);
    if (!computed.ok) throw new Error(computed.message);
    const received = unpackAnnularResult(structuredClone(packAnnularResult(computed)));
    if (!received.ok) throw new Error(received.message);
    expect(received.accepted.routed.diagnostics).toEqual(computed.accepted.routed.diagnostics);
    for (const [index, candidate] of received.accepted.routed.routes.entries()) {
      const original = computed.accepted.routed.routes[index]!;
      expect(candidate.samples).toEqual(original.samples);
      expect(Object.isFrozen(candidate.samples[0])).toBe(true);
      for (const t of [0, 0.13, 0.5, 0.79, 1]) {
        expect(candidate.route.pointAt(t)).toEqual(original.route.pointAt(t));
        expect(candidate.route.tangentAt(t)).toEqual(original.route.tangentAt(t));
      }
    }
    const editable = received.accepted.routed.routes.find(isEditableCoverCubic)!;
    expect(verifyAnnularRouteControlEdit(received.accepted.routed, editable.edge.id, {
      control1: editable.route.controlPoints[1], control2: editable.route.controlPoints[2],
    }).ok).toBe(true);
  });

  it("also preserves the analytical bump family used by routing helpers", () => {
    const computed = executeAnnularTask(input);
    if (!computed.ok) throw new Error(computed.message);
    const routed = computed.accepted.routed;
    const candidate = routed.routes[0]!;
    const route = createAnnularRoute(routed.layout, { startLabel: candidate.edge.startLabel, endLabel: candidate.edge.endLabel, winding: 0 });
    const withBump = { ...computed, accepted: { ...computed.accepted, routed: { ...routed, routes: [{ ...candidate, route, routeFamily: "analytical-bump" as const }] } } };
    const restored = unpackAnnularResult(structuredClone(packAnnularResult(withBump)));
    if (!restored.ok) throw new Error(restored.message);
    expect(restored.accepted.routed.routes[0]!.route.pointAt(0.37)).toEqual(route.pointAt(0.37));
  });

  it("keeps validation failures, complement semantics and strict random constraints", () => {
    const invalid = executeAnnularTask({ kind: "input", p: "2", q: "2", notation: "(1 3 2 4)", interpretation: "strict-permutation" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.message).toContain("not annular-noncrossing");
    const random = executeAnnularTask({ kind: "random", p: 4, q: 3, mode: "sparse", singletonCycles: "forbid" }, () => {}, () => 0.999999);
    if (!random.ok) throw new Error(random.message);
    expect(random.message).toContain("singleton-free");
    expect(random.accepted.routed.routes.every((route) => route.edge.cycleLength >= 2)).toBe(true);
    const complement = executeAnnularTask({ kind: "complement", permutation: random.accepted.permutation });
    expect(complement.ok).toBe(true);
  });
});

class TestWorker {
  onmessage: ((event: MessageEvent<AnnularWorkerMessage>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  send(data: AnnularWorkerMessage): void { this.onmessage?.({ data } as MessageEvent<AnnularWorkerMessage>); }
}

describe("annular worker ownership", () => {
  it("terminates cancelled and superseded searches and ignores their late messages", async () => {
    const workers: TestWorker[] = [];
    const client = new AnnularWorkerClient(() => { const worker = new TestWorker(); workers.push(worker); return worker as unknown as Worker; });
    const oldProgress = vi.fn();
    const first = client.run(input, oldProgress);
    const second = client.run(input);
    expect(await first).toBeNull();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    workers[0]!.send({ id: 1, kind: "progress", message: "obsolete" });
    workers[0]!.send({ id: 1, kind: "result", result: { ok: false, message: "obsolete" } });
    expect(oldProgress).not.toHaveBeenCalled();
    workers[1]!.send({ id: 2, kind: "result", result: { ok: false, message: "current rejection" } });
    expect(await second).toEqual({ ok: false, message: "current rejection" });
    expect(workers[1]!.terminate).toHaveBeenCalledOnce();
    const third = client.run(input);
    client.cancel();
    expect(await third).toBeNull();
    expect(workers[2]!.terminate).toHaveBeenCalledOnce();
  });

  it("settles failed worker startup and crashes without a synchronous fallback", async () => {
    const unavailable = new AnnularWorkerClient(() => { throw new Error("blocked"); });
    expect((await unavailable.run(input))?.ok).toBe(false);
    const worker = new TestWorker();
    const client = new AnnularWorkerClient(() => worker as unknown as Worker);
    const pending = client.run(input);
    worker.onerror?.();
    expect((await pending)?.ok).toBe(false);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
