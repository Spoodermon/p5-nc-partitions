import { createPermutation } from "../permutation";
import { createAnnularPermutation, validAnnularBoundarySizes } from "./domain";
import { annularFailure, type AnnularPermutation, type AnnularResult } from "./types";

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/.test(character);
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

// Parses actual permutation cycles. Cycle orientation is preserved; omitted labels are fixed points.
export function parseAnnularPermutation(input: string, p: number, q: number): AnnularResult<AnnularPermutation> {
  if (!validAnnularBoundarySizes(p, q)) {
    return annularFailure({ kind: "invalid-boundary-size", p, q });
  }

  const n = p + q;
  const cycles: number[][] = [];
  const seen = new Set<number>();
  let position = 0;

  const skipWhitespace = (): number => {
    const start = position;
    while (isWhitespace(input[position])) position += 1;
    return position - start;
  };

  skipWhitespace();
  while (position < input.length) {
    if (input[position] !== "(") {
      return annularFailure({ kind: "malformed-syntax", position, message: "Expected '(' to start a cycle" });
    }
    position += 1;
    skipWhitespace();

    const cycle: number[] = [];
    if (input[position] === ")") {
      return annularFailure({ kind: "malformed-syntax", position, message: "Cycles cannot be empty" });
    }

    while (position < input.length && input[position] !== ")") {
      const tokenStart = position;
      let sign = 1;
      if (input[position] === "-" || input[position] === "+") {
        sign = input[position] === "-" ? -1 : 1;
        position += 1;
      }

      if (!isDigit(input[position])) {
        const token = input.slice(tokenStart, Math.max(tokenStart + 1, position + 1));
        if (input[position] === ",") {
          return annularFailure({
            kind: "malformed-syntax",
            position,
            message: "Commas are not valid separators",
          });
        }
        return annularFailure({ kind: "non-integer-label", position: tokenStart, token });
      }

      while (isDigit(input[position])) position += 1;
      const digitsStart = input[tokenStart] === "-" || input[tokenStart] === "+" ? tokenStart + 1 : tokenStart;
      const label = sign * Number(input.slice(digitsStart, position));
      if (label < 1) return annularFailure({ kind: "non-positive-label", position: tokenStart, label });
      if (label > n) {
        return annularFailure({ kind: "out-of-range-label", position: tokenStart, label, maximum: n });
      }
      if (seen.has(label)) return annularFailure({ kind: "duplicate-label", label });
      seen.add(label);
      cycle.push(label);

      const whitespaceCount = skipWhitespace();
      if (input[position] === ")") break;
      if (position >= input.length) break;
      if (whitespaceCount === 0) {
        return annularFailure({
          kind: "malformed-syntax",
          position,
          message: "Labels must be separated by whitespace",
        });
      }
    }

    if (input[position] !== ")") {
      return annularFailure({ kind: "malformed-syntax", position, message: "Unclosed cycle" });
    }
    position += 1;
    cycles.push(cycle);
    skipWhitespace();
  }

  const images = Array.from({ length: n }, (_, index) => index + 1);
  cycles.forEach((cycle) => {
    cycle.forEach((label, index) => {
      const image = cycle[(index + 1) % cycle.length];
      if (image === undefined) throw new Error("Parser cycle invariant violated");
      images[label - 1] = image;
    });
  });

  const permutation = createPermutation(images);
  if (!permutation.ok) {
    const message = permutation.error.kind === "invalid-permutation" ? permutation.error.message : permutation.error.kind;
    return annularFailure({ kind: "invalid-permutation", message });
  }
  return createAnnularPermutation(p, q, permutation.value);
}
