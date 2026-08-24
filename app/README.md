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

## Renderer

The application lays out vertices deterministically in a `0 0 1000 1000` SVG viewBox and renders permutation relations as cubic Bézier arcs. Forward and return roles have distinct depth, two-cycles form a lens, singleton fixed points receive a restrained presentation loop, and optional direction markers appear at curve midpoints.

SVG export serializes the same live SVG DOM used on screen. It removes transient selection state but does not recompute geometry or include raster content.

## SVG export

The download icon serializes the current live SVG DOM. Export preserves the current partition/complement and direction-marker option, removes transient selection state, and contains no Canvas or raster data.

## Known limitations

The application does not yet solve annular geometry/UI, inner phase placement, winding/lift geometry, general collision-free lane routing, intersection/clearance verification, PDF/TikZ conversion, embedded publication fonts, recurrence exposition, or the final scene architecture.
