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
      <main className="mx-auto max-w-4xl space-y-5 p-1 pb-24 sm:p-4">
        <section className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between">
          <div><p className="text-xs font-black uppercase text-teal-300">Communication center</p><h1 className="mt-2 text-3xl font-black">Notifications</h1><p className="mt-2 text-sm text-slate-300">Order updates, delivery events, support and post-delivery messages.</p></div>
          <div className="flex flex-wrap items-center gap-2"><PushNotificationManager /><button onClick={() => void fetchInbox()} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
        </section>
        <section className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Unread</p><p className="mt-1 text-3xl font-black text-teal-700">{unreadCount}</p></section>
        {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">{message}</div>}
        {loading && <div className="rounded-2xl bg-slate-100 p-8 text-center text-sm font-bold text-slate-500">Loading notifications...</div>}
        {!loading && items.length === 0 && <div className="rounded-3xl border border-dashed bg-white p-12 text-center"><Bell className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-4 text-lg font-black">No notifications yet</p></div>}
        <section className="space-y-3">{items.map((item) => <article key={item.id} className={`rounded-3xl border bg-white p-5 shadow-sm ${item.readAt ? 'opacity-70' : ''}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-950">{item.title}</p><p className="mt-1 text-sm font-bold text-slate-600">{item.body}</p><p className="mt-2 text-xs font-bold text-slate-400">#{item.orderId.slice(-8).toUpperCase()} · {new Date(item.createdAt).toLocaleString('en-IN')}</p></div>{!item.readAt && <button onClick={() => void markRead(item.sourceHistoryId)} className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-2 text-xs font-black text-white"><CheckCheck className="h-3 w-3" /> Read</button>}</div></article>)}</section>
      </main>
    </DashboardLayout>
  );
}
