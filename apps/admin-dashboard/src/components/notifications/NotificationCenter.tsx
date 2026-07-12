'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import {
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import {
  enablePushNotifications,
  pushNotificationsSupported,
} from '@/lib/pushNotifications';

type Role = 'ADMIN' | 'CUSTOMER' | 'STORE_OWNER' | 'RIDER';

type InboxItem = {
  id: string;
  recipientId?: string;
  sourceHistoryId: string;
  orderId?: string | null;
  deliveryJobId?: string | null;
  type: string;
  title: string;
  body: string;
  deepLink?: string | null;
  createdAt: string;
  sentAt?: string | null;
  openedAt?: string | null;
  readAt?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
};

type Props = {
  role: Role;
  title?: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
};

function roleFallback(role: Role, item: InboxItem) {
  if (role === 'ADMIN') {
    return item.orderId ? `/admin/orders/${item.orderId}` : '/admin/notifications';
  }
  if (role === 'STORE_OWNER') return '/store/orders';
  if (role === 'RIDER') return item.deliveryJobId ? `/rider/delivery?job=${encodeURIComponent(item.deliveryJobId)}` : '/rider/notifications';
  return item.orderId ? `/shop/orders/${item.orderId}` : '/shop/notifications';
}

function eventLabel(type: string) {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export default function NotificationCenter({
  role,
  title = 'Notifications',
  subtitle = 'Operational alerts, delivery updates, and account messages in one place.',
  rightSlot,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [globalPush, setGlobalPush] = useState(true);
  const [pushSupported, setPushSupported] = useState(false);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [inboxResponse, preferenceResponse] = await Promise.all([
        apiClient.get('/notifications/inbox?limit=100'),
        apiClient.get('/notifications/preferences'),
      ]);

      setItems(inboxResponse.data?.items || []);
      setUnreadCount(Number(inboxResponse.data?.unreadCount || 0));

      const preferences = Array.isArray(preferenceResponse.data)
        ? preferenceResponse.data
        : [];
      const globalPreference = preferences.find(
        (preference: any) => preference.eventType === '*',
      );
      setGlobalPush(globalPreference?.pushEnabled !== false);

      const supported = pushNotificationsSupported();
      setPushSupported(supported);
      setPushEnabled(
        supported
          && Notification.permission === 'granted'
          && localStorage.getItem('aagam_push_enabled') === 'true',
      );
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    const handlePush = () => void fetchInbox();
    window.addEventListener('aagam:push-message', handlePush);
    return () => window.removeEventListener('aagam:push-message', handlePush);
  }, [fetchInbox]);

  const markRead = async (item: InboxItem, navigate = false) => {
    try {
      if (!item.readAt) {
        await apiClient.patch(`/notifications/${item.sourceHistoryId}/read`);
      }
      if (item.recipientId) {
        await apiClient
          .patch(`/notifications/${item.recipientId}/opened`)
          .catch(() => undefined);
      }

      setItems((current) => current.map((entry) => (
        entry.id === item.id
          ? {
              ...entry,
              readAt: entry.readAt || new Date().toISOString(),
              status: 'READ',
            }
          : entry
      )));
      setUnreadCount((current) => Math.max(0, current - (item.readAt ? 0 : 1)));

      if (navigate) {
        router.push(item.deepLink || roleFallback(role, item));
      }
    } catch (error: any) {
      setMessage(
        error?.response?.data?.message || 'Could not update the notification.',
      );
    }
  };

  const enablePush = async () => {
    setPushLoading(true);
    setMessage('');
    try {
      const result = await enablePushNotifications();
      setPushEnabled(result.enabled);
      setMessage(
        result.enabled
          ? 'Background notifications are enabled on this device.'
          : result.reason || 'Push setup failed.',
      );
    } catch (error: any) {
      setMessage(
        error?.response?.data?.message
          || error?.message
          || 'Push setup failed.',
      );
    } finally {
      setPushLoading(false);
    }
  };

  const toggleGlobalPush = async () => {
    const next = !globalPush;
    setGlobalPush(next);
    try {
      await apiClient.patch('/notifications/preferences', {
        eventType: '*',
        pushEnabled: next,
        inAppEnabled: true,
      });
      setMessage(
        next
          ? 'Push delivery preference enabled.'
          : 'Push delivery paused. In-app notifications remain available.',
      );
    } catch (error: any) {
      setGlobalPush(!next);
      setMessage(
        error?.response?.data?.message
          || 'Could not update notification preferences.',
      );
    }
  };

  const recentCount = useMemo(
    () => items.filter(
      (item) => Date.now() - new Date(item.createdAt).getTime()
        < 24 * 60 * 60 * 1000,
    ).length,
    [items],
  );

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-5 rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-300">
            Communication centre
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {rightSlot}
          {pushSupported && (
            <button
              type="button"
              onClick={enablePush}
              disabled={pushLoading || pushEnabled}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black ${
                pushEnabled
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-indigo-500 text-white hover:bg-indigo-400'
              } disabled:cursor-default`}
            >
              {pushLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : pushEnabled ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              {pushEnabled ? 'Background alerts on' : 'Enable background alerts'}
            </button>
          )}

          <button
            type="button"
            onClick={fetchInbox}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Unread
          </p>
          <p className="mt-2 text-3xl font-black text-indigo-700">{unreadCount}</p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Last 24 hours
          </p>
          <p className="mt-2 text-3xl font-black text-slate-950">{recentCount}</p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Device delivery
          </p>
          <p className={`mt-2 text-lg font-black ${
            pushEnabled ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            {!pushSupported ? 'Unsupported' : pushEnabled ? 'Enabled' : 'Not enabled'}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Push preference
              </p>
              <p className="mt-2 text-lg font-black text-slate-950">
                {globalPush ? 'On' : 'Paused'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleGlobalPush}
              aria-label="Toggle push preference"
              className={`relative h-7 w-12 rounded-full transition ${
                globalPush ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                globalPush ? 'left-6' : 'left-1'
              }`} />
            </button>
          </div>
        </article>
      </section>

      {message && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          {message}
        </div>
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-indigo-600" />
              <h2 className="text-xl font-black text-slate-950">Inbox</h2>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Read state and delivery attempts are stored separately from order history.
            </p>
          </div>
          <Settings2 className="h-5 w-5 text-slate-300" />
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm font-bold text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading notifications
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 p-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-950">
              No notifications yet
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              New order and delivery events will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <article
                key={item.id}
                className={`group rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                  item.readAt
                    ? 'border-slate-200 bg-slate-50/70'
                    : 'border-indigo-200 bg-indigo-50/55'
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    type="button"
                    onClick={() => markRead(item, true)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                        item.readAt
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-indigo-600 text-white'
                      }`}>
                        {eventLabel(item.type)}
                      </span>
                      {!item.readAt && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    </div>

                    <h3 className="mt-3 text-base font-black text-slate-950">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                      {item.body}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {new Date(item.createdAt).toLocaleString('en-IN')}
                      </span>
                      {item.orderId && (
                        <span>Order #{item.orderId.slice(-8).toUpperCase()}</span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 self-end sm:self-start">
                    {!item.readAt && (
                      <button
                        type="button"
                        onClick={() => markRead(item)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700"
                      >
                        <CheckCheck className="h-4 w-4" />
                        Mark read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => markRead(item, true)}
                      aria-label="Open notification"
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
