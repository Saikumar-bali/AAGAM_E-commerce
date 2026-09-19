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
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.push('/shop')} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="enterprise-kicker">Reorder</p>
            <h1 className="mt-1 text-lg font-semibold text-slate-950">Reorder</h1>
            <p className="mt-0.5 text-xs text-slate-500">Repeat your previous orders</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-100 bg-white p-4">
                <div className="h-4 w-32 bg-slate-100 rounded" />
                <div className="mt-2 h-3 w-20 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState icon={RotateCcw} title="No past orders to reorder" description="Complete an order and it will appear here for quick reorder." action={{ label: 'Start shopping', onClick: () => router.push('/shop') }} />
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="enterprise-card p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-teal-50 text-teal-700 shrink-0">
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-950">#{order.id.slice(-8).toUpperCase()}</span>
                        <span className="enterprise-kicker">
                          <Clock className="mr-1 inline h-2.5 w-2.5" /> Delivered
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{order.items?.length || 0} items · {formatINR(Number(order.grandTotal ?? order.totalAmount) || 0)}</div>
                    </div>
                  </div>
                  <button onClick={() => handleReorder(order)} className="shrink-0 enterprise-button py-2 text-[11px]">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reorder
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
