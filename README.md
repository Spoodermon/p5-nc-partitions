# Permutation Visualizer

The canonical production application is [`app/`](app/). It visualizes disc noncrossing partitions and oriented annular noncrossing permutations, their Kreweras complements, and exports the live diagram as SVG.

The former p5 implementation is preserved only as historical source under [`legacy/p5/`](legacy/p5/); it is not built or deployed.

## Development

```sh
cd app
npm ci
npx playwright install chromium
npm run dev
```

Vite serves the application at `http://localhost:5173/`.

## Verification

```sh
cd app
npm test                 # fast unit/integration tier
npm run test:slow        # deterministic routing stress fixtures
npm run test:exhaustive  # full p+q <= 5 routing sweep
npm run benchmark        # representative timing ceilings
npm run test:release     # all tiers, browser checks, benchmarks, and production build
npm run build
```

Production limits are centralized in `app/src/config/limits.ts`: disc support is at most 400; `p` and `q` are separate decimal fields, each at most 20; annular total support is at most 24; partition/permutation notation is at most 16,384 characters. Whitespace-only annular notation denotes the identity permutation. Limit failures are reported as infrastructure limits, not mathematical rejection.

Routing defaults are centralized in `app/src/config/routingPolicy.ts`: 9 phase candidates, 140 candidates per edge, 5,000 global search nodes, 65 heuristic/rendering samples (`RoutingOptions` and candidate helpers accept 2–257; standalone sampling accepts at most 10,001), hard clearance 7.5, preferred clearance 14, shared-endpoint radius 24 (maximum 100), and analytical second-derivative verification tolerance 0.12 with tolerance-contracted endpoint clipping, a two-tolerance pairwise safety margin, and depth/segment bounds of 12/4,096. Continuous distance options are capped at 1,000 viewBox units.

## Deployment

GitHub Actions builds `app/` and deploys `app/dist/` to GitHub Pages. Production Vite builds use the project-site base `/p5-nc-partitions/`; local development uses `/`. Developer laboratories remain available under `/dev/` only in development and are excluded from `dist/`.

## Current architectural debt

Annular canonicalization and routing still run synchronously on the main thread. The UI therefore reports only an honest `Routing…` busy state. Moving those computations to a worker belongs in a dedicated follow-up, not this correctness hardening branch.
