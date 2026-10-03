'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { DataTable } from '@/components/DataTable';
import { apiClient } from '@aagam/utils';
import { RefreshCw } from 'lucide-react';

type TicketItem = { id?: string | null; productId?: string | null; name?: string | null; quantity?: number | null };
type Ticket = {
  id: string;
  orderId: string;
  createdAt: string;
  customer?: { name?: string | null; email?: string | null; phone?: string | null };
  store?: { name?: string | null };
  items?: TicketItem[];
  metadata?: any;
};

const itemSummary = (ticket: Ticket) => {
  if (!ticket.items?.length) return 'Snapshot unavailable';
  return ticket.items
    .map((item) => `${item.name || 'Item'} × ${Number(item.quantity || 1)}`)
    .join(', ');
};

const issueSummary = (ticket: Ticket) =>
  [ticket.metadata?.category || 'Issue', ticket.metadata?.message || 'No message']
    .filter(Boolean)
    .join(' — ');

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

  useEffect(() => { void fetchTickets(); }, []);

  const highPriority = tickets.filter((ticket) => ticket.metadata?.priority === 'HIGH').length;
  const refundRequests = tickets.filter((ticket) => ticket.metadata?.requestedRefund).length;

  const ticketColumns = [
    {
      key: 'order',
      header: 'Order Ref',
      align: 'left' as const,
      render: (ticket: Ticket) => `#${ticket.orderId.slice(-8).toUpperCase()}`,
    },
    {
      key: 'customer',
      header: 'Customer',
      align: 'left' as const,
      render: (ticket: Ticket) =>
        ticket.customer?.name || ticket.customer?.email || 'Customer',
    },
    {
      key: 'contact',
      header: 'Contact',
      align: 'left' as const,
      render: (ticket: Ticket) => ticket.customer?.phone || 'No phone',
    },
    {
      key: 'store',
      header: 'Store',
      align: 'left' as const,
      render: (ticket: Ticket) => ticket.store?.name || 'Store',
    },
    {
      key: 'priority',
      header: 'Priority',
      align: 'center' as const,
      searchValue: (ticket: Ticket) => ticket.metadata?.priority || 'NORMAL',
      render: (ticket: Ticket) => {
        const priority = ticket.metadata?.priority || 'NORMAL';
        const high = priority === 'HIGH';
        return (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${high ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
            {priority}
          </span>
        );
      },
    },
    {
      key: 'items',
      header: 'Order Items',
      align: 'left' as const,
      render: (ticket: Ticket) => itemSummary(ticket),
    },
    {
      key: 'issue',
      header: 'Issue',
      align: 'left' as const,
      render: (ticket: Ticket) => issueSummary(ticket),
    },
    {
      key: 'refund',
      header: 'Refund',
      align: 'center' as const,
      searchValue: (ticket: Ticket) => (ticket.metadata?.requestedRefund ? 'Review requested' : ''),
      render: (ticket: Ticket) =>
        ticket.metadata?.requestedRefund ? (
          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            Review requested
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'raised',
      header: 'Raised',
      align: 'right' as const,
      render: (ticket: Ticket) => new Date(ticket.createdAt).toLocaleString('en-IN'),
    },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <main className="space-y-5 p-4 pb-24">
        <section className="flex flex-col gap-4 rounded-xl bg-slate-950 p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-300">Post-delivery support</p>
            <h1 className="mt-2 text-3xl font-semibold">Support Queue</h1>
            <p className="mt-2 text-sm text-slate-300">Review order issues, refund requests and delivery complaints.</p>
          </div>
          <button onClick={() => void fetchTickets()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border bg-white p-5">
            <p className="text-xs font-semibold uppercase text-slate-400">Open tickets</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{tickets.length}</p>
          </article>
          <article className="rounded-xl border bg-white p-5">
            <p className="text-xs font-semibold uppercase text-slate-400">High priority</p>
            <p className="mt-2 text-3xl font-semibold text-red-700">{highPriority}</p>
          </article>
          <article className="rounded-xl border bg-white p-5">
            <p className="text-xs font-semibold uppercase text-slate-400">Refund reviews</p>
            <p className="mt-2 text-3xl font-semibold text-amber-700">{refundRequests}</p>
          </article>
        </section>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        <DataTable<Ticket>
          columns={ticketColumns}
          data={tickets}
          keyExtractor={(ticket) => ticket.id}
          title="Support tickets"
          subtitle="Order issues, refund requests and delivery complaints"
          searchPlaceholder="Search order, customer, store or issue..."
          emptyText="No support tickets. Customer issues will appear here."
          loading={loading}
        />
      </main>
    </DashboardLayout>
  );
}