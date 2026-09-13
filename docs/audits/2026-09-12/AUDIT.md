# Permutation Visualizer — audit and SWOT

**Follow-up:** The seven priorities below were addressed on 13 September; see the [remediation notes](../2026-09-13/REMEDIATION.md) for changes, verification and remaining limits. This report preserves the original audit snapshot.

**Date:** 12 September 2026

**Scope:** Current working tree, based on commit `ebd0e5c`, including the 23 modified tracked files and three untracked implementation/test files present when this review started. Findings describe that snapshot, not necessarily the deployed site. Application source was not changed during the audit.

## Assessment

This is a focused mathematical diagram editor with a strong computational foundation. Its most valuable work is the separation of mathematical validity from geometric routeability, bounded annular routing, analytical clearance verification, and editable vector output. The ordinary diagram experience is clean and the verification suite is substantial for the project’s size.

The next priority should be making the application’s visible behavior match those guarantees. Passing geometry checks currently does not always produce readable figures. Canonical block interpretation, validation messages, export styling, and production preview also have reproducible defects. I would fix the first two findings before expanding the supported sizes or presenting canonical output as reproducible.

## What the project does and how it is organized

The production application is a static TypeScript/Vite application using SVG.js. It has no application backend, account system, or runtime data service. Four direct runtime dependencies provide SVG rendering and three embedded font families. GitHub Actions builds and deploys to GitHub Pages. The historical p5 application is isolated under `legacy/p5/` and excluded from production.

The current source contains 60 TypeScript files and approximately 7,613 lines, including developer laboratories. Tests and browser specifications contain approximately 4,283 lines.

| Layer | Responsibility | Assessment |
|---|---|---|
| `math/` | Partition/permutation parsing, noncrossing predicates, complements, enumeration and random generation | Clear conventions, small functions, substantial invariant testing |
| `geometry/` | Disc cubics, annular cover coordinates, candidate search, clearance and editing | The main technical asset; also the largest concentration of complexity |
| `production/` | Annular input interpretation, bounded random attempts and accepted state | Useful boundary between mathematical acceptance and routing failure |
| `renderer/` | SVG elements, selection, curve controls, fonts and export | Shared live/export geometry is a sound choice; visual behavior still depends partly on external CSS |
| `main.ts` | Forms, mode switching, status, caches, history and redraws | At 673 lines, it now carries enough independent state to merit splitting into controllers |

