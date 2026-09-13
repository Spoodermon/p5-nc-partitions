# Audit remediation — 13 September 2026

Implemented the seven priorities from the [12 September audit](../2026-09-12/AUDIT.md) in the existing working tree, preserving the earlier uncommitted implementation work. Changes are local; no commit or deployment was performed.

## Changes

| Finding | Result |
|---|---|
| Canonical block interpretation | Candidate ordering now depends only on sorted block supports. Distinct valid orientations of the same block resolve identically in canonical mode; strict mode retains the typed orientation. |
| Dense disc readability | Every supported size tries its visible curve candidate. The 66-label paired fixture now has approximately 36 units of lane separation, versus 0.052 in the audit. The 65-singleton fixture has a first loop approximately 8.26 × 55.76 units, versus 0.008 × 0.056. Layouts that need the compact scaffold display a persistent readability notice. |
| Annular status persistence | Validation, routing and worker failures are stored in UI state and survive cosmetic redraws. Pending state also survives display-setting changes. |
| SVG styling | Edge stroke scaling is an SVG presentation attribute, so it survives standalone export. Selected/hovered styles and editor overlays remain transient. |
| Caption clipping | Long captions are fitted within 900 viewBox units and abbreviated above 80 characters. Complete notation is retained in the SVG description and accessible label. |
| Production preview and CI | Preview uses the same project base as the build. A separate production smoke test loads the built page and worker and downloads SVG. Pull requests run validation; Pages publication remains restricted to `main`. |
| Browser-thread routing | User-requested annular interpretation, routing, random generation and complements execute in a module worker with stage/attempt messages and Cancel. New requests, mathematical input edits, surface changes and page navigation terminate obsolete work. |

The complement cache now retains eight entries using LRU eviction. Documentation covers current editing capabilities, singleton-free generation, canonical interpretation, export behavior and the background execution model.

## Guarantees retained

- Mathematical predicates, support limits, annular routing budgets and clearance requirements remain in force.
- Worker messages carry verified samples and exact route constructor data. Reconstructing curve evaluators on the UI thread does not repeat the search. Round-trip tests compare samples, points, tangents, diagnostics and editable controls; received state is frozen.
- Only the current request may replace the admitted diagram. Cancellation, worker startup failure and worker crashes preserve the previous figure. Export is disabled during pending routing and unverified curve previews.
- Large disc layouts attempt the normal candidate once before compact fallback, avoiding repeated expensive whole-layout trials. The existing 400-label timing assertions pass without raising their ceilings.

## Validation

`npm run test:release` passed, including:

| Tier | Result |
|---|---|
| Fast unit/integration | 231 tests passed |
| Routing stress | 28 tests passed |
| Development Chromium | 26 tests passed |
| Timing/memory benchmarks | 3 tests passed |
| Exhaustive annular routing | 1 sweep passed |
| Production Chromium | 1 test passed |
| Production build | Type checking, bundling and distribution verification passed |

The final presentation build was also rebuilt and smoke-tested. Visual QA checked the corrected paired and singleton diagrams, canonical annular output, and pending routing at a 320-pixel viewport. The mobile document remained 320 pixels wide and Cancel remained usable. New regression tests exercise error persistence, canonical invariance, caption bounds, SVG stroke scaling, worker transport, cancellation, superseded requests and worker failures.

Evidence: [release log](evidence/release.log), [visual measurements](evidence/visual-checks.json), [66-label pairs](evidence/disc-66.png), [65 singletons](evidence/disc-singletons-65.png), [canonical annulus](evidence/annular-canonical.png), [mobile routing](evidence/mobile-pending.png).

## Remaining limits

The computational support ceiling is not a readability guarantee: sufficiently crowded disc figures still require the explicitly identified compact presentation. Disc construction, edit verification, the fixed small startup example, and direct programmatic APIs remain synchronous. Background execution does not make every mathematically valid annular permutation routable within the fixed budgets.

Broader browser/illustration-tool validation, saved figure recipes, user-facing seeds, a broader random sampler and generation with a known embedding remain future work. Remote GitHub Actions execution and publication were not performed during this local remediation.
