/* Web mock for react-native-geolocation-service.
 * The point must sit inside the store's delivery radius (see
 * SUBSCRIPTION_STORE_DELIVERY_RADIUS_KM, default 25km), otherwise the customer
 * self-subscribe quote/create returns 409 "Eligible stores are outside the
 * configured delivery radius". The AAGAAM store is at 17.7333, 82.9849. */
const position = {
  coords: { latitude: 17.7333, longitude: 82.9849, accuracy: 10, altitude: 0, heading: 0, speed: 0 },
  timestamp: Date.now(),
};

const Geolocation = {
  getCurrentPosition: (success) => {
    if (success) success(position);
    return 1;
  },
  watchPosition: (success) => {
    if (success) success(position);
    return 1;
  },
  clearWatch: () => undefined,
  stopObserving: () => undefined,
  requestAuthorization: async () => 'granted',
  setRNConfiguration: () => undefined,
};

export default Geolocation;