Disc input represents unordered set partitions; annular strict input represents oriented permutations. Both use the stated complement convention, `K(τ) = τ⁻¹γ`. The annular cycle-count equalities match Theorem 6.1 of [Mingo and Nica](https://arxiv.org/pdf/math/0303312). Their distinction between annular partitions and permutations also explains why a block-set mode needs an explicit representative-selection policy.

## Verification performed

All existing verification tiers passed locally on Node 22.17.0. This is evidence for the audited working tree, not a claim about remote CI status.

| Check | Result |
|---|---|
| `npm test` | 224 tests passed across 27 files |
| `npm run test:slow` | 28 tests passed |
| `npm run test:browser` | 21 Chromium tests passed |
| `npm run test:exhaustive` | Routing sweep through total annular support 5 passed |
| `npm run benchmark` | All three timing/memory checks passed |
| `npm run build` | Type checking, production bundling and distribution verification passed |
| `npm audit --json` | Zero known vulnerabilities reported for the locked dependency graph |
| Additional browser probes | Reproduced findings 1–5 and measured synchronous work |
| Production-preview smoke | Failed with the default preview configuration; passed with the intended base path explicitly supplied |

The test corpus includes mathematical enumeration through total annular support 8, disc geometry enumeration through support 8, non-finite inputs, resource exhaustion, editing rollback, responsive controls, and embedded-font exports. These are meaningful checks, not merely snapshots of ordinary examples.

Representative local router timings were approximately 38 ms for the ordinary fixture, 42 ms for the Mingo–Nica fixture, and 83 ms for the larger fixture. The 12+12 memory stress case rejected within its resource limits, using about 40 MiB above baseline at its operation high-water mark. These are single-machine diagnostics, not mobile latency guarantees. The built JavaScript was approximately 461 kB, or 255 kB gzip, including inline fonts.

## Prioritized findings

Priority meanings: **P1** should be addressed before relying on the affected feature; **P2** is an important defect or engineering risk to schedule next. No critical security vulnerability was identified in this review.

### 1. P1 — Canonical block mode depends on the order typed inside a block

**Confirmed:** With `p=2`, `q=2`, and interpretation `canonical-blocks`, `(1 2 3 4)` resolves to itself, while `(1 2 4 3)` resolves to itself. Both requests succeed. These inputs describe the same single unordered block but produce different oriented permutations and therefore different complements.

`orientedCycles()` tries the supplied order before the sorted order. The search stops at the first mathematically admissible result. It is deterministic for a particular string, but it is not canonical over block supports. The existing equal-support test uses a case where one orientation is rejected and therefore does not expose this ambiguity.

**Action:** Build the candidate order entirely from sorted block supports, with a documented tie-break. If preserving a valid typed orientation is intentional, rename the feature to describe that behavior instead of promising canonical block interpretation. Add a regression covering multiple valid orientations of the same support.

**Evidence:** [Candidate ordering](../../../app/src/production/annularController.ts#L103), [existing test](../../../app/tests/production-controller.test.ts#L104), [probe results](evidence/permutation-audit-probe-results.json).

### 2. P1 — Disc diagrams above 64 edges silently lose visible loops and separate lanes

**Confirmed:** Rendering the 66-label partition `(1 2)(3 4)…(65 66)` succeeds, but the first two-cycle’s midpoint separation is only **0.052 viewBox units**. At the measured 700-pixel figure width, that is about **0.036 pixels**, against a **3.4-pixel stroke**. The two directed edges visually merge. Rendering 65 singleton blocks produces a first loop approximately **0.008 × 0.056 viewBox units**, effectively hidden beneath its vertex.

For more than 64 edges, `maximumBackoffs` becomes `-1`, so the normal style is never admitted through that loop. The fallback deliberately shrinks lanes and singleton geometry. It achieves geometric separation at the expense of legibility, without notifying the user. This affects inputs well below the advertised support ceiling of 400.

**Action:** Treat readability as a separate acceptance condition. Preserve visible lanes and loops when space permits, and use an explicit dense-diagram presentation or explain a readability limit when it does not. Add browser assertions for visible separation and loop size around the 64/65 transition. Do not weaken collision verification to obtain broader curves.

**Evidence:** [Threshold](../../../app/src/geometry/disc-editing.ts#L236), [fallback](../../../app/src/geometry/disc-editing.ts#L291), [dense-diagram screenshot](evidence/permutation-audit-dense.png).

### 3. P2 — Display changes erase annular validation failures

**Confirmed:** Submit `(1 3 2 4)` at `(p,q)=(2,2)`. The application correctly reports a crossing permutation and retains the previous figure. Toggle **Directed**. The message becomes empty and `data-state` changes to `valid`, while the invalid input and previous figure remain.

The failure is written directly into the DOM, then discarded by `redraw()`, because `annularStatusOverride` remains null. Disc validation already has a persistent error mechanism.

**Action:** Store annular request status with the accepted state and preserve it across cosmetic redraws. Clear it when a subsequent request succeeds or when another deliberate transition supersedes it. Cover syntax, crossing and router failures in browser tests.

**Evidence:** [Failure handling](../../../app/src/main.ts#L396), [redraw status](../../../app/src/main.ts#L278), [probe results](evidence/permutation-audit-probe-results.json).

### 4. P2 — SVG export loses the live stroke-scaling behavior

**Confirmed:** A live edge has `vector-effect: non-scaling-stroke`; the same exported edge has `vector-effect: none`. The former rule comes from the application stylesheet, which the serializer does not include. At 700 pixels, an exported 1000-unit SVG scaled to the same width has a nominal 2.38-pixel edge where the live figure uses 3.4 pixels.

Geometry and the numeric stroke attribute survive export, but resizing the exported image changes its appearance relative to the live figure. Existing export checks verify content and attributes without checking this computed rendering behavior.

**Action:** Define the intended live/export scaling contract. Put essential SVG presentation properties on the SVG elements or embed a minimal export stylesheet. Compare live and exported rendering at multiple sizes, excluding deliberate selection/hover styling.

**Evidence:** [External CSS rule](../../../app/src/style.css#L430), [serializer](../../../app/src/renderer/export.ts#L27), [computed-style probe](evidence/permutation-audit-extra-results.json).

### 5. P2 — Long notation captions are clipped in accepted figures

**Confirmed:** The 66-label paired partition’s caption measures approximately **2,245 units wide** inside a **1,000-unit viewBox**, starting at `x≈−623`. Both ends are clipped. The export retains this layout.

Disc captions use fixed-size text centered at the bottom; annular captions follow the same general pattern. A notation can satisfy all input limits while greatly exceeding the available caption width.

**Action:** Fit or wrap captions, or move full notation into an optional caption area and SVG metadata. Preserve the complete notation accessibly even when the visible caption is abbreviated. Test caption bounds for long accepted inputs.

**Evidence:** [Disc caption](../../../app/src/renderer/svgRenderer.ts#L306), [annular caption](../../../app/src/renderer/annularSvgRenderer.ts#L306), [measured bounds](evidence/permutation-audit-probe-results.json).

### 6. P2 — Default production preview has the wrong asset base; automated tests miss it

**Confirmed:** The default Vite preview configuration served the HTML but returned **404** for `/p5-nc-partitions/assets/index-BObQcp5t.js`; no figure rendered. Explicitly setting preview base to `/p5-nc-partitions/` made disc rendering, annular rendering and SVG download pass with no failed responses.

The Vite configuration assigns the project-site base only when `command === "build"`. Preview loads the configuration with the serve command, selecting `/`. Meanwhile, Playwright starts the development server, so its passing suite never exercises this mismatch. The distribution verifier inspects files and strings, which cannot establish that the preview server actually serves those paths.

The sole workflow also runs on pushes to `main` and manual dispatch, without a `pull_request` trigger. It gates deployment, but this repository configuration does not itself provide pre-merge validation.

**Action:** Align preview with the build base. Add a small smoke suite against the built artifact at the deployed subpath. Run validation on pull requests and keep Pages publication restricted to the intended branch. Expand critical SVG/editing checks beyond Chromium as browser support becomes a product commitment.

**Evidence:** [Vite configuration](../../../app/vite.config.ts#L3), [Playwright server](../../../app/playwright.config.ts#L14), [workflow triggers](../../../.github/workflows/pages.yml#L3), [preview failure](evidence/permutation-audit-preview-failure.json).

### 7. P2 — Resource limits do not keep expensive work off the browser thread

**Measured architectural risk:** An auto-orientation request at `(20,1)` with alternating outer blocks `(1 3 … 19)(2 4 … 20)` exhausted 50,000 candidates in approximately **366 ms** synchronously in Chromium. The 12+12 full-cycle router stress case took approximately **179 ms** before bounded rejection. These operations prevent input handling and animation while they run.

`setTimeout` postpones the start of the work; it does not make the search asynchronous. Random generation’s 1,500 ms elapsed limit is explicitly soft and checked between attempts, so it cannot interrupt a single routing call. The README accurately acknowledges this limitation.

**Action:** Move orientation and routing to a cancellable worker with request identifiers, retain the existing operation limits, and measure browser responsiveness under CPU throttling. Keep the last admitted diagram available while new work runs.

**Evidence:** [Scheduled synchronous work](../../../app/src/main.ts#L404), [random attempt policy](../../../app/src/production/randomAnnular.ts#L16), [timing probe](evidence/permutation-audit-extra-results.json).

## Design and maintenance observations

- **Preserve the mathematical boundary.** Typed error categories, explicit composition conventions, immutable accepted geometry, independent final verification, and truthful budget failures are valuable design decisions. The randomized generator verifies its connected/noncrossing invariant before returning.
- **Bound session retention as well as individual calls.** `annularComplementCache` retains each distinct routed complement without eviction. This is a session-growth risk inferred from the code, not an observed out-of-memory failure. Use a small LRU cache or retain only the current/previous complements. The 50-state edit history is already bounded.
- **Split orchestration without replacing the stack.** Extract disc/annular controllers, status transitions, history and settings from `main.ts`. Share pointer/keyboard editor plumbing where practical; retain separate geometry rules. A framework rewrite is unnecessary to address the identified problems.
- **Document the sampler’s actual coverage.** Random ANC constructs one rooted through-cycle joining the roots containing labels 1 and `p+1`. It is a useful illustrative sampler, but it is not uniform over all connected ANC permutations and does not explore arbitrary numbers of through-cycles. Distribution labels describe its density heuristic.
- **Bring documentation up to the working tree.** The application README still says disc curves and annular singleton loops cannot be edited, although both now have implementations and passing browser tests. The new singleton-free option and dense-disc fallback also deserve accurate user-facing descriptions.
- **Support reproducible figures.** There is no user-facing save/load recipe or seed control. SVG is a good final artifact, but a versioned recipe containing notation, mode, settings and control edits would support later revision, bug reports and shared examples.
- **Security posture is appropriately simple.** No production application fetch calls, dynamic evaluation or input-to-HTML injection path were found in the reviewed source. Font assets are bundled locally, input sizes are bounded, and npm reported no known dependency vulnerabilities. This was not a penetration test or an assessment of hosting/account permissions. If external reuse is intended, add an explicit project license; the repository currently supplies font notices but no root project license.

## SWOT

| | Assessment |
|---|---|
| **Strengths** | Specialized mathematical functionality; explicit disc/annular semantics; strong invariant and regression testing; deterministic, bounded routing; analytical clearance checks; editable SVG with embedded fonts; simple static deployment and a small runtime dependency set. |
| **Weaknesses** | Canonicalization ambiguity; dense-diagram readability failures; status and export inconsistencies; synchronous search; orchestration concentrated in `main.ts`; no saved recipes; random generation covers a restricted family. |
| **Opportunities** | Reproducible figure recipes and seeded examples; teaching views that explain complements and orientation; publication presets and caption controls; worker-based routing; generation accompanied by a known embedding; a reusable math/geometry package after its public contracts stabilize. These are product opportunities inferred from the project, not market-demand claims. |
| **Threats** | Attractive but ambiguous figures can undermine mathematical trust; higher support limits can amplify readability and latency problems; specialized geometry knowledge can become a maintenance bottleneck; browser and illustration-tool differences can affect SVG behavior; missing artifact-level CI can allow release-only regressions. |

## Recommended sequence

1. **Restore semantic and visual trust:** fix canonical block invariance, dense-disc visibility, persistent annular errors, caption fitting and the export styling contract. Add focused regressions for the reproductions above.
2. **Close the release gap:** repair preview configuration, add a built-artifact smoke test, and provide pull-request validation. Update documentation alongside those changes.
3. **Improve session reliability:** introduce cancellable worker execution, bounded complement caching and clearer controller/state ownership.
4. **Develop the research workflow:** add save/load recipes, reproducible random inputs, richer representative examples and publication-oriented output controls.

## Evidence and limits

Screenshots: [ordinary figure](evidence/permutation-audit-default.png), [66-label figure](evidence/permutation-audit-dense.png). Machine-readable evidence: [behavior probes](evidence/permutation-audit-probe-results.json), [timing/export probes](evidence/permutation-audit-extra-results.json), [npm audit](evidence/permutation-audit-dependencies.json), [corrected-base production smoke](evidence/permutation-audit-production-results.json).

This review combined source inspection, existing tests, targeted Chromium reproductions, visual inspection, a dependency advisory check and a primary mathematical reference. It did not formally prove the geometry kernel, test every supported large permutation, perform a screen-reader audit, validate Safari/Firefox, or inspect the live GitHub Pages deployment and repository protection settings. Dependency results are a point-in-time registry report. No application fixes, commits or deployment changes were made.
