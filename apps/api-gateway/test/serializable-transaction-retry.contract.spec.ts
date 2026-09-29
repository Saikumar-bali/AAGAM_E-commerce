import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const databaseClient = fs.readFileSync(
  path.join(root, 'packages/database/src/index.ts'),
  'utf8',
);

describe('shared serializable transaction retry contract', () => {
  it('retries interactive Serializable transactions on Prisma and PostgreSQL transaction conflicts', () => {
    expect(databaseClient).toContain('transactionWithSerializableRetry');
    expect(databaseClient).toContain("typeof input === 'function'");
    expect(databaseClient).toContain("toLowerCase() === 'serializable'");
    expect(databaseClient).toContain('const maxAttempts = 3');
    expect(databaseClient).toContain("error?.code === 'P2034'");
    expect(databaseClient).toContain("['40001', '40P01', '25P02']");
    expect(databaseClient).toContain('containsRetryablePostgresState(error)');
    expect(databaseClient).toContain('attempt === maxAttempts');
    expect(databaseClient).toContain('setTimeout(resolve, attempt * 25)');
  });

  it('inspects Prisma/raw database error metadata for SQLSTATE values', () => {
    expect(databaseClient).toContain('candidate.meta?.code');
    expect(databaseClient).toContain('candidate.meta?.message');
    expect(databaseClient).toContain('candidate.meta?.database_error');
    expect(databaseClient).toContain('candidate.meta?.databaseError');
  });

  it('does not retry batch or non-serializable transactions', () => {
    expect(databaseClient).toContain('if (!isInteractive || !isSerializable)');
    expect(databaseClient).toContain('return baseTransaction(input, options)');
  });

  it('installs the retry wrapper on the single shared Prisma client', () => {
    expect(databaseClient).toContain("Object.defineProperty(prismaClient, '$transaction'");
    expect(databaseClient).toContain('value: transactionWithSerializableRetry');
    expect(databaseClient).toContain('export const prisma = prismaClient as AagamPrismaClient');
  });
});
