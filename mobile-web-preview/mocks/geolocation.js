/* Web mock for react-native-geolocation-service. */
const position = {
  coords: { latitude: 17.6868, longitude: 83.2185, accuracy: 10, altitude: 0, heading: 0, speed: 0 },
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
