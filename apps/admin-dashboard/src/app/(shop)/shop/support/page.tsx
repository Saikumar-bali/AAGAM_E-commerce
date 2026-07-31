'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/components/ToastProvider';
import { apiClient } from '@aagam/utils';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Headphones,
  Loader2,
  MessageSquareText,
  Package,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

type Order = {
  id: string;
  status: string;
  createdAt: string;
  grandTotal?: number;
  totalAmount?: number;
  store?: { name?: string | null } | null;
};

type Ticket = {
  id: string;
  createdAt?: string;
  metadata?: {
    status?: string;
    category?: string;
    message?: string;
    priority?: string;
    createdAt?: string;
  };
};

const categories = [
  { value: 'ORDER_STATUS', label: 'Order status or delay' },
  { value: 'MISSING_ITEM', label: 'Missing item' },
  { value: 'WRONG_ITEM', label: 'Wrong item' },
  { value: 'DAMAGED_ITEM', label: 'Damaged item' },
  { value: 'PAYMENT', label: 'Payment or refund' },
  { value: 'DELIVERY_EXPERIENCE', label: 'Delivery experience' },
  { value: 'OTHER', label: 'Other issue' },
];

function ticketDate(value?: string) {
  if (!value) return 'Recently opened';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently opened' : date.toLocaleString('en-IN');
}

