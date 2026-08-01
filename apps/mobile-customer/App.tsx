import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkForAppUpdate, startMobilePushLifecycle, useAuthStore } from '@aagam/mobile-shared';
import { RootNavigator } from './src/navigation/RootNavigator';
import { CustomerToast } from './src/ui/CustomerToast';
import { notify } from './src/ui/notify';
import { navigate } from './src/navigation/navigationRef';

const queryClient = new QueryClient();

function PushLifecycle() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let unsubscribe: () => void = () => undefined;
    void startMobilePushLifecycle('Aagaam Customer', (message) => {
      const title = message.notification?.title || message.data?.title || 'Aagaam update';
      const body = message.notification?.body || message.data?.body || 'Your order has an update.';
      notify.info(title, body);

      const orderId = message.data?.orderId;
      if (orderId) {
        setTimeout(() => {
          navigate('OrderDetail', { orderId });
        }, 500);
      }
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
  useEffect(() => { void checkForAppUpdate(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <PushLifecycle />
        <RootNavigator />
        <CustomerToast />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default App;
