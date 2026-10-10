/* Web mock for @react-native-firebase/messaging.
 *
 * No FCM in the browser; every call resolves to a benign value so the push
 * lifecycle code degrades gracefully instead of throwing.
 */
const noop = () => undefined;
const asyncNoop = async () => undefined;

const messaging = () => ({
  requestPermission: async () => 1,
  hasPermission: async () => 1,
  getToken: async () => 'web-preview-token',
  deleteToken: asyncNoop,
  getInitialNotification: async () => null,
  onNotificationOpenedApp: () => noop,
  onMessage: () => noop,
  onTokenRefresh: () => noop,
  setBackgroundMessageHandler: noop,
  subscribeToTopic: asyncNoop,
  unsubscribeFromTopic: asyncNoop,
  registerDeviceForRemoteMessages: asyncNoop,
  setAutoInitEnabled: noop,
});

messaging.AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };
messaging.getMessaging = noop;

export default messaging;
