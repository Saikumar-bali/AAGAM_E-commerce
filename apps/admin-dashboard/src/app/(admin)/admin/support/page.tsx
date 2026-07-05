'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { Headphones, RefreshCw } from 'lucide-react';

type Ticket = { id: string; orderId: string; createdAt: string; customer?: { name?: string | null; email?: string | null; phone?: string | null }; store?: { name?: string | null }; metadata?: any };

export default function AdminSupportQueuePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTickets = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/orders/post-delivery/support');
      setTickets(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load support queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(); }, []);

  return (
    <DashboardLayout allowedRole="ADMIN">
      <main className="space-y-5 p-4 pb-24">
        <section className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between">
          <div><p className="text-xs font-black uppercase text-teal-300">Post-delivery support</p><h1 className="mt-2 text-3xl font-black">Support Queue</h1><p className="mt-2 text-sm text-slate-300">Review order issues, refund requests and delivery complaints.</p></div>
          <button onClick={fetchTickets} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-950"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div>}
        {loading && <div className="rounded-2xl bg-slate-100 p-8 text-center text-sm font-bold text-slate-500">Loading support tickets...</div>}
        {!loading && tickets.length === 0 && <div className="rounded-3xl border border-dashed bg-white p-12 text-center"><Headphones className="mx-auto h-12 w-12 text-slate-300" /><p className="mt-4 text-lg font-black">No support tickets</p><p className="mt-1 text-sm font-bold text-slate-500">Customer issues will appear here.</p></div>}

        <section className="grid gap-4 lg:grid-cols-2">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-black">#{ticket.orderId.slice(-8).toUpperCase()}</p><p className="mt-1 text-xs font-bold text-slate-500">{new Date(ticket.createdAt).toLocaleString('en-IN')} · {ticket.store?.name || 'Store'}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-black ${ticket.metadata?.priority === 'HIGH' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{ticket.metadata?.priority || 'NORMAL'}</span></div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Customer</p><p className="mt-1 text-sm font-black text-slate-900">{ticket.customer?.name || ticket.customer?.email || 'Customer'}</p><p className="text-xs font-bold text-slate-500">{ticket.customer?.phone || ticket.customer?.email || 'No contact'}</p></div>
              <div className="mt-4"><p className="text-xs font-black uppercase text-slate-400">{ticket.metadata?.category || 'Issue'}</p><p className="mt-1 text-sm font-bold text-slate-800">{ticket.metadata?.message || 'No message'}</p>{ticket.metadata?.requestedRefund && <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">Refund review requested</p>}</div>
            </article>
          ))}
        </section>
      </main>
    </DashboardLayout>
  );
}
