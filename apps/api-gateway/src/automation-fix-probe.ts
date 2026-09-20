/**
 * Returns the nth Fibonacci number, 0-indexed.
 * Contract: fib(0) === 0, fib(1) === 1, fib(2) === 1, fib(3) === 2
 */
export function fib(n: number): number {
  if (n < 0) throw new RangeError('n must be non-negative');
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}
