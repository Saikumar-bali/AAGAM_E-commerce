'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import { apiClient } from '@aagam/utils';
import { Loader2, Megaphone, Send, Settings2 } from 'lucide-react';

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState('Service update');
  const [body, setBody] = useState('AAGAM operations update');
  const [audience, setAudience] = useState('ALL_USERS');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const broadcast = async () => {
    setSending(true);
    setMessage('');
    try {
      const response = await apiClient.post('/notifications/admin/broadcast', {
        title,
        body,
        audience,
      }, {
        headers: { 'Idempotency-Key': `admin-broadcast-${Date.now()}` },
      });
      setMessage(`Broadcast queued successfully (${response.data?.outboxEventId || 'outbox event created'}).`);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Could not queue the broadcast.');
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <main className="space-y-5 p-2 pb-24 sm:p-4">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-indigo-600" />
                <h2 className="text-xl font-black text-slate-950">Operations broadcast</h2>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">Creates a durable, deduplicated outbox event with a role-safe destination for every recipient.</p>
            </div>
            <div className="grid flex-1 gap-3 lg:max-w-4xl lg:grid-cols-[1fr_1.4fr_180px_auto]">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-400"
              />
              <input
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Message"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-400"
              />
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-400"
              >
                <option value="ALL_USERS">All users</option>
                <option value="CUSTOMERS">Customers</option>
                <option value="RIDERS">Riders</option>
                <option value="STORE_OWNERS">Store owners</option>
                <option value="ADMINS">Admins</option>
              </select>
              <button
                type="button"
                onClick={broadcast}
                disabled={sending || title.trim().length < 2 || body.trim().length < 2}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Queue
              </button>
            </div>
          </div>
          {message && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{message}</p>}
        </section>

        <NotificationCenter
          role="ADMIN"
          title="Operations Notifications"
          subtitle="Dispatch exceptions, customer support, order events, delivery failures, and broadcast delivery status."
          rightSlot={(
            <Link
              href="/admin/notifications/settings"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-black text-white ring-1 ring-white/20 hover:bg-white/15"
            >
              <Settings2 className="h-4 w-4" /> Preferences
            </Link>
          )}
        />
      </main>
    </DashboardLayout>
  );
}
