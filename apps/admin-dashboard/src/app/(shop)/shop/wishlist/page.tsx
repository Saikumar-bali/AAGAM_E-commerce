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
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.push('/shop')} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="enterprise-kicker">Wishlist</p>
            <h1 className="mt-1 text-lg font-semibold text-slate-950">My wishlist</h1>
            <p className="mt-0.5 text-xs text-slate-500">{items.length} saved item{items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={Heart} title="No saved items yet" description="Save products to your wishlist and they'll appear here." action={{ label: 'Browse products', onClick: () => router.push('/shop') }} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {items.map((product: any) => {
              const price = Number(product.price) || 0;
              const image = getProductImage(product);
              return (
                <div key={product.id} className="enterprise-card overflow-hidden">
                  <div className="relative aspect-[4/3] bg-slate-50">
                    <img src={image} alt={product.name} className="h-full w-full object-cover" />
                    <button onClick={() => wishlist.remove(product.id)} className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-md bg-white/90 border border-slate-100 text-rose-500 hover:bg-rose-50 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="p-2.5">
                    <h3 className="text-[11px] font-semibold text-slate-950 truncate">{product.name}</h3>
                    <div className="mt-0.5 text-sm font-semibold text-teal-700">{formatINR(price)}</div>
                    <button onClick={() => { addToCart({ id: product.id, name: product.name, price, image }); }} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-teal-700 px-2.5 py-2 text-[11px] font-semibold text-white hover:bg-teal-800 transition-colors">
                      <ShoppingCart className="h-3 w-3" /> Add to cart
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
