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

## Current renderer

The application lays out vertices deterministically in a `0 0 1000 1000` SVG viewBox and renders permutation relations as cubic Bézier arcs. Forward and return roles have distinct depth, two-cycles form a lens, singleton fixed points receive a restrained presentation loop, and optional direction markers appear at curve midpoints.

SVG export serializes the same live SVG DOM used on screen. It removes transient selection state but does not recompute geometry or include raster content.

## Current limitations

The promoted renderer does not yet solve general collision-free lane routing, annular geometry, PDF conversion, embedded publication fonts, or the final scene architecture.
