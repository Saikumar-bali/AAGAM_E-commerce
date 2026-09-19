'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import PushNotificationManager from '@/components/PushNotificationManager';
import { apiClient } from '@aagam/utils';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';

type InboxItem = { id: string; sourceHistoryId: string; orderId: string; type: string; title: string; body: string; createdAt: string; readAt?: string | null };

export default function CustomerNotificationsPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchInbox = async () => {
    setLoading(true); setMessage('');
    try {
      const res = await apiClient.get('/notifications/inbox');
      setItems(res.data?.items || []);
      setUnreadCount(res.data?.unreadCount || 0);
    } catch (err: any) { setMessage(err?.response?.data?.message || 'Could not load notifications'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchInbox(); }, []);

  const markRead = async (id: string) => {
    try { await apiClient.patch(`/notifications/${id}/read`); await fetchInbox(); }
    catch (err: any) { setMessage(err?.response?.data?.message || 'Could not mark notification read'); }
  };

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <main className="max-w-4xl space-y-4 pb-24">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-teal-50 text-teal-700">
                  <Bell className="h-4 w-4" />
                </div>
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <div>
                <p className="enterprise-kicker">Notifications</p>
                <h1 className="mt-1 text-lg font-semibold text-slate-950">Notifications</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2"><PushNotificationManager /><button onClick={() => void fetchInbox()} className="enterprise-button"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
          </div>
        </section>
        {message && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] font-medium text-amber-900">{message}</div>}
        {loading && <div className="rounded-xl bg-slate-50 border border-slate-100 p-8 text-center text-sm text-slate-500">Loading notifications…</div>}
        {!loading && items.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center"><Bell className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-base font-semibold text-slate-600">No notifications yet</p></div>}
        <section className="space-y-2">{items.map((item) => <article key={item.id} className={`enterprise-card p-3 sm:p-4 ${item.readAt ? 'opacity-60' : ''}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-950">{item.title}</p><p className="mt-0.5 text-[11px] text-slate-600">{item.body}</p><p className="mt-1.5 text-[10px] text-slate-400">#{item.orderId.slice(-8).toUpperCase()} · {new Date(item.createdAt).toLocaleString('en-IN')}</p></div>{!item.readAt && <button onClick={() => void markRead(item.sourceHistoryId)} className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-2 py-1 text-[10px] font-semibold text-teal-700"><CheckCheck className="h-3 w-3" /> Read</button>}</div></article>)}</section>
      </main>
    </DashboardLayout>
  );
}
