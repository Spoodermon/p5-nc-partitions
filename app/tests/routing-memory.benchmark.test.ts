import { describe, expect, it } from "vitest";
// @ts-expect-error The browser application intentionally has no dependency on Node typings.
import { spawnSync } from "node:child_process";

declare const process: { readonly execPath: string };

const MEBIBYTE = 1024 * 1024;
// The isolated Vite/Node worker has a substantial baseline of its own. A
// 64 MiB routing allowance leaves allocator/runner headroom while still
// catching the prior 88/291 MiB routing regressions.
const MAXIMUM_PEAK_RSS = 256 * MEBIBYTE;
const MAXIMUM_BASELINE_TO_PEAK_GROWTH = 96 * MEBIBYTE;
const MAXIMUM_OPERATION_HIGH_WATER_GROWTH = 64 * MEBIBYTE;
const worker = decodeURIComponent(new URL("../scripts/routing-memory-worker.mjs", import.meta.url).pathname);
const appRoot = decodeURIComponent(new URL("../", import.meta.url).pathname);

interface MemoryReport {
  readonly scenario: string;
  readonly p: number;
  readonly q: number;
  readonly isRoutable: boolean;
  readonly reason: string | null;
  readonly elapsedMilliseconds: number;
  readonly baselineRssBytes: number;
  readonly baselineMaximumRssBytes: number;
  readonly rssAfterRouteBytes: number;
  readonly peakRssBytes: number;
  readonly baselineToPeakRssBytes: number;
  readonly operationHighWaterGrowthBytes: number;
  readonly materializedRouteCandidateCount: number;
  readonly materializedSamplePointCount: number;
  readonly maxMaterializedRouteCandidates: number;
  readonly maxMaterializedSamplePoints: number;
  readonly policyMaterializedRouteCandidates: number;
  readonly policyMaterializedSamplePoints: number;
  readonly searchedCandidateCount: number;
  readonly searchNodes: number;
  readonly maxSearchNodes: number;
  readonly publicMaximumCandidatesPerEdge: number;
  readonly requestedCandidatesPerEdge: number;
  readonly heuristicSampleCount: number;
  readonly mebibytes: {
    readonly peak: number;
    readonly baselineToPeak: number;
  };
}

function runScenario(scenario: string): MemoryReport {
  const child = spawnSync(process.execPath, ["--expose-gc", worker, scenario], {
    cwd: appRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Memory worker ${scenario} exited ${String(child.status)}\nstdout:\n${child.stdout}\nstderr:\n${child.stderr}`);
  }
  const lines = String(child.stdout).trim().split(/\r?\n/);
  const report = JSON.parse(lines[lines.length - 1] ?? "") as MemoryReport;
  console.info(
    `Routing memory ${scenario}: peak ${report.mebibytes.peak.toFixed(1)} MiB, `
      + `baseline-to-peak ${report.mebibytes.baselineToPeak.toFixed(1)} MiB, `
      + `operation high-water ${(report.operationHighWaterGrowthBytes / MEBIBYTE).toFixed(1)} MiB, `
      + `${report.materializedRouteCandidateCount} routes/${report.materializedSamplePointCount} points, `
      + `${report.elapsedMilliseconds.toFixed(1)} ms`,
  );
  return report;
}

function expectBoundedDiagnostics(report: MemoryReport) {
  expect(Number.isSafeInteger(report.materializedRouteCandidateCount)).toBe(true);
  expect(Number.isSafeInteger(report.materializedSamplePointCount)).toBe(true);
  expect(report.materializedRouteCandidateCount).toBeGreaterThan(0);
  expect(report.materializedSamplePointCount).toBeGreaterThan(0);
  expect(report.materializedRouteCandidateCount).toBeLessThanOrEqual(report.maxMaterializedRouteCandidates);
  expect(report.materializedSamplePointCount).toBeLessThanOrEqual(report.maxMaterializedSamplePoints);
  expect(report.maxMaterializedRouteCandidates).toBe(report.policyMaterializedRouteCandidates);
  expect(report.maxMaterializedSamplePoints).toBe(report.policyMaterializedSamplePoints);
  expect(report.searchedCandidateCount).toBeLessThanOrEqual(report.materializedRouteCandidateCount);
  expect(report.searchNodes).toBeLessThanOrEqual(report.maxSearchNodes);
  expect(report.peakRssBytes).toBeGreaterThanOrEqual(report.baselineRssBytes);
  expect(report.peakRssBytes).toBeGreaterThanOrEqual(report.rssAfterRouteBytes);
  expect(report.peakRssBytes).toBeLessThan(MAXIMUM_PEAK_RSS);
  expect(report.baselineToPeakRssBytes).toBeLessThan(MAXIMUM_BASELINE_TO_PEAK_GROWTH);
  expect(report.operationHighWaterGrowthBytes).toBeLessThan(MAXIMUM_OPERATION_HIGH_WATER_GROWTH);
}

describe("isolated routing memory governor", () => {
  it("rejects the admitted 12+12 stress request within production-default resource limits", () => {
    const report = runScenario("admitted-default");
    expect(report.p + report.q).toBe(24);
    expect(report.requestedCandidatesPerEdge).toBeLessThanOrEqual(report.publicMaximumCandidatesPerEdge);
    expect(report.isRoutable).toBe(false);
    expect(report.reason).toBe("search-limit-exceeded");
    expectBoundedDiagnostics(report);
  }, 150_000);

  it("bounds a one-node request at the public candidate and sample maxima", () => {
    const report = runScenario("maximum-public-options");
    expect(report.requestedCandidatesPerEdge).toBe(report.publicMaximumCandidatesPerEdge);
    expect(report.maxSearchNodes).toBe(1);
    expect(report.searchNodes).toBeLessThanOrEqual(1);
    expect(report.materializedRouteCandidateCount).toBeLessThanOrEqual(report.p + report.q);
    expect(report.materializedSamplePointCount).toBeLessThanOrEqual((report.p + report.q) * report.heuristicSampleCount);
    expectBoundedDiagnostics(report);
  }, 150_000);
});
