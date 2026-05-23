'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient, getProductImage } from '@aagam/utils';
import { useWishlist } from '@/hooks/useWishlist';
import { useCart } from '@/hooks/useCart';
import { formatINR } from '@/lib/currency';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';

export default function WishlistPage() {
  const router = useRouter();
  const wishlist = useWishlist();
  const { addToCart } = useCart();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const res = await apiClient.get('/products');
      const list = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setProducts(list);
    };
    load().catch(() => setProducts([]));
  }, []);

  const items = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return wishlist.items.map((w) => byId.get(w.id) || w);
  }, [products, wishlist.items]);

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="space-y-4">
        <h1 className="text-3xl font-black text-slate-950">Wishlist</h1>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-600">
            No saved items yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((product: any) => {
              const price = Number(product.price) || 0;
              const image = getProductImage(product);
              return (
                <div key={product.id} className="rounded-xl border border-emerald-100 bg-white p-3">
                  <img src={image} alt={product.name} className="h-28 w-full rounded-lg object-cover" />
                  <div className="mt-2 font-black text-slate-900">{product.name}</div>
                  <div className="text-sm font-bold text-emerald-700">{formatINR(price)}</div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => addToCart({ id: product.id, name: product.name, price, image })}
                      className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white"
                    >
                      <ShoppingCart className="mr-1 inline h-3.5 w-3.5" />
                      Add
                    </button>
                    <button
                      onClick={() => wishlist.remove(product.id)}
                      className="rounded-lg border border-rose-200 px-3 py-2 text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={() => router.push('/shop')} className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-black text-emerald-700">
          Back to shop
        </button>
      </div>
    </DashboardLayout>
  );
}

