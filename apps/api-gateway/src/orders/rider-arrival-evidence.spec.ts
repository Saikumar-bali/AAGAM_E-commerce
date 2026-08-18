import {
  addressLocationSourceFromSnapshot,
  distanceMetresBetween,
  validateCustomerArrivalEvidence,
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

  it('allows only an explicit audited exception for the existing generic/store path', () => {
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

  it('hard-geofences LIVE_GPS customer addresses and rejects the Rider override', () => {
    const passed = validateCustomerArrivalEvidence({
      evidence: {
        latitude: 17.7301,
        longitude: 83.3101,
        accuracyMetres: 12,
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      locationSource: 'LIVE_GPS',
      policy,
      now,
    });
    expect(passed).toMatchObject({
      verified: true,
      locationSource: 'LIVE_GPS',
      verificationMode: 'HARD_GEOFENCE',
      decision: 'PASS',
      geofenceRequired: true,
    });

    expect(() => validateCustomerArrivalEvidence({
      evidence: {
        override: {
          reason: 'GPS_UNAVAILABLE',
          note: 'Location hardware is temporarily unavailable.',
        },
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      locationSource: 'LIVE_GPS',
      policy,
      now,
    })).toThrow(/live GPS/i);
  });

  it('rejects LIVE_GPS customer arrival outside the saved geofence', () => {
    expect(() => validateCustomerArrivalEvidence({
      evidence: {
        latitude: 17.7400,
        longitude: 83.3200,
        accuracyMetres: 20,
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      locationSource: 'LIVE_GPS',
      policy,
      now,
    })).toThrow(/Move within 250 metres/);
  });

  it.each(['MAP_PIN', 'GEOCODED', 'LEGACY_UNKNOWN'] as const)(
    'records distance without rejecting %s customer addresses',
    (locationSource) => {
      const result = validateCustomerArrivalEvidence({
        evidence: {
          latitude: 17.7400,
          longitude: 83.3200,
          accuracyMetres: 20,
          capturedAt: '2026-08-04T00:59:30.000Z',
        },
        destination,
        locationSource,
        policy,
        now,
      });
      expect(result).toMatchObject({
        verified: true,
        locationSource,
        verificationMode: 'SOFT_AUDIT',
        decision: 'RECORDED',
        geofenceRequired: false,
      });
      expect((result as any).distanceMetres).toBeGreaterThan(250);
    },
  );

  it('allows an audited GPS exception only for non-live customer address sources', () => {
    const result = validateCustomerArrivalEvidence({
      evidence: {
        override: {
          reason: 'PERMISSION_DENIED',
          note: 'Customer confirmed delivery but location permission is denied.',
        },
        capturedAt: '2026-08-04T00:59:30.000Z',
      },
      destination,
      locationSource: 'GEOCODED',
      policy,
      now,
    });
    expect(result).toMatchObject({
      overridden: true,
      locationSource: 'GEOCODED',
      verificationMode: 'SOFT_AUDIT',
      decision: 'OVERRIDE_RECORDED',
      geofenceRequired: false,
    });
  });

  it('treats snapshots without provenance as legacy instead of GPS verified', () => {
    expect(addressLocationSourceFromSnapshot({ latitude: 17.73, longitude: 83.31 })).toBe('LEGACY_UNKNOWN');
    expect(addressLocationSourceFromSnapshot({ locationSource: 'LIVE_GPS' })).toBe('LIVE_GPS');
    expect(addressLocationSourceFromSnapshot({ locationSource: 'SOMETHING_ELSE' })).toBe('LEGACY_UNKNOWN');
  });

  it('computes distance deterministically', () => {
    expect(distanceMetresBetween(destination, destination)).toBe(0);
  });
});
