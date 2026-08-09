'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import { enablePushNotifications } from '@/lib/pushNotifications';
import DeliveryCodeModal from './DeliveryCodeModal';

type InboxItem = {
  id?: string;
  sourceHistoryId?: string;
  orderId?: string;
  title?: string;
  body?: string;
  type?: string;
  readAt?: string | null;
};

const LAST_OTP_KEY = 'aagam:last-auto-opened-delivery-otp';

function jobIdFromDeepLink(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/\/shop\/delivery-code\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isOtpNotice(item: InboxItem) {
  const text = `${item.title || ''} ${item.body || ''}`.toLowerCase();
  return text.includes('delivery verification code')
    || text.includes('verification code for order')
    || text.includes('code is ready in the order screen');
}

export default function CustomerDeliveryOtpListener() {
  const pathname = usePathname();
  const customerArea = Boolean(pathname?.startsWith('/shop'));
  const [deliveryJobId, setDeliveryJobId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const checking = useRef(false);

  const showJob = useCallback((jobId: string, noticeId?: string | null) => {
    if (!jobId) return;
    if (noticeId) window.localStorage.setItem(LAST_OTP_KEY, noticeId);
    setDeliveryJobId(jobId);
    setOpen(true);
  }, []);

  const resolveOrder = useCallback(async (orderId: string, noticeId?: string | null) => {
    try {
      const response = await apiClient.get(`/orders/my/${encodeURIComponent(orderId)}/delivery-context`);
      if (response.data?.deliveryStatus !== 'RIDER_AT_CUSTOMER' || !response.data?.deliveryJobId) return;
      showJob(String(response.data.deliveryJobId), noticeId);
    } catch {
      // The next inbox poll can retry. Do not interrupt shopping for a transient read failure.
    }
  }, [showJob]);

  useEffect(() => {
    if (!customerArea) return;

    const pathJobId = jobIdFromDeepLink(window.location.pathname);
    if (pathJobId) showJob(pathJobId, `path:${pathJobId}`);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void enablePushNotifications().catch(() => undefined);
    }

    const onPush = (event: Event) => {
      const payload = (event as CustomEvent<any>).detail || {};
      const data = payload.data || {};
      const operationType = String(data.operationType || '');
      const deepLinkJobId = jobIdFromDeepLink(data.deepLink);
      const directJobId = data.deliveryJobId ? String(data.deliveryJobId) : null;
      if (operationType !== 'OTP_ISSUED' && !deepLinkJobId) return;
      const jobId = directJobId || deepLinkJobId;
      if (jobId) showJob(jobId, data.notificationId ? `push:${data.notificationId}` : `push:${jobId}:${data.operationId || ''}`);
    };

    window.addEventListener('aagam:push-message', onPush as EventListener);
    return () => window.removeEventListener('aagam:push-message', onPush as EventListener);
  }, [customerArea, showJob]);

  useEffect(() => {
    if (!customerArea) return;
    let active = true;

    const poll = async () => {
      if (!active || checking.current || document.visibilityState === 'hidden') return;
      checking.current = true;
      try {
        const response = await apiClient.get('/notifications/inbox');
        const items: InboxItem[] = Array.isArray(response.data?.items) ? response.data.items : [];
        const latest = items.find((item) => item.orderId && isOtpNotice(item));
        if (!latest?.orderId) return;
        const noticeId = `inbox:${latest.sourceHistoryId || latest.id || latest.orderId}`;
        if (window.localStorage.getItem(LAST_OTP_KEY) === noticeId) return;
        await resolveOrder(String(latest.orderId), noticeId);
      } catch {
        // Push remains the primary path. Polling is intentionally a quiet fallback.
      } finally {
        checking.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 6_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [customerArea, resolveOrder]);

  if (!customerArea) return null;
  return <DeliveryCodeModal deliveryJobId={deliveryJobId} open={open} onClose={() => setOpen(false)} />;
}
