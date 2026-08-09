import messaging from '@react-native-firebase/messaging';
import {
  partnerOperationalSessionKey,
  registerMobileSessionCleanup,
  resolvePartnerOperationalRole,
  reverifyDeviceTokenBinding,
  startMobilePushLifecycle,
  useAuthStore,
} from '@aagam/mobile-shared';
import type { QueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef } from 'react';
import { AppState, NativeModules } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  notificationService,
  PartnerNotification,
  PartnerNotificationInbox,
} from '../api/notificationService';
import {
  navigationCommandForNotification,
  normalizeNotificationNavigation,
  notificationDedupeKey,
  PartnerNavigationCommand,
  queryKeysForNotification,
} from '../domain/partnerNotifications';
import { navigatePartnerCommand } from '../navigation/partnerNavigationCommands';
import { partnerNavigationRef } from '../navigation/partnerNavigationRef';

const NOTIFICATION_KEY = ['partner-notifications'] as const;
const PartnerAlertTone = NativeModules.PartnerAlertTone as { play?: () => void; stop?: () => void } | undefined;
const MAX_DEDUPE_ENTRIES = 500;
const INBOX_POLL_MS = 10_000;
const PUSH_REVERIFY_MS = 5 * 60_000;
const PUSH_STARTUP_RETRY_MS = 30_000;

type Props = {
  queryClient: QueryClient;
};

type RemoteMessageLike = {
  notification?: { title?: string; body?: string };
  data?: Record<string, unknown>;
};

function dataFromInboxItem(item: PartnerNotification): Record<string, unknown> {
  const metadata = item.metadata || {};
  return {
    ...metadata,
    id: item.id,
    notificationId: item.id,
    recipientId: item.recipientId || item.id,
    eventType: item.type,
    target: item.target,
    action: item.action,
    deepLink: item.deepLink,
    orderId: item.orderId ?? metadata.orderId,
    deliveryJobId: item.deliveryJobId ?? metadata.deliveryJobId,
    assignmentId: item.assignmentId ?? metadata.assignmentId,
    ticketId: item.ticketId ?? metadata.ticketId,
    storeId: item.storeId ?? metadata.storeId,
  };
}

function dataFromRemoteMessage(message: RemoteMessageLike) {
  return message.data;
}

