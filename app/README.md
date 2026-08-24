# Permutation Visualizer application

This directory contains the canonical TypeScript, Vite, and SVG.js application for disc noncrossing partition diagrams. The former NCV-1 technology spike has been promoted here; legacy p5 files remain at the repository root as historical reference.

## Install and run

```bash
cd app
npm install
npm run dev
```

Verification:

```bash
npm test
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

### Annular core

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

The inner mathematical cycle remains `(p+1 … p+q)`. A future renderer may place inner labels in the opposite screen-angular orientation, but that layout choice must not reverse the mathematical permutation.

Annular mathematics is available only in the independently tested core. Annular rendering and annular UI are not yet exposed.

## Annular geometry foundation

The isolated developer laboratory is available during development at:

```text
/dev/annular-geometry.html
```

It uses the canonical `0 0 1000 1000` coordinate system with centre `(500,500)`, outer radius `370`, and inner radius `170`. Outer labels increase clockwise:

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

**NCV-4 defines individual routes. It does not choose globally compatible collision-free routes for a permutation.** Permutation-aware phase selection, lift selection, lane assignment, bias coordination, collision avoidance, and clearance verification belong to the later global-routing stage. The laboratory's dense sampled SVG paths visualize the smooth analytical route family without fixing the future production path representation.

## Renderer

The application lays out vertices deterministically in a `0 0 1000 1000` SVG viewBox and renders permutation relations as cubic Bézier arcs. Forward and return roles have distinct depth, two-cycles form a lens, singleton fixed points receive a restrained presentation loop, and optional direction markers appear at curve midpoints.

SVG export serializes the same live SVG DOM used on screen. It removes transient selection state but does not recompute geometry or include raster content.

## SVG export

The download icon serializes the current live SVG DOM. Export preserves the current partition/complement and direction-marker option, removes transient selection state, and contains no Canvas or raster data.

## Known limitations

The application does not yet solve permutation-aware annular phase selection, automatic winding/lift choice, globally compatible lane routing, collision/clearance verification, production annular UI or SVG export, PDF/TikZ conversion, embedded publication fonts, recurrence exposition, or the final scene architecture.
