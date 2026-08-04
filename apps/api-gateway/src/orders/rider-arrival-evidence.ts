import { BadRequestException } from '@nestjs/common';

export type ArrivalCoordinate = {
  latitude: number;
  longitude: number;
};

export type RiderArrivalEvidence = ArrivalCoordinate & {
  accuracyMetres?: number;
  capturedAt: string;
  source?: string;
};

export type RiderArrivalOverride = {
  override: {
    reason: 'GPS_UNAVAILABLE' | 'GPS_INACCURATE' | 'PERMISSION_DENIED';
    note: string;
    deviceState?: string;
  };
  capturedAt: string;
  source?: string;
};

export type ArrivalEvidenceInput = RiderArrivalEvidence | RiderArrivalOverride;

export type TransitionEvidencePolicy = {
  maxAccuracyMetres: number;
  maxAgeMs: number;
};

export type ArrivalEvidencePolicy = TransitionEvidencePolicy & {
  radiusMetres: number;
};

const EARTH_RADIUS_METRES = 6_371_000;

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validCoordinate(point: ArrivalCoordinate) {
  return finite(point.latitude)
    && finite(point.longitude)
    && Math.abs(point.latitude) <= 90
    && Math.abs(point.longitude) <= 180;
}

export function distanceMetresBetween(from: ArrivalCoordinate, to: ArrivalCoordinate) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude))
      * Math.cos(radians(to.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validateRiderTransitionEvidence(input: {
  evidence: ArrivalEvidenceInput;
  policy: TransitionEvidencePolicy;
  now?: Date;
}) {
  if (!input.evidence || typeof input.evidence !== 'object') {
    throw new BadRequestException('Current GPS evidence is required for this Rider transition');
  }
  const now = input.now || new Date();
  const capturedAt = new Date((input.evidence as any).capturedAt);
  if (!Number.isFinite(capturedAt.getTime())) {
    throw new BadRequestException('capturedAt must be a valid ISO timestamp');
  }
  if (Math.abs(now.getTime() - capturedAt.getTime()) > input.policy.maxAgeMs) {
    throw new BadRequestException('Rider GPS evidence is stale. Capture a fresh location and retry.');
  }

  if ('override' in input.evidence) {
    const override = input.evidence.override;
    if (!override || !['GPS_UNAVAILABLE', 'GPS_INACCURATE', 'PERMISSION_DENIED'].includes(override.reason)) {
      throw new BadRequestException('A supported GPS exception reason is required');
    }
    if (!override.note || override.note.trim().length < 8) {
      throw new BadRequestException('GPS exception note must contain at least 8 characters');
    }
    return {
      verified: false,
      overridden: true,
      capturedAt: capturedAt.toISOString(),
      source: input.evidence.source || 'MOBILE_PARTNERS_OVERRIDE',
      override: {
        reason: override.reason,
        note: override.note.trim(),
        deviceState: override.deviceState || null,
      },
      policy: input.policy,
    };
  }

  if (!validCoordinate(input.evidence)) {
    throw new BadRequestException('Rider latitude and longitude are invalid');
  }
  if (
    finite(input.evidence.accuracyMetres)
    && Number(input.evidence.accuracyMetres) > input.policy.maxAccuracyMetres
  ) {
    throw new BadRequestException(
      `GPS accuracy must be within ${input.policy.maxAccuracyMetres} metres`,
    );
  }

  return {
    verified: true,
    overridden: false,
    latitude: input.evidence.latitude,
    longitude: input.evidence.longitude,
    accuracyMetres: input.evidence.accuracyMetres ?? null,
    capturedAt: capturedAt.toISOString(),
    source: input.evidence.source || 'MOBILE_PARTNERS_GPS',
    policy: input.policy,
  };
}

export function validateRiderArrivalEvidence(input: {
  evidence: ArrivalEvidenceInput;
  destination: ArrivalCoordinate;
  policy: ArrivalEvidencePolicy;
  now?: Date;
  destinationType: 'STORE' | 'CUSTOMER';
}) {
  const transition = validateRiderTransitionEvidence({
    evidence: input.evidence,
    policy: input.policy,
    now: input.now,
  });
  if (transition.overridden) {
    return { ...transition, destinationType: input.destinationType };
  }
  if (!validCoordinate(input.destination)) {
    throw new BadRequestException(`${input.destinationType.toLowerCase()} coordinates are unavailable`);
  }

  const distanceMetres = distanceMetresBetween(
    { latitude: transition.latitude!, longitude: transition.longitude! },
    input.destination,
  );
  if (distanceMetres > input.policy.radiusMetres) {
    throw new BadRequestException(
      `You are ${Math.round(distanceMetres)} metres from the ${input.destinationType.toLowerCase()}. Move within ${input.policy.radiusMetres} metres and retry.`,
    );
  }

  return {
    ...transition,
    destinationType: input.destinationType,
    distanceMetres: Math.round(distanceMetres),
  };
}

function positiveNumber(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function riderTransitionEvidencePolicy(): TransitionEvidencePolicy {
  return {
    maxAccuracyMetres: positiveNumber(process.env.RIDER_GEOFENCE_MAX_ACCURACY_METRES, 120),
    maxAgeMs: positiveNumber(process.env.RIDER_GEOFENCE_MAX_AGE_SECONDS, 120) * 1_000,
  };
}

export function riderArrivalPolicy(destinationType: 'STORE' | 'CUSTOMER'): ArrivalEvidencePolicy {
  return {
    ...riderTransitionEvidencePolicy(),
    radiusMetres: destinationType === 'STORE'
      ? positiveNumber(process.env.RIDER_STORE_GEOFENCE_METRES, 250)
      : positiveNumber(process.env.RIDER_CUSTOMER_GEOFENCE_METRES, 250),
  };
}
