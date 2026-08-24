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

## Mathematical input

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

## Renderer

The application lays out vertices deterministically in a `0 0 1000 1000` SVG viewBox and renders permutation relations as cubic Bézier arcs. Forward and return roles have distinct depth, two-cycles form a lens, singleton fixed points receive a restrained presentation loop, and optional direction markers appear at curve midpoints.

SVG export serializes the same live SVG DOM used on screen. It removes transient selection state but does not recompute geometry or include raster content.

## SVG export

The download icon serializes the current live SVG DOM. Export preserves the current partition/complement and direction-marker option, removes transient selection state, and contains no Canvas or raster data.

## Known limitations

The application does not yet solve general collision-free lane routing, intersection/clearance verification, annular mathematics or geometry, PDF/TikZ conversion, embedded publication fonts, recurrence exposition, or the final scene architecture.
