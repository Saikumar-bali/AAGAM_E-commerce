import { AppRegistry, I18nManager } from 'react-native';
import { setupBackgroundMessageHandler } from '@aagam/mobile-shared';
import App from './App';
import { name as appName } from './app.json';

// The partner workspace is English-only. The manifest pins
// android:supportsRtl="false", so this is belt-and-braces for iOS/Hermes: an
// RTL device locale would otherwise mirror the whole layout (pill backgrounds
// rendered flat, rows and overlays flipped, the scrollbar moved to the left
// edge). Pin the app to LTR before any component mounts so the layout is
// identical on every locale.
if (I18nManager.allowRTL) {
  I18nManager.allowRTL(false);
}
I18nManager.forceRTL(false);

setupBackgroundMessageHandler();
AppRegistry.registerComponent(appName, () => App);
