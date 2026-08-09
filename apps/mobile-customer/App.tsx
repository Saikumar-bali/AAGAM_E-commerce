import React, { useCallback, useEffect, useState } from 'react';
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

type DeliveryOtpRequest = {
  deliveryJobId: string;
  ownerUserId: string;
  revision: number;
};

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

    const handleMessage = (message: any) => {
      if (disposed) return;
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
          if (!disposed) navigate('OrderDetail', { orderId });
        }, 500);
      }
    };

    void startMobilePushLifecycle('Aagaam Customer', handleMessage, handleMessage).then((cleanup) => {
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
  const userId = useAuthStore((state) => state.user?.id || null);
  const [deliveryOtp, setDeliveryOtp] = useState<DeliveryOtpRequest | null>(null);

  const showDeliveryOtp = useCallback((deliveryJobId: string) => {
    if (!userId) return;
    // Always create a new request object. Reissuing an OTP for the same job
    // remounts the modal immediately instead of waiting for its polling interval.
    setDeliveryOtp({ deliveryJobId, ownerUserId: userId, revision: Date.now() });
  }, [userId]);

  useEffect(() => {
    // OTP state is account-scoped. Signing out or switching customers must make
    // the previous account's delivery code impossible to render on this device.
    setDeliveryOtp(null);
  }, [userId]);

  useEffect(() => { void checkForAppUpdate(); }, []);

  const visibleDeliveryOtp = Boolean(
    userId
    && deliveryOtp
    && deliveryOtp.ownerUserId === userId,
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <PushLifecycle onDeliveryOtp={showDeliveryOtp} />
        <RootNavigator />
        <DeliveryOtpModal
          key={deliveryOtp ? `${deliveryOtp.deliveryJobId}:${deliveryOtp.revision}` : 'delivery-otp-closed'}
          deliveryJobId={visibleDeliveryOtp ? deliveryOtp!.deliveryJobId : null}
          visible={visibleDeliveryOtp}
          onClose={() => setDeliveryOtp(null)}
        />
        <CustomerToast />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default App;
