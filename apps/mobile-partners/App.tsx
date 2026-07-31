import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, NativeModules, StatusBar, StyleSheet, Text, View } from 'react-native';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkForAppUpdate, startMobilePushLifecycle, useAuthStore } from '@aagam/mobile-shared';
import RootNavigator, { partnerNavigationRef } from './src/navigation/RootNavigator';
import { hydrateCachedRiderWorkspace } from './src/api/riderService';
import { notificationService, PartnerNotificationInbox } from './src/api/notificationService';

const queryClient = new QueryClient();
const NOTIFICATION_KEY = ['partner-notifications'] as const;
const PartnerAlertTone = NativeModules.PartnerAlertTone as { play?: () => void; stop?: () => void } | undefined;

function invalidateOperationalQueries(eventType?: string) {
  void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
  if (eventType === 'ORDER_PLACED' || eventType?.startsWith('ORDER_')) {
    void queryClient.invalidateQueries({ queryKey: ['partner-store-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['store-owner-dashboard-stores'] });
    void queryClient.invalidateQueries({ queryKey: ['partner-stores'] });
  }
  if (eventType === 'ASSIGNMENT_OFFERED' || eventType?.startsWith('ASSIGNMENT_') || eventType?.startsWith('DELIVERY_')) {
    void queryClient.invalidateQueries({ queryKey: ['rider', 'delivery-workspace'] });
  }
}

function openOperationalDestination(message?: FirebaseMessagingTypes.RemoteMessage | null) {
  if (!message || !partnerNavigationRef.isReady()) return;
  const eventType = String(message.data?.eventType || '');
  const storeId = message.data?.storeId ? String(message.data.storeId) : undefined;
  if (eventType === 'ORDER_PLACED' || eventType.startsWith('ORDER_')) {
    partnerNavigationRef.navigate('StoreTabs', {
      screen: 'Orders',
      params: { screen: 'OrderQueue', params: { storeId } },
    });
  } else if (eventType === 'ASSIGNMENT_OFFERED' || eventType.startsWith('ASSIGNMENT_') || eventType.startsWith('DELIVERY_')) {
    partnerNavigationRef.navigate('RiderTabs', { screen: 'Dashboard' });
  } else {
    partnerNavigationRef.navigate('Notifications');
  }
}

function PushLifecycle() {
  const user = useAuthStore((state) => state.user);
  const seenRecipientIds = useRef(new Set<string>());
  const inboxBootstrapped = useRef(false);

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let unsubscribePush: () => void = () => undefined;
    let unsubscribeOpened: () => void = () => undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let polling = false;
    seenRecipientIds.current.clear();
    inboxBootstrapped.current = false;

    const showMessage = (title?: string, body?: string, eventType?: string) => {
      PartnerAlertTone?.play?.();
      Toast.show({
        type: 'info',
        text1: title || 'Aagaam operations update',
        text2: body || 'Open the app for the latest operational update.',
        visibilityTime: 6000,
      });
      invalidateOperationalQueries(eventType);
    };

    const pollInbox = async () => {
      if (disposed || polling) return;
      polling = true;
      try {
        const inbox = await notificationService.getInbox(50);
        queryClient.setQueryData<PartnerNotificationInbox>(NOTIFICATION_KEY, inbox);
        const recipientKey = (item: any) => String(item.recipientId || item.sourceHistoryId || item.id);
        if (!inboxBootstrapped.current) {
          inbox.items.forEach((item) => seenRecipientIds.current.add(recipientKey(item)));
          inboxBootstrapped.current = true;
          return;
        }
        const unseen = inbox.items
          .filter((item) => !item.readAt && !seenRecipientIds.current.has(recipientKey(item)))
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
        unseen.slice(-3).forEach((item) => {
          seenRecipientIds.current.add(recipientKey(item));
          showMessage(item.title, item.body, item.type);
        });
        inbox.items.forEach((item) => seenRecipientIds.current.add(recipientKey(item)));
      } catch (_error) {
        // The next foreground poll or FCM callback will retry. Do not interrupt operations.
      } finally {
        polling = false;
      }
    };

    const deviceName = user.role === 'RIDER' ? 'Aagaam Rider' : 'Aagaam Store Partner';
    void startMobilePushLifecycle(deviceName, (message) => {
      const eventType = String(message.data?.eventType || '');
      const recipientId = String(message.data?.recipientId || '');
      if (recipientId) seenRecipientIds.current.add(recipientId);
      showMessage(
        message.notification?.title || String(message.data?.title || ''),
        message.notification?.body || String(message.data?.body || ''),
        eventType,
      );
      void pollInbox();
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribePush = cleanup;
    }).catch(() => {
      Toast.show({
        type: 'error',
        text1: 'Push notification setup unavailable',
        text2: 'The in-app Alerts inbox will continue checking for orders and rider offers.',
        visibilityTime: 7000,
      });
    });

    try {
      unsubscribeOpened = messaging().onNotificationOpenedApp((message) => {
        const recipientId = String(message.data?.recipientId || '');
        if (recipientId) seenRecipientIds.current.add(recipientId);
        invalidateOperationalQueries(String(message.data?.eventType || ''));
        openOperationalDestination(message);
      });
      void messaging().getInitialNotification().then((message) => {
        if (!message) return;
        const recipientId = String(message.data?.recipientId || '');
        if (recipientId) seenRecipientIds.current.add(recipientId);
        setTimeout(() => openOperationalDestination(message), 500);
      }).catch(() => undefined);
    } catch (_error) {
      // Dev builds without Firebase still receive the durable inbox fallback.
    }

    void pollInbox();
    interval = setInterval(() => void pollInbox(), 10_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void pollInbox();
    });

    return () => {
      disposed = true;
      PartnerAlertTone?.stop?.();
      unsubscribePush();
      unsubscribeOpened();
      if (interval) clearInterval(interval);
      appStateSubscription.remove();
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F7FB', gap: 12 },
  loadingText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
});

export default App;
