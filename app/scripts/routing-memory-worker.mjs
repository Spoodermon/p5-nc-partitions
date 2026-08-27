import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const MEBIBYTE = 1024 * 1024;

const scenarios = Object.freeze({
  "admitted-default": Object.freeze({
    p: 12,
    q: 12,
    notation: `(${Array.from({ length: 24 }, (_, index) => index + 1).join(" ")})`,
    options: () => Object.freeze({}),
  }),
  "maximum-public-options": Object.freeze({
    p: 20,
    q: 1,
    notation: `(${Array.from({ length: 20 }, (_, index) => index + 1).join(" ")})(21)`,
    options: (policy) => Object.freeze({
      maxSearchNodes: 1,
      maxCandidatesPerEdge: policy.maximumCandidatesPerEdge,
      sampleCount: policy.maximumRenderSampleCount,
    }),
  }),
});

function maximumRssBytes() {
  // Node reports resourceUsage().maxRSS in KiB on every supported platform.
  return process.resourceUsage().maxRSS * 1024;
}

function collectGarbage() {
  if (typeof globalThis.gc !== "function") {
    throw new Error("routing-memory-worker must run under Node with --expose-gc");
  }
  // Two collections release both newly unreachable module-loader objects and
  // weak references queued by the first collection before taking the baseline.
  globalThis.gc();
  globalThis.gc();
}

const scenarioName = process.argv[2];
const scenario = scenarios[scenarioName];
if (!scenario) {
  throw new Error(`Unknown routing memory scenario: ${scenarioName ?? "<missing>"}`);
}

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  appType: "custom",
  clearScreen: false,
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  logLevel: "silent",
  root: appRoot,
  server: { middlewareMode: true },
});

let math;
let routing;
let routingPolicy;
try {
  [math, routing, routingPolicy] = await Promise.all([
    server.ssrLoadModule("/src/math/index.ts"),
    server.ssrLoadModule("/src/geometry/annular-routing/index.ts"),
    server.ssrLoadModule("/src/config/routingPolicy.ts"),
  ]);
} finally {
  await server.close();
}

const parsed = math.parseAnnularPermutation(scenario.notation, scenario.p, scenario.q);
if (!parsed.ok) {
  throw new Error(`Memory fixture was not admitted: ${parsed.error.kind}`);
}

const policy = routingPolicy.ROUTING_POLICY;
const options = scenario.options(policy);
if (scenarioName === "maximum-public-options" && !Number.isInteger(options.maxCandidatesPerEdge)) {
  throw new Error("ROUTING_POLICY.maximumCandidatesPerEdge must be an integer");
}

collectGarbage();
const baselineRssBytes = process.memoryUsage().rss;
const baselineMaximumRssBytes = maximumRssBytes();
const started = performance.now();
const result = routing.routeAnnularPermutation(parsed.value, options);
const elapsedMilliseconds = performance.now() - started;
const rssAfterRouteBytes = process.memoryUsage().rss;
const peakRssBytes = maximumRssBytes();
const diagnostics = result.diagnostics;

const report = {
  scenario: scenarioName,
  p: scenario.p,
  q: scenario.q,
  isRoutable: result.isRoutable,
  reason: result.isRoutable ? null : result.reason,
  elapsedMilliseconds,
  baselineRssBytes,
  baselineMaximumRssBytes,
  rssAfterRouteBytes,
  peakRssBytes,
  baselineToPeakRssBytes: Math.max(0, peakRssBytes - baselineRssBytes),
  operationHighWaterGrowthBytes: Math.max(0, peakRssBytes - baselineMaximumRssBytes),
  materializedRouteCandidateCount: diagnostics.materializedRouteCandidateCount,
  materializedSamplePointCount: diagnostics.materializedSamplePointCount,
  maxMaterializedRouteCandidates: diagnostics.maxMaterializedRouteCandidates,
  maxMaterializedSamplePoints: diagnostics.maxMaterializedSamplePoints,
  policyMaterializedRouteCandidates: policy.maxMaterializedRouteCandidates,
  policyMaterializedSamplePoints: policy.maxMaterializedSamplePoints,
  searchedCandidateCount: diagnostics.searchedCandidateCount,
  searchNodes: diagnostics.searchNodes,
  maxSearchNodes: diagnostics.maxSearchNodes,
  publicMaximumCandidatesPerEdge: policy.maximumCandidatesPerEdge,
  requestedCandidatesPerEdge: options.maxCandidatesPerEdge ?? policy.maxCandidatesPerEdge,
  heuristicSampleCount: policy.heuristicSampleCount,
  mebibytes: {
    peak: peakRssBytes / MEBIBYTE,
    baselineToPeak: Math.max(0, peakRssBytes - baselineRssBytes) / MEBIBYTE,
  },
};

process.stdout.write(`${JSON.stringify(report)}\n`);
