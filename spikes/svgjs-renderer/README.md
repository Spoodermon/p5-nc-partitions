# NCV-1 SVG.js renderer spike

This isolated spike tests whether TypeScript, Vite, and SVG.js can provide the interactive and exportable rendering foundation for curved permutation diagrams. It is not the production application and does not migrate the NCV-0 p5 implementation.

## Run

```bash
npm install
npm run dev
```

Production verification:

```bash
npm test
npm run build
npm run preview
```

## Stack

- TypeScript 7.0.2
- Vite 8.2.2
- SVG.js 3.2.8
- Vitest 4.1.11
- jsdom 29.1.1 (test-only DOM environment; newest release compatible with Node 22.17)

## Included examples

- `(1 2)`
- `(1 2 3)`
- `(1 4)(2 3)`
- `(1 4)(2 3)(5 7 8 12)(6)(9 10 11)`

Examples are trusted static cycle arrays. Singleton cycles render as restrained local loops.

## Rendering and export

Vertices use deterministic coordinates in a `0 0 1000 1000` viewBox. Cubic Bézier paths distinguish forward and closing/return roles and expose a reusable lane/depth parameter. SVG.js creates the live SVG DOM used for hover, selection, and native marker interaction.

Export clones and serializes that live SVG. It removes transient selection classes and keyboard-only `tabindex` attributes, but does not recompute geometry. The result contains vector primitives only; no canvas or raster data is used.

## Known limitations

The spike does not solve arbitrary collision-free lane routing, mathematical parsing or validation, Kreweras complements, annular geometry or phase offsets, PDF conversion, embedded publication fonts, or the final scene/domain architecture. Its routing is tuned only to demonstrate controllable curved geometry on the four required examples.
