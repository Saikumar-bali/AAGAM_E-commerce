import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkForAppUpdate, startMobilePushLifecycle, useAuthStore } from '@aagam/mobile-shared';
import RootNavigator from './src/navigation/RootNavigator';
import { hydrateCachedRiderWorkspace } from './src/api/riderService';

const queryClient = new QueryClient();

function PushLifecycle() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let unsubscribe: () => void = () => undefined;
    const deviceName = user.role === 'RIDER' ? 'AAGAM Rider' : 'AAGAM Store Partner';
    void startMobilePushLifecycle(deviceName, (message) => {
      Toast.show({
        type: 'info',
        text1: message.notification?.title || message.data?.title || 'AAGAM operations update',
        text2: message.notification?.body || message.data?.body || 'Open the app for the latest assignment.',
      });
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [user?.id, user?.role]);

  return null;
}

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
            <PushLifecycle />
            <RootNavigator />
          </>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color="#0F766E" />
            <Text style={styles.loadingText}>Restoring partner workspace…</Text>
          </View>
        )}
        <Toast />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 12 },
  loadingText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
});

export default App;
