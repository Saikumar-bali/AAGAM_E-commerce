import { AppRegistry } from 'react-native';
import { setupBackgroundMessageHandler } from '@aagam/mobile-shared';
import App from './App';
import { name as appName } from './app.json';

setupBackgroundMessageHandler();
AppRegistry.registerComponent(appName, () => App);
