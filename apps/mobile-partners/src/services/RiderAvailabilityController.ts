import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { riderService } from '../api/riderService';
import { RiderOnlineService } from './RiderOnlineService';

export type RiderAvailabilityCoordinates = {
  latitude: number;
  longitude: number;
};

export type RiderPositionRequest = {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
};

type PositionProvider = (options: RiderPositionRequest) => Promise<RiderAvailabilityCoordinates>;

type OnlineTransitionDeps = {
  requestPermission: () => Promise<boolean>;
  acquireLocation: () => Promise<RiderAvailabilityCoordinates>;
  updateStatus: (status: 'ONLINE' | 'OFFLINE') => Promise<any>;
  sendHeartbeat: (location: RiderAvailabilityCoordinates) => Promise<any>;
  startOnlineService: (riderName: string) => Promise<any>;
  stopOnlineService: () => Promise<any>;
};

const CACHED_LOCATION_MAX_AGE_MS = 3 * 60_000;

function geolocationPosition(options: RiderPositionRequest) {
  return new Promise<RiderAvailabilityCoordinates>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      reject,
      options,
    );
  });
}

function locationFailureMessage(error: any) {
  if (Number(error?.code) === 1) {
    return 'Precise location permission is required before going online.';
  }
  if (Number(error?.code) === 2) {
    return 'Current location is unavailable. Turn on device Location and try again.';
  }
  if (Number(error?.code) === 3 || /timed?\s*out/i.test(String(error?.message || ''))) {
    return 'Location is taking too long. Keep device Location on and try again in an open area.';
  }
  return error?.message || 'Unable to get the Rider current location.';
}

/**
 * Prefer a recent fused/network fix first. If Android cannot provide one quickly,
 * fall back to a longer high-accuracy request. This avoids blocking Rider Online
 * on a 5-second-fresh GPS-only fix while still requiring a real current location.
 */
export async function acquireRiderAvailabilityLocation(
  positionProvider: PositionProvider = geolocationPosition,
): Promise<RiderAvailabilityCoordinates> {
  try {
    return await positionProvider({
      enableHighAccuracy: false,
      timeout: 5_000,
      maximumAge: CACHED_LOCATION_MAX_AGE_MS,
    });
  } catch {
    try {
      return await positionProvider({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: CACHED_LOCATION_MAX_AGE_MS,
      });
    } catch (error: any) {
      throw new Error(locationFailureMessage(error));
    }
  }
}

export async function requestRiderLocationPermission() {
  if (Platform.OS !== 'android') return true;

  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  const fineResult = await PermissionsAndroid.check(fine)
    ? PermissionsAndroid.RESULTS.GRANTED
    : await PermissionsAndroid.request(fine, {
        title: 'Allow rider location',
        message: 'Aagaam Partners uses precise location while you are online and fulfilling deliveries.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
  if (fineResult !== PermissionsAndroid.RESULTS.GRANTED) return false;
  if (Number(Platform.Version) < 29) return true;

  const background = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
  if (await PermissionsAndroid.check(background)) return true;
  const result = await PermissionsAndroid.request(background, {
    title: 'Allow background rider location',
    message: 'Choose Allow all the time so dispatch can keep your availability fresh.',
    buttonPositive: 'Continue',
    buttonNegative: 'Not now',
  });
  if (result === PermissionsAndroid.RESULTS.GRANTED) return true;

  if (Number(Platform.Version) >= 30) {
    Alert.alert(
      'Allow background location',
      'Open App permissions → Location and choose Allow all the time.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => undefined) },
      ],
    );
  }
  return false;
}

export async function performRiderOnlineTransition(
  riderName: string,
  deps: OnlineTransitionDeps = {
    requestPermission: requestRiderLocationPermission,
    acquireLocation: acquireRiderAvailabilityLocation,
    updateStatus: riderService.updateMyStatus,
    sendHeartbeat: riderService.sendAvailabilityHeartbeat,
    startOnlineService: RiderOnlineService.start,
    stopOnlineService: RiderOnlineService.stop,
  },
) {
  const permitted = await deps.requestPermission();
  if (!permitted) {
    throw new Error('Background location is required before going online.');
  }

  const location = await deps.acquireLocation();

  // Keep the eligibility/break gate on the portal status endpoint, then
  // immediately persist the captured fix through the dedicated heartbeat API.
  // Do not report Online until both steps and the native foreground service start.
  await deps.updateStatus('ONLINE');
  try {
    await deps.sendHeartbeat(location);
    await deps.startOnlineService(riderName);
  } catch (error) {
    await deps.updateStatus('OFFLINE').catch(() => undefined);
    await deps.stopOnlineService().catch(() => undefined);
    throw error;
  }

  return location;
}

export async function performRiderOfflineTransition() {
  const result = await riderService.updateMyStatus('OFFLINE');
  await RiderOnlineService.stop().catch(() => false);
  return result;
}

export async function ensureRiderOnlineService(riderName: string) {
  const permitted = await requestRiderLocationPermission();
  if (!permitted) return false;
  await RiderOnlineService.start(riderName);
  return true;
}
