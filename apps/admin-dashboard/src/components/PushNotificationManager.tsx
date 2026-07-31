'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { enablePushNotifications, pushNotificationsSupported } from '@/lib/pushNotifications';

type PushNotificationManagerProps = {
  onOpen?: () => void;
  compact?: boolean;
};

function toast(kind: 'success' | 'error' | 'info', title: string, message: string) {
  window.dispatchEvent(new CustomEvent('aagam:toast', { detail: { kind, title, message } }));
}

export default function PushNotificationManager({ onOpen, compact = false }: PushNotificationManagerProps) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const activate = useCallback(async (silent = false) => {
    setLoading(true);
    try {
      const result = await enablePushNotifications();
      setEnabled(result.enabled);
      if (!silent) {
        if (result.enabled) toast('success', 'Notifications enabled', 'Aagaam operational alerts will appear in the background.');
        else toast('info', 'Notifications not enabled', result.reason || 'Allow notifications in your browser settings.');
      }
      return result.enabled;
    } catch (error: any) {
      if (!silent) toast('error', 'Notification setup failed', error?.response?.data?.message || error?.message || 'Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const available = pushNotificationsSupported();
    setSupported(available);
    if (!available) return;
    const previouslyEnabled = Notification.permission === 'granted' && localStorage.getItem('aagam_push_enabled') === 'true';
    setEnabled(previouslyEnabled);
    if (previouslyEnabled) void activate(true);
  }, [activate]);

  const handleClick = async () => {
    if (!supported || enabled) {
      onOpen?.();
      return;
    }
    const activated = await activate(false);
    if (activated) window.setTimeout(() => onOpen?.(), 350);
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={loading}
      title={supported && !enabled ? 'Enable notifications' : 'Open notifications'}
      aria-label={supported && !enabled ? 'Enable notifications' : 'Open notifications'}
      className={`relative flex items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:text-teal-700 disabled:opacity-60 ${compact ? 'h-10 w-10' : 'h-12 w-12'}`}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : enabled ? <Bell className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
      {enabled ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" /> : null}
    </button>
  );
}
