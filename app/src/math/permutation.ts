import { failure, success, type DiscPartition, type Permutation, type Result } from "./types";

export function createPermutation(imagesInput: readonly number[]): Result<Permutation> {
  const n = imagesInput.length;
  if (n < 1) return failure({ kind: "invalid-permutation", message: "A permutation must be nonempty" });

  const seen = new Set<number>();
  for (const image of imagesInput) {
    if (!Number.isInteger(image) || image < 1 || image > n) {
      return failure({ kind: "invalid-permutation", message: `Images must be integers in [1, ${n}]` });
    }
    if (seen.has(image)) return failure({ kind: "invalid-permutation", message: "Images must be bijective" });
    seen.add(image);
  }

  return success(Object.freeze({ n, images: Object.freeze([...imagesInput]) }));
}

function guaranteedPermutation(images: readonly number[]): Permutation {
  const result = createPermutation(images);
  if (!result.ok) {
    throw new Error(result.error.kind === "invalid-permutation" ? result.error.message : result.error.kind);
  }
  return result.value;
}

export function identityPermutation(n: number): Permutation {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  return guaranteedPermutation(Array.from({ length: n }, (_, index) => index + 1));
}

export function longCycle(n: number): Permutation {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  return guaranteedPermutation(Array.from({ length: n }, (_, index) => ((index + 1) % n) + 1));
}

export function applyPermutation(permutation: Permutation, label: number): number {
  if (!Number.isInteger(label) || label < 1 || label > permutation.n) {
    throw new RangeError(`label must be in [1, ${permutation.n}]`);
  }
  const image = permutation.images[label - 1];
  if (image === undefined) throw new Error("Permutation invariant violated");
  return image;
}

// composePermutations(a, b) returns a ∘ b, so (a ∘ b)(i) = a(b(i)).
export function composePermutations(a: Permutation, b: Permutation): Permutation {
  if (a.n !== b.n) throw new RangeError("Permutations must have the same support");
  return guaranteedPermutation(
    Array.from({ length: a.n }, (_, index) => applyPermutation(a, applyPermutation(b, index + 1))),
  );
}

export function invertPermutation(permutation: Permutation): Permutation {
  const inverse = new Array<number>(permutation.n);
  permutation.images.forEach((image, index) => {
    inverse[image - 1] = index + 1;
  });
  return guaranteedPermutation(inverse);
}

export function equalPermutations(a: Permutation, b: Permutation): boolean {
  return a.n === b.n && a.images.every((image, index) => image === b.images[index]);
}

export function permutationCycles(permutation: Permutation): readonly (readonly number[])[] {
  const visited = new Array<boolean>(permutation.n).fill(false);
  const cycles: number[][] = [];

  for (let label = 1; label <= permutation.n; label += 1) {
    if (visited[label - 1]) continue;
    const cycle: number[] = [];
    let current = label;
    do {
      cycle.push(current);
      visited[current - 1] = true;
      current = applyPermutation(permutation, current);
    } while (current !== label);

    const minimumIndex = cycle.indexOf(Math.min(...cycle));
    cycles.push([...cycle.slice(minimumIndex), ...cycle.slice(0, minimumIndex)]);
  }

  cycles.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  return Object.freeze(cycles.map((cycle) => Object.freeze(cycle)));
}

export function partitionToPermutation(partition: DiscPartition): Permutation {
  const images = new Array<number>(partition.n);
  partition.blocks.forEach((block) => {
    block.forEach((label, index) => {
      const image = block[(index + 1) % block.length];
      if (image === undefined) throw new Error("Partition block invariant violated");
      images[label - 1] = image;
    });
  });
  return guaranteedPermutation(images);
}
