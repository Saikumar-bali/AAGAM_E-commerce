import { AppRegistry, I18nManager } from 'react-native';
import { setupBackgroundMessageHandler } from '@aagam/mobile-shared';
import App from './App';
import { name as appName } from './app.json';

// English-only app; the manifest pins android:supportsRtl="false".
// Without this guard an RTL device locale mirrors the whole layout (flat pill
// backgrounds, flipped rows/overlays, scrollbar on the left). Pin LTR before
// any component mounts.
if (I18nManager.allowRTL) {
  I18nManager.allowRTL(false);
}
I18nManager.forceRTL(false);

setupBackgroundMessageHandler();
AppRegistry.registerComponent(appName, () => App);
