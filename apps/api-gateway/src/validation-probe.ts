/**
 * Returns the nth triangular number: 1, 3, 6, 10 ... for n = 1, 2, 3, 4
 * Contract: triangular(n) must equal n * (n + 1) / 2
 */
export function triangular(n: number): number {
  let total = 0;
  for (let i = 0; i <= n; i++) {
    total += i;
  }
  return total;
}