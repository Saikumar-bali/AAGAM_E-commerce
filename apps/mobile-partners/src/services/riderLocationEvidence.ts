import { Alert } from 'react-native';
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

function createRiderLocationOverride(input: RiderLocationOverride['override']): RiderLocationOverride {
  if (!input.note || input.note.trim().length < 8) {
    throw new Error('Add an auditable GPS exception note of at least 8 characters.');
  }
  return {
    override: { ...input, note: input.note.trim() },
    capturedAt: new Date().toISOString(),
    source: 'MOBILE_PARTNERS_OVERRIDE',
  };
}

function confirmGpsException(error: { code?: number; message?: string }): Promise<RiderLocationOverride> {
  const permissionDenied = error.code === 1;
  const reason: RiderLocationOverride['override']['reason'] = permissionDenied
    ? 'PERMISSION_DENIED'
    : 'GPS_UNAVAILABLE';
  const message = error.message || 'The device did not return a current GPS fix.';

  return new Promise((resolve, reject) => {
    Alert.alert(
      'GPS evidence unavailable',
      `${message}\n\nArrival should normally be verified by location. Use an exception only when you are physically at the destination. This action is audited.`,
      [
        {
          text: 'Cancel and fix GPS',
          style: 'cancel',
          onPress: () => reject(new Error('Arrival cancelled. Fix GPS or location permission and retry.')),
        },
        {
          text: 'Use audited exception',
          style: 'destructive',
          onPress: () => resolve(createRiderLocationOverride({
            reason,
            note: `Rider explicitly confirmed destination arrival after GPS failure: ${message}`,
            deviceState: permissionDenied ? 'LOCATION_PERMISSION_DENIED' : 'LOCATION_ENABLED_NO_CURRENT_FIX',
          })),
        },
      ],
      { cancelable: false },
    );
  });
}

export function captureRiderLocationEvidence(
  timeout = 12_000,
): Promise<RiderLocationEvidence | RiderLocationOverride> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy,
        capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        source: 'MOBILE_PARTNERS_GPS',
      }),
      (error) => {
        void confirmGpsException(error)
          .then(resolve)
          .catch(reject);
      },
      { enableHighAccuracy: true, timeout, maximumAge: 5_000 },
    );
  });
}

export { createRiderLocationOverride };
