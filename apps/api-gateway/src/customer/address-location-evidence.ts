import { Prisma, prisma } from '@aagam/database';

export const ADDRESS_LOCATION_SOURCES = [
  'LIVE_GPS',
  'MAP_PIN',
  'GEOCODED',
  'LEGACY_UNKNOWN',
] as const;

export type AddressLocationSource = (typeof ADDRESS_LOCATION_SOURCES)[number];

type DbClient = Prisma.TransactionClient | typeof prisma;

export type AddressLocationEvidence = {
  source: AddressLocationSource;
  accuracyMetres: number | null;
  capturedAt: Date | null;
};

export type AddressLocationSnapshot = {
  locationSource: AddressLocationSource;
  locationAccuracyMetres: number | null;
  locationCapturedAt: string | null;
};

export function isAddressLocationSource(value: unknown): value is AddressLocationSource {
  return typeof value === 'string' && ADDRESS_LOCATION_SOURCES.includes(value as AddressLocationSource);
}

export function publicAddressLocationEvidence(evidence?: AddressLocationEvidence | null): AddressLocationSnapshot {
  const value = evidence || { source: 'LEGACY_UNKNOWN' as const, accuracyMetres: null, capturedAt: null };
  return {
    locationSource: value.source,
    locationAccuracyMetres: value.accuracyMetres ?? null,
    locationCapturedAt: value.capturedAt ? value.capturedAt.toISOString() : null,
  };
}

export async function readAddressLocationEvidence(
  db: DbClient,
  customerAddressId: string,
): Promise<AddressLocationEvidence> {
  const rows = await db.$queryRaw<Array<{
    source: string;
    accuracyMetres: number | null;
    capturedAt: Date | null;
  }>>(Prisma.sql`
    SELECT "source", "accuracyMetres", "capturedAt"
    FROM "CustomerAddressLocationEvidence"
    WHERE "customerAddressId" = ${customerAddressId}
    LIMIT 1
  `);
  const row = rows[0];
  return {
    source: isAddressLocationSource(row?.source) ? row.source : 'LEGACY_UNKNOWN',
    accuracyMetres: row?.accuracyMetres ?? null,
    capturedAt: row?.capturedAt ?? null,
  };
}

export async function upsertAddressLocationEvidence(
  db: DbClient,
  customerAddressId: string,
  evidence: AddressLocationEvidence,
) {
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "CustomerAddressLocationEvidence" (
      "customerAddressId", "source", "accuracyMetres", "capturedAt", "createdAt", "updatedAt"
    ) VALUES (
      ${customerAddressId}, ${evidence.source}, ${evidence.accuracyMetres}, ${evidence.capturedAt},
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("customerAddressId") DO UPDATE SET
      "source" = EXCLUDED."source",
      "accuracyMetres" = EXCLUDED."accuracyMetres",
      "capturedAt" = EXCLUDED."capturedAt",
      "updatedAt" = CURRENT_TIMESTAMP
  `);
}

export async function attachAddressLocationEvidence<T extends { id: string }>(
  db: DbClient,
  address: T,
): Promise<T & AddressLocationSnapshot> {
  const evidence = await readAddressLocationEvidence(db, address.id);
  return { ...address, ...publicAddressLocationEvidence(evidence) };
}

function snapshotObject(snapshot: unknown): Record<string, unknown> {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? { ...(snapshot as Record<string, unknown>) }
    : {};
}

export async function freezeAddressLocationEvidence(
  db: DbClient,
  snapshot: unknown,
): Promise<Record<string, unknown>> {
  const value = snapshotObject(snapshot);
  if (isAddressLocationSource(value.locationSource)) {
    return value;
  }
  const addressId = typeof value.id === 'string' ? value.id : null;
  if (!addressId) {
    return { ...value, ...publicAddressLocationEvidence(null) };
  }
  return {
    ...value,
    ...publicAddressLocationEvidence(await readAddressLocationEvidence(db, addressId)),
  };
}
