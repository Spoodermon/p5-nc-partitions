# Permutation Visualizer

The canonical TypeScript application in `app/` visualizes disc noncrossing partitions and annular noncrossing permutations. The root p5.js files remain as historical reference.

**Play with it here:** https://spoodermon.github.io/p5-nc-partitions/

## Instructions:
1. Press `spacebar` to toggle between the partition, $\pi$ and its Kreweras complement $\mathrm{Kr}(\pi)$
2. Press `enter` to input your own valid non-crossing partition, then press `enter` once again.

**Note:** The non-crossing partition must be of valid form, in particular its input must be in cycle notation e.g. $(1\ 4)(2\ 3)(5\ 10)(6\ 7\ 8\ 9)$ where cycles are delimited by brackets `(`, `)` and elements in the brackets are delimited by spaces ` `. The program will verify whether the partition indeed has support on $[n]$ and check the non-crossing condition. 

## Production application

Disc input is a set partition, so block orientation canonicalizes. Annular input is an oriented permutation with separate positive-integer `p` and `q` boundary sizes. Both modes support interaction, presentation controls, and exact vector SVG export from the live figure.

```sh
cd app
npm run dev
```

Open `http://localhost:5173/`. The annular geometry and routing laboratories remain under `/dev/` for diagnostics.

Run `npm test` for the full mathematical and routing regression suite and `npm run build` for the production build. NCV-7 is reserved for visual-language and UX refinement.
