import {
  distanceMetresBetween,
  validateRiderArrivalEvidence,
} from './rider-arrival-evidence';

const policy = { radiusMetres: 250, maxAccuracyMetres: 120, maxAgeMs: 120_000 };
const now = new Date('2026-08-04T01:00:00.000Z');
const destination = { latitude: 17.7300, longitude: 83.3100 };

describe('Rider arrival evidence', () => {
  it('accepts a fresh accurate location inside the geofence', () => {
    const result = validateRiderArrivalEvidence({
      evidence: {
        latitude: 17.7305,
        longitude: 83.3104,
        accuracyMetres: 18,
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      destinationType: 'CUSTOMER',
      policy,
      now,
    });
    expect(result).toMatchObject({ verified: true, overridden: false, destinationType: 'CUSTOMER' });
    expect((result as any).distanceMetres).toBeLessThan(250);
  });

  it('rejects coordinates outside the policy radius', () => {
    expect(() => validateRiderArrivalEvidence({
      evidence: {
        latitude: 17.7400,
        longitude: 83.3200,
        accuracyMetres: 20,
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      destinationType: 'STORE',
      policy,
      now,
    })).toThrow(/Move within 250 metres/);
  });

  it('rejects stale and inaccurate evidence', () => {
    expect(() => validateRiderArrivalEvidence({
      evidence: {
        latitude: 17.7301,
        longitude: 83.3101,
        accuracyMetres: 150,
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      destinationType: 'STORE',
      policy,
      now,
    })).toThrow(/accuracy/);
    expect(() => validateRiderArrivalEvidence({
      evidence: {
        latitude: 17.7301,
        longitude: 83.3101,
        accuracyMetres: 20,
        capturedAt: '2026-08-04T00:50:00.000Z',
      },
      destination,
      destinationType: 'STORE',
      policy,
      now,
    })).toThrow(/stale/);
  });

  it('allows only an explicit audited exception', () => {
    const result = validateRiderArrivalEvidence({
      evidence: {
        override: {
          reason: 'GPS_UNAVAILABLE',
          note: 'GPS hardware did not return a fix.',
          deviceState: 'LOCATION_ENABLED_NO_FIX',
        },
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      destinationType: 'CUSTOMER',
      policy,
      now,
    });
    expect(result).toMatchObject({
      verified: false,
      overridden: true,
      override: { reason: 'GPS_UNAVAILABLE' },
    });
  });

  it('requires positive accuracy for verified evidence', () => {
    expect(() => validateRiderArrivalEvidence({
      evidence: {
        latitude: 17.7301,
        longitude: 83.3101,
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      destinationType: 'STORE',
      policy,
      now,
    })).toThrow(/accuracy is required/);

    expect(() => validateRiderArrivalEvidence({
      evidence: {
        latitude: 17.7301,
        longitude: 83.3101,
        accuracyMetres: 0,
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      destinationType: 'STORE',
      policy,
      now,
    })).toThrow(/accuracy is required/);
  });

  it('computes distance deterministically', () => {
    expect(distanceMetresBetween(destination, destination)).toBe(0);
  });
});
