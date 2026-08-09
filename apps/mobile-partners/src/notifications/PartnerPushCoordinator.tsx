import messaging from '@react-native-firebase/messaging';
import {
  partnerOperationalSessionKey,
  registerDeviceToken,
  registerMobileSessionCleanup,
  resolvePartnerOperationalRole,
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
const PUSH_REPAIR_MS = 2 * 60 * 1000;

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
    let pushRepairInterval: ReturnType<typeof setInterval> | undefined;
    let polling = false;
    let repairingPush = false;

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
    const repairPushRegistration = async () => {
      if (disposed || repairingPush) return;
      repairingPush = true;
      try {
        // Re-upserting is intentional. It repairs a Store/Rider subscription after
        // a transient API failure, server cleanup, token reassignment, or account
        // switch even when Firebase has not emitted an onTokenRefresh callback.
        await registerDeviceToken(deviceName);
      } catch {
        // Durable inbox polling remains the fallback; retry on the next foreground
        // transition or repair interval without interrupting Partner operations.
      } finally {
        repairingPush = false;
      }
    };

    void startMobilePushLifecycle(deviceName, (message) => {
      void showForeground(
        dataFromRemoteMessage(message),
        message.notification?.title || String(message.data?.title || ''),
        message.notification?.body || String(message.data?.body || ''),
      ).then(pollInbox);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else pushCleanup = cleanup;
    }).catch(() => {
      Toast.show({
        type: 'error',
        text1: 'Push setup unavailable',
        text2: 'The durable Alerts inbox will continue checking for operational updates.',
        visibilityTime: 7_000,
      });
    });

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
    pushRepairInterval = setInterval(() => {
      if (AppState.currentState === 'active') void repairPushRegistration();
    }, PUSH_REPAIR_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        flushNavigation();
        void repairPushRegistration();
        void pollInbox();
      }
    });
    const unregisterCleanup = registerMobileSessionCleanup(() => {
      pendingNavigation.current = [];
      seen.current.clear();
      PartnerAlertTone?.stop?.();
    });

    return () => {
      disposed = true;
      PartnerAlertTone?.stop?.();
      pushCleanup();
      openedCleanup();
      unregisterCleanup();
      appState.remove();
      if (interval) clearInterval(interval);
      if (pushRepairInterval) clearInterval(pushRepairInterval);
    };
  }, [queryClient, user]);

  return null;
}
