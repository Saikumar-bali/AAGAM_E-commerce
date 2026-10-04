import { BadRequestException } from '@nestjs/common';

export interface IntQueryOptions {
  min?: number;
  max?: number;
}

/**
 * Parse an optional integer query parameter.
 *
 * Nest's `ValidationPipe` only validates class-validator DTOs, so endpoints that
 * read `@Query('x')` as a raw string and then call `parseInt`/`Number` on it
 * silently accept garbage. `parseInt('abc')` is `NaN`, which then reaches Prisma
 * (`skip: NaN`, `take: NaN`, invalid `Date`) and surfaces as an opaque HTTP 500
 * instead of a 400. Parse through this helper so malformed input is rejected at
 * the boundary with a clear message.
 */
export function parseIntQuery(
  raw: string | undefined,
  name: string,
  options: IntQueryOptions = {},
): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new BadRequestException(`${name} must be an integer`);
  }
  const value = Number.parseInt(trimmed, 10);
  if (options.min !== undefined && value < options.min) {
    throw new BadRequestException(`${name} must be greater than or equal to ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new BadRequestException(`${name} must be less than or equal to ${options.max}`);
  }
  return value;
}
