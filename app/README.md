# Permutation Visualizer application

This directory contains the canonical TypeScript, Vite, and SVG.js application for disc noncrossing partitions and annular noncrossing permutations. Historical p5 files are archived under `../legacy/p5/` and are not deployed.

## Install and run

```bash
cd app
npm install
npm run dev
```

Verification:

```bash
npm test
npm run test:slow
npm run test:exhaustive
npm run test:release
npm run build
npm run preview
```

## Mathematical conventions

### Disc input

Input denotes a **set partition**, not an oriented permutation. Blocks use parenthesized, whitespace-separated positive labels, for example:

```text
(1 4)(2 3)(5 7 8 12)(6)(9 10 11)
```

The support must be exactly `[1,n]`; labels cannot repeat. Block contents are unordered mathematically, so `(1 3 2)` and `(3 1 2)` both canonicalize to `(1 2 3)`. Each canonical block is sorted increasingly, and blocks are sorted lexicographically.

Rendering associates a canonical permutation to the partition: a block `{b₁ < … < bₖ}` becomes the directed cycle `(b₁ … bₖ)`. Arrays store images by zero-based JavaScript position, but all mathematical labels and permutation images remain 1-based.

The Kreweras convention is:

```text
γₙ = (1 2 … n)
K(π) = π⁻¹γₙ
(στ)(i) = σ(τ(i))
```

Invalid syntax, duplicate or missing support, and crossing partitions are reported without replacing the last valid figure.

### Annular input

Annular data denotes an **actual permutation**, not a set partition. Orientation is therefore retained:

```text
(1 2 3) ≠ (1 3 2)
```

Cyclic rotations such as `(1 3 2)`, `(3 2 1)`, and `(2 1 3)` denote the same cycle. Disjoint-cycle order is immaterial, and omitted labels are inferred as fixed points because `p` and `q` determine the complete support `[1,p+q]`.

The outer and inner mathematical label sets are:

```text
E = {1,…,p}
I = {p+1,…,p+q}
γ_{p,q} = (1 … p)(p+1 … p+q)
```

A cycle is `outer`, `inner`, or `through` according to the boundary sets containing its labels. The permutation is connected exactly when it has a through-cycle. With `K_{p,q}(τ) = τ⁻¹γ_{p,q}`, annular noncrossing validity uses the cycle-count geodesic equalities:

```text
connected:     #(τ) + #(K_{p,q}(τ)) = p + q
disconnected:  #(τ) + #(K_{p,q}(τ)) = p + q + 2
```

`Random ANC` constructs an oriented connected annular-noncrossing permutation directly, with a through-cycle joining the two boundary orbits, and submits it using strict-permutation semantics. Sparse, Balanced, and Dense distributions control block density; supports of size 12 or more default to Sparse until the user explicitly chooses a mode. Routing uses at most four independently bounded attempts, progressively simplifies the sampled structure, and finishes with the deterministic connected ANC `(1 p+1)` plus fixed points. A failed random request never replaces the admitted figure.

The inner mathematical cycle remains `(p+1 … p+q)`. The production renderer places inner labels in the opposite screen-angular orientation without reversing the mathematical permutation.

Production annular input uses separate positive-integer `p` and `q` fields plus oriented cycle notation. Syntax/domain errors, mathematically crossing permutations, and bounded-router failures are reported distinctly without replacing the last valid figure.

## Annular geometry foundation

The isolated developer laboratory is available during development at:

```text
/dev/annular-geometry.html
```

It uses the canonical `0 0 1000 1000` coordinate system with centre `(500,500)`, outer radius `370`, and inner radius `136`. Outer labels increase clockwise:

```text
θout(i) = -π/2 + 2π(i-1)/p
```

Inner labels increase counterclockwise on screen without changing their mathematical permutation order:

```text
θin(p+j) = -π/2 + δ - 2π(j-1)/q
```

The permutation-independent default phase is the half-step between exact radial-alignment phases:

```text
δ₀(p,q) = π / lcm(p,q)
```

The geometry kernel uses logarithmic universal-cover coordinates `(θ,u)`, retaining unwrapped `θ` values and an explicit integer lift. Cover height `u=0` is the inner boundary and `u=1` is the outer boundary:

```text
r(u) = Rin (Rout / Rin)^u
```

Supported individual route primitives are `outer-outer`, `inner-inner`, `through`, `outer-singleton`, and `inner-singleton`. Routes accept an explicit winding/lift integer, radial excursion, and angular bias; they provide deterministic point and tangent evaluation plus sampling. Singleton routes are renderer-only local loops and do not change the underlying fixed-point permutation.

The NCV-4 laboratory's dense sampled SVG paths visualize the same smooth analytical route family consumed by the production router.

## Global annular routing

The complete-permutation routing laboratory is available at:

```text
/dev/annular-routing.html
```

