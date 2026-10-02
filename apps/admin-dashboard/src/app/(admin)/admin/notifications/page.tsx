'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { DataTable } from '@/components/DataTable';
import { apiClient } from '@aagam/utils';
import { Megaphone, RefreshCw } from 'lucide-react';

type InboxItem = { id: string; sourceHistoryId: string; orderId: string; type: string; title: string; body: string; createdAt: string; readAt?: string | null; metadata?: any };

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('Service update');
  const [body, setBody] = useState('AAGAAM broadcast placeholder message');
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

  useEffect(() => { void fetchInbox(); }, []);

  const broadcast = async () => {
    setMessage('');
    try {
      const res = await apiClient.post('/notifications/admin/broadcast', { title, body, audience: 'ALL_USERS' });
      setMessage(`${res.data?.status || 'OK'}: broadcast placeholder validated`);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Broadcast placeholder failed');
    }
  };

  const inboxColumns = [
    {
      key: 'order',
      header: 'Order Ref',
      align: 'left' as const,
      render: (item: InboxItem) => `#${item.orderId.slice(-8).toUpperCase()}`,
    },
    {
      key: 'title',
      header: 'Title',
      align: 'left' as const,
      render: (item: InboxItem) => item.title,
    },
    {
      key: 'body',
      header: 'Message',
      align: 'left' as const,
      render: (item: InboxItem) => item.body,
    },
    {
      key: 'type',
      header: 'Type',
      align: 'left' as const,
      render: (item: InboxItem) => item.type,
    },
    {
      key: 'priority',
      header: 'Priority',
      align: 'center' as const,
      render: (item: InboxItem) =>
        item.metadata?.priority ? (
          <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
            {item.metadata.priority}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'state',
      header: 'State',
      align: 'center' as const,
      render: (item: InboxItem) =>
        item.readAt ? (
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            Read
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
            Unread
          </span>
        ),
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right' as const,
      render: (item: InboxItem) => new Date(item.createdAt).toLocaleString('en-IN'),
    },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <main className="space-y-5 p-4 pb-24">
        <section className="flex flex-col gap-4 rounded-xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-300">Communication center</p>
            <h1 className="mt-2 text-3xl font-semibold">Admin Notifications</h1>
            <p className="mt-2 text-sm text-slate-300">Support alerts, operations updates and broadcast placeholder.</p>
          </div>
          <button onClick={fetchInbox} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <article className="rounded-xl border bg-white p-5">
            <p className="text-xs font-semibold uppercase text-slate-400">Unread admin alerts</p>
            <p className="mt-2 text-3xl font-semibold text-teal-700">{unreadCount}</p>
          </article>
          <article className="rounded-xl border bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold">Broadcast placeholder</h2>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-xl border px-3 py-2 text-sm font-bold" />
              <input value={body} onChange={(e) => setBody(e.target.value)} className="rounded-xl border px-3 py-2 text-sm font-bold" />
              <button onClick={broadcast} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Validate</button>
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">Placeholder only. Durable broadcast storage needs a future Notification table migration.</p>
          </article>
        </section>

        {message && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{message}</div>}

        <DataTable<InboxItem>
          columns={inboxColumns}
          data={items}
          keyExtractor={(item) => item.id}
          title="Admin inbox"
          subtitle="Support alerts and operations updates"
          searchPlaceholder="Search order, title, message or type..."
          emptyText="No admin alerts yet."
          loading={loading}
        />
      </main>
    </DashboardLayout>
  );
}