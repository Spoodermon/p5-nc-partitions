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
