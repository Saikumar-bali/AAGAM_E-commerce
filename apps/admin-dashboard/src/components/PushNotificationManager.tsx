'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Loader2 } from 'lucide-react';
import { enablePushNotifications, pushNotificationsSupported } from '@/lib/pushNotifications';

export default function PushNotificationManager() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const activate = useCallback(async (silent = false) => {
    setLoading(true);
    if (!silent) setMessage('');
    try {
      const result = await enablePushNotifications();
      setEnabled(result.enabled);
      if (!silent) {
        setMessage(
          result.enabled
            ? 'Background alerts enabled.'
            : result.reason || 'Push notifications could not be enabled.',
        );
      }
    } catch (error: any) {
      if (!silent) {
        setMessage(
          error?.response?.data?.message ||
            error?.message ||
            'Push notification setup failed.',
        );
      }
    } finally {
      setLoading(false);
      if (!silent) window.setTimeout(() => setMessage(''), 5000);
    }
  }, []);

  useEffect(() => {
    const available = pushNotificationsSupported();
    setSupported(available);
    if (!available) return;

    const previouslyEnabled =
      Notification.permission === 'granted' &&
      localStorage.getItem('aagam_push_enabled') === 'true';
    setEnabled(previouslyEnabled);

    // A deploy can replace the service worker while permission remains granted.
    // Restore token and worker registration without asking the user again.
    if (previouslyEnabled) void activate(true);
  }, [activate]);

  if (!supported) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void activate(false)}
        disabled={loading || enabled}
        title={enabled ? 'Background notifications enabled' : 'Enable background notifications'}
        aria-label={enabled ? 'Background notifications enabled' : 'Enable background notifications'}
        className={`flex h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-black shadow-sm transition ${
          enabled
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:text-indigo-700'
        } disabled:cursor-default`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : enabled ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <BellRing className="h-4 w-4" />
        )}
        <span className="hidden xl:inline">{enabled ? 'Alerts on' : 'Enable alerts'}</span>
      </button>
      {message && (
        <div className="absolute right-0 top-14 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-700 shadow-xl">
          {message}
        </div>
      )}
    </div>
  );
}
