import { Alert } from 'react-native';

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

type GeolocationPosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  timestamp?: number;
};

type GeolocationError = {
  code?: number;
  message?: string;
};

type GeolocationApi = {
  getCurrentPosition: (
    success: (position: GeolocationPosition) => void,
    failure: (error: GeolocationError) => void,
    options: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
  ) => void;
};

function nativeGeolocation(): GeolocationApi {
  // Keep the native ESM package outside the module-load path so domain and API
  // tests can import Rider services without requiring a React Native runtime.
  const module = require('react-native-geolocation-service');
  return (module.default || module) as GeolocationApi;
}

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

function confirmGpsException(error: GeolocationError): Promise<RiderLocationOverride> {
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
    nativeGeolocation().getCurrentPosition(
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
