'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { useCart } from '@/hooks/useCart';
import { formatINR } from '@/lib/currency';
import EmptyState from '@/components/customer/EmptyState';
import { RotateCcw, ShoppingCart, ArrowLeft, Package, Clock } from 'lucide-react';

type Order = {
  id: string;
  status: string;
  createdAt: string;
  grandTotal?: number;
  totalAmount?: number;
  items?: Array<{ id: string; quantity: number; price: number; product?: { name?: string | null; image?: string | null } | null }>;
};

export default function ReorderPage() {
  const router = useRouter();
  const { addToCart } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/orders/my');
        const list = Array.isArray(res.data) ? res.data : [];
        setOrders(list.filter((o: Order) => o.status === 'DELIVERED').slice(0, 5));
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  const handleReorder = (order: Order) => {
    if (!order.items) return;
    order.items.forEach((it) => {
      if (it.product) {
        addToCart({ id: it.product.name || it.id, name: it.product.name || 'Item', price: Number(it.price) || 0 });
      }
    });
    router.push('/shop');
  };

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/shop')} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-950 tracking-tight">Reorder</h1>
            <p className="text-xs font-semibold text-slate-500">Repeat your previous orders</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5">
                <div className="h-5 w-40 bg-slate-100 rounded" />
                <div className="mt-3 h-4 w-24 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState icon={RotateCcw} title="No past orders to reorder" description="Complete an order and it will appear here for quick reorder." action={{ label: 'Start shopping', onClick: () => router.push('/shop') }} />
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-100 bg-white p-5 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-700 shrink-0">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-slate-950">#{order.id.slice(-8).toUpperCase()}</span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                          <Clock className="h-2.5 w-2.5" /> Delivered
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 font-semibold">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className="mt-1 text-xs text-slate-500">{order.items?.length || 0} items • {formatINR(Number(order.grandTotal ?? order.totalAmount) || 0)}</div>
                    </div>
                  </div>
                  <button onClick={() => handleReorder(order)} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black text-white hover:bg-teal-800 transition-colors">
                    <RotateCcw className="h-3.5 w-3.5" /> Reorder
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
