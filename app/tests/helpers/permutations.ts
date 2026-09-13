export function* permutationImages(n: number): Generator<readonly number[]> {
  const values = Array.from({ length: n }, (_, index) => index + 1);

  function* generate(position: number): Generator<readonly number[]> {
    if (position === values.length) {
      yield [...values];
      return;
    }
    for (let index = position; index < values.length; index += 1) {
      [values[position], values[index]] = [values[index] as number, values[position] as number];
      yield* generate(position + 1);
      [values[position], values[index]] = [values[index] as number, values[position] as number];
    }
  }

  yield* generate(0);
}

export function binomial(n: number, k: number): number {
  const reduced = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= reduced; index += 1) {
    value = (value * (n - reduced + index)) / index;
  }
  return value;
}

export function catalan(n: number): number {
  return binomial(2 * n, n) / (n + 1);
}

export function expectedConnectedAnnularCount(p: number, q: number): number {
  return (2 * p * q * binomial(2 * p - 1, p) * binomial(2 * q - 1, q)) / (p + q);
}
