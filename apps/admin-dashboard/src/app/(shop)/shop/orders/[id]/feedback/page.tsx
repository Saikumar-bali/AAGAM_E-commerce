'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { ArrowLeft, Headphones, Star } from 'lucide-react';

type RatingState = { orderRating: number; storeRating: number; riderRating: number; comment: string };

type SupportState = { category: string; message: string; priority: 'LOW' | 'NORMAL' | 'HIGH'; requestedRefund: boolean };

export default function CustomerFeedbackPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;
  const [order, setOrder] = useState<any>(null);
  const [postDelivery, setPostDelivery] = useState<any>(null);
  const [rating, setRating] = useState<RatingState>({ orderRating: 5, storeRating: 5, riderRating: 5, comment: '' });
  const [support, setSupport] = useState<SupportState>({ category: 'DELIVERY_ISSUE', message: '', priority: 'NORMAL', requestedRefund: false });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    if (!orderId) return;
    setLoading(true);
    setMessage('');
    try {
      const [orderRes, postRes] = await Promise.all([
        apiClient.get(`/orders/my/${orderId}`),
        apiClient.get(`/orders/post-delivery/${orderId}`),
      ]);
      setOrder(orderRes.data);
      setPostDelivery(postRes.data);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Could not load feedback page');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [orderId]);

  const submitRating = async () => {
    setMessage('');
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/rating`, rating);
      setMessage('Rating submitted. Thank you.');
      await refresh();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Could not submit rating');
    }
  };

  const submitSupport = async () => {
    setMessage('');
    try {
      await apiClient.post(`/orders/post-delivery/${orderId}/support`, support);
      setSupport((prev) => ({ ...prev, message: '', requestedRefund: false }));
      setMessage('Support ticket opened. Our team will review it.');
      await refresh();
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Could not open support ticket');
    }
  };

  const ratingSubmitted = Boolean(postDelivery?.rating);
  const delivered = order?.status === 'DELIVERED';

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <main className="mx-auto max-w-4xl space-y-5 p-4 pb-24">
        <button onClick={() => router.push(`/shop/orders/${orderId}`)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to order
        </button>

        <section className="rounded-3xl bg-slate-950 p-6 text-white">
          <p className="text-xs font-black uppercase text-teal-300">Post-delivery experience</p>
          <h1 className="mt-2 text-3xl font-black">Rate order or get support</h1>
          <p className="mt-2 text-sm text-slate-300">Ratings are allowed after delivery. Support is available for any order problem.</p>
        </section>

        {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">{message}</div>}
        {loading && <div className="rounded-2xl bg-slate-100 p-8 text-center text-sm font-bold text-slate-500">Loading...</div>}

        {!loading && order && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><Star className="h-5 w-5 text-amber-500" /><h2 className="text-lg font-black">Rate this order</h2></div>
              {!delivered && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">Rating opens after delivery.</div>}
              {ratingSubmitted && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-800">Rating already submitted.</div>}
              {delivered && !ratingSubmitted && <div className="space-y-4">
                {[['orderRating', 'Order'], ['storeRating', 'Store'], ['riderRating', 'Rider']].map(([key, label]) => (
                  <label key={key} className="block"><span className="text-sm font-black text-slate-700">{label} rating</span><select value={(rating as any)[key]} onChange={(e) => setRating((prev) => ({ ...prev, [key]: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border px-3 py-3 text-sm font-bold"><option value={5}>5 - Excellent</option><option value={4}>4 - Good</option><option value={3}>3 - Okay</option><option value={2}>2 - Poor</option><option value={1}>1 - Bad</option></select></label>
                ))}
                <textarea value={rating.comment} onChange={(e) => setRating((prev) => ({ ...prev, comment: e.target.value }))} placeholder="Optional feedback" className="min-h-24 w-full rounded-xl border px-3 py-3 text-sm font-bold" />
                <button onClick={submitRating} className="w-full rounded-2xl bg-amber-500 py-3 text-sm font-black text-white">Submit rating</button>
              </div>}
            </section>

            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><Headphones className="h-5 w-5 text-teal-600" /><h2 className="text-lg font-black">Need help?</h2></div>
              <div className="space-y-4">
                <label className="block"><span className="text-sm font-black text-slate-700">Issue category</span><select value={support.category} onChange={(e) => setSupport((prev) => ({ ...prev, category: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-3 text-sm font-bold"><option value="DELIVERY_ISSUE">Delivery issue</option><option value="MISSING_ITEM">Missing item</option><option value="DAMAGED_ITEM">Damaged item</option><option value="PAYMENT_ISSUE">Payment issue</option><option value="OTHER">Other</option></select></label>
                <label className="block"><span className="text-sm font-black text-slate-700">Priority</span><select value={support.priority} onChange={(e) => setSupport((prev) => ({ ...prev, priority: e.target.value as SupportState['priority'] }))} className="mt-1 w-full rounded-xl border px-3 py-3 text-sm font-bold"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="LOW">Low</option></select></label>
                <textarea value={support.message} onChange={(e) => setSupport((prev) => ({ ...prev, message: e.target.value }))} placeholder="Tell us what went wrong" className="min-h-28 w-full rounded-xl border px-3 py-3 text-sm font-bold" />
                <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={support.requestedRefund} onChange={(e) => setSupport((prev) => ({ ...prev, requestedRefund: e.target.checked }))} /> Request refund review</label>
                <button onClick={submitSupport} disabled={support.message.trim().length < 5} className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-black text-white disabled:bg-slate-300">Open support ticket</button>
              </div>
              {postDelivery?.tickets?.length > 0 && <div className="mt-5 rounded-2xl bg-teal-50 p-4"><p className="text-sm font-black text-teal-900">Previous tickets</p>{postDelivery.tickets.map((ticket: any) => <p key={ticket.id} className="mt-2 text-xs font-bold text-teal-800">{ticket.metadata?.category || 'Issue'} · {ticket.metadata?.status || 'OPEN'}</p>)}</div>}
            </section>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
