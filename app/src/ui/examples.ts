export interface PartitionExample {
  readonly id: string;
  readonly label: string;
  readonly notation: string;
}

export const EXAMPLES = [
  {
    id: "two-cycle",
    label: "Two-cycle — (1 2)",
    notation: "(1 2)",
  },
  {
    id: "three-cycle",
    label: "Three-cycle — (1 2 3)",
    notation: "(1 2 3)",
  },
  {
    id: "nested",
    label: "Nested — (1 4)(2 3)",
    notation: "(1 4)(2 3)",
  },
  {
    id: "representative",
    label: "Representative 12-point example",
    notation: "(1 4)(2 3)(5 7 8 12)(6)(9 10 11)",
  },
  { id: "antipodal-ribbon", label: "Symmetric antipodal ribbon — (1 3)", notation: "(1 3)(2)(4)" },
] as const satisfies readonly PartitionExample[];

export type ExampleId = (typeof EXAMPLES)[number]["id"];

export function getExample(id: string): PartitionExample {
  return EXAMPLES.find((example) => example.id === id) ?? EXAMPLES[0];
}

export interface AnnularExample {
  readonly id: string;
  readonly label: string;
  readonly p: number;
  readonly q: number;
  readonly notation: string;
}

export const ANNULAR_EXAMPLES = [
  { id: "through-two-cycle", label: "Through 2-cycle", p: 3, q: 2, notation: "(1 4)(2)(3)(5)" },
  { id: "one-one", label: "(1,1) through transposition", p: 1, q: 1, notation: "(1 2)" },
  { id: "disconnected", label: "Disconnected boundary cycles", p: 4, q: 3, notation: "(1 2 3 4)(5 6 7)" },
  { id: "former-blocker", label: "Former direct-through blocker", p: 1, q: 4, notation: "(1 5)(2 3 4)" },
  { id: "mingo-nica", label: "Mingo–Nica (5,3)", p: 5, q: 3, notation: "(1 8)(2)(3 4 7)(5 6)" },
  { id: "dense-medium", label: "Dense medium (3,3)", p: 3, q: 3, notation: "(1 2)(3 4 5 6)" },
  { id: "singletons", label: "Singletons and ribbons", p: 4, q: 3, notation: "(1)(2 3)(4 5 6 7)" },
  { id: "outer-side-4-2", label: "Outer 3-cycle (4,2)", p: 4, q: 2, notation: "(1 3 4)(2)(5)(6)" },
  { id: "reported-8-5", label: "Reported larger through-cycle (8,5)", p: 8, q: 5, notation: "(1 2 3)(4 6)(5)(7 8 9 12 13)(10 11)" },
  { id: "canonical-order-10-7", label: "Canonical block order (10,7)", p: 10, q: 7, notation: "(1 11 10)(2 17)(3)(4)(5)(6)(7)(8)(9)(12)(13)(14)(15)(16)" },
  { id: "supplied-10-7", label: "Supplied hand-drawn fixture (10,7)", p: 10, q: 7, notation: "(1 11)(2 3 16)(4 5 6)(7 13)(8)(9 12)(10)(14 15)(17)" },
  { id: "spacing-10-7", label: "Sparse spacing fixture (10,7)", p: 10, q: 7, notation: "(1 11 12 10)(2 17)(3 5 16)(4)(6)(7)(8)(9)(13)(14)(15)" },
  { id: "former-freeze-10-7", label: "Former freeze fixture (10,7)", p: 10, q: 7, notation: "(1 3)(2)(4 6 15 16 17)(5)(7)(8 9 10)(11 12)(13 14)" },
  { id: "crossing-check-10-7", label: "Crossing check (10,7)", p: 10, q: 7, notation: "(1 12 11 17)(2)(3)(4)(5)(6 7 14)(8)(9)(10)(13)(15)(16)" },
] as const satisfies readonly AnnularExample[];

export function getAnnularExample(id: string): AnnularExample {
  return ANNULAR_EXAMPLES.find((example) => example.id === id) ?? ANNULAR_EXAMPLES[0];
}
