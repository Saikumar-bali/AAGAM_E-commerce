'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Minus, Plus, ShoppingBag, Heart, Clock, ShieldCheck, Truck, Star, Store } from 'lucide-react';
import { apiClient, getProductImage } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { formatINR } from '@/lib/currency';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const router = useRouter();
  const [product, setProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { cart, addToCart, updateQuantity } = useCart();
  const wishlist = useWishlist();

  useEffect(() => {
    if (!productId) return;
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get(`/products/${productId}`);
        setProduct(response.data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load product');
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [productId]);

  const qty = useMemo(() => {
    const match = cart.find((item) => item.id === product?.id);
    return match?.quantity || 0;
  }, [cart, product?.id]);

  const productImage = product ? getProductImage(product) : '';
  const price = product ? Number(product.price) || 0 : 0;
  const inStock = product?.availability?.inStock ?? true;
  const wished = product ? wishlist.has(product.id) : false;

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-5xl mx-auto pb-24 md:pb-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {loading ? (
          <div className="rounded-3xl border border-slate-100 bg-white p-6 animate-pulse">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="aspect-square rounded-2xl bg-slate-100" />
              <div className="space-y-4">
                <div className="h-4 w-24 rounded bg-slate-100" />
                <div className="h-8 w-3/4 rounded bg-slate-100" />
                <div className="h-4 w-full rounded bg-slate-100" />
                <div className="h-10 w-32 rounded bg-slate-100" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-center">
            <p className="text-sm font-bold text-red-700">{error}</p>
            <button onClick={() => router.push('/shop')} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white">
              Back to shop
            </button>
          </div>
        ) : !product ? (
          <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">Product not found.</p>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-100 bg-white overflow-hidden shadow-sm">
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="relative bg-gradient-to-br from-teal-50 to-amber-50">
                <img src={productImage} alt={product.name} className="h-full w-full min-h-[300px] lg:min-h-[500px] object-cover" />
                {product.category?.name && (
                  <div className="absolute top-4 left-4 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-100 px-3 py-1.5 text-xs font-black text-teal-800 uppercase tracking-wider">
                    {product.category.name}
                  </div>
                )}
                <button
                  onClick={() => wishlist.toggle({ id: product.id, name: product.name, price })}
                  className={`absolute top-4 right-4 grid h-10 w-10 place-items-center rounded-xl border backdrop-blur-sm transition-all ${
                    wished ? 'bg-rose-100 border-rose-200 text-rose-500' : 'bg-white/90 border-slate-200 text-slate-400 hover:text-rose-400'
                  }`}
                >
                  <Heart className={`h-5 w-5 ${wished ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="p-6 lg:p-8 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5">
                    <Star className="h-3 w-3 text-amber-500 fill-current" />
                    <span className="text-xs font-black text-amber-700">Popular</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-teal-50 border border-teal-200 px-2 py-0.5">
                    <Clock className="h-3 w-3 text-teal-600" />
                    <span className="text-xs font-black text-teal-700">10 min</span>
                  </div>
                </div>

                <h1 className="mt-2 text-2xl lg:text-3xl font-black text-slate-950 tracking-tight">{product.name}</h1>

                <p className="mt-3 text-sm leading-6 text-slate-500 font-semibold">
                  {product.description || 'Freshly stocked and ready for a fast doorstep delivery.'}
                </p>

                <div className="mt-6 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-5">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400">Price</div>
                  <div className="mt-2 text-3xl font-black text-white">{formatINR(price)}</div>
                  {product.availability && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black ${
                        inStock ? 'bg-teal-500/20 text-teal-300' : 'bg-red-500/20 text-red-300'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${inStock ? 'bg-teal-400' : 'bg-red-400'}`} />
                        {inStock ? 'In stock' : 'Out of stock'}
                      </span>
                      {product.availability.storeName && (
                        <span className="flex items-center gap-1 text-xs font-bold text-slate-400">
                          <Store className="h-3 w-3" />
                          {product.availability.storeName}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {qty > 0 ? (
                    <div className="inline-flex items-center rounded-xl border-2 border-teal-200 bg-teal-50">
                      <button
                        onClick={() => updateQuantity(product.id, qty - 1)}
                        className="h-12 w-12 grid place-items-center rounded-l-xl text-teal-800 hover:bg-teal-100 transition-colors"
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span className="w-12 text-center text-lg font-black text-teal-900">{qty}</span>
                      <button
                        onClick={() => updateQuantity(product.id, qty + 1)}
                        className="h-12 w-12 grid place-items-center rounded-r-xl text-teal-800 hover:bg-teal-100 transition-colors"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart({ id: product.id, name: product.name, price, image: productImage })}
                      disabled={!inStock}
                      className="inline-flex h-12 items-center gap-2 rounded-xl bg-teal-700 px-6 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition-all hover:bg-teal-800 hover:-translate-y-0.5 disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Add to cart
                    </button>
                  )}

                  <button
                    onClick={() => wishlist.toggle({ id: product.id, name: product.name, price })}
                    className={`inline-flex h-12 items-center gap-2 rounded-xl border-2 px-5 text-sm font-black transition-all ${
                      wished
                        ? 'border-rose-200 bg-rose-50 text-rose-600'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${wished ? 'fill-current' : ''}`} />
                    {wished ? 'Saved' : 'Save'}
                  </button>
                </div>

                <div className="mt-auto pt-6 grid grid-cols-2 gap-3">
                  {[
                    { icon: Truck, label: 'Free delivery', sub: 'On first order' },
                    { icon: ShieldCheck, label: 'Quality assured', sub: '100% genuine' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <item.icon className="h-4 w-4 text-teal-600 shrink-0" />
                      <div>
                        <div className="text-xs font-black text-slate-900">{item.label}</div>
                        <div className="text-[10px] font-bold text-slate-400">{item.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {totalItems > 0 && (
          <div className="fixed bottom-4 inset-x-0 z-40 px-4 md:px-0 md:max-w-5xl md:mx-auto pointer-events-none">
            <div className="pointer-events-auto flex items-center justify-between rounded-2xl bg-slate-950 px-5 py-3.5 shadow-2xl shadow-slate-950/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-black text-white">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  {cart.reduce((s, i) => s + i.quantity, 0)} item{cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}
                </div>
                <span className="text-lg font-black text-white">{formatINR(cart.reduce((s, i) => s + i.price * i.quantity, 0))}</span>
              </div>
              <button
                onClick={() => router.push('/shop/checkout')}
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-teal-900/20 transition-all hover:bg-teal-500"
              >
                Checkout →
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