export function PartnerPushCoordinator({ queryClient }: Props) {
  const user = useAuthStore((state) => state.user);
  const pendingNavigation = useRef<PartnerNavigationCommand[]>([]);
  const seen = useRef(new Map<string, number>());
  const inboxBootstrapped = useRef(false);
  const previousSession = useRef<string | null>(null);

  useEffect(() => {
    const sessionKey = partnerOperationalSessionKey(user as any);
    if (previousSession.current && previousSession.current !== sessionKey) {
      pendingNavigation.current = [];
      seen.current.clear();
      inboxBootstrapped.current = false;
      queryClient.removeQueries({
        predicate: (query) => {
          const first = query.queryKey[0];
          return first === 'rider'
            || first === 'partner-notifications'
            || first === 'partner-store-orders'
            || first === 'store-owner-dashboard-stores';
        },
      });
    }
    previousSession.current = sessionKey;
  }, [queryClient, user]);

  useEffect(() => {
    const role = resolvePartnerOperationalRole(user as any);
    if (!user || (role !== 'RIDER' && role !== 'STORE_OWNER')) return;

    let disposed = false;
    let pushCleanup: () => void = () => undefined;
    let openedCleanup: () => void = () => undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let pushReverifyInterval: ReturnType<typeof setInterval> | undefined;
    let pushStartupRetry: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let pushReverifyInFlight: Promise<void> | null = null;
    let pushLifecycleStartInFlight: Promise<void> | null = null;

    const clearPushRecoveryTimers = () => {
      if (pushReverifyInterval) {
        clearInterval(pushReverifyInterval);
        pushReverifyInterval = undefined;
      }
      if (pushStartupRetry) {
        clearTimeout(pushStartupRetry);
        pushStartupRetry = undefined;
      }
    };

    const remember = (key: string) => {
      if (!key) return false;
      if (seen.current.has(key)) return false;
      seen.current.set(key, Date.now());
      if (seen.current.size > MAX_DEDUPE_ENTRIES) {
        const oldest = Array.from(seen.current.entries())
          .sort((left, right) => left[1] - right[1])
          .slice(0, seen.current.size - MAX_DEDUPE_ENTRIES);
        oldest.forEach(([entry]) => seen.current.delete(entry));
      }
      return true;
    };

    const invalidate = async (
      payload: ReturnType<typeof normalizeNotificationNavigation>,
    ) => {
      await Promise.all(
        queryKeysForNotification(payload.eventType, payload.ticketId).map((queryKey) => (
          queryClient.invalidateQueries({ queryKey })
        )),
      );
    };

    const flushNavigation = () => {
      if (!partnerNavigationRef.isReady()) return;
      const commands = pendingNavigation.current.splice(0);
      commands.forEach((command) => navigatePartnerCommand(command));
    };

    const queueOrNavigate = (command: PartnerNavigationCommand) => {
      if (!navigatePartnerCommand(command)) {
        pendingNavigation.current = [command];
        setTimeout(flushNavigation, 350);
        setTimeout(flushNavigation, 1_000);
      }
    };

    const acknowledgeOpen = async (payload: ReturnType<typeof normalizeNotificationNavigation>) => {
      const recipientId = payload.recipientId;
      if (recipientId) {
        await notificationService.markOpened(recipientId).catch(() => undefined);
      }
      const readableId = payload.recipientId || payload.notificationId;
      if (readableId) {
        await notificationService.markRead(readableId).catch(() => undefined);
      }
      await queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
    };

    const routeOpened = async (raw: Record<string, unknown> | undefined) => {
      const payload = normalizeNotificationNavigation(raw);
      if (!remember(`${notificationDedupeKey(payload)}:opened`)) return;
      await Promise.all([invalidate(payload), acknowledgeOpen(payload)]);
      queueOrNavigate(navigationCommandForNotification(payload));
    };

    const showForeground = async (
      raw: Record<string, unknown> | undefined,
      title?: string,
      body?: string,
    ) => {
      const payload = normalizeNotificationNavigation(raw);
      if (!remember(notificationDedupeKey(payload))) return;
      PartnerAlertTone?.play?.();
      Toast.show({
        type: 'info',
        text1: title || 'Aagaam operations update',
        text2: body || 'Open Alerts for the latest update.',
        visibilityTime: 6_000,
        onPress: () => void routeOpened(raw),
      });
      await invalidate(payload);
    };

    const pollInbox = async () => {
      if (disposed || polling) return;
      polling = true;
      try {
        const inbox = await notificationService.getInbox(50);
        queryClient.setQueryData<PartnerNotificationInbox>(NOTIFICATION_KEY, inbox);
        if (!inboxBootstrapped.current) {
          inbox.items.forEach((item) => remember(notificationDedupeKey(
            normalizeNotificationNavigation(dataFromInboxItem(item)),
          )));
          inboxBootstrapped.current = true;
          return;
        }

        const unseen = inbox.items
          .filter((item) => !item.readAt)
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
        for (const item of unseen.slice(-3)) {
          await showForeground(dataFromInboxItem(item), item.title, item.body);
        }
      } catch {
        // Durable inbox retry happens on the next interval or foreground event.
      } finally {
        polling = false;
      }
    };

    const deviceName = role === 'RIDER' ? 'Aagaam Rider' : 'Aagaam Store Partner';
    const reverifyPushRegistration = () => {
      if (disposed) return Promise.resolve();
      if (pushReverifyInFlight) return pushReverifyInFlight;

      const task = reverifyDeviceTokenBinding(deviceName)
        .catch((error) => {
          if (__DEV__) console.warn('[FCM] Partner push re-registration failed.', error?.message || error);
        })
        .then(() => undefined)
        .finally(() => {
          if (pushReverifyInFlight === task) pushReverifyInFlight = null;
        });
      pushReverifyInFlight = task;
      return task;
    };

    const lifecycleTask = startMobilePushLifecycle(deviceName, (message) => {
      void showForeground(
        dataFromRemoteMessage(message),
        message.notification?.title || String(message.data?.title || ''),
        message.notification?.body || String(message.data?.body || ''),
      ).then(pollInbox);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else pushCleanup = cleanup;
    }).catch(() => {
      if (!disposed) {
        Toast.show({
          type: 'error',
          text1: 'Push setup unavailable',
          text2: 'The durable Alerts inbox will continue checking for operational updates.',
          visibilityTime: 7_000,
        });
      }
    }).finally(() => {
      if (pushLifecycleStartInFlight === lifecycleTask) pushLifecycleStartInFlight = null;
    });
    pushLifecycleStartInFlight = lifecycleTask;

    // If initial registration failed for a transient network/session reason, repair
    // only an already-authorized token. Automatic recovery never opens a permission
    // prompt after the user chose "Not now".
    pushStartupRetry = setTimeout(() => { void reverifyPushRegistration(); }, PUSH_STARTUP_RETRY_MS);
    pushReverifyInterval = setInterval(() => { void reverifyPushRegistration(); }, PUSH_REVERIFY_MS);

    try {
      openedCleanup = messaging().onNotificationOpenedApp((message) => {
        void routeOpened(dataFromRemoteMessage(message));
      });
      void messaging().getInitialNotification().then((message) => {
        if (message) void routeOpened(dataFromRemoteMessage(message));
      }).catch(() => undefined);
    } catch {
      // Local builds without Firebase still use the inbox fallback.
    }

    void pollInbox();
    interval = setInterval(() => void pollInbox(), INBOX_POLL_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        flushNavigation();
        void reverifyPushRegistration();
        void pollInbox();
      }
    });
    const unregisterCleanup = registerMobileSessionCleanup(async () => {
      // Logout waits for any already-started registration POST to finish before
      // disableCurrentMobilePushSubscription runs. This prevents a late POST from
      // reactivating the FCM token after logout has disabled it.
      disposed = true;
      clearPushRecoveryTimers();
      await Promise.all([
        pushReverifyInFlight?.catch(() => undefined),
        pushLifecycleStartInFlight?.catch(() => undefined),
      ]);
      pendingNavigation.current = [];
      seen.current.clear();
      PartnerAlertTone?.stop?.();
    });

    return () => {
      disposed = true;
      clearPushRecoveryTimers();
      PartnerAlertTone?.stop?.();
      pushCleanup();
      openedCleanup();
      unregisterCleanup();
      appState.remove();
      if (interval) clearInterval(interval);
    };
  }, [queryClient, user]);

  return null;
}
