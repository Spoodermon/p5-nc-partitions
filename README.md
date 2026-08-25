# Non-Crossing Disc Partitions and their Kreweras Complements (p5.js)

Interactive visualization of non-crossing partitions on the disc. 

**Play with it here:** https://spoodermon.github.io/p5-nc-partitions/

## Instructions:
1. Press `spacebar` to toggle between the partition, $\pi$ and its Kreweras complement $\mathrm{Kr}(\pi)$
2. Press `enter` to input your own valid non-crossing partition, then press `enter` once again.

**Note:** The non-crossing partition must be of valid form, in particular its input must be in cycle notation e.g. $(1\ 4)(2\ 3)(5\ 10)(6\ 7\ 8\ 9)$ where cycles are delimited by brackets `(`, `)` and elements in the brackets are delimited by spaces ` `. The program will verify whether the partition indeed has support on $[n]$ and check the non-crossing condition. 

## Annular routing laboratory

The NCV-5 development lab renders complete annular permutations with deterministic cycle corridors, cover-space cubic routes, seams, lane assignments, direction markers, and clearance diagnostics.

```sh
cd app
npm run dev
```

Open `http://localhost:5173/dev/annular-routing.html`. The first fixture is the former blocker `(1 2)(3 4 5)`.

The collision gate is stroke-aware: the hard centerline clearance is `7.5 px`, the preferred clearance is `14 px`, and shared endpoint neighborhoods of radius `24 px` are clipped before unrelated route segments are compared. Run `npm test` for the exhaustive `p + q <= 5` acceptance sweep and `npm run build` for the production build.
