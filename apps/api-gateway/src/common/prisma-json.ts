import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@aagam/database';

function normalizeNestedJson(value: unknown, path: string): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new BadRequestException(`${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeNestedJson(entry, `${path}[${index}]`));
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new BadRequestException(`${path} must contain only plain JSON objects`);
    }
    const output: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      output[key] = normalizeNestedJson(entry, `${path}.${key}`);
    }
    return output;
  }
  throw new BadRequestException(`${path} contains a non-JSON value`);
}

export function requiredJson(value: unknown, path: string): Prisma.InputJsonValue {
  const normalized = normalizeNestedJson(value, path);
  if (normalized === null) throw new BadRequestException(`${path} cannot be null`);
  return normalized;
}

export function nullableJson(
  value: unknown,
  path: string,
): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  const normalized = normalizeNestedJson(value, path);
  return normalized === null ? Prisma.JsonNull : normalized;
}