export default function CustomerSupportPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [category, setCategory] = useState(categories[0].value);
  const [message, setMessage] = useState('');
  const [requestedRefund, setRequestedRefund] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const selectedOrderRef = useRef('');
  const historyRequestVersion = useRef(0);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const response = await apiClient.get('/orders/my');
      const items = Array.isArray(response.data) ? response.data : [];
      setOrders(items);
      setSelectedOrderId((current) => {
        const next = items.some((order: Order) => order.id === current) ? current : items[0]?.id || '';
        selectedOrderRef.current = next;
        return next;
      });
    } catch {
      // Global API interceptor shows the backend message.
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const loadTicketHistory = useCallback(async (orderId: string) => {
    const requestVersion = ++historyRequestVersion.current;
    if (!orderId) {
      setTickets([]);
      setLoadingHistory(false);
      return;
    }
    setLoadingHistory(true);
    try {
      const response = await apiClient.get(`/orders/post-delivery/${orderId}`);
      if (requestVersion !== historyRequestVersion.current || selectedOrderRef.current !== orderId) return;
      setTickets(Array.isArray(response.data?.tickets) ? response.data.tickets : []);
    } catch {
      if (requestVersion === historyRequestVersion.current && selectedOrderRef.current === orderId) setTickets([]);
    } finally {
      if (requestVersion === historyRequestVersion.current && selectedOrderRef.current === orderId) setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    selectedOrderRef.current = selectedOrderId;
    void loadTicketHistory(selectedOrderId);
    return () => {
      historyRequestVersion.current += 1;
    };
  }, [loadTicketHistory, selectedOrderId]);

  const selectOrder = (orderId: string) => {
    selectedOrderRef.current = orderId;
    setSelectedOrderId(orderId);
  };

  const submitTicket = async () => {
    const details = message.trim();
    const orderId = selectedOrderId;
    if (!orderId) {
      toast.warning('Select the order that needs help.', 'Order required');
      return;
    }
    if (details.length < 5) {
      toast.warning('Describe the issue using at least five characters.', 'More details required');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/support`, {
        category,
        message: details,
        priority: category === 'PAYMENT' || category === 'MISSING_ITEM' ? 'HIGH' : 'NORMAL',
        requestedRefund,
      });
      setMessage('');
      setRequestedRefund(false);
      toast.success('The Aagaam support team can now review your request.', 'Support ticket opened');
      await loadTicketHistory(orderId);
    } catch {
      // Global API interceptor shows conflicts and backend validation as a toast.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-5xl space-y-6 pb-8">
        <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:px-8 sm:py-9">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-teal-400/20" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-teal-200"><Headphones className="h-4 w-4" /> Aagaam customer care</p>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-4xl">How can we help?</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">Choose the affected order and send the details directly to the support queue. Your ticket stays linked to the order for faster resolution.</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur"><ShieldCheck className="h-7 w-7 text-teal-300" /><div><p className="font-black">Verified account</p><p className="text-xs font-semibold text-slate-300">Only your orders are available here.</p></div></div>
          </div>
        </section>

        {loadingOrders ? (
          <div className="grid min-h-64 place-items-center rounded-3xl border border-slate-200 bg-white"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-teal-600" /><p className="mt-3 text-sm font-bold text-slate-500">Loading your orders…</p></div></div>
        ) : orders.length === 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Package className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-xl font-black text-slate-950">No orders available for support</h2><p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500">Customer tickets are linked to an order so the support team can see the right store, payment and delivery context.</p></section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Step 1</p><h2 className="mt-2 text-xl font-black text-slate-950">Select an order</h2></div><button type="button" onClick={() => void loadOrders()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-teal-300 hover:text-teal-700" aria-label="Refresh orders"><RefreshCw className="h-4 w-4" /></button></div>
              <div className="mt-5 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                {orders.map((order) => {
                  const selected = order.id === selectedOrderId;
                  return <button key={order.id} type="button" onClick={() => selectOrder(order.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selected ? 'border-teal-500 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">Order #{order.id.slice(-8).toUpperCase()}</p><p className="mt-1 text-xs font-semibold text-slate-500">{order.store?.name || 'Aagaam store'} · {new Date(order.createdAt).toLocaleDateString('en-IN')}</p></div><ChevronRight className={`h-5 w-5 ${selected ? 'text-teal-700' : 'text-slate-300'}`} /></div><div className="mt-3 flex items-center justify-between text-xs font-black"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{order.status}</span><span className="text-slate-900">₹{Number(order.grandTotal ?? order.totalAmount ?? 0).toLocaleString('en-IN')}</span></div></button>;
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Step 2</p><h2 className="mt-2 text-xl font-black text-slate-950">Tell us what happened</h2>
              {selectedOrder ? <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-teal-700">Selected order</p><p className="mt-1 font-black text-teal-950">#{selectedOrder.id.slice(-8).toUpperCase()} · {selectedOrder.status}</p></div> : null}
              <label className="mt-5 block"><span className="mb-2 block text-sm font-black text-slate-800">Issue category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="enterprise-input w-full bg-white">{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="mt-4 block"><span className="mb-2 block text-sm font-black text-slate-800">Describe what happened</span><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 1000))} rows={6} maxLength={1000} placeholder="Include the item, payment, delivery or refund details that will help the support team investigate." className="enterprise-input min-h-36 w-full resize-y bg-white" /></label>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><input type="checkbox" checked={requestedRefund} onChange={(event) => setRequestedRefund(event.target.checked)} className="mt-1 h-4 w-4 accent-teal-700" /><span><span className="block text-sm font-black text-slate-900">This request may need a refund</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">Support will review eligibility. Selecting this does not automatically approve a refund.</span></span></label>
              <button type="button" onClick={() => void submitTicket()} disabled={submitting || !selectedOrderId || message.trim().length < 5} className="enterprise-button mt-5 w-full gap-2 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageSquareText className="h-5 w-5" />}{submitting ? 'Opening ticket…' : 'Open support ticket'}</button>

              <div className="mt-6 border-t border-slate-100 pt-5"><div className="flex items-center justify-between"><h3 className="font-black text-slate-950">Previous tickets for this order</h3>{loadingHistory ? <Loader2 className="h-4 w-4 animate-spin text-teal-600" /> : null}</div>{!loadingHistory && tickets.length === 0 ? <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No support ticket has been opened for this order.</p> : null}<div className="mt-3 space-y-3">{tickets.map((ticket) => <div key={ticket.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-700"><CheckCircle2 className="h-4 w-4" />{ticket.metadata?.status || 'OPEN'}</span><span className="text-xs font-semibold text-slate-400">{ticketDate(ticket.createdAt || ticket.metadata?.createdAt)}</span></div><p className="mt-2 text-sm font-black text-slate-900">{categories.find((item) => item.value === ticket.metadata?.category)?.label || ticket.metadata?.category || 'Support request'}</p><p className="mt-1 line-clamp-3 text-sm font-semibold leading-6 text-slate-600">{ticket.metadata?.message || 'Support request submitted.'}</p></div>)}</div></div>
            </section>
          </div>
        )}

        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm font-semibold leading-6">For an immediate safety emergency, contact local emergency services. This support form is intended for order, payment, item and delivery issues.</p></div>
      </div>
    </DashboardLayout>
  );
}
