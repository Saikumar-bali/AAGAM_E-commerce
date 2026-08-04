import Geolocation from 'react-native-geolocation-service';

export type RiderLocationEvidence = {
  latitude: number;
  longitude: number;
  accuracyMetres?: number;
  capturedAt: string;
  source: 'MOBILE_PARTNERS_GPS';
};

export type RiderLocationOverride = {
  override: {
    reason: 'GPS_UNAVAILABLE' | 'GPS_INACCURATE' | 'PERMISSION_DENIED';
    note: string;
    deviceState?: string;
  };
  capturedAt: string;
  source: 'MOBILE_PARTNERS_OVERRIDE';
};

export function captureRiderLocationEvidence(timeout = 12_000): Promise<RiderLocationEvidence> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy,
        capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        source: 'MOBILE_PARTNERS_GPS',
      }),
      (error) => reject(new Error(
        error?.message
          || 'Current GPS evidence is required for this arrival action. Open Tracking diagnostics and retry.',
      )),
      { enableHighAccuracy: true, timeout, maximumAge: 5_000 },
    );
  });
}

export function createRiderLocationOverride(input: RiderLocationOverride['override']): RiderLocationOverride {
  if (!input.note || input.note.trim().length < 8) {
    throw new Error('Add an auditable GPS exception note of at least 8 characters.');
  }
  return {
    override: { ...input, note: input.note.trim() },
    capturedAt: new Date().toISOString(),
    source: 'MOBILE_PARTNERS_OVERRIDE',
  };
}
