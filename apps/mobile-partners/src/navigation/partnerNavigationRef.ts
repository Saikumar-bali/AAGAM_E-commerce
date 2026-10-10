import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './partnerNavigationTypes';

export const partnerNavigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Single back entry point for pushed store screens. Pops the owning stack when
 * it can; otherwise (a dead-end deep link) returns to the nearest tab so the
 * control is never a no-op. Never throws if the container is not ready.
 */
export function goBackOrHome(navigation?: { canGoBack?: () => boolean; goBack?: () => void }): void {
  if (navigation?.canGoBack?.()) {
    navigation.goBack?.();
    return;
  }
  if (partnerNavigationRef.isReady()) {
    partnerNavigationRef.navigate('StoreTabs');
  }
}
