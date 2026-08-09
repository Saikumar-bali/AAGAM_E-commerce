import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkForAppUpdate, startMobilePushLifecycle, useAuthStore } from '@aagam/mobile-shared';
import { RootNavigator } from './src/navigation/RootNavigator';
import { CustomerToast } from './src/ui/CustomerToast';
import { notify } from './src/ui/notify';
import { navigate } from './src/navigation/navigationRef';
import { DeliveryOtpModal } from './src/components/orders/DeliveryOtpModal';

const queryClient = new QueryClient();

function deliveryJobFromMessage(message: any) {
  const data = message?.data || {};
  if (data.deliveryJobId) return String(data.deliveryJobId);
  const deepLink = typeof data.deepLink === 'string' ? data.deepLink : '';
  const match = deepLink.match(/\/shop\/delivery-code\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function PushLifecycle({ onDeliveryOtp }: { onDeliveryOtp: (deliveryJobId: string) => void }) {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let unsubscribe: () => void = () => undefined;
    void startMobilePushLifecycle('Aagaam Customer', (message) => {
      const title = message.notification?.title || message.data?.title || 'Aagaam update';
      const body = message.notification?.body || message.data?.body || 'Your order has an update.';
      notify.info(title, body);

      const deliveryJobId = deliveryJobFromMessage(message);
      const operationType = String(message.data?.operationType || '');
      const isDeliveryOtp = operationType === 'OTP_ISSUED'
        || String(message.data?.deepLink || '').includes('/shop/delivery-code/');
      if (isDeliveryOtp && deliveryJobId) {
        onDeliveryOtp(deliveryJobId);
        return;
      }

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
  }, [user?.id, onDeliveryOtp]);

  return null;
}

function App() {
  const [deliveryOtpJobId, setDeliveryOtpJobId] = useState<string | null>(null);
  useEffect(() => { void checkForAppUpdate(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <PushLifecycle onDeliveryOtp={setDeliveryOtpJobId} />
        <RootNavigator />
        <DeliveryOtpModal
          deliveryJobId={deliveryOtpJobId}
          visible={Boolean(deliveryOtpJobId)}
          onClose={() => setDeliveryOtpJobId(null)}
        />
        <CustomerToast />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default App;
