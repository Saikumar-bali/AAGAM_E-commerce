export function isOneOf<T>(value: T, allowed: readonly T[]): boolean {
  return allowed.includes(value);
}
