'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient, getProductImage } from '@aagam/utils';
import { useWishlist } from '@/hooks/useWishlist';
import { useCart } from '@/hooks/useCart';
import { formatINR } from '@/lib/currency';
import EmptyState from '@/components/customer/EmptyState';
import { Heart, ShoppingCart, Trash2, ArrowLeft } from 'lucide-react';

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
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/shop')} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-950 tracking-tight">My Wishlist</h1>
            <p className="text-xs font-semibold text-slate-500">{items.length} saved item{items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={Heart} title="No saved items yet" description="Save products to your wishlist and they'll appear here." action={{ label: 'Browse products', onClick: () => router.push('/shop') }} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((product: any) => {
              const price = Number(product.price) || 0;
              const image = getProductImage(product);
              return (
                <div key={product.id} className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-teal-50 to-amber-50">
                    <img src={image} alt={product.name} className="h-full w-full object-cover" />
                    <button onClick={() => wishlist.remove(product.id)} className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-xl bg-white/90 border border-slate-100 text-rose-500 hover:bg-rose-50 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-black text-slate-950 truncate">{product.name}</h3>
                    <div className="mt-1 text-base font-black text-teal-700">{formatINR(price)}</div>
                    <button onClick={() => { addToCart({ id: product.id, name: product.name, price, image }); }} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2.5 text-xs font-black text-white hover:bg-teal-800 transition-colors">
                      <ShoppingCart className="h-3.5 w-3.5" /> Add to cart
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
