import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { startMobilePushLifecycle, useAuthStore } from '@aagam/mobile-shared';
import { RootNavigator } from './src/navigation/RootNavigator';

const queryClient = new QueryClient();

function PushLifecycle() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let unsubscribe: () => void = () => undefined;
    void startMobilePushLifecycle('AAGAM Customer', (message) => {
      Toast.show({
        type: 'info',
        text1: message.notification?.title || message.data?.title || 'AAGAM update',
        text2: message.notification?.body || message.data?.body || 'Your order has an update.',
      });
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [user?.id]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <PushLifecycle />
        <RootNavigator />
        <Toast />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default App;