The production router first rejects input that is not mathematically annular-noncrossing. It extracts every directed cycle edge, searches 9 deterministic phase candidates, builds bounded candidate sets, and assigns them with deterministic backtracking. Same-boundary candidates use explicit excursion lanes; return edges prefer deeper lanes. Through candidates use bounded angular-bias families, and opposite directed edges in a two-cycle receive paired biases.

Candidate heuristics use at most 25 samples. Lightweight candidate specifications are ranked first, then memoizing frontiers materialize routes and sample arrays only as the search asks for them; the compatibility `generateCycleBundles` helper can still drain a complete bounded frontier. The accepted `RoutingOptions.sampleCount` and candidate-helper range is 2–257; standalone `sampleAnnularRoute` calls accept 2–10,001 points. Public sampling density never controls final admission. Every successful plan is independently resampled by adaptive subdivision of `pointAt(t)` using the analytical route family's global second-derivative bound and the interpolation remainder `M·Δt²/8`. This proves a 0.12 viewBox-unit whole-subcurve error bound, subject to maximum depth 12 and 4,096 segments per route. Admission reserves twice that tolerance (0.24 units) for pairwise approximation error and reports clearance after subtracting the margin. The radius-24 shared-endpoint exemption is contracted by the per-route approximation tolerance before polyline clipping; the separate 8-unit crossing guard is contracted identically and requires `2·tolerance` polyline separation. Continuous routing distances are bounded to 1,000 viewBox units, with common-endpoint radius capped at 100. The default hard clearance is 7.5 viewBox units; requested hard clearance is never weakened. Label proximity is a soft warning.

Search is bounded to 64 candidates per edge and 5,000 nodes for the entire routing call; programmatic options may select 1–64 candidates, 0–5,000 nodes, and 2–65 phases. The same call-wide governor permits at most 20,000 materialized route candidates, 500,000 materialized sample points, and 20,000 pair-validation checks, including rejected through specifications and cross-bundle compatibility work. Every phase, seam, principal/fallback pass, greedy attempt, and backtracking state shares those budgets; fallback cannot widen the requested candidate cap. Diagnostics distinguish candidates actually examined from routes materialized. Exhaustion returns `search-limit-exceeded`; invalid programmatic options and verification failure have distinct reasons. The router reports `feasible` when its selected through routes are principal and otherwise conservatively reports `not-proven`; it does not claim that the principal class is infeasible. Route-plan serialization and tie-breaking are deterministic.

The production renderer consumes the admitted routed diagram directly. Developer laboratories are served during development but excluded from production builds.

## Renderer

Disc geometry uses its admitted cubic Bézier arcs. Annular geometry comes from the deterministic global router and is sampled directly from each admitted route. Singleton fixed points remain visible loops and optional direction markers appear at curve midpoints.

Selecting a non-singleton annular edge exposes its two logarithmic-cover cubic controls. Dragging previews the curve while its anchors and winding remain pinned. On release, the production adaptive verifier checks the complete route set and rejects self-contact or inter-edge collisions by restoring the previous immutable routed state. Accepted edits drive the ribbon fill and direction marker, persist in SVG export, and support a bounded 50-state undo history plus reset; the transient handles and guides are never exported. Search-plan scores are intentionally omitted once geometry is manually overridden, while clearance and through-route geometry diagnostics are recomputed. This first version does not edit disc curves or annular singleton loops.

SVG export serializes the same live SVG DOM used on screen. It removes transient selection state but does not recompute geometry or include raster content. The selected Newsreader, Geist, or Geist Mono Latin variable face is embedded as WOFF2 data and assigned to every exported text node, so a standalone SVG does not depend on an installed font or a network request.

## SVG export

The download icon serializes the current live SVG DOM in either mode. Export preserves current geometry, phase, fill, widths, direction markers, and selected number font; removes transient selection state; and contains no Canvas, raster data, controls, or developer diagnostics. Font text remains selectable and editable. Pinned Fontsource packages supply the OFL-licensed binaries, and the deployed license notice is at `licenses/embedded-fonts-OFL-1.1.txt`.

## Known limitations and future routing work

The bounded router may still report a dimension-specific exhaustion for a mathematically valid larger permutation; diagnostics identify search nodes, route candidates, sample points, or pair-validation checks with their used/limit counters.

Two architectural follow-ups are intentionally deferred:

1. Construct a routing witness/embedding alongside random permutation generation, so routeability is available by construction rather than discovered by a later search.
2. Move routing to a worker with cancellation, progress events, and opt-in larger budgets while keeping the current main-thread governors as the production default.

A later direct-construction editor may start from an annulus skeleton: click a vertex, drag a constrained edge to successive vertices, close a ribbon, and let new ribbons request deformation space from existing ones. That feature needs a constraint solver, stable edit history, and explicit topology semantics; it is not approximated by the current two-control editor.

Publication presets, figure recipes, PDF/TikZ conversion, optional text-to-path export for legacy illustration tools, and recurrence exposition remain deferred.
