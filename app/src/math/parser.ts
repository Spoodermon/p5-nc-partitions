import { createDiscPartition } from "./partition";
import { noncrossingResult } from "./noncrossing";
import { failure, type DiscPartition, type Result } from "./types";

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/.test(character);
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

export function parseDiscPartition(input: string): Result<DiscPartition> {
  if (input.trim().length === 0) return failure({ kind: "empty-input" });

  const blocks: number[][] = [];
  let position = 0;

  const skipWhitespace = (): number => {
    const start = position;
    while (isWhitespace(input[position])) position += 1;
    return position - start;
  };

  skipWhitespace();
  while (position < input.length) {
    if (input[position] !== "(") {
      return failure({ kind: "malformed-syntax", position, message: "Expected '(' to start a block" });
    }
    position += 1;
    skipWhitespace();

    const block: number[] = [];
    if (input[position] === ")") {
      return failure({ kind: "malformed-syntax", position, message: "Blocks cannot be empty" });
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
          return failure({ kind: "malformed-syntax", position, message: "Commas are not valid separators" });
        }
        return failure({ kind: "non-integer-label", position: tokenStart, token });
      }

      while (isDigit(input[position])) position += 1;
      const unsigned = Number(input.slice(sign === -1 || input[tokenStart] === "+" ? tokenStart + 1 : tokenStart, position));
      const label = sign * unsigned;
      if (label < 1) return failure({ kind: "non-positive-label", position: tokenStart, label });
      block.push(label);

      const whitespaceCount = skipWhitespace();
      if (input[position] === ")") break;
      if (position >= input.length) break;
      if (whitespaceCount === 0) {
        return failure({ kind: "malformed-syntax", position, message: "Labels must be separated by whitespace" });
      }
    }

    if (input[position] !== ")") {
      return failure({ kind: "malformed-syntax", position, message: "Unclosed block" });
    }
    position += 1;
    blocks.push(block);
    skipWhitespace();
  }

  return createDiscPartition(blocks);
}

export function parseNoncrossingPartition(input: string): Result<DiscPartition> {
  const parsed = parseDiscPartition(input);
  if (!parsed.ok) return parsed;
  return noncrossingResult(parsed.value);
}
