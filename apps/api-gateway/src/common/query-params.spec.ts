import { BadRequestException } from '@nestjs/common';
import { parseIntQuery } from './query-params';

describe('parseIntQuery', () => {
  it('returns undefined for absent or blank input', () => {
    expect(parseIntQuery(undefined, 'page')).toBeUndefined();
    expect(parseIntQuery('', 'page')).toBeUndefined();
    expect(parseIntQuery('   ', 'page')).toBeUndefined();
  });

  it('parses a valid integer', () => {
    expect(parseIntQuery('42', 'page')).toBe(42);
    expect(parseIntQuery('-3', 'offset')).toBe(-3);
  });

  it('rejects non-numeric input with a 400 instead of leaking NaN to Prisma', () => {
    expect(() => parseIntQuery('abc', 'days')).toThrow(BadRequestException);
    expect(() => parseIntQuery('12abc', 'days')).toThrow(BadRequestException);
    expect(() => parseIntQuery('1.5', 'days')).toThrow(BadRequestException);
  });

  it('enforces min and max bounds', () => {
    expect(() => parseIntQuery('0', 'page', { min: 1 })).toThrow(/greater than or equal to 1/);
    expect(() => parseIntQuery('999999', 'pageSize', { max: 200 })).toThrow(/less than or equal to 200/);
    expect(parseIntQuery('200', 'pageSize', { max: 200 })).toBe(200);
  });
});
