import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkForAppUpdate } from '@aagam/mobile-shared';
import RootNavigator from './src/navigation/RootNavigator';
import { hydrateCachedRiderWorkspace } from './src/api/riderService';
import { PartnerPushCoordinator } from './src/notifications/PartnerPushCoordinator';
import { RiderPhotoProofFallback } from './src/components/RiderPhotoProofFallback';

const queryClient = new QueryClient();

function App() {
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => { void checkForAppUpdate(); }, []);
  useEffect(() => {
    let active = true;
    void hydrateCachedRiderWorkspace(queryClient).finally(() => {
      if (active) setCacheReady(true);
    });
    return () => { active = false; };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        {cacheReady ? (
          <>
            <PartnerPushCoordinator queryClient={queryClient} />
            <RootNavigator />
            <RiderPhotoProofFallback />
          </>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color="#0F766E" />
            <Text style={styles.loadingText}>Restoring partner workspace…</Text>
          </View>
        )}
        <Toast position="top" topOffset={8} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F7FB', gap: 12 },
  loadingText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
});

export default App;
