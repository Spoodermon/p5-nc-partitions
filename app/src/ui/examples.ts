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
] as const satisfies readonly AnnularExample[];

export function getAnnularExample(id: string): AnnularExample {
  return ANNULAR_EXAMPLES.find((example) => example.id === id) ?? ANNULAR_EXAMPLES[0];
}
