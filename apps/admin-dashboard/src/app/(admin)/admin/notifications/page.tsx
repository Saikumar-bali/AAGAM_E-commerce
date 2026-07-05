'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Bell, Megaphone, RefreshCw } from 'lucide-react';

type InboxItem = { id: string; sourceHistoryId: string; orderId: string; type: string; title: string; body: string; createdAt: string; readAt?: string | null; metadata?: any };

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('Service update');
  const [body, setBody] = useState('AAGAM broadcast placeholder message');
  const [message, setMessage] = useState('');

  const fetchInbox = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await apiClient.get('/notifications/inbox');
      setItems(res.data?.items || []);
      setUnreadCount(res.data?.unreadCount || 0);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInbox(); }, []);

  const broadcast = async () => {
    setMessage('');
    try {
      const res = await apiClient.post('/notifications/admin/broadcast', { title, body, audience: 'ALL_USERS' });
      setMessage(`${res.data?.status || 'OK'}: broadcast placeholder validated`);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Broadcast placeholder failed');
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <main className="space-y-5 p-4 pb-24">
        <section className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between">
          <div><p className="text-xs font-black uppercase text-teal-300">Communication center</p><h1 className="mt-2 text-3xl font-black">Admin Notifications</h1><p className="mt-2 text-sm text-slate-300">Support alerts, operations updates and broadcast placeholder.</p></div>
          <button onClick={fetchInbox} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-950"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <article className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Unread admin alerts</p><p className="mt-2 text-3xl font-black text-teal-700">{unreadCount}</p></article>
          <article className="rounded-3xl border bg-white p-5 shadow-sm"><div className="mb-3 flex items-center gap-2"><Megaphone className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-black">Broadcast placeholder</h2></div><div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"><input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl border px-3 py-2 text-sm font-bold" /><input value={body} onChange={(e) => setBody(e.target.value)} className="rounded-xl border px-3 py-2 text-sm font-bold" /><button onClick={broadcast} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Validate</button></div><p className="mt-2 text-xs font-bold text-slate-500">Placeholder only. Durable broadcast storage needs a future Notification table migration.</p></article>
        </section>

        {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">{message}</div>}
        {loading && <div className="rounded-2xl bg-slate-100 p-8 text-center text-sm font-bold text-slate-500">Loading notifications...</div>}
        {!loading && items.length === 0 && <div className="rounded-3xl border border-dashed bg-white p-12 text-center"><Bell className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-4 text-lg font-black">No admin alerts yet</p></div>}

        <section className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-950">{item.title}</p><p className="mt-1 text-sm font-bold text-slate-600">{item.body}</p><p className="mt-2 text-xs font-bold text-slate-400">#{item.orderId.slice(-8).toUpperCase()} · {new Date(item.createdAt).toLocaleString('en-IN')}</p>{item.metadata?.priority && <span className="mt-2 inline-block rounded-full bg-red-50 px-2 py-1 text-[11px] font-black text-red-700">{item.metadata.priority}</span>}</div></div></article>
          ))}
        </section>
      </main>
    </DashboardLayout>
  );
}
