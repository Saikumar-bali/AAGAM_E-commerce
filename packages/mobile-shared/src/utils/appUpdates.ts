import { Alert, Linking } from 'react-native';
import { APP_VARIANT, APP_VERSION_CODE } from '@env';
import { apiClient } from '../api/client';

let checked = false;

export async function checkForAppUpdate() {
  if (checked) return;
  checked = true;
  try {
    const current = Number(APP_VERSION_CODE || 0);
    const app = String(APP_VARIANT || '').toUpperCase();
    if (!current || !['CUSTOMER', 'PARTNERS'].includes(app)) return;
    const release = (await apiClient.get('/app-releases/latest', { params: { app } })).data;
    if (!release?.versionCode || release.versionCode <= current || !release.downloadUrl) return;
    Alert.alert('AAGAM update available', `${release.versionName || 'A newer version'} is ready. Android will ask you to approve installation after download.`, [
      { text: 'Later', style: 'cancel' },
      { text: 'Download update', onPress: () => void Linking.openURL(release.downloadUrl) },
    ]);
  } catch {
    checked = false;
  }
}
